const mongoose = require('mongoose');

const reelSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Reel title is required'],
      trim: true,
    },
    videoUrl: {
      type: String,
      required: [true, 'Video URL or file path is required'],
      trim: true,
    },
    thumbnail: {
      type: String,
      default: '',
    },
    handle: {
      type: String,
      default: '@bovato_india',
      trim: true,
    },
    views: {
      type: String,
      default: '54.2K',
    },
    likes: {
      type: String,
      default: '4.8K',
    },
    productSlug: {
      type: String,
      default: 'bright-up-face-wash',
    },
    productName: {
      type: String,
      default: 'Bright-Up Face Wash',
    },
    productPrice: {
      type: Number,
      default: 449,
    },
    reelType: {
      type: String,
      enum: ['ai_reel', 'google_reel', 'ugc', 'brand'],
      default: 'ai_reel',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Reel', reelSchema);
