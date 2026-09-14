const express = require('express');
const asyncHandler = require('express-async-handler');
const Coupon = require('../models/Coupon');
const { protect, admin } = require('../middleware/authMiddleware');

const router = express.Router();

// Seed initial default coupons if not existing
const ensureDefaultCoupons = async () => {
  const defaults = [
    { code: 'BOVATO10', discountPercent: 10, minCartValue: 0, type: 'welcome' },
    { code: 'HOTDEAL15', discountPercent: 15, minCartValue: 799, type: 'special_offer' },
    { code: 'VIP20', discountPercent: 20, minCartValue: 1499, type: 'special_offer' },
    { code: 'COMEBACK15', discountPercent: 15, minCartValue: 0, type: 'abandoned_cart' },
  ];

  for (const c of defaults) {
    const exists = await Coupon.findOne({ code: c.code });
    if (!exists) {
      await Coupon.create(c);
    }
  }
};
ensureDefaultCoupons();

// @desc    Validate a coupon code against cart total
// @route   POST /api/coupons/validate
// @access  Public
router.post(
  '/validate',
  asyncHandler(async (req, res) => {
    const { code } = req.body;
    const subtotal = Number(req.body.cartTotal !== undefined ? req.body.cartTotal : req.body.subtotal !== undefined ? req.body.subtotal : req.body.amount) || 0;

    if (!code) {
      res.status(400);
      throw new Error('Coupon code is required');
    }

    const cleanCode = code.trim().toUpperCase();
    const coupon = await Coupon.findOne({ code: cleanCode, isActive: true });

    if (!coupon) {
      res.status(404);
      throw new Error('Invalid or expired coupon code');
    }

    if (coupon.expiresAt && new Date() > coupon.expiresAt) {
      res.status(400);
      throw new Error('This coupon code has expired');
    }

    if (subtotal < coupon.minCartValue) {
      res.status(400);
      throw new Error(`Minimum cart value of ₹${coupon.minCartValue} required for this coupon`);
    }

    const rawDiscount = (subtotal * coupon.discountPercent) / 100;
    const discountAmount = Math.round(Math.min(rawDiscount, coupon.maxDiscount || 1000));
    const finalTotal = Math.max(0, subtotal - discountAmount);

    res.json({
      valid: true,
      code: coupon.code,
      discountPercent: coupon.discountPercent,
      discountAmount,
      finalTotal,
      message: `Coupon ${coupon.code} applied: ₹${discountAmount} discount!`,
    });
  })
);

// @desc    Generate a dynamic personalized lead offer coupon
// @route   POST /api/coupons/generate-offer
// @access  Public
router.post(
  '/generate-offer',
  asyncHandler(async (req, res) => {
    const { discountPercent = 10, type = 'welcome' } = req.body;
    const code = `BOVATO${discountPercent}-${Math.floor(100 + Math.random() * 900)}`;

    const coupon = await Coupon.create({
      code,
      discountPercent: Number(discountPercent),
      minCartValue: 0,
      type,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days validity
    });

    res.status(201).json({
      code: coupon.code,
      discountPercent: coupon.discountPercent,
      expiresAt: coupon.expiresAt,
    });
  })
);

// @desc    Get all coupons (Admin)
// @route   GET /api/coupons
// @access  Private/Admin
router.get(
  '/',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const coupons = await Coupon.find({}).sort({ createdAt: -1 });
    res.json(coupons);
  })
);

// @desc    Create new coupon (Admin)
// @route   POST /api/coupons
// @access  Private/Admin
router.post(
  '/',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const rawCode = (req.body.code || '').trim().toUpperCase();
    if (!rawCode) {
      res.status(400);
      throw new Error('Coupon code is required');
    }

    const exists = await Coupon.findOne({ code: rawCode });
    if (exists) {
      res.status(400);
      throw new Error('Coupon code already exists');
    }

    const discountPercent = Math.min(
      90,
      Math.max(
        1,
        Number(req.body.discountPercent || req.body.discountValue || req.body.discount || 10)
      )
    );

    const validTypes = ['welcome', 'abandoned_cart', 'special_offer', 'referral', 'general'];
    const rawType = req.body.type || req.body.discountType || 'special_offer';
    const type = validTypes.includes(rawType) ? rawType : 'special_offer';

    const coupon = await Coupon.create({
      code: rawCode,
      discountPercent,
      minCartValue: Number(req.body.minCartValue !== undefined ? req.body.minCartValue : req.body.minOrderValue) || 0,
      maxDiscount: Number(req.body.maxDiscount !== undefined ? req.body.maxDiscount : req.body.maxDiscountAmount) || 1000,
      type,
      isActive: req.body.isActive !== undefined ? Boolean(req.body.isActive) : true,
      expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : undefined,
    });

    res.status(201).json(coupon);
  })
);

module.exports = router;
