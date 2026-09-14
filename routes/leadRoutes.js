// routes/leadRoutes.js
// Public Lead Capture & OTP Verification APIs
const express = require('express');
const crypto = require('crypto');
const asyncHandler = require('express-async-handler');
const rateLimit = require('express-rate-limit');
const Lead = require('../models/Lead');
const {
  normalizeToE164,
  sendLeadWelcomeOffer,
  sendWhatsAppOTP,
  sendVerificationConfirmation,
} = require('../services/whatsappService');

const router = express.Router();

// Strict Rate Limiting for Lead Capture & OTP submissions
const leadSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // max 30 captures per IP
  message: { success: false, message: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // max 10 OTP requests per IP
  message: { success: false, message: 'Too many OTP requests. Please wait a few minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Helper to compute Lead Score & Category
 */
const calculateLeadScore = ({ intent = 'get_offer', cartValue = 0, phone, email, source }) => {
  let score = 30;
  if (intent === 'get_offer') score += 30;
  if (cartValue >= 500) score += 20;
  if (phone && phone.length >= 10) score += 10;
  if (email && email.includes('@')) score += 5;
  if (source && source.includes('campaign')) score += 5;

  score = Math.min(100, Math.max(0, score));

  let category = 'WARM';
  if (score >= 70) category = 'HOT';
  else if (score < 40) category = 'COLD';

  return { score, category };
};

/**
 * @desc    Capture lead voluntarily with WhatsApp consent & UTM parameters
 * @route   POST /api/leads & POST /api/leads/capture
 * @access  Public
 */
const handleCaptureLead = asyncHandler(async (req, res) => {
  const {
    name,
    phone,
    email,
    countryCode = '+91',
    source = 'campaign_popup',
    landingPage = '/offer',
    sourceUrl = '',
    campaign = '',
    campaignId = '',
    utm_source,
    utm_medium,
    utm_campaign,
    utm_term,
    utm_content,
    utmSource,
    utmMedium,
    utmCampaign,
    utmTerm,
    utmContent,
    productSlug = '',
    productName = 'BOVATO Routine',
    productPrice = 449,
    intent = 'get_offer',
    cartValue = 449,
    consentGiven,
  } = req.body;

  // 1. Mandatory Consent Check (Legal & WhatsApp Messaging Compliance)
  if (consentGiven !== true && consentGiven !== 'true') {
    res.status(400);
    throw new Error('Explicit consent is required to receive WhatsApp offers and updates.');
  }

  // 2. Normalize and Validate Phone Number
  if (!phone) {
    res.status(400);
    throw new Error('Please enter a valid WhatsApp mobile number.');
  }

  const normalized = normalizeToE164(phone, countryCode);
  if (!normalized.isValid) {
    res.status(400);
    throw new Error('Please enter a valid 10-digit mobile number.');
  }

  const finalUtmSource = utm_source || utmSource || '';
  const finalUtmMedium = utm_medium || utmMedium || '';
  const finalUtmCampaign = utm_campaign || utmCampaign || campaign || '';
  const finalUtmTerm = utm_term || utmTerm || '';
  const finalUtmContent = utm_content || utmContent || '';
  const finalCampaign = campaign || finalUtmCampaign || 'Special Offer';

  const { score, category } = calculateLeadScore({
    intent,
    cartValue: Number(cartValue) || 449,
    phone: normalized.e164,
    email,
    source,
  });

  // 3. Duplicate Lead Handling: Search for existing lead by normalized E.164 phone
  let lead = await Lead.findOne({
    $or: [
      { normalizedPhone: normalized.e164 },
      { phone: normalized.e164 },
      { phone: normalized.digits },
      { phone: phone.trim() },
    ],
  });

  let isFirstTime = !lead;

  if (lead) {
    // Preserve primary lead profile and append campaign submission to campaignHistory
    lead.campaignHistory.push({
      campaign: finalCampaign,
      campaignId: campaignId || '',
      source: source || 'campaign_popup',
      sourceUrl: sourceUrl || '',
      landingPage: landingPage || '',
      utmSource: finalUtmSource,
      utmMedium: finalUtmMedium,
      utmCampaign: finalUtmCampaign,
      utmTerm: finalUtmTerm,
      utmContent: finalUtmContent,
      productName: productName || lead.productName,
      submittedAt: new Date(),
    });

    // Update latest active attributes
    if (name && name.trim() && lead.name === 'Visitor') {
      lead.name = name.trim();
    }
    if (email && email.trim()) {
      lead.email = email.trim();
    }
    lead.normalizedPhone = normalized.e164;
    lead.countryCode = normalized.countryCode;
    lead.campaign = finalCampaign;
    lead.landingPage = landingPage || lead.landingPage;
    lead.sourceUrl = sourceUrl || lead.sourceUrl;
    lead.utmSource = finalUtmSource || lead.utmSource;
    lead.utmMedium = finalUtmMedium || lead.utmMedium;
    lead.utmCampaign = finalUtmCampaign || lead.utmCampaign;
    lead.consentGiven = true;
    lead.consentTimestamp = new Date();
    lead.leadScore = Math.max(lead.leadScore, score);
    if (category === 'HOT') lead.category = 'HOT';

    lead.notes.push({
      text: `Campaign visit repeated: "${finalCampaign}" via ${finalUtmSource || source}`,
      author: 'System Attribution',
      createdAt: new Date(),
    });

    await lead.save();
  } else {
    // Create new Lead record
    lead = await Lead.create({
      name: name && name.trim() ? name.trim() : 'Visitor',
      phone: normalized.e164,
      normalizedPhone: normalized.e164,
      countryCode: normalized.countryCode,
      email: email ? email.trim() : '',
      source: source || 'campaign_popup',
      landingPage: landingPage || '/offer',
      sourceUrl: sourceUrl || '',
      campaign: finalCampaign,
      campaignId: campaignId || '',
      utm_source: finalUtmSource,
      utm_medium: finalUtmMedium,
      utm_campaign: finalUtmCampaign,
      utm_term: finalUtmTerm,
      utm_content: finalUtmContent,
      utmSource: finalUtmSource,
      utmMedium: finalUtmMedium,
      utmCampaign: finalUtmCampaign,
      utmTerm: finalUtmTerm,
      utmContent: finalUtmContent,
      consentGiven: true,
      consentTimestamp: new Date(),
      phoneVerified: false,
      whatsappStatus: 'pending',
      productSlug: productSlug || '',
      productName: productName || 'BOVATO Routine',
      productPrice: Number(productPrice) || 449,
      intent,
      leadScore: score,
      category,
      status: 'new',
      cartValue: Number(cartValue) || 449,
      whatsappOptIn: true,
      isFirstTime: true,
      campaignHistory: [
        {
          campaign: finalCampaign,
          campaignId: campaignId || '',
          source: source || 'campaign_popup',
          sourceUrl: sourceUrl || '',
          landingPage: landingPage || '/offer',
          utmSource: finalUtmSource,
          utmMedium: finalUtmMedium,
          utmCampaign: finalUtmCampaign,
          utmTerm: finalUtmTerm,
          utmContent: finalUtmContent,
          productName: productName || 'BOVATO Routine',
          submittedAt: new Date(),
        },
      ],
      notes: [
        {
          text: `Lead captured voluntarily with consent from campaign "${finalCampaign}" (${finalUtmSource || source})`,
          author: 'System Attribution',
          createdAt: new Date(),
        },
      ],
    });
  }

  // 4. Trigger Automated WhatsApp Welcome Offer Message
  const offerResult = await sendLeadWelcomeOffer({
    lead,
    couponCode: 'BOVATO10',
    websiteLink: process.env.CLIENT_URL || 'http://localhost:8080',
  });

  res.status(201).json({
    success: true,
    isFirstTime,
    leadId: lead._id,
    lead,
    couponCode: 'BOVATO10',
    whatsappMessage: {
      status: lead.whatsappStatus,
      whatsappUrl: offerResult.whatsappUrl,
      dispatchedVia: offerResult.dispatchedVia,
    },
    message: 'Offer unlocked! We have dispatched your secret offer on WhatsApp.',
  });
});

router.post('/', leadSubmitLimiter, handleCaptureLead);
router.post('/capture', leadSubmitLimiter, handleCaptureLead);

/**
 * @desc    Send 6-digit WhatsApp OTP for phone verification
 * @route   POST /api/leads/send-otp
 * @access  Public
 */
router.post(
  '/send-otp',
  otpLimiter,
  asyncHandler(async (req, res) => {
    const { phone, countryCode = '+91', name = 'Customer' } = req.body;

    if (!phone) {
      res.status(400);
      throw new Error('Please provide a mobile number to receive OTP.');
    }

    const normalized = normalizeToE164(phone, countryCode);
    if (!normalized.isValid) {
      res.status(400);
      throw new Error('Please provide a valid 10-digit mobile number.');
    }

    // Find or initialize lead
    let lead = await Lead.findOne({
      $or: [
        { normalizedPhone: normalized.e164 },
        { phone: normalized.e164 },
        { phone: normalized.digits },
      ],
    });

    if (!lead) {
      lead = new Lead({
        name: name.trim() || 'Customer',
        phone: normalized.e164,
        normalizedPhone: normalized.e164,
        countryCode: normalized.countryCode,
        consentGiven: true,
        consentTimestamp: new Date(),
        status: 'otp_sent',
        whatsappStatus: 'pending',
      });
    }

    // Rate-limit resend attempts (max 5 per hour)
    if (lead.resendOtpAttempts >= 5 && lead.otpExpiresAt && lead.otpExpiresAt > Date.now()) {
      res.status(429);
      throw new Error('Too many OTP attempts. Please wait 15 minutes before requesting a new OTP.');
    }

    // Generate secure 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    // Hash OTP before storing (Never store plain-text OTPs!)
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

    lead.otpHash = otpHash;
    lead.otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes validity
    lead.otpAttempts = 0; // reset failed attempts
    lead.resendOtpAttempts = (lead.resendOtpAttempts || 0) + 1;
    lead.status = 'otp_sent';
    lead.consentGiven = true;

    await lead.save();

    // Dispatch OTP on WhatsApp
    const otpResult = await sendWhatsAppOTP({ lead, otp });

    res.status(200).json({
      success: true,
      message: 'A 6-digit verification code has been sent to your WhatsApp number.',
      expiresInSeconds: 300,
      whatsappUrl: otpResult.whatsappUrl,
      // For easy testing in dev environment when Meta live API is simulated:
      devNote: process.env.NODE_ENV !== 'production' ? `Simulated OTP: ${otp}` : undefined,
    });
  })
);

/**
 * @desc    Verify WhatsApp OTP and mark phone number as verified
 * @route   POST /api/leads/verify-otp
 * @access  Public
 */
router.post(
  '/verify-otp',
  asyncHandler(async (req, res) => {
    const { phone, otp, countryCode = '+91' } = req.body;

    if (!phone || !otp) {
      res.status(400);
      throw new Error('Please provide both phone number and 6-digit OTP.');
    }

    const normalized = normalizeToE164(phone, countryCode);

    const lead = await Lead.findOne({
      $or: [
        { normalizedPhone: normalized.e164 },
        { phone: normalized.e164 },
        { phone: normalized.digits },
      ],
    });

    if (!lead) {
      res.status(404);
      throw new Error('Lead not found. Please request a new OTP.');
    }

    // Check attempt limits to prevent brute-force
    if (lead.otpAttempts >= 3) {
      lead.otpHash = '';
      lead.otpExpiresAt = null;
      await lead.save();
      res.status(400);
      throw new Error('Too many incorrect attempts. For security, please request a new OTP.');
    }

    // Check expiration
    if (!lead.otpExpiresAt || Date.now() > new Date(lead.otpExpiresAt).getTime()) {
      res.status(400);
      throw new Error('Your OTP has expired. Please request a new one.');
    }

    // Verify hash
    const inputHash = crypto.createHash('sha256').update(String(otp).trim()).digest('hex');
    if (inputHash !== lead.otpHash) {
      lead.otpAttempts = (lead.otpAttempts || 0) + 1;
      await lead.save();
      const remaining = 3 - lead.otpAttempts;
      res.status(400);
      throw new Error(`Incorrect OTP. Please enter the valid 6-digit code. (${remaining} attempts left)`);
    }

    // Successfully verified!
    lead.phoneVerified = true;
    lead.status = 'verified';
    lead.otpHash = '';
    lead.otpExpiresAt = null;
    lead.otpAttempts = 0;
    lead.resendOtpAttempts = 0;
    lead.leadScore = Math.max(lead.leadScore, 85);
    lead.category = 'HOT';

    lead.notes.push({
      text: '✅ WhatsApp mobile number verified via OTP.',
      author: 'System Security',
      createdAt: new Date(),
    });

    await lead.save();

    // Send confirmation message
    await sendVerificationConfirmation({
      lead,
      websiteLink: process.env.CLIENT_URL || 'http://localhost:8080',
    });

    res.status(200).json({
      success: true,
      verified: true,
      couponCode: 'BOVATO10',
      message: 'Mobile number verified successfully! VIP discount unlocked.',
      lead,
    });
  })
);

// @desc    Get all leads with optional filter & limit (CRM compatibility)
// @route   GET /api/leads
// @access  Public / Admin
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { category, status, search, limit = 200, page = 1 } = req.query;
    const query = {};

    if (category && category !== 'ALL') query.category = category;
    if (status && status !== 'ALL') query.status = status;
    if (search && search.trim()) {
      const s = search.trim();
      query.$or = [
        { name: { $regex: s, $options: 'i' } },
        { phone: { $regex: s, $options: 'i' } },
        { email: { $regex: s, $options: 'i' } },
        { campaign: { $regex: s, $options: 'i' } },
      ];
    }

    const limitNum = Math.min(500, Number(limit) || 200);
    const skipNum = (Math.max(1, Number(page) || 1) - 1) * limitNum;

    const [leads, total] = await Promise.all([
      Lead.find(query).sort({ createdAt: -1 }).skip(skipNum).limit(limitNum),
      Lead.countDocuments(query),
    ]);

    res.json({
      success: true,
      leads,
      total,
      page: Number(page) || 1,
      pages: Math.ceil(total / limitNum),
    });
  })
);

// @desc    Get single lead by ID
// @route   GET /api/leads/:id
// @access  Public / Admin
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

// @desc    Update lead by ID
// @route   PUT /api/leads/:id
// @access  Public / Admin
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      res.status(404);
      throw new Error('Lead not found');
    }

    const fields = ['name', 'phone', 'email', 'category', 'status', 'leadScore', 'notes', 'cartValue'];
    fields.forEach((f) => {
      if (req.body[f] !== undefined) lead[f] = req.body[f];
    });

    await lead.save();
    res.json({ success: true, lead });
  })
);

module.exports = router;
