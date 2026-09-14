const express = require('express');
const { body } = require('express-validator');
const asyncHandler = require('express-async-handler');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const validate = require('../middleware/validateMiddleware');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Helper for User Registration
const handleRegistration = asyncHandler(async (req, res) => {
  const { name, fullName, full_name, email, phone, password, avatar_url } = req.body;
  const userName = (fullName || full_name || name || 'BOVATO Customer').trim();
  const cleanEmail = (email || '').toLowerCase().trim();

  // Check if user exists
  const userExists = await User.findOne({ email: cleanEmail });

  if (userExists) {
    res.status(400);
    throw new Error('User already exists with this email address');
  }

  // Create user
  const user = await User.create({
    name: userName,
    email: cleanEmail,
    phone: phone ? phone.trim() : '',
    avatar_url: avatar_url || '',
    password,
    isAdmin: false,
  });

  if (user) {
    res.status(201).json({
      _id: user._id,
      id: user._id,
      name: user.name,
      fullName: user.name,
      full_name: user.name,
      email: user.email,
      phone: user.phone,
      avatar_url: user.avatar_url,
      isAdmin: user.isAdmin,
      token: generateToken(user._id),
    });
  } else {
    res.status(400);
    throw new Error('Invalid user registration data');
  }
});

// @desc    Register new user (/signup and /register aliases)
// @route   POST /api/auth/signup & POST /api/auth/register
// @access  Public
const registerValidation = [
  body('email').isEmail().withMessage('Valid email is required (e.g. user@gmail.com)'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

router.post('/signup', registerValidation, validate, handleRegistration);
router.post('/register', registerValidation, validate, handleRegistration);

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const cleanEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: cleanEmail }).select('+password');

    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        id: user._id,
        name: user.name,
        fullName: user.name,
        full_name: user.name,
        email: user.email,
        phone: user.phone,
        avatar_url: user.avatar_url || '',
        isAdmin: user.isAdmin,
        token: generateToken(user._id),
      });
    } else {
      res.status(401);
      throw new Error('Invalid email or password');
    }
  })
);

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
router.get(
  '/me',
  protect,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);

    res.json({
      _id: user._id,
      id: user._id,
      name: user.name,
      fullName: user.name,
      full_name: user.name,
      email: user.email,
      phone: user.phone,
      avatar_url: user.avatar_url || '',
      addresses: user.addresses,
      isAdmin: user.isAdmin,
    });
  })
);

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
router.post(
  '/logout',
  protect,
  asyncHandler(async (req, res) => {
    res.json({ message: 'Logged out successfully' });
  })
);

module.exports = router;
