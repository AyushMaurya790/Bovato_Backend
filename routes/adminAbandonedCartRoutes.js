// routes/adminAbandonedCartRoutes.js
// Protected Admin APIs for Abandoned Cart Recovery Center
const express = require('express');
const crypto = require('crypto');
const asyncHandler = require('express-async-handler');
const AbandonedCart = require('../models/AbandonedCart');
const RecoverySetting = require('../models/RecoverySetting');
const WhatsAppMessage = require('../models/WhatsAppMessage');
const Coupon = require('../models/Coupon');
const { protect, admin } = require('../middleware/authMiddleware');
const { sendManualCartWhatsApp, sendCartRecoveryMessage } = require('../services/whatsappService');

const router = express.Router();

// Guard all admin routes with authentication + admin role check
router.use(protect);
router.use(admin);

/**
 * @desc    Get 8 dynamic KPI metrics
 * @route   GET /api/admin/abandoned-carts/stats
 * @access  Private/Admin
 */
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const [
      totalAbandoned,
      abandonedValueAgg,
      messagesSent,
      messagesDelivered,
      messagesRead,
      recoveredCarts,
      recoveryRevenueAgg,
    ] = await Promise.all([
      AbandonedCart.countDocuments({
        $or: [
          { lifecycleStatus: 'abandoned' },
          { recoveryStatus: { $in: ['abandoned', 'message_pending', 'message_sent', 'delivered', 'read', 'recovered', 'expired', 'failed'] } },
        ],
      }),
      AbandonedCart.aggregate([
        {
          $match: {
            $or: [
              { lifecycleStatus: 'abandoned' },
              { recoveryStatus: { $in: ['abandoned', 'message_pending', 'message_sent', 'delivered', 'read', 'recovered', 'expired', 'failed'] } },
            ],
          },
        },
        { $group: { _id: null, total: { $sum: '$totalValue' } } },
      ]),
      WhatsAppMessage.countDocuments({
        cartId: { $ne: null },
        status: { $in: ['sent', 'delivered', 'read'] },
      }),
      WhatsAppMessage.countDocuments({
        cartId: { $ne: null },
        status: { $in: ['delivered', 'read'] },
      }),
      WhatsAppMessage.countDocuments({
        cartId: { $ne: null },
        status: 'read',
      }),
      AbandonedCart.countDocuments({
        $or: [{ lifecycleStatus: 'recovered' }, { recoveryStatus: 'recovered' }],
      }),
      AbandonedCart.aggregate([
        {
          $match: {
            $or: [{ lifecycleStatus: 'recovered' }, { recoveryStatus: 'recovered' }],
          },
        },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$recoveryRevenue', '$totalValue'] } } } },
      ]),
    ]);

    const abandonedValue = abandonedValueAgg[0]?.total || 0;
    const recoveryRevenue = recoveryRevenueAgg[0]?.total || 0;
    const recoveryRate = totalAbandoned > 0 ? ((recoveredCarts / totalAbandoned) * 100).toFixed(1) : 0;

    res.json({
      success: true,
      stats: {
        totalAbandoned,
        abandonedValue,
        messagesSent,
        messagesDelivered,
        messagesRead,
        recoveredCarts,
        recoveryRevenue,
        recoveryRate: Number(recoveryRate),
      },
    });
  })
);

