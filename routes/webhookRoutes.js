const express = require('express');
const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');

const router = express.Router();

const { normalizeShiprocketStatus } = require('../utils/shippingStatus');

// ─────────────────────────────────────────────────────────────────────────────
// SHIPROCKET WEBHOOK RECEIVER
// @route   POST /api/webhooks/shiprocket
// @access  Public (Webhook)
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/shiprocket',
  asyncHandler(async (req, res) => {
    const payload = req.body;
    console.log('[SHIPROCKET WEBHOOK] Received event:', JSON.stringify(payload));

    const awb = payload.awb || payload.awb_code;
    const shipmentId = String(payload.shipment_id || '');
    const orderId = String(payload.order_id || '');
    const currentStatus = payload.current_status || payload.status;

    if (!awb && !shipmentId && !orderId) {
      return res.status(200).json({ received: true, ignored: 'No identifiable order fields' });
    }

    // Find the matching order in MongoDB
    const query = [];
    if (awb) query.push({ awbCode: awb }, { trackingNumber: awb });
    if (shipmentId) query.push({ shiprocketShipmentId: shipmentId });
    if (orderId) query.push({ shiprocketOrderId: orderId });

    const order = await Order.findOne({ $or: query });

    if (!order) {
      console.warn('[SHIPROCKET WEBHOOK] Order not found for incoming payload.');
      return res.status(200).json({ received: true, message: 'Order not found, ignored.' });
    }

    const normalizedStatus = normalizeShiprocketStatus(currentStatus);
    const prevStatus = order.shippingStatus;
    order.shippingStatus = normalizedStatus;
    order.lastTrackingUpdate = new Date();

    const location = payload.current_location || payload.location || payload.city;
    if (location) {
      order.currentLocation = location;
    }

    if (normalizedStatus === 'DELIVERED') {
      order.orderStatus = 'delivered';
      order.isDelivered = true;
      order.deliveredAt = Date.now();
    } else if (normalizedStatus === 'PICKED_UP' && !order.pickedUpAt) {
      order.pickedUpAt = Date.now();
    } else if (normalizedStatus === 'OUT_FOR_DELIVERY' && !order.outForDeliveryAt) {
      order.outForDeliveryAt = Date.now();
    } else if (normalizedStatus === 'IN_TRANSIT' || normalizedStatus === 'OUT_FOR_DELIVERY') {
      order.orderStatus = 'shipped';
    } else if (normalizedStatus === 'CANCELLED') {
      order.orderStatus = 'cancelled';
    } else if (normalizedStatus.startsWith('RTO')) {
      order.rtoStatus = normalizedStatus;
    }

    if (payload.courier_name && !order.courierName) {
      order.courierName = payload.courier_name;
    }
    if (payload.etd && !order.estimatedDeliveryDate) {
      order.estimatedDeliveryDate = payload.etd;
    }

    // Add tracking event with duplicate protection
    const eventDesc = payload.activity || payload.description || payload.status || `Shipment ${normalizedStatus}`;
    order.addTrackingEvent({
      timestamp: payload.date || payload.timestamp || Date.now(),
      status: normalizedStatus,
      description: eventDesc,
      location: location || '',
    });

    await order.save();
    console.log(`[SHIPROCKET WEBHOOK] Updated Order #${order._id} from ${prevStatus} to ${normalizedStatus}`);

    res.status(200).json({
      received: true,
      success: true,
      orderId: order._id,
      newStatus: normalizedStatus,
    });
  })
);

module.exports = router;
