const express = require('express');
const crypto = require('crypto');
const asyncHandler = require('express-async-handler');
const Cart = require('../models/Cart');
const AbandonedCart = require('../models/AbandonedCart');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const { protect, optionalAuth } = require('../middleware/authMiddleware');
const { normalizeToE164 } = require('../services/whatsappService');

const router = express.Router();

// Helper to find product by id or slug
const findProduct = async (identifier) => {
  if (!identifier) return null;
  if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
    const p = await Product.findById(identifier);
    if (p) return p;
  }
  return await Product.findOne({ slug: identifier });
};

// @desc    Get user's cart
// @route   GET /api/cart
// @access  Private
router.get(
  '/',
  protect,
  asyncHandler(async (req, res) => {
    let cart = await Cart.findOne({ user: req.user._id }).populate(
      'items.product',
      'name price mrp image slug stock category'
    );

    if (!cart) {
      cart = await Cart.create({ user: req.user._id, items: [] });
    }

    res.json(cart);
  })
);

// @desc    Add item to cart (accepts slug or productId)
// @route   POST /api/cart & POST /api/cart/items
// @access  Private
const handleAddToCart = asyncHandler(async (req, res) => {
  const { productId, slug, qty = 1 } = req.body;
    const identifier = slug || productId;

    if (!identifier) {
      res.status(400);
      throw new Error('Product slug or ID is required');
    }

    const product = await findProduct(identifier);
    if (!product) {
      res.status(404);
      throw new Error('Product not found');
    }

    const quantity = Math.max(1, Number(qty) || 1);

    if (product.stock < quantity) {
      res.status(400);
      throw new Error('Insufficient stock');
    }

    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      cart = await Cart.create({ user: req.user._id, items: [] });
    }

    const existingItem = cart.items.find(
      (item) => item.product?.toString() === product._id.toString() || item.slug === product.slug
    );

    if (existingItem) {
      existingItem.qty += quantity;
    } else {
      cart.items.push({
        product: product._id,
        slug: product.slug,
        name: product.name,
        price: product.price,
        mrp: product.mrp,
        image: product.image,
        qty: quantity,
      });
    }

    await cart.save();
    await cart.populate('items.product', 'name price mrp image slug stock category');

    res.status(201).json(cart);
  });

router.post('/', protect, handleAddToCart);
router.post('/items', protect, handleAddToCart);

// @desc    Update cart item quantity (accepts slug or productId as :identifier)
// @route   PUT /api/cart/items/:identifier
// @access  Private
router.put(
  '/items/:identifier',
  protect,
  asyncHandler(async (req, res) => {
    const { qty } = req.body;
    const { identifier } = req.params;
    const cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      res.status(404);
      throw new Error('Cart not found');
    }

    const targetQty = Number(qty);

    if (targetQty <= 0) {
      cart.items = cart.items.filter(
        (item) => item.product?.toString() !== identifier && item.slug !== identifier
      );
    } else {
      const item = cart.items.find(
        (item) => item.product?.toString() === identifier || item.slug === identifier
      );

      if (!item) {
        res.status(404);
        throw new Error('Item not found in cart');
      }

      item.qty = targetQty;
    }

    await cart.save();
    await cart.populate('items.product', 'name price mrp image slug stock category');

    res.json(cart);
  })
);

// @desc    Remove item from cart (accepts slug or productId as :identifier)
// @route   DELETE /api/cart/items/:identifier
// @access  Private
router.delete(
  '/items/:identifier',
  protect,
  asyncHandler(async (req, res) => {
    const { identifier } = req.params;
    const cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      res.status(404);
      throw new Error('Cart not found');
    }

    cart.items = cart.items.filter(
      (item) => item.product?.toString() !== identifier && item.slug !== identifier
    );

    await cart.save();
    res.json({ message: 'Item removed from cart', cart });
  })
);