/**
 * @desc    Get paginated abandoned carts with multi-attribute filtering
 * @route   GET /api/admin/abandoned-carts
 * @access  Private/Admin
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const {
      search,
      status,
      whatsappStatus,
      campaign,
      dateRange,
      page = 1,
      limit = 20,
    } = req.query;

    const query = {};

    // Search by customer name, phone, or email
    if (search && search.trim()) {
      const cleanSearch = search.trim();
      query.$or = [
        { customerName: { $regex: cleanSearch, $options: 'i' } },
        { phone: { $regex: cleanSearch.replace(/[^0-9]/g, ''), $options: 'i' } },
        { normalizedPhone: { $regex: cleanSearch, $options: 'i' } },
        { email: { $regex: cleanSearch, $options: 'i' } },
        { cartId: { $regex: cleanSearch, $options: 'i' } },
      ];
    }

    // Filter by recovery status / lifecycle status
    if (status && status !== 'ALL') {
      const lowerStatus = status.toLowerCase();
      if (lowerStatus === 'abandoned') {
        query.$or = [{ lifecycleStatus: 'abandoned' }, { recoveryStatus: 'abandoned' }];
      } else if (lowerStatus === 'recovered') {
        query.$or = [{ lifecycleStatus: 'recovered' }, { recoveryStatus: 'recovered' }];
      } else {
        query.recoveryStatus = lowerStatus;
      }
    }

    // Filter by WhatsApp Status
    if (whatsappStatus && whatsappStatus !== 'ALL') {
      const ws = whatsappStatus.toLowerCase();
      if (ws === 'sent') query.recoveryStatus = { $in: ['message_sent', 'delivered', 'read'] };
      else if (ws === 'delivered') query.recoveryStatus = { $in: ['delivered', 'read'] };
      else if (ws === 'read') query.recoveryStatus = 'read';
      else if (ws === 'failed') query.recoveryStatus = 'failed';
    }

    // Filter by Campaign
    if (campaign && campaign !== 'ALL') {
      query.utmCampaign = campaign;
    }

    // Filter by Date Range
    if (dateRange && dateRange !== 'ALL') {
      const now = new Date();
      let start = new Date();
      if (dateRange === 'today') {
        start.setHours(0, 0, 0, 0);
        query.createdAt = { $gte: start };
      } else if (dateRange === 'yesterday') {
        start.setDate(start.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date();
        end.setHours(0, 0, 0, 0);
        query.createdAt = { $gte: start, $lt: end };
      } else if (dateRange === '7d') {
        start.setDate(start.getDate() - 7);
        query.createdAt = { $gte: start };
      } else if (dateRange === '30d') {
        start.setDate(start.getDate() - 30);
        query.createdAt = { $gte: start };
      } else if (dateRange === '90d') {
        start.setDate(start.getDate() - 90);
        query.createdAt = { $gte: start };
      }
    }

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Number(limit) || 20);

    const [carts, total] = await Promise.all([
      AbandonedCart.find(query)
        .sort({ updatedAt: -1, createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      AbandonedCart.countDocuments(query),
    ]);

    res.json({
      success: true,
      carts,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
    });
  })
);

/**
 * @desc    Get single abandoned cart details with full timeline and message logs
 * @route   GET /api/admin/abandoned-carts/:id
 * @access  Private/Admin
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const cart = await AbandonedCart.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { cartId: id }],
    });

    if (!cart) {
      res.status(404);
      throw new Error('Abandoned cart not found');
    }

    const messages = await WhatsAppMessage.find({ cartId: cart._id }).sort({ createdAt: -1 });

    res.json({
      success: true,
      cart,
      messages,
    });
  })
);

/**
 * @desc    Send manual WhatsApp recovery message to customer
 * @route   POST /api/admin/abandoned-carts/:id/send-whatsapp
 * @access  Private/Admin
 */
router.post(
  '/:id/send-whatsapp',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { messageText, templateName, stage } = req.body;

    const cart = await AbandonedCart.findOne({
      $or: [{ _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }, { cartId: id }],
    });

    if (!cart) {
      res.status(404);
      throw new Error('Cart not found');
    }

    if (stage) {
      // Dispatches structured stage template
      const clientBaseUrl = process.env.CLIENT_URL || 'http://localhost:8080';
      const recoveryUrl = `${clientBaseUrl}/recover-cart/${cart.recoveryToken}?utm_source=whatsapp&utm_medium=admin_manual&stage=${stage}`;
      const result = await sendCartRecoveryMessage({
        cart,
        stage: Number(stage),
        recoveryUrl,
        couponCode: cart.recoveryCoupon,
        discountPercent: cart.recoveryCouponDiscount || 10,
      });

      return res.json({ success: result.success, ...result });
    }

    if (!messageText) {
      res.status(400);
      throw new Error('Message text is required');
    }

    const result = await sendManualCartWhatsApp({
      cart,
      messageText,
      templateName: templateName || 'admin_cart_recovery',
    });

    res.json({
      success: result.success,
      message: 'WhatsApp message dispatched',
      ...result,
    });
  })
);

