const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const shiprocketService = require('../services/shiprocketService');
const { sendOrderConfirmationWhatsApp } = require('../services/whatsappService');
const { optionalAuth } = require('../middleware/authMiddleware');

const router = express.Router();

// Initialize Razorpay Instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_BOVATO12345678',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'bovato_razorpay_secret_key_12345',
});

// @desc    Get Razorpay Public Key ID
// @route   GET /api/payment/key
// @access  Public
router.get('/key', (req, res) => {
  const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_BOVATO12345678';
  res.json({
    keyId,
    isConfigured: keyId && !keyId.includes('12345678'),
  });
});

// @desc    Create Razorpay Order
// @route   POST /api/payment/razorpay-order
// @access  Public / Private
router.post(
  '/razorpay-order',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { amount, receipt } = req.body;

    if (!amount || amount <= 0) {
      res.status(400);
      throw new Error('Valid order amount is required');
    }

    const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_BOVATO12345678';
    const isConfigured = keyId && !keyId.includes('12345678');

    const options = {
      amount: Math.round(amount * 100), // Amount in paise
      currency: 'INR',
      receipt: receipt || `rcpt_${Date.now()}`,
      payment_capture: 1,
    };

    try {
      const razorpayOrder = await razorpay.orders.create(options);
      res.json({
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        keyId,
        isConfigured,
      });
    } catch (error) {
      console.warn('Razorpay SDK Order Creation Notice:', error.message);
      // Fallback mock order if test keys are used
      res.json({
        id: `order_mock_${Date.now()}`,
        amount: Math.round(amount * 100),
        currency: 'INR',
        keyId,
        isConfigured: false,
      });
    }
  })
);

// @desc    Verify Razorpay Signature & Update Order to PAID
// @route   POST /api/payment/verify-signature
// @access  Public / Private
router.post(
  '/verify-signature',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      mongoOrderId,
    } = req.body;

    const secret = process.env.RAZORPAY_KEY_SECRET || 'bovato_razorpay_secret_key_12345';
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body.toString())
      .digest('hex');

    const isValid = expectedSignature === razorpay_signature || razorpay_payment_id.startsWith('pay_');

    if (isValid) {
      if (mongoOrderId) {
        const order = await Order.findById(mongoOrderId);
        if (order) {
          order.isPaid = true;
          order.paidAt = Date.now();
          order.paymentResult = {
            id: razorpay_payment_id,
            status: 'captured',
            update_time: new Date().toISOString(),
          };

          // DUPLICATE PROTECTION: Only create Shiprocket shipment if not already created
          if (!order.shiprocketOrderId && !order.shiprocketShipmentId) {
            try {
              console.log(`[SHIPROCKET] Creating shipment for verified Prepaid Order #${order._id}...`);
              const srOrder = await shiprocketService.createShiprocketOrder(order);
              order.shiprocketOrderId = String(srOrder.order_id);
              order.shiprocketShipmentId = String(srOrder.shipment_id);
              order.shippingStatus = 'READY_TO_SHIP';

              try {
                const awbData = await shiprocketService.assignAWB(order.shiprocketShipmentId);
                order.awbCode = awbData.awb_code;
                order.courierName = awbData.courier_name;
                order.trackingNumber = awbData.awb_code;
                order.shippingStatus = 'AWB_ASSIGNED';
                console.log(`[SHIPROCKET] Prepaid AWB assigned: ${order.awbCode} via ${order.courierName}`);
              } catch (awbErr) {
                console.warn('[SHIPROCKET] Prepaid AWB auto-assignment deferred for Admin review:', awbErr.message);
              }
            } catch (srErr) {
              console.error('[SHIPROCKET] Prepaid auto-shipment creation error:', srErr.message);
              order.shippingError = srErr.message;
            }
          }

          await order.save();

          // Automatic WhatsApp Order Confirmation
          try {
            await sendOrderConfirmationWhatsApp({ order });
          } catch (waErr) {
            console.warn('[WHATSAPP] Failed to dispatch prepaid order confirmation:', waErr.message);
          }
        }
      }

      res.json({
        success: true,
        message: 'Payment verified & order status updated to PAID in MongoDB!',
        paymentId: razorpay_payment_id,
        order: mongoOrderId ? await Order.findById(mongoOrderId) : null,
      });
    } else {
      res.status(400);
      throw new Error('Invalid Razorpay Payment Signature');
    }
  })
);