// @desc    Clear cart
// @route   DELETE /api/cart
// @access  Private
router.delete(
  '/',
  protect,
  asyncHandler(async (req, res) => {
    const cart = await Cart.findOne({ user: req.user._id });

    if (cart) {
      cart.items = [];
      await cart.save();
    }

    res.json({ message: 'Cart cleared' });
  })
);

// ==========================================
// ABANDONED CART RECOVERY & TRACKING ENDPOINTS
// ==========================================

// @desc    Track or update customer cart session
// @route   POST /api/cart/track
// @access  Public / Optional Auth
router.post(
  '/track',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const {
      cartId,
      items = [],
      subtotal = 0,
      discount = 0,
      shipping = 0,
      totalValue = 0,
      customerName,
      phone,
      email,
      consentGiven = false,
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      utmTerm,
      source = 'storefront',
      landingPage,
    } = req.body;

    let cart = null;

    if (cartId) {
      cart = await AbandonedCart.findOne({ cartId });
    }

    const { e164, digits } = normalizeToE164(phone);

    if (!cart && e164) {
      // Check if there is an active/checkout_started cart for this phone
      cart = await AbandonedCart.findOne({
        $or: [{ normalizedPhone: e164 }, { phone: digits }],
        lifecycleStatus: { $in: ['active', 'checkout_started'] },
      });
    }

    const cleanItems = (items || []).map((item) => ({
      product: item.product || item.productId || null,
      slug: item.slug || item.productSlug || 'bovato-item',
      productSlug: item.productSlug || item.slug || '',
      name: item.name || 'Product',
      price: Number(item.price) || 0,
      mrp: Number(item.mrp) || Number(item.price) || 0,
      qty: Math.max(1, Number(item.qty) || 1),
      image: item.image || '',
    }));

    const finalSubtotal = Number(subtotal) || cleanItems.reduce((s, i) => s + i.price * i.qty, 0);
    const finalTotal = Number(totalValue) || Math.max(0, finalSubtotal - Number(discount) + Number(shipping));

    if (cart) {
      cart.items = cleanItems;
      cart.subtotal = finalSubtotal;
      cart.discount = Number(discount) || cart.discount;
      cart.shipping = Number(shipping) || cart.shipping;
      cart.totalValue = finalTotal;
      cart.lastActivityAt = new Date();

      if (customerName) cart.customerName = customerName;
      if (e164) {
        cart.phone = digits;
        cart.normalizedPhone = e164;
      }
      if (email) cart.email = email.toLowerCase().trim();
      if (consentGiven !== undefined) {
        cart.consentGiven = Boolean(consentGiven);
        if (consentGiven && !cart.consentTimestamp) cart.consentTimestamp = new Date();
      }
      if (req.user && !cart.user) {
        cart.user = req.user._id;
        cart.customerId = req.user._id;
      }

      cart.activityHistory.push({
        event: 'cart_updated',
        timestamp: new Date(),
        details: `Cart updated: ${cleanItems.length} item(s), total ₹${finalTotal}`,
      });

      await cart.save();
    } else {
      cart = await AbandonedCart.create({
        cartId: cartId || `cart_${crypto.randomBytes(8).toString('hex')}`,
        user: req.user ? req.user._id : undefined,
        customerId: req.user ? req.user._id : undefined,
        customerName: customerName || (req.user?.name ?? 'Shopper'),
        phone: digits || '',
        normalizedPhone: e164 || '',
        email: email ? email.toLowerCase().trim() : (req.user?.email ?? ''),
        items: cleanItems,
        subtotal: finalSubtotal,
        discount: Number(discount) || 0,
        shipping: Number(shipping) || 0,
        totalValue: finalTotal,
        lifecycleStatus: 'active',
        recoveryStatus: 'active',
        lastActivityAt: new Date(),
        consentGiven: Boolean(consentGiven),
        consentTimestamp: consentGiven ? new Date() : undefined,
        utmSource: utmSource || '',
        utmMedium: utmMedium || '',
        utmCampaign: utmCampaign || '',
        utmContent: utmContent || '',
        utmTerm: utmTerm || '',
        source: source || 'storefront',
        landingPage: landingPage || '',
        activityHistory: [
          {
            event: 'cart_created',
            timestamp: new Date(),
            details: `Cart initialized with ${cleanItems.length} item(s)`,
          },
        ],
      });
    }

    res.status(200).json({
      success: true,
      cartId: cart.cartId,
      lifecycleStatus: cart.lifecycleStatus,
      totalValue: cart.totalValue,
      itemCount: cart.itemCount,
    });
  })
);

