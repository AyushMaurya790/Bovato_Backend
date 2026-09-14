const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please add a name'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Please add an email'],
      unique: true,
      lowercase: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please add a valid email',
      ],
    },
    phone: {
      type: String,
      default: '',
    },
    avatar_url: {
      type: String,
      default: '',
    },
    password: {
      type: String,
      required: [true, 'Please add a password'],
      minlength: 6,
      select: false, // Don't return password by default
    },
    addresses: [
      {
        label: { type: String, default: 'Home' },
        recipient_name: { type: String, default: '' },
        phone: { type: String, default: '' },
        line1: { type: String, default: '' },
        line2: { type: String, default: null },
        city: { type: String, default: '' },
        state: { type: String, default: '' },
        pincode: { type: String, default: '' },
        is_default: { type: Boolean, default: false },

        // Legacy admin compatibility
        firstName: { type: String, default: '' },
        lastName: { type: String, default: '' },
        address: { type: String, default: '' },
        pin: { type: String, default: '' },
        isDefault: { type: Boolean, default: false },
      },
    ],
    isAdmin: {
      type: Boolean,
      default: false,
    },
    loyaltyPoints: {
      type: Number,
      default: 100, // 100 free points on signup welcome bonus
    },
    tier: {
      type: String,
      enum: ['Bronze', 'Silver', 'Gold', 'Platinum'],
      default: 'Bronze',
    },
    referralCode: {
      type: String,
      default: '',
    },
    rewardsHistory: [
      {
        action: { type: String, required: true },
        points: { type: Number, required: true },
        type: { type: String, enum: ['EARN', 'REDEEM'], required: true },
        date: { type: Date, default: Date.now },
        description: { type: String, default: '' },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for full_name
userSchema.virtual('full_name')
  .get(function () {
    return this.name;
  })
  .set(function (v) {
    this.name = v;
  });

// Encrypt password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match user password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
