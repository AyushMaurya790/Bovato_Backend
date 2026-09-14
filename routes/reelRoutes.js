const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const Reel = require('../models/Reel');
const Product = require('../models/Product');
const { protect, admin } = require('../middleware/authMiddleware');

// High-definition curated AI and Google grooming routine reels
const DEFAULT_AI_REELS = [
  {
    title: 'AI Morning Routine: Deep Charcoal Cleansing & Skin Brightening',
    handle: '@bovato_india',
    views: '62.4K',
    likes: '5.8K',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-man-washing-his-face-in-the-bathroom-43094-large.mp4',
    productSlug: 'bright-up-face-wash',
    productName: 'Bright-Up Face Wash',
    productPrice: 449,
    reelType: 'ai_reel',
    order: 1,
    isActive: true,
  },
  {
    title: 'Google AI Sun Shield Test: Zero White Cast on Indian Skin',
    handle: '@bovato_india',
    views: '78.9K',
    likes: '7.1K',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-young-man-applying-face-cream-41551-large.mp4',
    productSlug: 'daily-defense-spf-50',
    productName: 'Daily Defense SPF 50',
    productPrice: 549,
    reelType: 'google_reel',
    order: 2,
    isActive: true,
  },
  {
    title: 'AI Transformation: 30-Day Beard Thickness & Patch Repair',
    handle: '@bovato_india',
    views: '54.1K',
    likes: '4.9K',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-hands-of-a-man-applying-beard-oil-41553-large.mp4',
    productSlug: 'beard-growth-oil',
    productName: 'Beard Growth Oil',
    productPrice: 499,
    reelType: 'ai_reel',
    order: 3,
    isActive: true,
  },
  {
    title: 'Post-Workout Ice Menthol Shower Refresh Routine',
    handle: '@bovato_india',
    views: '43.5K',
    likes: '3.8K',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-man-taking-a-shower-41552-large.mp4',
    productSlug: 'energizing-body-wash',
    productName: 'Skin Energizing Body Wash',
    productPrice: 399,
    reelType: 'google_reel',
    order: 4,
    isActive: true,
  },
  {
    title: 'All-Day Oil-Free Hydration Lock Routine for Men',
    handle: '@bovato_india',
    views: '49.2K',
    likes: '4.3K',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-man-applying-lotion-to-his-face-41550-large.mp4',
    productSlug: 'hydra-face-cream',
    productName: 'Hydra Face Cream',
    productPrice: 499,
    reelType: 'ai_reel',
    order: 5,
    isActive: true,
  },
  {
    title: '15-Min Instant Sun De-Tan Facial for Indian Men',
    handle: '@bovato_india',
    views: '68.0K',
    likes: '6.4K',
    videoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-man-cleaning-his-face-with-towel-43093-large.mp4',
    productSlug: 'd-tan-cream',
    productName: 'D-Tan Brightening Cream',
    productPrice: 499,
    reelType: 'ai_reel',
    order: 6,
    isActive: true,
  },
];

// @desc    Get active reels for storefront
// @route   GET /api/reels
// @access  Public
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const reels = await Reel.find({ isActive: true }).sort({ order: 1, createdAt: -1 });
    res.json(reels);
  })
);

// @desc    Get all reels for admin panel
// @route   GET /api/reels/admin
// @access  Private/Admin
router.get(
  '/admin',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const reels = await Reel.find().sort({ order: 1, createdAt: -1 });
    res.json(reels);
  })
);

// @desc    Create new reel from admin panel
// @route   POST /api/reels
// @access  Private/Admin
router.post(
  '/',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const {
      title,
      videoUrl,
      thumbnail,
      handle,
      views,
      likes,
      productSlug,
      productName,
      productPrice,
      reelType,
      isActive,
      order,
    } = req.body;

    if (!title || !videoUrl) {
      res.status(400);
      throw new Error('Title and Video URL are required');
    }

    // Auto-fetch product details if productSlug is provided
    let finalProductName = productName;
    let finalProductPrice = productPrice;

    if (productSlug && (!finalProductName || !finalProductPrice)) {
      const product = await Product.findOne({ slug: productSlug });
      if (product) {
        finalProductName = product.name;
        finalProductPrice = product.price;
      }
    }

    const reel = await Reel.create({
      title,
      videoUrl,
      thumbnail: thumbnail || '',
      handle: handle || '@bovato_india',
      views: views || '25.0K',
      likes: likes || '2.1K',
      productSlug: productSlug || 'bright-up-face-wash',
      productName: finalProductName || 'BOVATO Routine',
      productPrice: Number(finalProductPrice) || 449,
      reelType: reelType || 'ai_reel',
      isActive: isActive !== undefined ? isActive : true,
      order: Number(order) || 0,
    });

    res.status(201).json(reel);
  })
);

// @desc    Update reel from admin panel
// @route   PUT /api/reels/:id
// @access  Private/Admin
router.put(
  '/:id',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const reel = await Reel.findById(req.params.id);

    if (!reel) {
      res.status(404);
      throw new Error('Reel not found');
    }

    const {
      title,
      videoUrl,
      thumbnail,
      handle,
      views,
      likes,
      productSlug,
      productName,
      productPrice,
      reelType,
      isActive,
      order,
    } = req.body;

    reel.title = title !== undefined ? title : reel.title;
    reel.videoUrl = videoUrl !== undefined ? videoUrl : reel.videoUrl;
    reel.thumbnail = thumbnail !== undefined ? thumbnail : reel.thumbnail;
    reel.handle = handle !== undefined ? handle : reel.handle;
    reel.views = views !== undefined ? views : reel.views;
    reel.likes = likes !== undefined ? likes : reel.likes;
    reel.productSlug = productSlug !== undefined ? productSlug : reel.productSlug;
    reel.productName = productName !== undefined ? productName : reel.productName;
    reel.productPrice = productPrice !== undefined ? Number(productPrice) : reel.productPrice;
    reel.reelType = reelType !== undefined ? reelType : reel.reelType;
    reel.isActive = isActive !== undefined ? isActive : reel.isActive;
    reel.order = order !== undefined ? Number(order) : reel.order;

    const updated = await reel.save();
    res.json(updated);
  })
);

// @desc    Delete reel from admin panel
// @route   DELETE /api/reels/:id
// @access  Private/Admin
router.delete(
  '/:id',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const reel = await Reel.findByIdAndDelete(req.params.id);

    if (!reel) {
      res.status(404);
      throw new Error('Reel not found');
    }

    res.json({ success: true, message: 'Reel permanently deleted from database' });
  })
);

// @desc    Seed or reset default AI & Google reels
// @route   POST /api/reels/seed-defaults
// @access  Private/Admin
router.post(
  '/seed-defaults',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    await Reel.deleteMany({ handle: '@bovato_india' });
    const inserted = await Reel.insertMany(DEFAULT_AI_REELS);
    res.json({ success: true, count: inserted.length, reels: inserted });
  })
);

module.exports = router;
