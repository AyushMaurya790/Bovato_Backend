const express = require('express');
const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Coupon = require('../models/Coupon');

const router = express.Router();

// Helper: Try to extract user from token or query email
const getUserFromReq = async (req) => {
  let user = null;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'bovato_secret_key_2026_production');
      user = await User.findById(decoded.id);
    } catch (e) {
      // invalid token
    }
  }

  if (!user && req.query.email) {
    user = await User.findOne({ email: req.query.email.trim().toLowerCase() });
  }

  if (!user && req.body && req.body.email) {
    user = await User.findOne({ email: req.body.email.trim().toLowerCase() });
  }

  return user;
};

// Program configuration data (mirrors Blue Nectar rewards & gifting rules)
const REWARDS_CONFIG = {
  programName: 'BOVATO Rituals Rewards',
  pointsToRupeeRatio: 1, // 1 point per ₹1 spent
  welcomeBonusPoints: 100,
  waysToEarn: [
    {
      id: 'purchase',
      title: 'Make a Purchase',
      pointsReward: '1 Point per ₹1',
      description: 'Earn Bovato Points on every order. Points are credited upon delivery.',
      icon: 'shopping-bag',
      actionLabel: 'Shop Now',
      actionUrl: '/shop',
    },
    {
      id: 'signup',
      title: 'Create an Account',
      pointsReward: '100 Points',
      description: 'Sign up for a free BOVATO account and instantly unlock 100 welcome points.',
      icon: 'user-plus',
      actionLabel: 'Sign Up',
      actionUrl: '/auth?mode=register',
    },
    {
      id: 'instagram',
      title: 'Follow on Instagram',
      pointsReward: '50 Points',
      description: 'Follow @bovato.grooming on Instagram for grooming tips, drop alerts & reels.',
      icon: 'instagram',
      actionLabel: 'Follow & Claim',
      claimableAction: 'instagram',
    },
    {
      id: 'review',
      title: 'Write a Product Review',
      pointsReward: '50 Points',
      description: 'Leave a verified customer review on any purchased product.',
      icon: 'star',
      actionLabel: 'Review Products',
      actionUrl: '/Reviews',
    },
    {
      id: 'birthday',
      title: 'Celebrate a Birthday',
      pointsReward: '200 Points',
      description: 'Add your birthday in profile to receive 200 bonus points annually.',
      icon: 'cake',
      actionLabel: 'Add Birthday',
      claimableAction: 'birthday',
    },
    {
      id: 'referral',
      title: 'Refer a Friend',
      pointsReward: '250 Points',
      description: 'Give your friends ₹150 off their first order. Earn 250 points when they buy.',
      icon: 'users',
      actionLabel: 'Share Link',
      actionUrl: '#referral',
    },
  ],
  waysToRedeem: [
    {
      id: 'reward_100',
      title: '₹100 Off Your Order',
      pointsCost: 200,
      discountPercent: 15,
      maxDiscount: 100,
      minCartValue: 499,
      description: 'Instant ₹100 discount coupon valid on all grooming products.',
      icon: 'tag',
    },
    {
      id: 'reward_250',
      title: '₹250 Off Your Order',
      pointsCost: 500,
      discountPercent: 20,
      maxDiscount: 250,
      minCartValue: 999,
      description: 'Instant ₹250 discount coupon for premium grooming orders.',
      icon: 'sparkles',
    },
    {
      id: 'reward_free_shipping',
      title: 'Free Express Shipping Voucher',
      pointsCost: 150,
      discountPercent: 10,
      maxDiscount: 99,
      minCartValue: 0,
      description: 'Waives standard shipping charge on any order size.',
      icon: 'truck',
    },
    {
      id: 'reward_free_wash',
      title: 'Free Bright-Up Cleanser Coupon',
      pointsCost: 600,
      discountPercent: 100,
      maxDiscount: 499,
      minCartValue: 799,
      description: 'Redeem for 100% off Bright-Up Face Wash when shopping over ₹799.',
      icon: 'gift',
    },
  ],
  spendMilestones: [
    {
      tier: 1,
      minSpend: 799,
      title: 'Free Express Shipping',
      subtitle: 'Fast doorstep delivery across India',
      icon: 'truck',
    },
    {
      tier: 2,
      minSpend: 1199,
      title: 'Free Bovato Travel Mini',
      subtitle: 'Free 30ml travel essential added to bag',
      giftProduct: {
        slug: 'travel-mini-kit',
        name: 'Bovato Travel Essentials Mini',
        price: 0,
        mrp: 299,
        image: '/assets/products/BOVATO -01.png',
      },
      icon: 'gift',
    },
    {
      tier: 3,
      minSpend: 1799,
      title: 'Free Full-Size Bright-Up Cleanser',
      subtitle: '100ml Vitamin C + Niacinamide Face Wash (₹499 value)',
      giftProduct: {
        slug: 'bright-up-face-wash',
        name: 'Bright-Up Face Wash (Full Size)',
        price: 0,
        mrp: 499,
        image: '/assets/products/brightup-ai-hero.jpg',
      },
      icon: 'sparkles',
    },
  ],
  faqs: [
    {
      q: 'What is BOVATO Rituals Rewards?',
      a: 'It is our loyalty program where you earn Bovato Points on every order and social engagement. Points can be exchanged for instant cash discounts and free gift products.',
    },
    {
      q: 'How do I earn points?',
      a: 'You automatically earn 1 point for every ₹1 spent. You also receive 100 free points when creating an account, 50 points for following on Instagram, and 250 points for every successful friend referral.',
    },
    {
      q: 'How do I redeem my points for discounts?',
      a: 'Open the Rewards widget, click "Ways To Redeem", and select your reward. A unique coupon code is generated that is immediately applied to your cart!',
    },
    {
      q: 'How do the Free Gifts work?',
      a: 'Whenever your cart value reaches spend tiers like ₹1,199 or ₹1,799, free gifts are unlocked and can be claimed straight into your bag with 1 click!',
    },
  ],
};

