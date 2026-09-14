const express = require('express');
const { body } = require('express-validator');
const asyncHandler = require('express-async-handler');
const Review = require('../models/Review');
const validate = require('../middleware/validateMiddleware');
const { protect, admin, optionalAuth } = require('../middleware/authMiddleware');

const router = express.Router();

// @desc    Get all reviews with stats and optional product filter
// @route   GET /api/reviews
// @access  Public
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { productSlug, limit = 50, page = 1 } = req.query;

    const query = {};
    if (productSlug) {
      query.productSlug = productSlug;
    }

    const reviews = await Review.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Review.countDocuments(query);

    // Aggregate statistics
    const allReviews = await Review.find(query).select('rating');
    const totalCount = allReviews.length;
    const avgRating = totalCount > 0
      ? (allReviews.reduce((sum, r) => sum + r.rating, 0) / totalCount).toFixed(1)
      : 4.8;

    const ratingBreakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    allReviews.forEach((r) => {
      const rounded = Math.round(r.rating);
      if (ratingBreakdown[rounded] !== undefined) ratingBreakdown[rounded]++;
    });

    res.json({
      reviews,
      page: Number(page),
      limit: Number(limit),
      total,
      stats: {
        totalReviews: totalCount > 0 ? `${totalCount}+` : '10k+',
        averageRating: Number(avgRating),
        repeatCustomers: '82%',
        ratingBreakdown,
      },
    });
  })
);

// @desc    Get review stats
// @route   GET /api/reviews/stats
// @access  Public
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const allReviews = await Review.find({}).select('rating');
    const totalCount = allReviews.length;
    const avgRating = totalCount > 0
      ? (allReviews.reduce((sum, r) => sum + r.rating, 0) / totalCount).toFixed(1)
      : 4.8;

    res.json({
      verifiedReviews: totalCount > 0 ? `${totalCount}+` : '10k+',
      averageRating: Number(avgRating),
      repeatCustomers: '82%',
    });
  })
);

// @desc    Get reviews for a specific product by slug
// @route   GET /api/reviews/:productSlug
// @access  Public
router.get(
  '/:productSlug',
  asyncHandler(async (req, res) => {
    const { productSlug } = req.params;
    const { limit = 50, page = 1 } = req.query;

    const query = { productSlug };
    const reviews = await Review.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Review.countDocuments(query);
    const allReviews = await Review.find(query).select('rating');
    const totalCount = allReviews.length;
    const avgRating = totalCount > 0
      ? (allReviews.reduce((sum, r) => sum + r.rating, 0) / totalCount).toFixed(1)
      : 4.8;

    res.json({
      reviews,
      page: Number(page),
      limit: Number(limit),
      total,
      stats: {
        totalReviews: totalCount > 0 ? `${totalCount}+` : '10k+',
        averageRating: Number(avgRating),
        repeatCustomers: '82%',
      },
    });
  })
);

// @desc    Create a new customer review
// @route   POST /api/reviews
// @access  Public / Optional Auth
router.post(
  '/',
  optionalAuth,
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('rating').isFloat({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('title').trim().notEmpty().withMessage('Review title is required'),
    body('body').trim().notEmpty().withMessage('Review content is required'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { name, location, rating, title, body, productSlug, productName } = req.body;

    const review = await Review.create({
      name,
      location: location || 'India',
      rating: Number(rating),
      title,
      body,
      productSlug: productSlug || '',
      productName: productName || '',
      isVerified: true,
      user: req.user ? req.user._id : null,
    });

    res.status(201).json(review);
  })
);

// @desc    Delete review (Admin only)
// @route   DELETE /api/reviews/:id
// @access  Private/Admin
router.delete(
  '/:id',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const review = await Review.findById(req.params.id);
    if (!review) {
      res.status(404);
      throw new Error('Review not found');
    }

    await review.deleteOne();
    res.json({ message: 'Review removed' });
  })
);

module.exports = router;