/**
 * @desc    Generate or regenerate secure recovery link
 * @route   POST /api/admin/abandoned-carts/:id/recovery-link
 * @access  Private/Admin
 */
router.post(
  '/:id/recovery-link',
  asyncHandler(async (req, res) => {
    const cart = await AbandonedCart.findOne({
      $or: [{ _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null }, { cartId: req.params.id }],
    });

    if (!cart) {
      res.status(404);
      throw new Error('Cart not found');
    }

    cart.recoveryToken = crypto.randomBytes(24).toString('hex');
    cart.recoveryTokenExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    cart.activityHistory.push({
      event: 'cart_updated',
      timestamp: new Date(),
      details: 'Admin regenerated secure recovery token.',
    });
    await cart.save();

    const clientBaseUrl = process.env.CLIENT_URL || 'http://localhost:8080';
    const recoveryUrl = `${clientBaseUrl}/recover-cart/${cart.recoveryToken}`;

    res.json({
      success: true,
      recoveryToken: cart.recoveryToken,
      recoveryUrl,
      expiresAt: cart.recoveryTokenExpiresAt,
    });
  })
);

/**
 * @desc    Create dynamic coupon for abandoned cart
 * @route   POST /api/admin/abandoned-carts/:id/coupon
 * @access  Private/Admin
 */