// @desc    Get rewards program configuration
// @route   GET /api/rewards/config
// @access  Public
router.get('/config', (req, res) => {
  res.json({
    success: true,
    data: REWARDS_CONFIG,
  });
});

// @desc    Get user points balance & rewards status
// @route   GET /api/rewards/user
// @access  Public (returns guest defaults if unauthenticated)
router.get(
  '/user',
  asyncHandler(async (req, res) => {
    const user = await getUserFromReq(req);

    if (!user) {
      return res.json({
        authenticated: false,
        points: 0,
        tier: 'Bronze',
        referralCode: 'BOVATO100',
        history: [],
      });
    }

    // Assign referral code if not already present
    if (!user.referralCode) {
      user.referralCode = `BVT${user._id.toString().slice(-5).toUpperCase()}`;
      await user.save();
    }

    res.json({
      authenticated: true,
      userId: user._id,
      name: user.name,
      email: user.email,
      points: user.loyaltyPoints || 100,
      tier: user.tier || 'Bronze',
      referralCode: user.referralCode,
      history: user.rewardsHistory || [],
    });
  })
);

// @desc    Claim points for an action (e.g. instagram, birthday, welcome)
// @route   POST /api/rewards/claim-action
// @access  Public (uses token or email)
router.post(
  '/claim-action',
  asyncHandler(async (req, res) => {
    const { action, email } = req.body;
    let user = await getUserFromReq(req);

    if (!user && email) {
      user = await User.findOne({ email: email.trim().toLowerCase() });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Please log in to claim reward points',
      });
    }

    let pointsToAdd = 0;
    let description = '';

    if (action === 'instagram') {
      // Check if already claimed
      const alreadyClaimed = (user.rewardsHistory || []).some((h) => h.action === 'instagram');
      if (alreadyClaimed) {
        return res.status(400).json({ success: false, message: 'Instagram follow points already claimed!' });
      }
      pointsToAdd = 50;
      description = 'Followed @bovato.grooming on Instagram';
    } else if (action === 'birthday') {
      const alreadyClaimed = (user.rewardsHistory || []).some(
        (h) => h.action === 'birthday' && new Date(h.date).getFullYear() === new Date().getFullYear()
      );
      if (alreadyClaimed) {
        return res.status(400).json({ success: false, message: 'Birthday bonus already claimed for this year!' });
      }
      pointsToAdd = 200;
      description = 'Annual Birthday Gift Points';
    } else if (action === 'welcome') {
      const alreadyClaimed = (user.rewardsHistory || []).some((h) => h.action === 'welcome');
      if (alreadyClaimed) {
        return res.status(400).json({ success: false, message: 'Welcome bonus already claimed!' });
      }
      pointsToAdd = 100;
      description = 'Welcome to BOVATO Loyalty Program';
    } else {
      return res.status(400).json({ success: false, message: 'Unknown claim action' });
    }

    user.loyaltyPoints = (user.loyaltyPoints || 0) + pointsToAdd;
    if (!user.rewardsHistory) user.rewardsHistory = [];
    user.rewardsHistory.unshift({
      action,
      points: pointsToAdd,
      type: 'EARN',
      date: new Date(),
      description,
    });

    await user.save();

    res.json({
      success: true,
      message: `🎉 Success! +${pointsToAdd} Bovato Points added to your account.`,
      points: user.loyaltyPoints,
      newBalance: user.loyaltyPoints,
      history: user.rewardsHistory,
    });
  })
);

// @desc    Redeem points for an instant discount coupon
// @route   POST /api/rewards/redeem
// @access  Public (uses token or email)
router.post(
  '/redeem',
  asyncHandler(async (req, res) => {
    const { rewardId, email } = req.body;
    let user = await getUserFromReq(req);

    if (!user && email) {
      user = await User.findOne({ email: email.trim().toLowerCase() });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Please sign in or create an account to redeem points',
      });
    }

    const reward = REWARDS_CONFIG.waysToRedeem.find((r) => r.id === rewardId);
    if (!reward) {
      return res.status(404).json({ success: false, message: 'Reward option not found' });
    }

    const currentPoints = user.loyaltyPoints || 0;
    if (currentPoints < reward.pointsCost) {
      return res.status(400).json({
        success: false,
        message: `Insufficient points. You have ${currentPoints} points, but need ${reward.pointsCost} points.`,
      });
    }

    // Deduct points
    user.loyaltyPoints = currentPoints - reward.pointsCost;

    // Generate unique coupon code
    const uniqueSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
    const couponCode = `BVT-${reward.id.toUpperCase()}-${uniqueSuffix}`;

    // Create coupon in Coupon collection
    await Coupon.create({
      code: couponCode,
      discountPercent: reward.discountPercent || 15,
      maxDiscount: reward.maxDiscount || 100,
      minCartValue: reward.minCartValue || 0,
      type: 'special_offer',
      isActive: true,
      expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days validity
    });

    // Record in user history
    if (!user.rewardsHistory) user.rewardsHistory = [];
    user.rewardsHistory.unshift({
      action: reward.id,
      points: reward.pointsCost,
      type: 'REDEEM',
      date: new Date(),
      description: `Redeemed ${reward.title} (Code: ${couponCode})`,
    });

    await user.save();

    res.json({
      success: true,
      message: `🎉 Reward unlocked! Coupon code ${couponCode} is ready to apply.`,
      couponCode,
      discountAmount: reward.maxDiscount,
      remainingPoints: user.loyaltyPoints,
      rewardTitle: reward.title,
    });
  })
);

module.exports = router;