// @desc    Update cart by ID
// @route   PUT /api/cart/:id
// @access  Public / Optional Auth
router.put(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const cart = await AbandonedCart.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { cartId: id }],
    });

    if (!cart) {
      res.status(404);
      throw new Error('Cart not found');
    }

    const { items, customerName, phone, email, consentGiven } = req.body;
    if (items) {
      cart.items = items;
      cart.subtotal = items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 1), 0);
      cart.totalValue = cart.subtotal;
    }
    if (customerName) cart.customerName = customerName;
    if (phone) {
      const { e164, digits } = normalizeToE164(phone);
      cart.phone = digits;
      cart.normalizedPhone = e164;
    }
    if (email) cart.email = email;
    if (consentGiven !== undefined) {
      cart.consentGiven = Boolean(consentGiven);
      if (consentGiven && !cart.consentTimestamp) cart.consentTimestamp = new Date();
    }
    cart.lastActivityAt = new Date();
    await cart.save();

    res.json({ success: true, cart });
  })
);

// @desc    Transition cart to CHECKOUT_STARTED
// @route   POST /api/cart/checkout-start
// @access  Public / Optional Auth
router.post(
  '/checkout-start',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { cartId, phone, customerName, email, consentGiven, items, totalValue } = req.body;

    let cart = null;
    if (cartId) {
      cart = await AbandonedCart.findOne({ cartId });
    }

    const { e164, digits } = normalizeToE164(phone);

    if (!cart && e164) {
      cart = await AbandonedCart.findOne({
        $or: [{ normalizedPhone: e164 }, { phone: digits }],
        lifecycleStatus: { $in: ['active', 'checkout_started'] },
      });
    }

    if (!cart && items && items.length > 0) {
      // Create new cart in checkout_started
      cart = await AbandonedCart.create({
        cartId: cartId || `cart_${crypto.randomBytes(8).toString('hex')}`,
        items,
        totalValue: Number(totalValue) || 0,
        subtotal: Number(totalValue) || 0,
      });
    }

    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    cart.lifecycleStatus = 'checkout_started';
    cart.checkoutStarted = true;
    cart.checkoutStartedAt = new Date();
    cart.lastActivityAt = new Date();

    if (customerName) cart.customerName = customerName;
    if (e164) {
      cart.phone = digits;
      cart.normalizedPhone = e164;
    }
    if (email) cart.email = email.toLowerCase().trim();
    if (consentGiven !== undefined) {
      cart.consentGiven = Boolean(consentGiven);
      if (consentGiven && !cart.consentTimestamp) cart.consentTimestamp = new Date();
    }

    cart.activityHistory.push({
      event: 'checkout_started',
      timestamp: new Date(),
      details: 'Customer initiated checkout procedure.',
    });

    await cart.save();

    res.json({
      success: true,
      cartId: cart.cartId,
      lifecycleStatus: cart.lifecycleStatus,
    });
  })
);

