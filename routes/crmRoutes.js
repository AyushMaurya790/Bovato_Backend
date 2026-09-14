const express = require('express');
const asyncHandler = require('express-async-handler');
const Lead = require('../models/Lead');
const Order = require('../models/Order');
const AbandonedCart = require('../models/AbandonedCart');
const Product = require('../models/Product');
const { protect, admin } = require('../middleware/authMiddleware');

const router = express.Router();

// Pre-defined high-converting WhatsApp message templates including 1-day, 3-day, and 7-day follow-ups
const WHATSAPP_TEMPLATES = [
  {
    id: 'hot_lead_offer',
    title: '🔥 Hot Lead — Secret 10% Offer',
    tag: 'HOT',
    text: 'Hey {name}! 🌿 Saw you were checking out {productName} on BOVATO. We’ve unlocked an exclusive 10% secret discount for you right now using code *{couponCode}*! Can I help you complete your order today? 🚀',
  },
  {
    id: 'followup_day1',
    title: '⏰ Day 1 Follow-Up — Routine Guide',
    tag: 'DAY 1',
    text: 'Hi {name}! 👋 Yesterday you checked out {productName} at BOVATO. Did you have any questions about how to use it in your daily routine? Let me know and I will help you right here!',
  },
  {
    id: 'followup_day3',
    title: '⏰ Day 3 Follow-Up — 10% Discount Deal',
    tag: 'DAY 3',
    text: 'Hey {name}! 🌿 Quick heads-up: your 10% discount code *{couponCode}* for {productName} is active for the next 24 hours. Click here to grab your order with Free Delivery: {link}',
  },
  {
    id: 'followup_day7',
    title: '⏰ Day 7 VIP Comeback — Final 15% OFF',
    tag: 'DAY 7',
    text: 'Hey {name}! 🌟 We really want you to experience BOVATO’s grooming routine. As a VIP visitor, here is an exclusive 15% OFF code *VIP15* on {productName}! Order now: {link}',
  },
  {
    id: 'cart_recovery',
    title: '🛒 Abandoned Cart Recovery (15% OFF)',
    tag: 'CART',
    text: 'Hey {name}! 🌿 You left your grooming routine in your BOVATO cart ({cartValue}). We’ve saved your bag and reserved an extra 15% OFF with code *{couponCode}* + Free Shipping! Click here to grab it: {link}',
  },
  {
    id: 'product_enquiry',
    title: '💬 Instant WhatsApp Enquiry Follow-Up',
    tag: 'ENQUIRY',
    text: 'Hi {name}! 👋 Thank you for enquiring about {productName} at BOVATO. Our men’s grooming specialist is right here. Would you like ingredient details or skin routine recommendations?',
  },
  {
    id: 'price_drop',
    title: '🔔 Price Drop Alert',
    tag: 'ALERT',
    text: 'Good news {name}! 🎉 {productName} that you were watching has just dropped to a special deal price of *{price}*! Grab it before stock runs out: {link}',
  },
  {
    id: 'referral_repeat',
    title: '🎁 Referral & Repeat Order (₹150 OFF)',
    tag: 'LOYALTY',
    text: 'Hey {name}! Hope you’re loving your BOVATO routine. Share your referral code *{couponCode}* with a friend—they get ₹150 OFF and you get ₹150 on your next refill! 🌿',
  },
];

