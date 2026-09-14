const express = require('express');
const asyncHandler = require('express-async-handler');
const Alert = require('../models/Alert');
const Lead = require('../models/Lead');
const { protect, admin } = require('../middleware/authMiddleware');

const router = express.Router();

// @desc    Subscribe to price drop or back-in-stock alert
// @route   POST /api/alerts/subscribe
// @access  Public
router.post(
  '/subscribe',
  asyncHandler(async (req, res) => {
    const { phone, email, productSlug, productName, type = 'price_drop', targetPrice = 0 } = req.body;

    if (!phone && !email) {
      res.status(400);
      throw new Error('Phone number or email is required to subscribe for alerts');
    }

    const cleanPhone = (phone || '').replace(/[^0-9+]/g, '');

    const alert = await Alert.create({
      phone: cleanPhone,
      email: email || '',
      productSlug,
      productName: productName || productSlug,
      type,
      targetPrice: Number(targetPrice) || 0,
    });

    // Also register a warm lead in the CRM system
    if (cleanPhone) {
      const existingLead = await Lead.findOne({ phone: cleanPhone });
      if (existingLead) {
        existingLead.intent = type === 'price_drop' ? 'price_drop_alert' : 'back_in_stock';
        existingLead.leadScore = Math.max(existingLead.leadScore, 65);
        if (existingLead.category === 'COLD') existingLead.category = 'WARM';
        await existingLead.save();
      } else {
        await Lead.create({
          name: 'Subscriber',
          phone: cleanPhone,
          email: email || '',
          productSlug,
          productName: productName || productSlug,
          intent: type === 'price_drop' ? 'price_drop_alert' : 'back_in_stock',
          leadScore: 65,
          category: 'WARM',
          source: 'price_alert',
        });
      }
    }

    res.status(201).json({
      success: true,
      message: `Subscribed successfully! We will notify you via WhatsApp as soon as ${productName || 'product'} ${type === 'price_drop' ? 'price drops' : 'is back in stock'}.`,
      alert,
    });
  })
);

// @desc    Get all alerts (Admin)
// @route   GET /api/alerts
// @access  Private/Admin
router.get(
  '/',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const alerts = await Alert.find({}).sort({ createdAt: -1 });
    res.json(alerts);
  })
);

module.exports = router;
