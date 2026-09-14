// routes/adminLeadRoutes.js
// Protected Admin APIs for Leads, WhatsApp Controls & Metrics
const express = require('express');
const asyncHandler = require('express-async-handler');
const Lead = require('../models/Lead');
const WhatsAppMessage = require('../models/WhatsAppMessage');
const { protect, admin } = require('../middleware/authMiddleware');
const { sendCustomWhatsAppMessage } = require('../services/whatsappService');

const router = express.Router();

// Apply auth & admin guard to all routes in this router
router.use(protect);
router.use(admin);

/**
 * @desc    Get dashboard metrics & cards
 * @route   GET /api/admin/leads/stats
 * @access  Private/Admin
 */
router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      totalLeads,
      todayLeads,
      verifiedLeads,
      whatsappSent,
      whatsappDelivered,
      whatsappFailed,
    ] = await Promise.all([
      Lead.countDocuments(),
      Lead.countDocuments({ createdAt: { $gte: startOfToday } }),
      Lead.countDocuments({ phoneVerified: true }),
      Lead.countDocuments({ whatsappStatus: { $in: ['sent', 'delivered', 'read'] } }),
      Lead.countDocuments({ whatsappStatus: { $in: ['delivered', 'read'] } }),
      Lead.countDocuments({ whatsappStatus: 'failed' }),
    ]);

    res.json({
      success: true,
      stats: {
        totalLeads,
        todayLeads,
        verifiedLeads,
        whatsappSent,
        whatsappDelivered,
        whatsappFailed,
      },
    });
  })
);

/**
 * @desc    Export filtered leads to CSV
 * @route   GET /api/admin/leads/export/csv
 * @access  Private/Admin
 */
