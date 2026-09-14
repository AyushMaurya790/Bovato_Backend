const mongoose = require('mongoose');
const crypto = require('crypto');

const cartItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: false,
    },
    slug: {
      type: String,
      required: true,
    },
    productSlug: {
      type: String,
      default: '',
    },
    name: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      default: 0,
    },
    mrp: {
      type: Number,
      default: 0,
    },
    qty: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    image: {
      type: String,
      default: '',
    },
  },
  { _id: false }
);

const activityHistorySchema = new mongoose.Schema(
  {
    event: {
      type: String,
      required: true,
      enum: [
        'cart_created',
        'item_added',
        'item_removed',
        'cart_updated',
        'customer_identified',
        'checkout_started',
        'cart_abandoned',
        'whatsapp_stage_1_sent',
        'whatsapp_stage_2_sent',
        'whatsapp_stage_3_sent',
        'whatsapp_custom_sent',
        'whatsapp_delivered',
        'whatsapp_read',
        'whatsapp_failed',
        'recovery_link_opened',
        'recovery_coupon_applied',
        'checkout_restarted',
        'order_completed',
        'marked_recovered_manually',
        'customer_opted_out',
        'recovery_expired',
      ],
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    details: {
      type: String,
      default: '',
    },
  },
  { _id: false }
);

const leadNoteSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    author: { type: String, default: 'Admin' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const abandonedCartSchema = new mongoose.Schema(
  {
    cartId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => `cart_${crypto.randomBytes(8).toString('hex')}`,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      index: true,
    },
    customerName: {
      type: String,
      trim: true,
      default: 'Shopper',
    },
    phone: {
      type: String,
      trim: true,
      index: true,
      default: '',
    },
    normalizedPhone: {
      type: String,
      trim: true,
      index: true,
      default: '',
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    items: [cartItemSchema],
    subtotal: {
      type: Number,
      default: 0,
    },
    discount: {
      type: Number,
      default: 0,
    },
    shipping: {
      type: Number,
      default: 0,
    },
    totalValue: {
      type: Number,
      required: true,
      default: 0,
      index: true,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    // Lifecycle states
    lifecycleStatus: {
      type: String,
      enum: ['active', 'checkout_started', 'abandoned', 'recovered', 'expired'],
      default: 'active',
      index: true,
    },
    // Recovery / messaging progression status
    recoveryStatus: {
      type: String,
      enum: [
        'active',
        'checkout_started',
        'abandoned',
        'message_pending',
        'message_sent',
        'delivered',
        'read',
        'recovered',
        'expired',
        'failed',
        'opted_out',
      ],
      default: 'active',
      index: true,
    },
    recoveryStage: {
      type: Number,
      default: 0, // 0: None, 1: Stage 1, 2: Stage 2, 3: Stage 3
      index: true,
    },
    // Secure single-use / time-limited recovery link token
    recoveryToken: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      default: () => crypto.randomBytes(24).toString('hex'),
    },
    recoveryTokenExpiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 48 * 60 * 60 * 1000), // 48h validity
    },
    recoveryCoupon: {
      type: String,
      default: '',
    },
    recoveryCouponDiscount: {
      type: Number,
      default: 0,
    },
    remindersCount: {
      type: Number,
      default: 0,
    },
    lastReminderAt: {
      type: Date,
    },
    checkoutStarted: {
      type: Boolean,
      default: false,
    },
    checkoutStartedAt: {
      type: Date,
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    abandonedAt: {
      type: Date,
      index: true,
    },
    recoveredAt: {
      type: Date,
    },
    recoveredOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
    },
    recoveryRevenue: {
      type: Number,
      default: 0,
    },
    recoveredFromCampaign: {
      type: Boolean,
      default: false,
    },
    linkClicked: {
      type: Boolean,
      default: false,
    },
    linkClickedAt: {
      type: Date,
    },
    checkoutRestarted: {
      type: Boolean,
      default: false,
    },
    checkoutRestartedAt: {
      type: Date,
    },
    // UTM Campaign tracking
    utmSource: { type: String, default: '' },
    utmMedium: { type: String, default: '' },
    utmCampaign: { type: String, default: '' },
    utmContent: { type: String, default: '' },
    utmTerm: { type: String, default: '' },
    source: { type: String, default: 'direct' },
    landingPage: { type: String, default: '' },
    // Consent
    consentGiven: {
      type: Boolean,
      default: false,
    },
    consentTimestamp: {
      type: Date,
    },
    optedOut: {
      type: Boolean,
      default: false,
    },
    optedOutAt: {
      type: Date,
    },
    activityHistory: [activityHistorySchema],
    notes: [leadNoteSchema],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for ID backward compatibility
abandonedCartSchema.virtual('id').get(function () {
  return this._id;
});

// Calculate items count
abandonedCartSchema.virtual('itemCount').get(function () {
  return (this.items || []).reduce((acc, item) => acc + (item.qty || 1), 0);
});

// Useful Compound Indexes for High-Performance Queries
abandonedCartSchema.index({ lifecycleStatus: 1, lastActivityAt: -1 });
abandonedCartSchema.index({ recoveryStatus: 1, abandonedAt: -1 });
abandonedCartSchema.index({ normalizedPhone: 1, recoveryStatus: 1 });
abandonedCartSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AbandonedCart', abandonedCartSchema);
