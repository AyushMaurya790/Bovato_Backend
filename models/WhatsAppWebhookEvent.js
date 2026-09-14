// models/WhatsAppWebhookEvent.js
// Audit store for all inbound Meta WhatsApp Webhook payloads
const mongoose = require('mongoose');

const whatsAppWebhookEventSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      enum: ['verification', 'status_update', 'incoming_message', 'error', 'other'],
      default: 'other',
      index: true,
    },
    wamid: {
      type: String,
      default: '',
      index: true,
    },
    status: {
      type: String,
      default: '',
    },
    senderPhone: {
      type: String,
      default: '',
      index: true,
    },
    recipientPhone: {
      type: String,
      default: '',
    },
    messageBody: {
      type: String,
      default: '',
    },
    rawPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    processed: {
      type: Boolean,
      default: false,
    },
    errorMessage: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Auto-expire raw webhook logs after 60 days to keep DB performant
whatsAppWebhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 86400 });

module.exports = mongoose.model('WhatsAppWebhookEvent', whatsAppWebhookEventSchema);