router.post(
  '/:id/coupon',
  asyncHandler(async (req, res) => {
    const { discountPercent = 10, expiryHours = 48 } = req.body;
    const cart = await AbandonedCart.findOne({
      $or: [{ _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null }, { cartId: req.params.id }],
    });

    if (!cart) {
      res.status(404);
      throw new Error('Cart not found');
    }

    const code = `BOVATO-REC-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    await Coupon.create({
      code,
      discountPercent: Number(discountPercent) || 10,
      type: 'abandoned_cart',
      expiresAt: new Date(Date.now() + (Number(expiryHours) || 48) * 60 * 60 * 1000),
      minCartValue: 0,
    });

    cart.recoveryCoupon = code;
    cart.recoveryCouponDiscount = Number(discountPercent) || 10;
    cart.activityHistory.push({
      event: 'recovery_coupon_applied',
      timestamp: new Date(),
      details: `Admin assigned recovery coupon ${code} (${discountPercent}% OFF)`,
    });
    await cart.save();

    res.json({
      success: true,
      couponCode: code,
      discountPercent: Number(discountPercent),
    });
  })
);

/**
 * @desc    Update status manually (e.g. mark recovered or opted out)
 * @route   PUT /api/admin/abandoned-carts/:id/status
 * @access  Private/Admin
 */
router.put(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const { status, note } = req.body;
    const cart = await AbandonedCart.findOne({
      $or: [{ _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null }, { cartId: req.params.id }],
    });

    if (!cart) {
      res.status(404);
      throw new Error('Cart not found');
    }

    if (status === 'recovered') {
      cart.lifecycleStatus = 'recovered';
      cart.recoveryStatus = 'recovered';
      cart.recoveredAt = new Date();
      cart.recoveryRevenue = cart.totalValue;
      cart.activityHistory.push({
        event: 'marked_recovered_manually',
        timestamp: new Date(),
        details: note || 'Admin manually marked cart as RECOVERED.',
      });
    } else if (status === 'opted_out') {
      cart.optedOut = true;
      cart.optedOutAt = new Date();
      cart.recoveryStatus = 'opted_out';
      cart.activityHistory.push({
        event: 'customer_opted_out',
        timestamp: new Date(),
        details: note || 'Customer marked as opted out by Admin.',
      });
    } else if (status) {
      cart.recoveryStatus = status.toLowerCase();
    }

    if (note) {
      cart.notes.push({
        text: note,
        author: req.user?.name || 'Admin',
        createdAt: new Date(),
      });
    }

    await cart.save();

    res.json({
      success: true,
      message: 'Cart status updated',
      cart,
    });
  })
);

/**
 * @desc    Get automation settings
 * @route   GET /api/admin/abandoned-carts/settings
 * @access  Private/Admin
 */
router.get(
  '/settings',
  asyncHandler(async (req, res) => {
    const settings = await RecoverySetting.getOrCreate();
    res.json({ success: true, settings });
  })
);

/**
 * @desc    Update automation settings
 * @route   PUT /api/admin/abandoned-carts/settings
 * @access  Private/Admin
 */
router.put(
  '/settings',
  asyncHandler(async (req, res) => {
    let settings = await RecoverySetting.getOrCreate();
    const allowed = [
      'abandonmentDelayMinutes',
      'stage1DelayMinutes',
      'stage2DelayHours',
      'stage3DelayHours',
      'maxRecoveryMessages',
      'enableWhatsAppRecovery',
      'enableRecoveryCoupon',
      'couponDiscountPercent',
      'couponExpiryHours',
      'campaignActive',
      'allowManualRecoveryMessage',
    ];

    allowed.forEach((k) => {
      if (req.body[k] !== undefined) {
        settings[k] = req.body[k];
      }
    });

    await settings.save();
    res.json({ success: true, message: 'Settings saved successfully', settings });
  })
);

/**
 * @desc    Export abandoned carts to CSV
 * @route   GET /api/admin/abandoned-carts/export/csv
 * @access  Private/Admin
 */
router.get(
  '/export/csv',
  asyncHandler(async (req, res) => {
    const carts = await AbandonedCart.find({}).sort({ createdAt: -1 }).limit(1000);

    const headers = [
      'Cart ID',
      'Customer Name',
      'Phone',
      'Email',
      'Items Count',
      'Total Value (INR)',
      'Lifecycle Status',
      'Recovery Status',
      'Recovery Stage',
      'Recovery Coupon',
      'Consent Given',
      'UTM Campaign',
      'UTM Source',
      'Abandoned At',
      'Recovered At',
      'Recovery Revenue',
      'Created At',
    ];

    const rows = carts.map((c) => [
      `"${c.cartId}"`,
      `"${c.customerName || 'Shopper'}"`,
      `"${c.normalizedPhone || c.phone || ''}"`,
      `"${c.email || ''}"`,
      c.items?.length || 0,
      c.totalValue || 0,
      `"${c.lifecycleStatus || ''}"`,
      `"${c.recoveryStatus || ''}"`,
      c.recoveryStage || 0,
      `"${c.recoveryCoupon || ''}"`,
      c.consentGiven ? 'YES' : 'NO',
      `"${c.utmCampaign || ''}"`,
      `"${c.utmSource || ''}"`,
      `"${c.abandonedAt ? new Date(c.abandonedAt).toISOString() : ''}"`,
      `"${c.recoveredAt ? new Date(c.recoveredAt).toISOString() : ''}"`,
      c.recoveryRevenue || 0,
      `"${new Date(c.createdAt).toISOString()}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=bovato_abandoned_carts_${Date.now()}.csv`
    );
    res.status(200).send(csvContent);
  })
);

/**
 * @desc    Get Recovery Analytics & Funnel Breakdown
 * @route   GET /api/admin/recovery-analytics
 * @access  Private/Admin
 */