router.get(
  '/export/csv',
  asyncHandler(async (req, res) => {
    const { search, status, whatsappStatus, campaign, dateRange } = req.query;

    const query = {};

    if (status && status !== 'ALL') query.status = status;
    if (whatsappStatus && whatsappStatus !== 'ALL') query.whatsappStatus = whatsappStatus;
    if (campaign && campaign !== 'ALL') query.campaign = new RegExp(campaign, 'i');

    if (search) {
      const sRegex = new RegExp(search, 'i');
      query.$or = [
        { name: sRegex },
        { phone: sRegex },
        { normalizedPhone: sRegex },
        { campaign: sRegex },
        { email: sRegex },
      ];
    }

    if (dateRange === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      query.createdAt = { $gte: today };
    } else if (dateRange === '7d') {
      const d7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      query.createdAt = { $gte: d7 };
    } else if (dateRange === '30d') {
      const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      query.createdAt = { $gte: d30 };
    }

    const leads = await Lead.find(query).sort('-createdAt').limit(2000);

    const escapeCsv = (str) => {
      if (str === null || str === undefined) return '""';
      const s = String(str).replace(/"/g, '""');
      return `"${s}"`;
    };

    const headers = [
      'Lead ID',
      'Name',
      'Phone',
      'Normalized Phone',
      'Country Code',
      'Campaign',
      'Source',
      'Landing Page',
      'UTM Source',
      'UTM Medium',
      'UTM Campaign',
      'Phone Verified',
      'Consent Given',
      'Consent Timestamp',
      'WhatsApp Status',
      'Lead Status',
      'Score',
      'Created At',
    ];

    const rows = leads.map((l) => [
      escapeCsv(l._id),
      escapeCsv(l.name),
      escapeCsv(l.phone),
      escapeCsv(l.normalizedPhone || l.phone),
      escapeCsv(l.countryCode || '+91'),
      escapeCsv(l.campaign || ''),
      escapeCsv(l.source || 'direct'),
      escapeCsv(l.landingPage || ''),
      escapeCsv(l.utmSource || l.utm_source || ''),
      escapeCsv(l.utmMedium || l.utm_medium || ''),
      escapeCsv(l.utmCampaign || l.utm_campaign || ''),
      escapeCsv(l.phoneVerified ? 'YES' : 'NO'),
      escapeCsv(l.consentGiven ? 'YES' : 'NO'),
      escapeCsv(l.consentTimestamp ? l.consentTimestamp.toISOString() : ''),
      escapeCsv(l.whatsappStatus ? l.whatsappStatus.toUpperCase() : 'PENDING'),
      escapeCsv(l.status ? l.status.toUpperCase() : 'NEW'),
      escapeCsv(l.leadScore || 50),
      escapeCsv(l.createdAt ? l.createdAt.toISOString() : ''),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="bovato-leads-${Date.now()}.csv"`);
    res.status(200).send(csvContent);
  })
);

/**
 * @desc    Get all leads with search, filters & pagination
 * @route   GET /api/admin/leads
 * @access  Private/Admin
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const {
      search,
      status,
      whatsappStatus,
      verified,
      campaign,
      dateRange,
      page = 1,
      limit = 25,
      sort = '-createdAt',
    } = req.query;

    const query = {};

    if (status && status !== 'ALL') query.status = status;
    if (whatsappStatus && whatsappStatus !== 'ALL') query.whatsappStatus = whatsappStatus;
    if (verified === 'true') query.phoneVerified = true;
    if (verified === 'false') query.phoneVerified = false;
    if (campaign && campaign !== 'ALL') query.campaign = new RegExp(campaign, 'i');

    if (search) {
      const sRegex = new RegExp(search, 'i');
      query.$or = [
        { name: sRegex },
        { phone: sRegex },
        { normalizedPhone: sRegex },
        { campaign: sRegex },
        { email: sRegex },
      ];
    }

    if (dateRange === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      query.createdAt = { $gte: today };
    } else if (dateRange === '7d') {
      const d7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      query.createdAt = { $gte: d7 };
    } else if (dateRange === '30d') {
      const d30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      query.createdAt = { $gte: d30 };
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Number(limit));

    const [leads, total] = await Promise.all([
      Lead.find(query)
        .sort(sort)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum),
      Lead.countDocuments(query),
    ]);

    res.json({
      success: true,
      leads,
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum) || 1,
    });
  })
);

/**
 * @desc    Get single lead details with campaign history & notes
 * @route   GET /api/admin/leads/:id
 * @access  Private/Admin
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      res.status(404);
      throw new Error('Lead not found');
    }

    res.json({ success: true, lead });
  })
);

/**
 * @desc    Update lead (status, category, add notes)
 * @route   PUT /api/admin/leads/:id
 * @access  Private/Admin
 */
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      res.status(404);
      throw new Error('Lead not found');
    }

    const { status, category, note } = req.body;

    if (status) lead.status = status;
    if (category) lead.category = category;

    if (note && note.trim()) {
      lead.notes.push({
        text: note.trim(),
        author: req.user?.name || 'Admin',
        createdAt: new Date(),
      });
    }

    await lead.save();
    res.json({ success: true, lead });
  })
);

/**
 * @desc    Send WhatsApp message to lead from Admin Dashboard
 * @route   POST /api/admin/leads/:id/send-whatsapp
 * @access  Private/Admin
 */
router.post(
  '/:id/send-whatsapp',
  asyncHandler(async (req, res) => {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      res.status(404);
      throw new Error('Lead not found');
    }

    const { messageText, templateName = 'admin_direct' } = req.body;

    if (!messageText || !messageText.trim()) {
      res.status(400);
      throw new Error('Please provide message text to send.');
    }

    // Consent Validation Guard
    if (lead.consentGiven === false) {
      res.status(400);
      throw new Error('Cannot send message: customer has not consented to WhatsApp updates.');
    }

    const result = await sendCustomWhatsAppMessage({
      lead,
      messageText: messageText.trim(),
      templateName,
    });

    if (!result.success) {
      res.status(500);
      throw new Error(result.error || 'Failed to dispatch WhatsApp message');
    }

    res.json({
      success: true,
      message: 'WhatsApp message dispatched successfully',
      providerMessageId: result.providerMessageId,
      whatsappUrl: result.whatsappUrl,
      dispatchedVia: result.dispatchedVia,
    });
  })
);

/**
 * @desc    Get WhatsApp message history for a lead
 * @route   GET /api/admin/leads/:id/messages
 * @access  Private/Admin
 */
router.get(
  '/:id/messages',
  asyncHandler(async (req, res) => {
    const messages = await WhatsAppMessage.find({ leadId: req.params.id }).sort('-createdAt');
    res.json({
      success: true,
      messages,
    });
  })
);

module.exports = router;
