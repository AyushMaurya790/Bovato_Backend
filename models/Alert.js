const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      trim: true,
      default: '',
    },
    productSlug: {
      type: String,
      required: true,
      index: true,
    },
    productName: {
      type: String,
      default: '',
    },
    type: {
      type: String,
      enum: ['price_drop', 'back_in_stock'],
      default: 'price_drop',
    },
    targetPrice: {
      type: Number,
      default: 0,
    },
    isNotified: {
      type: Boolean,
      default: false,
    },
    notifiedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

alertSchema.virtual('id').get(function () {
  return this._id;
});

module.exports = mongoose.model('Alert', alertSchema);
