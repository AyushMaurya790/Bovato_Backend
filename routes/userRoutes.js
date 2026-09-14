const express = require('express');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const { protect, admin } = require('../middleware/authMiddleware');

const router = express.Router();

// Helper to format address for both bovato and admin
const formatAddress = (addr) => {
  const recipient_name = addr.recipient_name || `${addr.firstName || ''} ${addr.lastName || ''}`.trim();
  const line1 = addr.line1 || addr.address || '';
  const pincode = addr.pincode || addr.pin || '';
  const is_default = addr.is_default !== undefined ? addr.is_default : Boolean(addr.isDefault);

  return {
    _id: addr._id,
    id: addr._id,
    label: addr.label || 'Home',
    recipient_name,
    phone: addr.phone || '',
    line1,
    line2: addr.line2 || null,
    city: addr.city || '',
    state: addr.state || '',
    pincode,
    is_default,

    // Legacy admin compatibility
    firstName: addr.firstName || recipient_name.split(' ')[0] || '',
    lastName: addr.lastName || recipient_name.split(' ').slice(1).join(' ') || '',
    address: line1,
    pin: pincode,
    isDefault: is_default,
  };
};

// @desc    Get all users (Admin only)
// @route   GET /api/users/all
// @access  Private/Admin
router.get(
  '/all',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const users = await User.find({}).sort({ createdAt: -1 }).select('-password');
    res.json(users);
  })
);

// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private
router.get(
  '/profile',
  protect,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select('-password');
    if (user) {
      res.json({
        _id: user._id,
        id: user._id,
        name: user.name,
        fullName: user.name,
        full_name: user.name,
        email: user.email,
        phone: user.phone,
        avatar_url: user.avatar_url || '',
        addresses: (user.addresses || []).map(formatAddress),
        isAdmin: user.isAdmin,
      });
    } else {
      res.status(404);
      throw new Error('User not found');
    }
  })
);

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
router.put(
  '/profile',
  protect,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);

    if (user) {
      const newName = req.body.full_name || req.body.fullName || req.body.name;
      if (newName) user.name = newName.trim();
      if (req.body.email) user.email = req.body.email.toLowerCase().trim();
      if (req.body.phone !== undefined) user.phone = req.body.phone.trim();
      if (req.body.avatar_url !== undefined) user.avatar_url = req.body.avatar_url;
      if (req.body.password) user.password = req.body.password;

      const updatedUser = await user.save();

      res.json({
        _id: updatedUser._id,
        id: updatedUser._id,
        name: updatedUser.name,
        fullName: updatedUser.name,
        full_name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        avatar_url: updatedUser.avatar_url || '',
        addresses: (updatedUser.addresses || []).map(formatAddress),
        isAdmin: updatedUser.isAdmin,
      });
    } else {
      res.status(404);
      throw new Error('User not found');
    }
  })
);

// @desc    Upload / set profile photo
// @route   POST /api/users/profile/avatar
// @access  Private
router.post(
  '/profile/avatar',
  protect,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    const { avatar_url, avatar } = req.body;
    const url = avatar_url || avatar;
    if (!url) {
      res.status(400);
      throw new Error('Avatar image URL or data is required');
    }

    user.avatar_url = url;
    await user.save();

    res.json({
      success: true,
      avatar_url: user.avatar_url,
    });
  })
);

// @desc    Get user's addresses
// @route   GET /api/users/addresses
// @access  Private
router.get(
  '/addresses',
  protect,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    const list = (user.addresses || []).map(formatAddress);
    // Sort default address first
    list.sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0));

    res.json(list);
  })
);

// @desc    Add address to user profile
// @route   POST /api/users/addresses
// @access  Private
router.post(
  '/addresses',
  protect,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    const {
      label,
      recipient_name,
      phone,
      line1,
      line2,
      city,
      state,
      pincode,
      is_default,
      firstName,
      lastName,
      address,
      pin,
      isDefault,
    } = req.body;

    const rName = recipient_name || `${firstName || ''} ${lastName || ''}`.trim();
    const l1 = line1 || address || '';
    const pinVal = pincode || pin || '';
    const shouldDefault = is_default !== undefined
      ? Boolean(is_default)
      : (isDefault !== undefined ? Boolean(isDefault) : user.addresses.length === 0);

    if (shouldDefault) {
      user.addresses.forEach((a) => {
        a.is_default = false;
        a.isDefault = false;
      });
    }

    const newAddr = {
      label: label || 'Home',
      recipient_name: rName,
      phone: phone || user.phone || '',
      line1: l1,
      line2: line2 || null,
      city: city || '',
      state: state || '',
      pincode: pinVal,
      is_default: shouldDefault,

      // Legacy admin compatibility
      firstName: firstName || rName.split(' ')[0] || '',
      lastName: lastName || rName.split(' ').slice(1).join(' ') || '',
      address: l1,
      pin: pinVal,
      isDefault: shouldDefault,
    };

    user.addresses.push(newAddr);
    const updatedUser = await user.save();
    const saved = updatedUser.addresses[updatedUser.addresses.length - 1];

    res.status(201).json(formatAddress(saved));
  })
);

// @desc    Update address
// @route   PUT /api/users/addresses/:addressId
// @access  Private
router.put(
  '/addresses/:addressId',
  protect,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    const address = user.addresses.id(req.params.addressId);
    if (!address) {
      res.status(404);
      throw new Error('Address not found');
    }

    const {
      label,
      recipient_name,
      phone,
      line1,
      line2,
      city,
      state,
      pincode,
      is_default,
      firstName,
      lastName,
      address: legacyAddress,
      pin,
      isDefault,
    } = req.body;

    const shouldDefault = is_default !== undefined ? Boolean(is_default) : (isDefault !== undefined ? Boolean(isDefault) : false);

    if (shouldDefault) {
      user.addresses.forEach((a) => {
        a.is_default = false;
        a.isDefault = false;
      });
      address.is_default = true;
      address.isDefault = true;
    }

    if (label !== undefined) address.label = label;
    if (recipient_name !== undefined) address.recipient_name = recipient_name;
    if (phone !== undefined) address.phone = phone;
    if (line1 !== undefined) address.line1 = line1;
    if (line2 !== undefined) address.line2 = line2;
    if (city !== undefined) address.city = city;
    if (state !== undefined) address.state = state;
    if (pincode !== undefined) address.pincode = pincode;

    // Legacy fields sync
    if (firstName !== undefined) address.firstName = firstName;
    if (lastName !== undefined) address.lastName = lastName;
    if (legacyAddress !== undefined) address.address = legacyAddress;
    if (pin !== undefined) address.pin = pin;

    await user.save();

    res.json(formatAddress(address));
  })
);

// @desc    Set address as default
// @route   PUT /api/users/addresses/:addressId/default
// @access  Private
router.put(
  '/addresses/:addressId/default',
  protect,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    const address = user.addresses.id(req.params.addressId);
    if (!address) {
      res.status(404);
      throw new Error('Address not found');
    }

    user.addresses.forEach((a) => {
      a.is_default = false;
      a.isDefault = false;
    });

    address.is_default = true;
    address.isDefault = true;

    await user.save();

    res.json({
      message: 'Default address updated',
      address: formatAddress(address),
    });
  })
);

// @desc    Delete address
// @route   DELETE /api/users/addresses/:addressId
// @access  Private
router.delete(
  '/addresses/:addressId',
  protect,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    user.addresses = user.addresses.filter(
      (addr) => addr._id.toString() !== req.params.addressId
    );

    await user.save();
    res.json({ message: 'Address removed' });
  })
);

module.exports = router;
