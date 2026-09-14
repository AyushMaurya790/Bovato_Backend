const express = require('express');
const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const Order = require('../models/Order');
const shiprocketService = require('../services/shiprocketService');
const { protect, admin, optionalAuth } = require('../middleware/authMiddleware');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// 1. PINCODE SERVICEABILITY & DYNAMIC SHIPPING CALCULATION
// @route   POST /api/shipping/serviceability
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/serviceability',
  asyncHandler(async (req, res) => {
    const { pincode, items = [], paymentMethod = 'card' } = req.body;

    if (!pincode || !/^[1-9][0-9]{5}$/.test(String(pincode).trim())) {
      return res.json({
        available: false,
        message: 'Invalid delivery pincode. Please enter a valid 6-digit Indian PIN (e.g. 110001).',
        shippingCharge: 0,
        estimatedDelivery: null,
      });
    }

    const cleanPincode = String(pincode).trim();
    const isCod = String(paymentMethod).toLowerCase() === 'cod';

    // SERVER-SIDE CART WEIGHT CALCULATION (Never trust weight from React)
    let calculatedWeight = 0;
    let maxDimensions = { length: 15, breadth: 10, height: 5 };

    if (Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        const slug = item.slug || item.product_slug;
        const qty = Number(item.qty) || 1;

        let itemWeight = 0.25; // default 250g per cosmetic item
        if (slug) {
          const dbProd = await Product.findOne({ slug });
          if (dbProd && dbProd.shipping?.weight) {
            itemWeight = Number(dbProd.shipping.weight) || 0.25;
            if (dbProd.shipping.length > maxDimensions.length) maxDimensions.length = dbProd.shipping.length;
            if (dbProd.shipping.breadth > maxDimensions.breadth) maxDimensions.breadth = dbProd.shipping.breadth;
            if (dbProd.shipping.height > maxDimensions.height) maxDimensions.height = dbProd.shipping.height;
          }
        }
        calculatedWeight += itemWeight * qty;
      }
    } else {
      calculatedWeight = 0.5;
    }

    // Minimum weight 0.5 kg as per standard courier slabs
    calculatedWeight = Math.max(0.5, Math.round(calculatedWeight * 100) / 100);

    const result = await shiprocketService.checkServiceability({
      pickup_postcode: process.env.SHIPROCKET_PICKUP_PINCODE || '110001',
      delivery_postcode: cleanPincode,
      weight: calculatedWeight,
      cod: isCod ? 1 : 0,
    });

    if (!result.available) {
      return res.json({
        available: false,
        message: result.message || 'Delivery is currently unavailable at this pincode.',
        shippingCharge: 0,
        estimatedDelivery: null,
      });
    }

    // Return safe normalized customer response (never expose tokens or internal details)
    res.json({
      available: true,
      shippingCharge: result.shippingCharge,
      estimatedDelivery: result.estimatedDelivery,
      courierName: result.courierName,
      weight: calculatedWeight,
      dimensions: maxDimensions,
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. CREATE SHIPROCKET SHIPMENT FOR AN ORDER
// @route   POST /api/shipping/create-order/:orderId
// @access  Private / Admin
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/create-order/:orderId',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    // DUPLICATE SHIPMENT PROTECTION
    if (order.shiprocketOrderId || order.shiprocketShipmentId) {
      return res.json({
        success: true,
        alreadyCreated: true,
        message: 'Shipment already exists for this order.',
        order,
      });
    }

    try {
      const srResult = await shiprocketService.createShiprocketOrder(order);
      order.shiprocketOrderId = String(srResult.order_id);
      order.shiprocketShipmentId = String(srResult.shipment_id);
      order.shippingStatus = 'READY_TO_SHIP';
      order.shippingProvider = 'Shiprocket';
      order.shippingError = null;
      await order.save();

      res.json({
        success: true,
        message: 'Shipment created successfully in Shiprocket!',
        shiprocketOrderId: order.shiprocketOrderId,
        shiprocketShipmentId: order.shiprocketShipmentId,
        order,
      });
    } catch (err) {
      order.shippingError = err.message;
      await order.save();
      res.status(400);
      throw new Error(`Failed to create shipment: ${err.message}`);
    }
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. ASSIGN AWB TO SHIPMENT
// @route   POST /api/shipping/assign-awb/:orderId
// @access  Private / Admin
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/assign-awb/:orderId',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    if (!order.shiprocketShipmentId) {
      res.status(400);
      throw new Error('Please create the Shiprocket shipment first before assigning AWB');
    }

    if (order.awbCode) {
      return res.json({
        success: true,
        alreadyAssigned: true,
        message: 'AWB already assigned for this order.',
        awbCode: order.awbCode,
        courierName: order.courierName,
        order,
      });
    }

    try {
      const awbRes = await shiprocketService.assignAWB(order.shiprocketShipmentId, req.body.courierId);
      order.awbCode = awbRes.awb_code;
      order.courierName = awbRes.courier_name;
      order.courierId = String(awbRes.courier_company_id || '');
      order.trackingNumber = awbRes.awb_code;
      order.shippingStatus = 'AWB_ASSIGNED';
      order.orderStatus = 'shipped';
      order.shippedAt = Date.now();
      order.shippingError = null;
      await order.save();

      res.json({
        success: true,
        message: 'AWB assigned successfully!',
        awbCode: order.awbCode,
        courierName: order.courierName,
        order,
      });
    } catch (err) {
      order.shippingError = err.message;
      await order.save();
      res.status(400);
      throw new Error(`Failed to assign AWB: ${err.message}`);
    }
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. SCHEDULE PICKUP
// @route   POST /api/shipping/schedule-pickup/:orderId
// @access  Private / Admin
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/schedule-pickup/:orderId',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    if (!order.shiprocketShipmentId) {
      res.status(400);
      throw new Error('Shipment must be created first');
    }

    try {
      const pickupRes = await shiprocketService.generatePickup(order.shiprocketShipmentId);
      order.shippingStatus = 'PICKUP_SCHEDULED';
      order.pickupScheduledAt = pickupRes.pickup_scheduled_date || Date.now();
      order.shippingError = null;
      await order.save();

      res.json({
        success: true,
        message: 'Pickup scheduled successfully with courier partner!',
        pickupScheduledAt: order.pickupScheduledAt,
        order,
      });
    } catch (err) {
      order.shippingError = err.message;
      await order.save();
      res.status(400);
      throw new Error(`Failed to schedule pickup: ${err.message}`);
    }
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// 5. GENERATE SHIPPING LABEL
// @route   POST /api/shipping/generate-label/:orderId
// @access  Private / Admin
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/generate-label/:orderId',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    if (!order.shiprocketShipmentId) {
      res.status(400);
      throw new Error('Shipment must be created first to generate label');
    }

    if (order.labelUrl) {
      return res.json({
        success: true,
        labelUrl: order.labelUrl,
        alreadyGenerated: true,
      });
    }

    try {
      const labelRes = await shiprocketService.generateLabel(order.shiprocketShipmentId);
      order.labelUrl = labelRes.label_url;
      await order.save();

      res.json({
        success: true,
        message: 'Shipping label generated!',
        labelUrl: order.labelUrl,
      });
    } catch (err) {
      res.status(400);
      throw new Error(`Failed to generate label: ${err.message}`);
    }
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// 6. GENERATE INVOICE
// @route   POST /api/shipping/generate-invoice/:orderId
// @access  Private / Admin
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/generate-invoice/:orderId',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    if (!order.shiprocketOrderId) {
      res.status(400);
      throw new Error('Shiprocket order must exist to generate invoice');
    }

    if (order.invoiceUrl) {
      return res.json({
        success: true,
        invoiceUrl: order.invoiceUrl,
        alreadyGenerated: true,
      });
    }

    try {
      const invoiceRes = await shiprocketService.generateInvoice(order.shiprocketOrderId);
      order.invoiceUrl = invoiceRes.invoice_url;
      await order.save();

      res.json({
        success: true,
        message: 'Invoice generated!',
        invoiceUrl: order.invoiceUrl,
      });
    } catch (err) {
      res.status(400);
      throw new Error(`Failed to generate invoice: ${err.message}`);
    }
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// 6b. GENERATE & PRINT MANIFEST
// @route   POST /api/shipping/generate-manifest/:orderId
// @access  Private / Admin
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/generate-manifest/:orderId',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    if (!order.shiprocketShipmentId) {
      res.status(400);
      throw new Error('Shipment must be created first before generating manifest');
    }

    try {
      const manifestRes = await shiprocketService.generateManifest([order.shiprocketShipmentId]);
      if (manifestRes.manifest_url) {
        order.manifestUrl = manifestRes.manifest_url;
        await order.save();
      }

      res.json({
        success: true,
        message: 'Manifest generated successfully!',
        manifestUrl: order.manifestUrl || manifestRes.manifest_url,
        data: manifestRes.data,
      });
    } catch (err) {
      res.status(400);
      throw new Error(`Failed to generate manifest: ${err.message}`);
    }
  })
);

