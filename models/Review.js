const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add reviewer name'],
      trim: true,
    },
    location: {
      type: String,
      default: 'India',
      trim: true,
    },
    rating: {
      type: Number,
      required: [true, 'Please provide a rating between 1 and 5'],
      min: 1,
      max: 5,
      default: 5,
    },
    title: {
      type: String,
      required: [true, 'Please provide a review title'],
      trim: true,
    },
    body: {
      type: String,
      required: [true, 'Please provide review content'],
      trim: true,
    },
    productSlug: {
      type: String,
      default: '',
      index: true,
    },
    productName: {
      type: String,
      default: '',
    },
    isVerified: {
      type: Boolean,
      default: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

reviewSchema.virtual('id').get(function () {
  return this._id;
});

module.exports = mongoose.model('Review', reviewSchema);
