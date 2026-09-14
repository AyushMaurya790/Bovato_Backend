const express = require('express');
const asyncHandler = require('express-async-handler');
const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Helper to get or create wishlist
const getOrCreateWishlist = async (userId) => {
  let wishlist = await Wishlist.findOne({ user: userId });
  if (!wishlist) {
    wishlist = await Wishlist.create({ user: userId, products: [], productSlugs: [] });
  }
  return wishlist;
};

// @desc    Get user's wishlist (both products and slugs)
// @route   GET /api/wishlist
// @access  Private
router.get(
  '/',
  protect,
  asyncHandler(async (req, res) => {
    let wishlist = await getOrCreateWishlist(req.user._id);

    // Sync productSlugs if empty but products exist
    if (wishlist.products.length > 0 && (!wishlist.productSlugs || wishlist.productSlugs.length === 0)) {
      const prods = await Product.find({ _id: { $in: wishlist.products } }).select('slug');
      wishlist.productSlugs = prods.map((p) => p.slug);
      await wishlist.save();
    }

    // Populate products
    const populated = await Wishlist.findById(wishlist._id).populate(
      'products',
      'slug name price mrp image rating reviews badge category concern'
    );

    res.json(populated);
  })
);

// @desc    Get array of wishlist product slugs only (for bovato useShop & WishlistSync)
// @route   GET /api/wishlist/slugs
// @access  Private
router.get(
  '/slugs',
  protect,
  asyncHandler(async (req, res) => {
    const wishlist = await getOrCreateWishlist(req.user._id);
    res.json(wishlist.productSlugs || []);
  })
);

// @desc    Sync / merge wishlist slugs (for bovato frontend on sign-in / changes)
// @route   POST /api/wishlist/sync
// @access  Private
router.post(
  '/sync',
  protect,
  asyncHandler(async (req, res) => {
    const { slugs = [] } = req.body;
    const wishlist = await getOrCreateWishlist(req.user._id);

    const mergedSlugs = Array.from(new Set([...(wishlist.productSlugs || []), ...slugs]));

    // Match with database products
    const prods = await Product.find({ slug: { $in: mergedSlugs } });
    const prodIds = prods.map((p) => p._id);

    wishlist.productSlugs = mergedSlugs;
    wishlist.products = prodIds;
    await wishlist.save();

    res.json({
      productSlugs: wishlist.productSlugs,
      count: wishlist.productSlugs.length,
    });
  })
);

// @desc    Toggle product in wishlist by slug or ID
// @route   POST /api/wishlist & POST /api/wishlist/toggle
// @access  Private
const handleToggleWishlist = asyncHandler(async (req, res) => {
  const { slug, productId } = req.body;
  const targetSlug = slug || (productId ? (await Product.findById(productId))?.slug : null);

  if (!targetSlug) {
    res.status(400);
    throw new Error('Product slug or ID is required');
  }

  const product = await Product.findOne({ slug: targetSlug });
  const wishlist = await getOrCreateWishlist(req.user._id);

  const slugIndex = (wishlist.productSlugs || []).indexOf(targetSlug);
  let added = false;

  if (slugIndex > -1) {
    // Remove
    wishlist.productSlugs.splice(slugIndex, 1);
    if (product) {
      wishlist.products = wishlist.products.filter((id) => id.toString() !== product._id.toString());
    }
  } else {
    // Add
    wishlist.productSlugs.push(targetSlug);
    if (product && !wishlist.products.includes(product._id)) {
      wishlist.products.push(product._id);
    }
    added = true;
  }

  await wishlist.save();

  res.json({
    success: true,
    added,
    slug: targetSlug,
    productSlugs: wishlist.productSlugs,
  });
});

router.post('/', protect, handleToggleWishlist);
router.post('/toggle', protect, handleToggleWishlist);

// @desc    Add product to wishlist (accepts :identifier as slug OR ObjectId)
// @route   POST /api/wishlist/:identifier
// @access  Private
router.post(
  '/:identifier',
  protect,
  asyncHandler(async (req, res) => {
    const { identifier } = req.params;
    let product = null;

    if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
      product = await Product.findById(identifier);
    }
    if (!product) {
      product = await Product.findOne({ slug: identifier });
    }

    const targetSlug = product ? product.slug : identifier;
    const wishlist = await getOrCreateWishlist(req.user._id);

    if (!wishlist.productSlugs.includes(targetSlug)) {
      wishlist.productSlugs.push(targetSlug);
    }
    if (product && !wishlist.products.includes(product._id)) {
      wishlist.products.push(product._id);
    }

    await wishlist.save();
    res.status(201).json(wishlist);
  })
);

// @desc    Remove product from wishlist (accepts :identifier as slug OR ObjectId)
// @route   DELETE /api/wishlist/:identifier
// @access  Private
router.delete(
  '/:identifier',
  protect,
  asyncHandler(async (req, res) => {
    const { identifier } = req.params;
    const wishlist = await getOrCreateWishlist(req.user._id);

    let product = null;
    if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
      product = await Product.findById(identifier);
    }
    const targetSlug = product ? product.slug : identifier;

    wishlist.productSlugs = (wishlist.productSlugs || []).filter((s) => s !== targetSlug && s !== identifier);
    if (product) {
      wishlist.products = wishlist.products.filter((id) => id.toString() !== product._id.toString());
    }

    await wishlist.save();
    res.json({ message: 'Product removed from wishlist', productSlugs: wishlist.productSlugs });
  })
);

module.exports = router;
