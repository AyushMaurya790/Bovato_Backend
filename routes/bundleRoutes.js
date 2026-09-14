const express = require('express');
const asyncHandler = require('express-async-handler');

const router = express.Router();

const BUNDLES = [
  {
    slug: 'daily-essentials',
    name: 'Daily Essentials Kit',
    tagline: 'Complete 3-step morning ritual',
    products: ['Face Wash', 'Face Cream', 'SPF 50'],
    productSlugs: ['bright-up-face-wash', 'hydra-face-cream', 'daily-defense-spf-50'],
    price: 1299,
    mrp: 1647,
    savings: 348,
    discountPercent: 21,
    image: 'http://localhost:5001/images/products/anti-pollution-face-wash.svg',
  },
  {
    slug: 'office-ready',
    name: 'Office Ready Kit',
    tagline: 'Clean look and sun & environmental protection',
    products: ['Face Wash', 'D-Tan Cream', 'Lip Balm'],
    productSlugs: ['bright-up-face-wash', 'd-tan-cream', 'repair-lip-balm'],
    price: 1399,
    mrp: 1747,
    savings: 348,
    discountPercent: 20,
    image: 'http://localhost:5001/images/products/detan-pack.svg',
  },
  {
    slug: 'weekend-reset',
    name: 'Weekend Reset Kit',
    tagline: 'Deep body recovery and beard nourishment',
    products: ['Body Wash', 'Body Lotion', 'Beard Max'],
    productSlugs: ['energizing-body-wash', 'nourishing-body-lotion', 'beard-growth-oil'],
    price: 1199,
    mrp: 1547,
    savings: 348,
    discountPercent: 22,
    image: 'http://localhost:5001/images/products/body-lotion.svg',
  },
  {
    slug: 'premium-gift',
    name: 'Premium Gift Box',
    tagline: 'The ultimate complete luxury grooming collection',
    products: ['Full grooming ritual'],
    productSlugs: ['bright-up-face-wash', 'hydra-face-cream', 'daily-defense-spf-50', 'd-tan-cream', 'beard-growth-oil'],
    price: 2499,
    mrp: 3299,
    savings: 800,
    discountPercent: 24,
    image: 'http://localhost:5001/images/products/beard-growth-oil.svg',
  },
];

const BUILD_A_KIT_TIERS = [
  { count: 3, off: 10, label: 'Pick 3+ → 10% OFF' },
  { count: 4, off: 15, label: 'Pick 4+ → 15% OFF' },
  { count: 5, off: 20, label: 'Pick 5+ → 20% OFF' },
];

// @desc    Get all kits and bundles
// @route   GET /api/bundles
// @access  Public
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({
      bundles: BUNDLES,
      tiers: BUILD_A_KIT_TIERS,
    });
  })
);

// @desc    Get build-your-kit tier discount rules
// @route   GET /api/bundles/tiers
// @access  Public
router.get(
  '/tiers',
  asyncHandler(async (req, res) => {
    res.json(BUILD_A_KIT_TIERS);
  })
);

// @desc    Get bundle by slug
// @route   GET /api/bundles/:slug
// @access  Public
router.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const bundle = BUNDLES.find((b) => b.slug === req.params.slug);
    if (!bundle) {
      res.status(404);
      throw new Error('Bundle not found');
    }
    res.json(bundle);
  })
);

module.exports = router;