// @desc    Get complete CRM overview metrics & funnel analytics
// @route   GET /api/crm/overview
// @access  Private/Admin
router.get(
  '/overview',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    // 1. Leads counts
    const totalLeads = await Lead.countDocuments();
    const hotLeads = await Lead.countDocuments({ category: 'HOT' });
    const warmLeads = await Lead.countDocuments({ category: 'WARM' });
    const coldLeads = await Lead.countDocuments({ category: 'COLD' });

    // 2. Orders & Revenue
    const totalOrders = await Order.countDocuments();
    const revenueAgg = await Order.aggregate([
      { $match: { orderStatus: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$totalPrice' } } },
    ]);
    const totalRevenue = revenueAgg[0]?.total || 0;

    // 3. Abandoned Carts
    const abandonedCount = await AbandonedCart.countDocuments({ recoveryStatus: 'abandoned' });
    const recoverableAgg = await AbandonedCart.aggregate([
      { $match: { recoveryStatus: 'abandoned' } },
      { $group: { _id: null, total: { $sum: '$totalValue' } } },
    ]);
    const recoverableRevenue = recoverableAgg[0]?.total || 0;

    // 4. Estimated Visitors & Funnel Conversion
    const estimatedVisitors = Math.max(120, totalLeads * 4 + totalOrders * 2);
    const visitorToLeadRate = estimatedVisitors > 0 ? ((totalLeads / estimatedVisitors) * 100).toFixed(1) : 0;
    const leadToOrderRate = totalLeads > 0 ? ((totalOrders / totalLeads) * 100).toFixed(1) : 0;

    // 5. Source Breakdown
    const sourcesAgg = await Lead.aggregate([
      { $group: { _id: '$source', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // 6. Recent Hot Leads for immediate action
    const recentHotLeads = await Lead.find({ category: 'HOT' })
      .sort({ createdAt: -1 })
      .limit(6);

    res.json({
      funnel: {
        visitors: estimatedVisitors,
        leads: totalLeads,
        hotLeads,
        warmLeads,
        coldLeads,
        orders: totalOrders,
        visitorToLeadRate: `${visitorToLeadRate}%`,
        leadToOrderRate: `${leadToOrderRate}%`,
      },
      revenue: {
        totalRevenue,
        recoverableRevenue,
        abandonedCartsCount: abandonedCount,
      },
      sources: sourcesAgg.map((s) => ({ source: s._id || 'direct', count: s.count })),
      recentHotLeads,
    });
  })
);

// @desc    Get WhatsApp message templates
// @route   GET /api/crm/whatsapp-templates
// @access  Private/Admin
router.get(
  '/whatsapp-templates',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    res.json(WHATSAPP_TEMPLATES);
  })
);

// @desc    Log / prepare WhatsApp message action for a lead
// @route   POST /api/crm/whatsapp/send
// @access  Private/Admin
router.post(
  '/whatsapp/send',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { leadId, templateId, customMessage } = req.body;

    const lead = await Lead.findById(leadId);
    if (!lead) {
      res.status(404);
      throw new Error('Lead not found');
    }

    const template = WHATSAPP_TEMPLATES.find((t) => t.id === templateId);
    let messageText = customMessage;

    if (!messageText && template) {
      messageText = template.text
        .replace(/{name}/g, lead.name || 'Friend')
        .replace(/{productName}/g, lead.productName || 'BOVATO grooming routine')
        .replace(/{couponCode}/g, 'BOVATO10')
        .replace(/{cartValue}/g, `₹${lead.cartValue || lead.productPrice || 599}`)
        .replace(/{price}/g, `₹${lead.productPrice || 449}`)
        .replace(/{link}/g, 'http://localhost:5173/shop');
    }

    // Format phone for WhatsApp
    const rawDigits = (lead.phone || '').replace(/[^0-9]/g, '');
    const phone = rawDigits.startsWith('91') ? rawDigits : `91${rawDigits}`;
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(messageText)}`;

    // Update lead status
    lead.status = 'contacted';
    lead.lastContactedAt = new Date();
    lead.notes.push({
      text: `WhatsApp message: "${messageText.slice(0, 80)}..."`,
      author: req.user.name || 'Admin',
      createdAt: new Date(),
    });
    await lead.save();

    res.json({
      success: true,
      whatsappUrl,
      messageText,
      lead,
    });
  })
);

// @desc    Add internal CRM note to a lead
// @route   POST /api/crm/leads/:id/notes
// @access  Private/Admin
router.post(
  '/leads/:id/notes',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { text } = req.body;
    if (!text) {
      res.status(400);
      throw new Error('Note text is required');
    }

    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      res.status(404);
      throw new Error('Lead not found');
    }

    lead.notes.push({
      text,
      author: req.user.name || 'Admin',
      createdAt: new Date(),
    });
    await lead.save();

    res.status(201).json(lead.notes);
  })
);

// @desc    Product interest & visitor analytics
// @route   GET /api/crm/product-analytics
// @access  Private/Admin
router.get(
  '/product-analytics',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const allProducts = await Product.find({ isActive: true }).select('name slug price image category rating reviews');

    // Count interest from leads
    const leadCounts = await Lead.aggregate([
      { $match: { productSlug: { $ne: '' } } },
      { $group: { _id: '$productSlug', leadsCount: { $sum: 1 }, hotCount: { $sum: { $cond: [{ $eq: ['$category', 'HOT'] }, 1, 0] } } } },
    ]);

    const leadMap = {};
    leadCounts.forEach((lc) => {
      leadMap[lc._id] = { leadsCount: lc.leadsCount, hotCount: lc.hotCount };
    });

    const analytics = allProducts.map((p) => {
      const stats = leadMap[p.slug] || { leadsCount: 0, hotCount: 0 };
      return {
        slug: p.slug,
        name: p.name,
        category: p.category,
        price: p.price,
        image: p.image,
        views: (p.reviews * 4) + (stats.leadsCount * 12) + 35,
        inquiries: stats.leadsCount + Math.floor(stats.hotCount * 1.5),
        hotLeads: stats.hotCount,
      };
    });

    analytics.sort((a, b) => b.hotLeads - a.hotLeads || b.inquiries - a.inquiries);
    res.json(analytics);
  })
);

// @desc    WhatsApp Cloud API Webhook Verification
// @route   GET /api/crm/whatsapp/webhook
// @access  Public
router.get('/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'bovato_webhook_token_2026';

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ [WHATSAPP WEBHOOK] Verified successfully');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// @desc    WhatsApp Inbound Message Webhook (Receives customer messages)
// @route   POST /api/crm/whatsapp/webhook
// @access  Public
router.post(
  '/whatsapp/webhook',
  asyncHandler(async (req, res) => {
    const { handleInboundCustomerMessage } = require('../services/whatsappService');
    const body = req.body;

    // Handle Meta WhatsApp Cloud API format
    if (body.object && body.entry) {
      const entries = body.entry;
      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          const value = change.value;
          if (value && value.messages && value.messages.length > 0) {
            const message = value.messages[0];
            const fromPhone = message.from;
            const customerName = value.contacts?.[0]?.profile?.name || 'Customer';
            const messageText = message.text?.body || '';

            await handleInboundCustomerMessage({
              fromPhone,
              customerName,
              messageText,
            });
          }
        }
      }
      return res.status(200).send('EVENT_RECEIVED');
    }

    // Direct / Generic format (for custom bot or simulator)
    const { fromPhone, customerName, messageText } = req.body;
    if (fromPhone) {
      const result = await handleInboundCustomerMessage({
        fromPhone,
        customerName: customerName || 'Customer',
        messageText: messageText || '',
      });
      return res.status(200).json(result);
    }

    res.status(200).send('EVENT_RECEIVED');
  })
);

// @desc    Simulate customer sending WhatsApp message from storefront
// @route   POST /api/crm/whatsapp/simulate-inbound
// @access  Private/Admin
router.post(
  '/whatsapp/simulate-inbound',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const { handleInboundCustomerMessage } = require('../services/whatsappService');
    const { fromPhone, customerName, messageText } = req.body;

    if (!fromPhone) {
      res.status(400);
      throw new Error('Customer phone number is required');
    }

    const result = await handleInboundCustomerMessage({
      fromPhone,
      customerName: customerName || 'Visitor',
      messageText: messageText || 'Hi BOVATO, I am interested in this product!',
    });

    res.status(200).json(result);
  })
);

module.exports = router;

