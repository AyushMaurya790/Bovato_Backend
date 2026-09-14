const express = require('express');
const { body } = require('express-validator');
const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const validate = require('../middleware/validateMiddleware');
const { protect, admin } = require('../middleware/authMiddleware');

const router = express.Router();

// @desc    Get all products with filtering and sorting
// @route   GET /api/products
// @access  Public
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const {
      category,
      concern,
      sort = 'featured',
      page = 1,
      limit = 20,
      search,
    } = req.query;

    const query = { isActive: true };

    // Filter by category
    if (category) {
      query.category = category;
    }

    // Filter by concern
    if (concern) {
      const concerns = concern.split(',');
      query.concern = { $in: concerns };
    }

    // Search
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { name: searchRegex },
        { slug: searchRegex },
        { category: searchRegex },
      ];
    }

    // Sorting
    let sortOption = {};
    switch (sort) {
      case 'price-asc':
        sortOption = { price: 1 };
        break;
      case 'price-desc':
        sortOption = { price: -1 };
        break;
      case 'rating':
        sortOption = { rating: -1 };
        break;
      case 'best-selling':
        sortOption = { reviews: -1 };
        break;
      case 'newest':
        sortOption = { createdAt: -1 };
        break;
      default:
        sortOption = { badge: -1, rating: -1 };
    }

    const products = await Product.find(query)
      .sort(sortOption)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('-__v');

    const count = await Product.countDocuments(query);

    const result = {
      products,
      page: Number(page),
      pages: Math.ceil(count / limit),
      total: count,
    };

    res.json(result);
  })
);

// @desc    Get all product categories
// @route   GET /api/products/categories
// @access  Public
router.get(
  '/categories',
  asyncHandler(async (req, res) => {
    res.json(['Skin', 'Beard', 'Body', 'Hair', 'Lips']);
  })
);

// @desc    Get all product concerns
// @route   GET /api/products/concerns
// @access  Public
router.get(
  '/concerns',
  asyncHandler(async (req, res) => {
    res.json([
      { name: 'Acne', emoji: '✦' },
      { name: 'Oily Skin', emoji: '◐' },
      { name: 'Dry Skin', emoji: '◯' },
      { name: 'Dull Skin', emoji: '✺' },
      { name: 'Dark Lips', emoji: '◉' },
      { name: 'Tanning', emoji: '☀' },
      { name: 'Hair Fall', emoji: '≋' },
      { name: 'Sun Protection', emoji: '✷' },
    ]);
  })
);

// @desc    Get single product by slug
// @route   GET /api/products/:slug
// @access  Public
router.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const rawSlug = req.params.slug;

    // Friendly slug alias mapping to ensure 100% bovato storefront compatibility
    const SLUG_ALIASES = {
      'charcoal-face-wash': 'bright-up-face-wash',
      'face-wash': 'bright-up-face-wash',
      'anti-pollution-face-wash': 'bright-up-face-wash',
      'sunscreen': 'daily-defense-spf-50',
      'invisible-sunscreen-spf50': 'daily-defense-spf-50',
      'beard-growth-oil-premium': 'beard-growth-oil',
      'beard-oil': 'beard-growth-oil',
      'beard-wash': 'beard-recharge-wash',
      'beard-recharge-beard-wash': 'beard-recharge-wash',
      'body-wash': 'energizing-body-wash',
      'body-lotion': 'nourishing-body-lotion',
      'spf35-body-lotion': 'nourishing-body-lotion',
      'face-cream': 'hydra-face-cream',
      'd-tan': 'd-tan-cream',
      'tan-reset-detan-pack': 'd-tan-cream',
      'lipbalm': 'repair-lip-balm',
    };

    const targetSlug = SLUG_ALIASES[rawSlug] || rawSlug;

    let product = await Product.findOne({
      slug: targetSlug,
      isActive: true,
    });

    // Fallback: search by regex on slug or name if exact slug match isn't found
    if (!product && rawSlug) {
      const searchPattern = rawSlug.replace(/-/g, '.*');
      const searchRegex = new RegExp(searchPattern, 'i');
      product = await Product.findOne({
        $or: [{ slug: searchRegex }, { name: searchRegex }],
        isActive: true,
      });
    }

    if (product) {
      res.json(product);
    } else {
      res.status(404);
      throw new Error('Product not found');
    }
  })
);

// @desc    Create a product
// @route   POST /api/products
// @access  Private/Admin
router.post(
  '/',
  protect,
  admin,
  [
    body('slug').trim().notEmpty().withMessage('Slug is required'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('category').isIn(['Skin', 'Body', 'Hair', 'Beard', 'Lips']).withMessage('Valid category required'),
    body('price').isNumeric().withMessage('Price must be a number'),
    body('mrp').isNumeric().withMessage('MRP must be a number'),
    body('description').notEmpty().withMessage('Description is required'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    try {
      // Check if slug already exists — if so, make slug unique automatically
      let originalSlug = req.body.slug || req.body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      let existing = await Product.findOne({ slug: originalSlug });
      if (existing) {
        req.body.slug = `${originalSlug}-${Date.now().toString().slice(-4)}`;
        console.log(`ℹ️  Slug collision auto-resolved: '${originalSlug}' -> '${req.body.slug}'`);
      } else {
        req.body.slug = originalSlug;
      }

      const product = await Product.create(req.body);
      res.status(201).json(product);
    } catch (err) {
      console.error('❌ Product CREATE error:', err.name, err.message);
      if (err.errors) {
        console.error('Validation errors:', JSON.stringify(err.errors, null, 2));
      }
      throw err; // re-throw so errorHandler responds with proper message
    }
  })
);

// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Private/Admin
router.put(
  '/:id',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);

    if (product) {
      Object.keys(req.body).forEach((key) => {
        product[key] = req.body[key];
      });

      const updatedProduct = await product.save();
      res.json(updatedProduct);
    } else {
      res.status(404);
      throw new Error('Product not found');
    }
  })
);

// @desc    Delete a product
// @route   DELETE /api/products/:id
// @access  Private/Admin
router.delete(
  '/:id',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);

    if (product) {
      // ── Hard Delete from MongoDB ───────────────────────────────────────
      await Product.findByIdAndDelete(req.params.id);

      // Clean up any reels or reviews linked to this product
      try {
        const Reel = require('../models/Reel');
        await Reel.deleteMany({ productSlug: product.slug });
      } catch {}

      try {
        const Review = require('../models/Review');
        await Review.deleteMany({ product: req.params.id });
      } catch {}

      res.json({ success: true, message: 'Product permanently deleted from database' });
    } else {
      res.status(404);
      throw new Error('Product not found');
    }
  })
);

module.exports = router;