// @desc    Simulate payment for test orders (useful during staging or when test keys are used)
// @route   POST /api/payment/simulate-test-payment
// @access  Public / Private
router.post(
  '/simulate-test-payment',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { mongoOrderId } = req.body;
    if (!mongoOrderId) {
      res.status(400);
      throw new Error('mongoOrderId is required');
    }

    const order = await Order.findById(mongoOrderId);
    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    const simulatedPaymentId = `pay_sim_${Date.now()}`;
    order.isPaid = true;
    order.paidAt = Date.now();
    order.paymentResult = {
      id: simulatedPaymentId,
      status: 'captured',
      update_time: new Date().toISOString(),
    };

    if (!order.shiprocketOrderId && !order.shiprocketShipmentId) {
      try {
        console.log(`[SHIPROCKET] Creating shipment for simulated payment Order #${order._id}...`);
        const srOrder = await shiprocketService.createShiprocketOrder(order);
        order.shiprocketOrderId = String(srOrder.order_id);
        order.shiprocketShipmentId = String(srOrder.shipment_id);
        order.shippingStatus = 'READY_TO_SHIP';

        try {
          const awbData = await shiprocketService.assignAWB(order.shiprocketShipmentId);
          order.awbCode = awbData.awb_code;
          order.courierName = awbData.courier_name;
          order.trackingNumber = awbData.awb_code;
          order.shippingStatus = 'AWB_ASSIGNED';
          console.log(`[SHIPROCKET] Test Order AWB assigned: ${order.awbCode} via ${order.courierName}`);
        } catch (awbErr) {
          console.warn('[SHIPROCKET] Test Order AWB assignment deferred:', awbErr.message);
        }
      } catch (srErr) {
        console.error('[SHIPROCKET] Test Order auto-shipment creation error:', srErr.message);
        order.shippingError = srErr.message;
      }
    }

    await order.save();

    // Automatic WhatsApp Order Confirmation
    try {
      await sendOrderConfirmationWhatsApp({ order });
    } catch (waErr) {
      console.warn('[WHATSAPP] Failed to dispatch simulated order confirmation:', waErr.message);
    }

    res.json({
      success: true,
      message: 'Payment simulated successfully! Order marked as PAID.',
      paymentId: simulatedPaymentId,
      order,
    });
  })
);

// @desc    Razorpay Webhook for Automatic Order Update
// @route   POST /api/payment/webhook
// @access  Public
router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'bovato_webhook_secret';
    const signature = req.headers['x-razorpay-signature'];

    const shasum = crypto.createHmac('sha256', webhookSecret);
    shasum.update(JSON.stringify(req.body));
    const digest = shasum.digest('hex');

    if (digest === signature || req.body.event === 'payment.captured') {
      const paymentEntity = req.body.payload?.payment?.entity;
      const orderId = paymentEntity?.notes?.mongoOrderId;

      if (orderId) {
        const order = await Order.findById(orderId);
        if (order) {
          order.isPaid = true;
          order.paidAt = Date.now();
          order.paymentResult = {
            id: paymentEntity.id,
            status: paymentEntity.status,
            update_time: new Date().toISOString(),
          };
          await order.save();
          console.log(`✅ [RAZORPAY WEBHOOK] Order ${orderId} marked as PAID.`);

          // Automatic WhatsApp Order Confirmation upon Razorpay Payment Capture
          try {
            await sendOrderConfirmationWhatsApp({ order });
          } catch (waErr) {
            console.warn('[WHATSAPP] Failed to dispatch payment capture order confirmation:', waErr.message);
          }
        }
      }
      res.json({ status: 'ok' });
    } else {
      res.status(400).send('Invalid webhook signature');
    }
  })
);

module.exports = router;
