const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: [true, 'Please add a product name'],
    },
    category: {
      type: String,
      required: true,
      enum: ['Skin', 'Body', 'Hair', 'Beard', 'Lips'],
    },
    concern: {
      type: [String],
      required: true,
    },
    benefit: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: [true, 'Please add a price'],
      min: 0,
    },
    mrp: {
      type: Number,
      required: [true, 'Please add MRP'],
      min: 0,
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    reviews: {
      type: Number,
      default: 0,
    },
    image: {
      type: String,
      required: true,
    },
    images: {
      type: [String],
      default: [],
    },
    description: {
      type: String,
      required: true,
    },
    bullets: {
      type: [String],
      default: [],
    },
    ingredients: [
      {
        name: String,
        note: String,
      },
    ],
    howToUse: {
      type: [String],
      default: [],
    },
    badge: {
      type: String,
      enum: ['Best Seller', 'New', 'Limited', 'Official BOVATO', ''],
      default: '',
    },
    folder: {
      type: String,
      default: '',
    },
    stock: {
      type: Number,
      default: 100,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    // ── Shiprocket Shipping Information ────────────────────────────────────
    shipping: {
      weight: {
        type: Number,
        default: 0.25, // weight in kg
        min: 0.01,
      },
      length: {
        type: Number,
        default: 15, // cm
      },
      breadth: {
        type: Number,
        default: 10, // cm
      },
      height: {
        type: Number,
        default: 5, // cm
      },
    },
    sku: {
      type: String,
      default: '',
    },

    // ── SEO Fields ─────────────────────────────────────────────────────────
    metaTitle: {
      type: String,
      default: '',
      maxlength: 70,
    },
    metaDescription: {
      type: String,
      default: '',
      maxlength: 165,
    },
    metaKeywords: {
      type: [String],
      default: [],
    },
    canonicalUrl: {
      type: String,
      default: '',
    },
    ogTitle: {
      type: String,
      default: '',
    },
    ogDescription: {
      type: String,
      default: '',
    },
    schemaType: {
      type: String,
      enum: ['Product', 'ItemPage', ''],
      default: 'Product',
    },
  },
  {
    timestamps: true,
  }
);

// Index for search and filtering
productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ category: 1, concern: 1 });

module.exports = mongoose.model('Product', productSchema);
