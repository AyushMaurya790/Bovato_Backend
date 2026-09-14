const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    discountPercent: {
      type: Number,
      required: true,
      min: 1,
      max: 90,
      default: 10,
    },
    minCartValue: {
      type: Number,
      default: 0,
    },
    maxDiscount: {
      type: Number,
      default: 1000,
    },
    type: {
      type: String,
      enum: ['welcome', 'abandoned_cart', 'special_offer', 'referral', 'general'],
      default: 'special_offer',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    usageCount: {
      type: Number,
      default: 0,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

couponSchema.virtual('id').get(function () {
  return this._id;
});

module.exports = mongoose.model('Coupon', couponSchema);