// @desc    Voluntarily attach customer contact details and consent to cart
// @route   POST /api/cart/identify-customer
// @access  Public / Optional Auth
router.post(
  '/identify-customer',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { cartId, name, phone, email, consentGiven = true } = req.body;

    if (!phone && !email) {
      res.status(400);
      throw new Error('Please provide at least a mobile number or email');
    }

    const { e164, digits } = normalizeToE164(phone);

    let cart = null;
    if (cartId) {
      cart = await AbandonedCart.findOne({ cartId });
    }

    if (!cart && e164) {
      cart = await AbandonedCart.findOne({
        $or: [{ normalizedPhone: e164 }, { phone: digits }],
        lifecycleStatus: { $in: ['active', 'checkout_started', 'abandoned'] },
      });
    }

    if (!cart) {
      return res.status(404).json({ success: false, message: 'Active cart session not found' });
    }

    if (name) cart.customerName = name.trim();
    if (e164) {
      cart.phone = digits;
      cart.normalizedPhone = e164;
    }
    if (email) cart.email = email.toLowerCase().trim();
    cart.consentGiven = Boolean(consentGiven);
    if (consentGiven) cart.consentTimestamp = new Date();
    cart.lastActivityAt = new Date();

    cart.activityHistory.push({
      event: 'customer_identified',
      timestamp: new Date(),
      details: `Customer identified (+${digits}). Consent: ${consentGiven ? 'YES' : 'NO'}`,
    });

    await cart.save();

    res.json({
      success: true,
      cartId: cart.cartId,
      customerName: cart.customerName,
      phone: cart.phone,
      consentGiven: cart.consentGiven,
    });
  })
);

// @desc    Retrieve restored cart by secure cryptographic recovery token
// @route   GET /api/cart/recover/:token
// @access  Public
router.get(
  '/recover/:token',
  asyncHandler(async (req, res) => {
    const { token } = req.params;

    if (!token) {
      res.status(400);
      throw new Error('Recovery token is required');
    }

    const cart = await AbandonedCart.findOne({ recoveryToken: token });

    if (!cart) {
      return res.status(404).json({
        success: false,
        error: 'INVALID_TOKEN',
        message: 'Cart recovery link is invalid or does not exist.',
      });
    }

    if (cart.recoveryTokenExpiresAt && cart.recoveryTokenExpiresAt < new Date()) {
      return res.status(410).json({
        success: false,
        error: 'EXPIRED_TOKEN',
        message: 'This cart recovery link has expired. Please explore our newest products!',
      });
    }

    if (cart.lifecycleStatus === 'recovered') {
      return res.status(200).json({
        success: true,
        alreadyRecovered: true,
        message: 'This cart has already been successfully recovered and ordered! 🎉',
        cart: {
          customerName: cart.customerName,
          totalValue: cart.totalValue,
          recoveredAt: cart.recoveredAt,
        },
      });
    }

    // Mark link clicked
    cart.linkClicked = true;
    cart.linkClickedAt = new Date();
    cart.activityHistory.push({
      event: 'recovery_link_opened',
      timestamp: new Date(),
      details: 'Customer opened secure recovery URL in browser.',
    });
    await cart.save();

    res.json({
      success: true,
      message: 'Cart recovered successfully',
      cart: {
        cartId: cart.cartId,
        recoveryToken: cart.recoveryToken,
        customerName: cart.customerName,
        phone: cart.phone,
        email: cart.email,
        items: cart.items,
        subtotal: cart.subtotal,
        discount: cart.discount,
        shipping: cart.shipping,
        totalValue: cart.totalValue,
        currency: cart.currency,
        recoveryCoupon: cart.recoveryCoupon,
        recoveryCouponDiscount: cart.recoveryCouponDiscount,
      },
    });
  })
);

// @desc    Restore customer cart session and apply discount for checkout restart
// @route   POST /api/cart/recover/:token
// @access  Public
router.post(
  '/recover/:token',
  asyncHandler(async (req, res) => {
    const { token } = req.params;
    const cart = await AbandonedCart.findOne({ recoveryToken: token });

    if (!cart) {
      res.status(404);
      throw new Error('Recovery token not found');
    }

    cart.checkoutRestarted = true;
    cart.checkoutRestartedAt = new Date();
    cart.activityHistory.push({
      event: 'checkout_restarted',
      timestamp: new Date(),
      details: 'Customer clicked checkout CTA from recovery page.',
    });
    await cart.save();

    res.json({
      success: true,
      message: 'Checkout restarted',
      cart,
    });
  })
);

module.exports = router;