router.post(
  '/print-manifest/:orderId',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    if (!order.shiprocketOrderId) {
      res.status(400);
      throw new Error('Shiprocket order must exist to print manifest');
    }

    try {
      const printRes = await shiprocketService.printManifest([order.shiprocketOrderId]);
      if (printRes.manifest_url) {
        order.manifestUrl = printRes.manifest_url;
        await order.save();
      }

      res.json({
        success: true,
        message: 'Manifest print URL generated!',
        manifestUrl: order.manifestUrl || printRes.manifest_url,
      });
    } catch (err) {
      res.status(400);
      throw new Error(`Failed to print manifest: ${err.message}`);
    }
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// 7. TRACK SHIPMENT BY AWB (Customer & Admin)
// @route   GET /api/shipping/track/:awb
// @access  Public (Validated against order ownership or guest match)
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/track/:awb',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { awb } = req.params;
    if (!awb) {
      res.status(400);
      throw new Error('AWB code is required');
    }

    // Find linked order in MongoDB
    const order = await Order.findOne({
      $or: [{ awbCode: awb }, { trackingNumber: awb }],
    });

    if (order && req.user && !req.user.isAdmin) {
      // If customer is logged in, ensure they own the order
      if (order.user && order.user.toString() !== req.user._id.toString()) {
        res.status(403);
        throw new Error('You are not authorized to track this shipment');
      }
    }

    try {
      const trackingData = await shiprocketService.trackShipment(awb);

      if (order) {
        if (trackingData.status) order.shippingStatus = trackingData.status;
        if (trackingData.currentLocation && trackingData.currentLocation !== 'Not available') {
          order.currentLocation = trackingData.currentLocation;
        }
        if (trackingData.estimatedDeliveryDate) {
          order.estimatedDeliveryDate = trackingData.estimatedDeliveryDate;
        }
        order.lastTrackingUpdate = new Date();

        if (Array.isArray(trackingData.trackingEvents)) {
          trackingData.trackingEvents.forEach((ev) => order.addTrackingEvent(ev));
        }
        await order.save();
      }

      res.json({
        success: true,
        orderId: order?._id || null,
        orderNumber: order?._id ? `#${String(order._id).slice(-8).toUpperCase()}` : null,
        orderDate: order?.createdAt,
        awbCode: trackingData.awbCode,
        courierName: trackingData.courierName,
        status: trackingData.status,
        statusLabel: trackingData.statusLabel,
        currentLocation: trackingData.currentLocation || 'Not available',
        estimatedDeliveryDate: trackingData.estimatedDeliveryDate,
        lastUpdated: order?.lastTrackingUpdate || new Date(),
        events: trackingData.trackingEvents || [],
        activities: trackingData.activities || [],
      });
    } catch (err) {
      res.status(400);
      throw new Error(`Tracking query failed: ${err.message}`);
    }
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// 8. CANCEL SHIPMENT (Admin)
// @route   POST /api/shipping/cancel/:orderId
// @access  Private / Admin
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/cancel/:orderId',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.orderId);
    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    if (!order.awbCode && !order.shiprocketShipmentId) {
      res.status(400);
      throw new Error('No active shipment found to cancel');
    }

    try {
      if (order.awbCode) {
        await shiprocketService.cancelShipment(order.awbCode);
      }
      order.shippingStatus = 'CANCELLED';
      order.orderStatus = 'cancelled';
      await order.save();

      res.json({
        success: true,
        message: 'Shipment cancelled in Shiprocket and order status updated.',
        order,
      });
    } catch (err) {
      res.status(400);
      throw new Error(`Cancellation failed: ${err.message}`);
    }
  })
);

module.exports = router;
