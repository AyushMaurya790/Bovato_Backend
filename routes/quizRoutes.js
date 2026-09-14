const express = require('express');
const asyncHandler = require('express-async-handler');
const QuizResult = require('../models/QuizResult');
const Product = require('../models/Product');
const { protect, optionalAuth } = require('../middleware/authMiddleware');

const router = express.Router();

// Helper to calculate recommendations from picks / concerns
const getRecommendations = async (concernsList = []) => {
  const allProducts = await Product.find({ isActive: true });

  const scored = allProducts.map((p) => {
    const score = (p.concern || []).reduce(
      (acc, c) => acc + (concernsList.includes(c) ? 1 : 0),
      0
    );
    return { product: p, score };
  });

  return scored
    .sort((a, b) => b.score - a.score || b.product.rating - a.product.rating)
    .slice(0, 4)
    .map((x) => x.product);
};

// @desc    Quick recommend products based on user quiz picks
// @route   POST /api/quiz/recommend & POST /api/quiz/recommendations
// @access  Public
const handleRecommend = asyncHandler(async (req, res) => {
  const picks = req.body.picks || req.body.concerns || (req.body.answers ? Object.values(req.body.answers) : []);
  const recommended = await getRecommendations(picks);
  res.json({
    picks,
    count: recommended.length,
    recommendedProducts: recommended,
  });
});

router.post('/recommend', handleRecommend);
router.post('/recommendations', handleRecommend);

// @desc    Save quiz result and calculate recommendations
// @route   POST /api/quiz
// @access  Public / Optional Auth
router.post(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { sessionId, answers, concerns, picks } = req.body;
    const concernsList = concerns || picks || [];

    const recommendedProducts = await getRecommendations(concernsList);

    const quizData = {
      sessionId: sessionId || `quiz_${Date.now()}`,
      answers: answers || {},
      concerns: concernsList,
      recommendedProducts: recommendedProducts.map((p) => p._id),
      user: req.user ? req.user._id : (req.body.user_id || undefined),
    };

    const quizResult = await QuizResult.create(quizData);

    const populatedResult = await QuizResult.findById(quizResult._id).populate(
      'recommendedProducts',
      'slug name price mrp image rating reviews badge category concern benefit'
    );

    res.status(201).json(populatedResult);
  })
);

// @desc    Get user's quiz results
// @route   GET /api/quiz/my-results
// @access  Private
router.get(
  '/my-results',
  protect,
  asyncHandler(async (req, res) => {
    const results = await QuizResult.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate('recommendedProducts', 'slug name price mrp image rating reviews badge category concern benefit');

    res.json(results);
  })
);

// @desc    Get quiz result by session ID
// @route   GET /api/quiz/:sessionId
// @access  Public
router.get(
  '/:sessionId',
  asyncHandler(async (req, res) => {
    const result = await QuizResult.findOne({
      sessionId: req.params.sessionId,
    }).populate('recommendedProducts', 'slug name price mrp image rating reviews badge category concern benefit');

    if (result) {
      res.json(result);
    } else {
      res.status(404);
      throw new Error('Quiz result not found');
    }
  })
);

module.exports = router;
