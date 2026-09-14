// models/WhatsAppSetting.js
// Persistent, secure configuration store for Meta WhatsApp Cloud API
const mongoose = require('mongoose');

const whatsAppSettingSchema = new mongoose.Schema(
  {
    phoneNumberId: {
      type: String,
      default: '',
      trim: true,
    },
    businessAccountId: {
      type: String,
      default: '',
      trim: true,
    },
    accessToken: {
      type: String,
      default: '',
      trim: true,
      select: false, // Never return in default queries to prevent accidental leakage
    },
    verifyToken: {
      type: String,
      default: 'bovato_whatsapp_verify_token_2026',
      trim: true,
    },
    apiVersion: {
      type: String,
      default: 'v20.0',
      trim: true,
    },
    isEnabled: {
      type: Boolean,
      default: true,
    },
    webhookUrl: {
      type: String,
      default: '',
      trim: true,
    },
    webhookVerifiedAt: {
      type: Date,
      default: null,
    },
    lastTestedAt: {
      type: Date,
      default: null,
    },
    lastTestStatus: {
      type: String,
      enum: ['NONE', 'SUCCESS', 'FAILED'],
      default: 'NONE',
    },
    lastTestError: {
      type: String,
      default: '',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Helper static to get or initialize singleton settings
whatsAppSettingSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '1357890114067093',
      businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '2161354898125389',
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'bovato_whatsapp_verify_token_2026',
      apiVersion: process.env.WHATSAPP_API_VERSION || 'v20.0',
      isEnabled: true,
      webhookUrl: process.env.WHATSAPP_WEBHOOK_URL || 'http://localhost:5001/api/whatsapp/webhook',
    });
  }
  return settings;
};

module.exports = mongoose.model('WhatsAppSetting', whatsAppSettingSchema);
