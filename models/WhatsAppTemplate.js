// models/WhatsAppTemplate.js
// Template catalog for Meta WhatsApp Cloud API messaging
const mongoose = require('mongoose');

const whatsAppTemplateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    displayName: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: ['UTILITY', 'MARKETING', 'AUTHENTICATION'],
      default: 'UTILITY',
    },
    language: {
      type: String,
      default: 'en',
    },
    status: {
      type: String,
      enum: ['APPROVED', 'PENDING', 'REJECTED', 'PAUSED'],
      default: 'APPROVED',
    },
    bodyTemplate: {
      type: String,
      required: true,
    },
    variables: [
      {
        name: { type: String },
        description: { type: String },
        sampleValue: { type: String },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Helper static to seed default templates if none exist
whatsAppTemplateSchema.statics.seedDefaults = async function () {
  const count = await this.countDocuments();
  if (count > 0) return;

  const defaultTemplates = [
    {
      name: 'order_confirmed',
      displayName: 'Order Confirmed',
      category: 'UTILITY',
      language: 'en',
      status: 'APPROVED',
      bodyTemplate: 'Hi {{1}} 👋, thank you for shopping with BOVATO! Your order #{{2}} for ₹{{3}} has been confirmed. We are preparing it for express dispatch.',
      variables: [
        { name: '1', description: 'Customer Name', sampleValue: 'Rahul' },
        { name: '2', description: 'Order ID', sampleValue: '3983DB6F' },
        { name: '3', description: 'Total Amount', sampleValue: '998' },
      ],
      isActive: true,
    },
    {
      name: 'order_processing',
      displayName: 'Order Processing',
      category: 'UTILITY',
      language: 'en',
      status: 'APPROVED',
      bodyTemplate: 'Hi {{1}}, your BOVATO order #{{2}} is now being packed with utmost care at our fulfillment center.',
      variables: [
        { name: '1', description: 'Customer Name', sampleValue: 'Rahul' },
        { name: '2', description: 'Order ID', sampleValue: '3983DB6F' },
      ],
      isActive: true,
    },
    {
      name: 'order_shipped',
      displayName: 'Order Shipped / Dispatched',
      category: 'UTILITY',
      language: 'en',
      status: 'APPROVED',
      bodyTemplate: 'Great news {{1}}! Your BOVATO order #{{2}} has been shipped via {{3}}. Tracking AWB: {{4}}. Track here: {{5}}',
      variables: [
        { name: '1', description: 'Customer Name', sampleValue: 'Rahul' },
        { name: '2', description: 'Order ID', sampleValue: '3983DB6F' },
        { name: '3', description: 'Courier Partner', sampleValue: 'Blue Dart' },
        { name: '4', description: 'AWB Code', sampleValue: 'SR12345678' },
        { name: '5', description: 'Tracking Link', sampleValue: 'https://bovato.in/track' },
      ],
      isActive: true,
    },
    {
      name: 'order_delivered',
      displayName: 'Order Delivered',
      category: 'UTILITY',
      language: 'en',
      status: 'APPROVED',
      bodyTemplate: 'Yay {{1}}! Your BOVATO order #{{2}} has been successfully delivered. We hope you love your products! 🌿 Reply if you need anything.',
      variables: [
        { name: '1', description: 'Customer Name', sampleValue: 'Rahul' },
        { name: '2', description: 'Order ID', sampleValue: '3983DB6F' },
      ],
      isActive: true,
    },
    {
      name: 'order_cancelled',
      displayName: 'Order Cancelled',
      category: 'UTILITY',
      language: 'en',
      status: 'APPROVED',
      bodyTemplate: 'Hi {{1}}, your BOVATO order #{{2}} has been cancelled. If you made an online payment, refund will be processed within 5-7 business days.',
      variables: [
        { name: '1', description: 'Customer Name', sampleValue: 'Rahul' },
        { name: '2', description: 'Order ID', sampleValue: '3983DB6F' },
      ],
      isActive: true,
    },
    {
      name: 'exclusive_offer_welcome',
      displayName: 'Welcome Offer / VIP Club',
      category: 'MARKETING',
      language: 'en',
      status: 'APPROVED',
      bodyTemplate: 'Hi {{1}} 👋, welcome to BOVATO VIP! Use code {{2}} to get 10% OFF on your first purchase.',
      variables: [
        { name: '1', description: 'Customer Name', sampleValue: 'Rahul' },
        { name: '2', description: 'Coupon Code', sampleValue: 'BOVATO10' },
      ],
      isActive: true,
    },
    {
      name: 'otp_verification',
      displayName: 'OTP Verification',
      category: 'AUTHENTICATION',
      language: 'en',
      status: 'APPROVED',
      bodyTemplate: 'Your BOVATO verification code is {{1}}. Valid for 5 minutes. Do not share this code.',
      variables: [
        { name: '1', description: 'OTP Code', sampleValue: '123456' },
      ],
      isActive: true,
    },
  ];

  await this.insertMany(defaultTemplates);
};

module.exports = mongoose.model('WhatsAppTemplate', whatsAppTemplateSchema);
