const mongoose = require('mongoose');

const whatsAppMessageSchema = new mongoose.Schema(
  {
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      index: true,
    },
    cartId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AbandonedCart',
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      index: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    templateName: {
      type: String,
      default: '',
    },
    messageType: {
      type: String,
      enum: [
        'template',
        'text',
        'otp',
        'welcome',
        'offer',
        'status_update',
        'custom',
        'test_message',
        'support',
        'order_pending',
        'order_confirmed',
        'order_processing',
        'order_shipped',
        'order_delivered',
        'order_cancelled',
        'order_confirmation',
        'shipping_update',
        'cart_recovery_stage_1',
        'cart_recovery_stage_2',
        'cart_recovery_stage_3',
        'cart_recovery_manual',
      ],
      default: 'offer',
    },
    recoveryStage: {
      type: Number,
      default: null,
      index: true,
    },
    campaignId: {
      type: String,
      default: '',
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
      default: 'pending',
      index: true,
    },
    providerMessageId: {
      type: String,
      trim: true,
      index: true,
    },
    messageBody: {
      type: String,
      default: '',
    },
    sentAt: {
      type: Date,
    },
    deliveredAt: {
      type: Date,
    },
    readAt: {
      type: Date,
    },
    failedAt: {
      type: Date,
    },
    errorMessage: {
      type: String,
      default: '',
    },
    failureReason: {
      type: String,
      default: '',
    },
    rawResponse: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('WhatsAppMessage', whatsAppMessageSchema);
