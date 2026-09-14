const mongoose = require('mongoose');

const recoverySettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'global_recovery_settings',
    },
    // Abandonment detection delay in minutes (default: 30)
    abandonmentDelayMinutes: {
      type: Number,
      required: true,
      default: 30,
      min: 1,
    },
    // WhatsApp Recovery Sequences
    stage1DelayMinutes: {
      type: Number,
      required: true,
      default: 30, // 30m after abandonment
      min: 1,
    },
    stage2DelayHours: {
      type: Number,
      required: true,
      default: 6, // 6 hours after abandonment
      min: 1,
    },
    stage3DelayHours: {
      type: Number,
      required: true,
      default: 24, // 24 hours after abandonment
      min: 1,
    },
    maxRecoveryMessages: {
      type: Number,
      required: true,
      default: 3,
      min: 1,
      max: 5,
    },
    enableWhatsAppRecovery: {
      type: Boolean,
      default: true,
    },
    enableRecoveryCoupon: {
      type: Boolean,
      default: true,
    },
    couponDiscountPercent: {
      type: Number,
      default: 10,
      min: 1,
      max: 90,
    },
    couponExpiryHours: {
      type: Number,
      default: 48,
    },
    campaignActive: {
      type: Boolean,
      default: true,
    },
    allowManualRecoveryMessage: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Static method to get or initialize default settings
recoverySettingSchema.statics.getOrCreate = async function () {
  let settings = await this.findOne({ key: 'global_recovery_settings' });
  if (!settings) {
    settings = await this.create({ key: 'global_recovery_settings' });
  }
  return settings;
};

module.exports = mongoose.model('RecoverySetting', recoverySettingSchema);
