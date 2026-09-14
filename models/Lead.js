const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: 'Visitor',
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required for WhatsApp lead'],
      trim: true,
      index: true,
    },
    normalizedPhone: {
      type: String,
      trim: true,
      index: true,
    },
    countryCode: {
      type: String,
      default: '+91',
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    source: {
      type: String,
      default: 'direct', // 'campaign_popup', 'offer_page', 'instagram', 'google', 'whatsapp', 'facebook', 'direct'
    },
    landingPage: { type: String, default: '' },
    sourceUrl: { type: String, default: '' },
    campaign: { type: String, default: '' },
    campaignId: { type: String, default: '' },
    utm_source: { type: String, default: '' },
    utm_medium: { type: String, default: '' },
    utm_campaign: { type: String, default: '' },
    utm_term: { type: String, default: '' },
    utm_content: { type: String, default: '' },
    utmSource: { type: String, default: '' },
    utmMedium: { type: String, default: '' },
    utmCampaign: { type: String, default: '' },
    utmTerm: { type: String, default: '' },
    utmContent: { type: String, default: '' },

    // Consent & Verification
    consentGiven: {
      type: Boolean,
      default: true,
      required: true,
    },
    consentTimestamp: {
      type: Date,
      default: Date.now,
    },
    phoneVerified: {
      type: Boolean,
      default: false,
      index: true,
    },
    otpHash: {
      type: String,
      default: '',
    },
    otpExpiresAt: {
      type: Date,
    },
    otpAttempts: {
      type: Number,
      default: 0,
    },
    resendOtpAttempts: {
      type: Number,
      default: 0,
    },
    whatsappStatus: {
      type: String,
      enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
      default: 'pending',
      index: true,
    },

    // Duplicate Lead Campaign Attribution History
    campaignHistory: [
      {
        campaign: { type: String, default: '' },
        campaignId: { type: String, default: '' },
        source: { type: String, default: '' },
        sourceUrl: { type: String, default: '' },
        landingPage: { type: String, default: '' },
        utmSource: { type: String, default: '' },
        utmMedium: { type: String, default: '' },
        utmCampaign: { type: String, default: '' },
        utmTerm: { type: String, default: '' },
        utmContent: { type: String, default: '' },
        productName: { type: String, default: '' },
        submittedAt: { type: Date, default: Date.now },
      },
    ],

    productSlug: {
      type: String,
      default: '',
    },
    productName: {
      type: String,
      default: '',
    },
    productPrice: {
      type: Number,
      default: 0,
    },
    intent: {
      type: String,
      enum: ['get_offer', 'whatsapp_enquiry', 'add_to_cart', 'price_drop_alert', 'back_in_stock', 'general_enquiry'],
      default: 'get_offer',
    },
    leadScore: {
      type: Number,
      default: 50,
      min: 0,
      max: 100,
      index: true,
    },
    category: {
      type: String,
      enum: ['HOT', 'WARM', 'COLD'],
      default: 'WARM',
      index: true,
    },
    status: {
      type: String,
      enum: ['new', 'otp_sent', 'verified', 'contacted', 'qualified', 'converted', 'lost'],
      default: 'new',
      index: true,
    },
    cartValue: {
      type: Number,
      default: 0,
    },
    whatsappOptIn: {
      type: Boolean,
      default: true,
    },
    isFirstTime: {
      type: Boolean,
      default: true,
    },
    autoWelcomeMsgSent: {
      type: Boolean,
      default: false,
    },
    autoWelcomeMsgAt: {
      type: Date,
    },
    autoWelcomeMsgText: {
      type: String,
      default: '',
    },
    notes: [
      {
        text: { type: String, required: true },
        author: { type: String, default: 'Admin' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    lastContactedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

leadSchema.virtual('id').get(function () {
  return this._id;
});

module.exports = mongoose.model('Lead', leadSchema);