router.get(
  '/recovery-analytics',
  asyncHandler(async (req, res) => {
    const [
      abandonedCount,
      messagesSentCount,
      deliveredCount,
      readCount,
      linkClickedCount,
      checkoutRestartedCount,
      orderCompletedCount,
      campaignAgg,
      revenueOverTimeAgg,
    ] = await Promise.all([
      AbandonedCart.countDocuments({
        $or: [
          { lifecycleStatus: 'abandoned' },
          { recoveryStatus: { $in: ['abandoned', 'message_sent', 'delivered', 'read', 'recovered', 'expired', 'failed'] } },
        ],
      }),
      WhatsAppMessage.countDocuments({ cartId: { $ne: null }, status: { $in: ['sent', 'delivered', 'read'] } }),
      WhatsAppMessage.countDocuments({ cartId: { $ne: null }, status: { $in: ['delivered', 'read'] } }),
      WhatsAppMessage.countDocuments({ cartId: { $ne: null }, status: 'read' }),
      AbandonedCart.countDocuments({ linkClicked: true }),
      AbandonedCart.countDocuments({ checkoutRestarted: true }),
      AbandonedCart.countDocuments({
        $or: [{ lifecycleStatus: 'recovered' }, { recoveryStatus: 'recovered' }],
      }),
      AbandonedCart.aggregate([
        { $match: { utmCampaign: { $ne: '' } } },
        {
          $group: {
            _id: '$utmCampaign',
            totalCarts: { $sum: 1 },
            recoveredCarts: {
              $sum: {
                $cond: [
                  { $in: ['$recoveryStatus', ['recovered']] },
                  1,
                  0,
                ],
              },
            },
            recoveredRevenue: { $sum: '$recoveryRevenue' },
          },
        },
        { $sort: { totalCarts: -1 } },
        { $limit: 10 },
      ]),
      AbandonedCart.aggregate([
        {
          $match: {
            recoveredAt: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$recoveredAt' } },
            revenue: { $sum: '$recoveryRevenue' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $limit: 30 },
      ]),
    ]);

    // Construct 7-Stage Recovery Funnel
    const funnel = [
      { stage: 'Cart Abandoned', count: abandonedCount, percentage: 100 },
      {
        stage: 'WhatsApp Sent',
        count: messagesSentCount,
        percentage: abandonedCount > 0 ? Math.round((messagesSentCount / abandonedCount) * 100) : 0,
      },
      {
        stage: 'Delivered',
        count: deliveredCount,
        percentage: messagesSentCount > 0 ? Math.round((deliveredCount / messagesSentCount) * 100) : 0,
      },
      {
        stage: 'Read',
        count: readCount,
        percentage: deliveredCount > 0 ? Math.round((readCount / deliveredCount) * 100) : 0,
      },
      {
        stage: 'Link Clicked',
        count: linkClickedCount,
        percentage: deliveredCount > 0 ? Math.round((linkClickedCount / deliveredCount) * 100) : 0,
      },
      {
        stage: 'Checkout Restarted',
        count: checkoutRestartedCount,
        percentage: linkClickedCount > 0 ? Math.round((checkoutRestartedCount / linkClickedCount) * 100) : 0,
      },
      {
        stage: 'Order Completed',
        count: orderCompletedCount,
        percentage: abandonedCount > 0 ? Math.round((orderCompletedCount / abandonedCount) * 100) : 0,
      },
    ];

    res.json({
      success: true,
      funnel,
      campaigns: campaignAgg.map((c) => ({
        campaign: c._id,
        totalCarts: c.totalCarts,
        recoveredCarts: c.recoveredCarts,
        recoveredRevenue: c.recoveredRevenue,
        rate: c.totalCarts > 0 ? Math.round((c.recoveredCarts / c.totalCarts) * 100) : 0,
      })),
      revenueTrend: revenueOverTimeAgg.map((r) => ({
        date: r._id,
        revenue: r.revenue,
        orders: r.count,
      })),
    });
  })
);

/**
 * @desc    Get WhatsApp message logs
 * @route   GET /api/admin/whatsapp-messages
 * @access  Private/Admin
 */
router.get(
  '/whatsapp-messages',
  asyncHandler(async (req, res) => {
    const { cartId, status, page = 1, limit = 50 } = req.query;
    const query = {};
    if (cartId) query.cartId = cartId;
    if (status && status !== 'ALL') query.status = status.toLowerCase();

    const [messages, total] = await Promise.all([
      WhatsAppMessage.find(query)
        .sort({ createdAt: -1 })
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit)),
      WhatsAppMessage.countDocuments(query),
    ]);

    res.json({
      success: true,
      messages,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  })
);

module.exports = router;
