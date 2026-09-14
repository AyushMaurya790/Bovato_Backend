const express = require('express');
const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const shiprocketService = require('../services/shiprocketService');
const { sendOrderConfirmationWhatsApp, sendOrderNotification } = require('../services/whatsappService');
const { SHIPPING_STATUSES, STATUS_LABELS } = require('../utils/shippingStatus');
const { protect, optionalAuth, admin } = require('../middleware/authMiddleware');

const router = express.Router();

// Helper to normalize incoming shipping address
const normalizeShippingAddress = (body) => {
  const sa = body.shipping_address || body.shippingAddress || {};
  const contact = body.contactInfo || {};

  const recipient_name = (
    sa.recipient_name ||
    sa.name ||
    `${sa.firstName || ''} ${sa.lastName || ''}`.trim() ||
    'Customer'
  );
  const email = sa.email || contact.email || body.email || '';
  const phone = sa.phone || contact.phone || body.phone || '9876543210';
  const line1 = sa.line1 || sa.address || '';
  const line2 = sa.line2 || null;
  const city = sa.city || '';
  const state = sa.state || '';
  const pincode = sa.pincode || sa.pin || '';

  return {
    recipient_name,
    email,
    phone,
    line1,
    line2,
    city,
    state,
    pincode,

    // Legacy fields for admin compatibility
    firstName: sa.firstName || recipient_name.split(' ')[0] || '',
    lastName: sa.lastName || recipient_name.split(' ').slice(1).join(' ') || '',
    address: line1,
    pin: pincode,
  };
};

// @desc    Create new order (Supports both Bovato storefront and Admin formats)
// @route   POST /api/orders
// @access  Public / Private
router.post(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const rawItems = req.body.items || req.body.order_items || req.body.orderItems || [];

    if (!rawItems || rawItems.length === 0) {
      res.status(400);
      throw new Error('No order items provided');
    }

    const shippingAddress = normalizeShippingAddress(req.body);
    const paymentMethod = (req.body.payment_method || req.body.paymentMethod || 'card').toLowerCase();
    const subtotal = Number(req.body.subtotal !== undefined ? req.body.subtotal : req.body.itemsPrice) || 0;
    const shipping = Number(req.body.shipping !== undefined ? req.body.shipping : req.body.shippingPrice) || 0;
    const total = Number(req.body.total !== undefined ? req.body.total : req.body.totalPrice) || (subtotal + shipping);

    // Determine or create User
    let userId = req.user ? req.user._id : (req.body.user_id || null);

    if (!userId && shippingAddress.email) {
      const cleanEmail = shippingAddress.email.toLowerCase().trim();
      let existingUser = await User.findOne({ email: cleanEmail });
      if (!existingUser) {
        existingUser = await User.create({
          name: shippingAddress.recipient_name || 'Guest Customer',
          email: cleanEmail,
          phone: shippingAddress.phone || '',
          password: 'guestpassword123',
          isAdmin: false,
        });
      }
      userId = existingUser._id;
    }

    // Enrich order items with Product details & ObjectIds, and calculate weight
    const enrichedItems = [];
    let totalWeight = 0;
    const maxDimensions = { length: 15, breadth: 10, height: 5 };

    for (const item of rawItems) {
      const slug = item.product_slug || item.slug || 'bovato-item';
      let prodId = item.product;
      let img = item.image || '';
      let itemWeight = 0.25;

      const foundProd = await Product.findOne({ slug });
      if (foundProd) {
        prodId = prodId || foundProd._id;
        img = img || foundProd.image;
        if (foundProd.shipping?.weight) itemWeight = Number(foundProd.shipping.weight);
        if (foundProd.shipping?.length > maxDimensions.length) maxDimensions.length = foundProd.shipping.length;
        if (foundProd.shipping?.breadth > maxDimensions.breadth) maxDimensions.breadth = foundProd.shipping.breadth;
        if (foundProd.shipping?.height > maxDimensions.height) maxDimensions.height = foundProd.shipping.height;
      }

      const qty = Number(item.qty) || 1;
      totalWeight += itemWeight * qty;

      enrichedItems.push({
        product: prodId || null,
        slug,
        product_slug: slug,
        name: item.name || 'BOVATO Product',
        qty,
        image: img || 'http://localhost:5001/images/products/anti-pollution-face-wash.svg',
        price: Number(item.price) || 0,
      });
    }

    totalWeight = Math.max(0.5, Math.round(totalWeight * 100) / 100);

    const order = await Order.create({
      user: userId,
      orderItems: enrichedItems,
      shippingAddress,
      contactInfo: {
        email: shippingAddress.email,
        phone: shippingAddress.phone,
      },
      paymentMethod,
      itemsPrice: subtotal,
      shippingPrice: shipping,
      shippingCharge: shipping,
      packageWeight: totalWeight,
      packageDimensions: maxDimensions,
      totalPrice: total,
      isPaid: false,
      orderStatus: req.body.status || 'confirmed',
      shippingStatus: 'PENDING',
      shippingProvider: 'Shiprocket',
    });

    // Automatic Shiprocket booking for COD orders (Prepaid orders book after Razorpay verification)
    if (paymentMethod === 'cod') {
      try {
        console.log(`[SHIPROCKET] Auto-initiating shipment creation for COD Order #${order._id}...`);
        const srOrder = await shiprocketService.createShiprocketOrder(order);
        order.shiprocketOrderId = String(srOrder.order_id);
        order.shiprocketShipmentId = String(srOrder.shipment_id);
        order.shippingStatus = 'READY_TO_SHIP';

        // Auto-assign AWB
        try {
          const awbData = await shiprocketService.assignAWB(order.shiprocketShipmentId);
          order.awbCode = awbData.awb_code;
          order.courierName = awbData.courier_name;
          order.trackingNumber = awbData.awb_code;
          order.shippingStatus = 'AWB_ASSIGNED';
          console.log(`[SHIPROCKET] COD AWB assigned: ${order.awbCode} via ${order.courierName}`);
        } catch (awbErr) {
          console.warn('[SHIPROCKET] COD AWB assignment deferred for Admin review:', awbErr.message);
        }

        await order.save();
      } catch (srErr) {
        console.error('[SHIPROCKET] COD auto-booking error:', srErr.message);
        order.shippingError = srErr.message;
        await order.save();
      }
    }

    // Automatic WhatsApp Order Confirmation (Dispatched for COD and Confirmed/Paid orders)
    const isCodOrder = paymentMethod === 'cod' || paymentMethod === 'cash on delivery';
    if (isCodOrder || order.isPaid || order.orderStatus === 'confirmed') {
      try {
        await sendOrderConfirmationWhatsApp({ order });
      } catch (waErr) {
        console.warn('[WHATSAPP] Failed to dispatch order confirmation:', waErr.message);
      }
    }

    // Automatic Abandoned Cart Recovery Hook
    try {
      const AbandonedCart = require('../models/AbandonedCart');
      const contactPhone = shippingAddress.phone || '';
      const cleanPhone = contactPhone.replace(/[^0-9]/g, '');
      const contactEmail = (shippingAddress.email || '').toLowerCase().trim();

      const matchingCarts = await AbandonedCart.find({
        $or: [
          ...(cleanPhone ? [{ phone: { $regex: cleanPhone } }, { normalizedPhone: { $regex: cleanPhone } }] : []),
          ...(contactEmail ? [{ email: contactEmail }] : []),
          ...(userId ? [{ user: userId }, { customerId: userId }] : []),
        ],
        lifecycleStatus: { $in: ['active', 'checkout_started', 'abandoned'] },
      });

      for (const c of matchingCarts) {
        c.lifecycleStatus = 'recovered';
        c.recoveryStatus = 'recovered';
        c.recoveredAt = new Date();
        c.recoveredOrderId = order._id;
        c.recoveryRevenue = order.totalPrice;
        c.recoveryTokenExpiresAt = new Date(); // invalidate token
        c.activityHistory.push({
          event: 'order_completed',
          timestamp: new Date(),
          details: `Order #${order._id} completed for ₹${order.totalPrice}. Cart successfully RECOVERED!`,
        });
        await c.save();
        console.log(`🎉 [RECOVERY COMPLETE] Cart ${c.cartId} marked RECOVERED from Order #${order._id}`);
      }
    } catch (recoveryErr) {
      console.warn('[ABANDONED CART RECOVERY HOOK] Note:', recoveryErr.message);
    }

    const populatedOrder = await Order.findById(order._id).populate('user', 'name email phone');
    res.status(201).json(populatedOrder);
  })
);

// @desc    Get logged in user orders
// @route   GET /api/orders/my-orders & /api/orders/myorders
// @access  Private
const getUserOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json(orders);
});

router.get('/my-orders', protect, getUserOrders);
router.get('/myorders', protect, getUserOrders);

// @desc    Get all orders (Admin only)
// @route   GET /api/orders
// @access  Private/Admin
router.get(
  '/',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const orders = await Order.find({}).populate('user', 'name email').sort({ createdAt: -1 });
    res.json(orders);
  })
);

// @desc    Get customer orders by email for storefront
// @route   GET /api/orders/customer/by-email
// @access  Public / OptionalAuth
router.get(
  '/customer/by-email',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const email = req.query.email || req.headers['x-guest-email'];
    if (!email) {
      return res.json([]);
    }
    const cleanEmail = String(email).toLowerCase().trim();
    const orders = await Order.find({
      $or: [
        { 'contactInfo.email': cleanEmail },
        { 'shippingAddress.email': cleanEmail },
      ],
    }).sort({ createdAt: -1 });

    res.json(orders);
  })
);

// @desc    Sync Supabase order to MongoDB for Admin management
// @route   POST /api/orders/sync-supabase
// @access  Public / OptionalAuth
router.post(
  '/sync-supabase',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const supaOrder = req.body;
    if (!supaOrder || !supaOrder.id) {
      res.status(400);
      throw new Error('Invalid Supabase order data');
    }

    // Check if already in MongoDB
    let existing = await Order.findOne({
      $or: [
        { supabaseOrderId: supaOrder.id },
        { _id: mongoose.Types.ObjectId.isValid(supaOrder.id) ? supaOrder.id : null },
      ].filter(Boolean),
    });
    if (existing) {
      return res.json({ success: true, order: existing, alreadyExisted: true });
    }

    const sa = supaOrder.shipping_address || {};
    const created = await Order.create({
      supabaseOrderId: supaOrder.id,
      orderItems: (supaOrder.order_items || []).map((it) => ({
        slug: it.product_slug || it.slug || 'product',
        name: it.name || 'BOVATO Item',
        price: Number(it.price) || 0,
        qty: Number(it.qty) || 1,
        image: it.image || 'http://localhost:5001/images/products/anti-pollution-face-wash.svg',
      })),
      shippingAddress: {
        recipient_name: sa.recipient_name || 'Customer',
        phone: sa.phone || '9876543210',
        email: sa.email || '',
        line1: sa.line1 || 'Address',
        city: sa.city || 'City',
        state: sa.state || 'State',
        pincode: sa.pincode || '110001',
      },
      contactInfo: {
        email: sa.email || '',
        phone: sa.phone || '9876543210',
      },
      paymentMethod: supaOrder.payment_method || 'card',
      itemsPrice: Number(supaOrder.subtotal) || Number(supaOrder.total) || 0,
      shippingPrice: Number(supaOrder.shipping) || 0,
      totalPrice: Number(supaOrder.total) || 0,
      isPaid: supaOrder.payment_method !== 'cod',
      orderStatus: supaOrder.status || 'confirmed',
      shippingStatus: supaOrder.status === 'delivered' ? 'DELIVERED' : supaOrder.status === 'shipped' ? 'IN_TRANSIT' : 'ORDER_CONFIRMED',
      awbCode: supaOrder.awb_code || null,
      courierName: supaOrder.courier_name || 'Shiprocket Partner',
      createdAt: supaOrder.created_at ? new Date(supaOrder.created_at) : new Date(),
      trackingEvents: [
        {
          timestamp: supaOrder.created_at ? new Date(supaOrder.created_at) : new Date(),
          status: 'ORDER_CONFIRMED',
          description: 'Order placed and confirmed',
          location: 'BOVATO Fulfillment Center',
        },
      ],
    });

    res.status(201).json({ success: true, order: created, isNew: true });
  })
);

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Public / Private
router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    let order = null;
    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      order = await Order.findById(req.params.id).populate('user', 'name email phone');
    }
    if (!order) {
      order = await Order.findOne({
        $or: [
          { supabaseOrderId: req.params.id },
          { awbCode: req.params.id },
          { shiprocketOrderId: req.params.id },
          { trackingNumber: req.params.id },
        ],
      }).populate('user', 'name email phone');
    }

    if (order) {
      // Allow access if guest or owner or admin
      if (!order.user || !req.user || order.user._id.toString() === req.user._id.toString() || req.user.isAdmin) {
        res.json(order);
      } else {
        res.status(401);
        throw new Error('Not authorized to view this order');
      }
    } else {
      res.status(404);
      throw new Error('Order not found');
    }
  })
);

// @desc    Get complete order tracking details by Order ID
// @route   GET /api/orders/:id/tracking
// @access  Public / Private (With Strict Customer Ownership Check)
router.get(
  '/:id/tracking',
  optionalAuth,
  asyncHandler(async (req, res) => {
    let order = null;
    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      order = await Order.findById(req.params.id).populate('user', 'name email phone');
    }
    if (!order) {
      order = await Order.findOne({
        $or: [
          { supabaseOrderId: req.params.id },
          { awbCode: req.params.id },
          { shiprocketOrderId: req.params.id },
          { shiprocketShipmentId: req.params.id },
          { trackingNumber: req.params.id },
        ],
      }).populate('user', 'name email phone');
    }

    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    // 1. Strict Customer Ownership Check
    if (order.user) {
      const isOwner = req.user && (order.user._id || order.user).toString() === req.user._id.toString();
      const isAdmin = req.user && req.user.isAdmin;
      const guestEmail = req.headers['x-guest-email'] || req.query.email;
      const isGuestMatch = guestEmail && (
        order.contactInfo?.email?.toLowerCase() === String(guestEmail).toLowerCase() ||
        order.shippingAddress?.email?.toLowerCase() === String(guestEmail).toLowerCase()
      );

      if (!isOwner && !isAdmin && !isGuestMatch) {
        res.status(403);
        throw new Error('You are not authorized to track this order');
      }
    }

    const orderNumber = `#${String(order._id).slice(-8).toUpperCase()}`;

    const orderDetails = {
      orderItems: order.orderItems || [],
      shippingAddress: order.shippingAddress,
      contactInfo: order.contactInfo,
      paymentMethod: order.paymentMethod,
      isPaid: order.isPaid,
      paidAt: order.paidAt,
      itemsPrice: order.itemsPrice,
      shippingPrice: order.shippingPrice,
      totalPrice: order.totalPrice,
      orderStatus: order.orderStatus,
    };

    // 2. Case: Order Not Yet Shipped / No AWB assigned
    if (!order.awbCode) {
      const currentStatus = order.shippingStatus || 'ORDER_CONFIRMED';
      const events = (order.trackingEvents && order.trackingEvents.length > 0)
        ? order.trackingEvents
        : [
            {
              timestamp: order.createdAt,
              status: 'ORDER_CONFIRMED',
              description: 'Order confirmed and registered for dispatch',
              location: order.currentLocation || 'BOVATO Fulfillment Center',
            },
          ];

      return res.json({
        success: true,
        orderId: String(order._id),
        orderNumber,
        orderDate: order.createdAt,
        awbCode: null,
        courierName: order.courierName || null,
        status: currentStatus,
        statusLabel: STATUS_LABELS[currentStatus] || currentStatus,
        currentLocation: order.currentLocation || 'Order Processing Facility',
        estimatedDeliveryDate: order.estimatedDeliveryDate || 'Will be updated upon dispatch',
        lastUpdated: order.lastTrackingUpdate || order.updatedAt,
        message: 'Your order is confirmed and being prepared. Tracking will be available once the courier is assigned.',
        events,
        ...orderDetails,
      });
    }

    // 3. Case: Order has AWB code -> Check 15-min cache or fetch fresh from Shiprocket
    const isRefreshRequested = req.query.refresh === 'true';
    const lastUpdate = order.lastTrackingUpdate ? new Date(order.lastTrackingUpdate).getTime() : 0;
    const now = Date.now();
    const cacheAgeMs = now - lastUpdate;
    const isCacheValid = !isRefreshRequested && cacheAgeMs < 15 * 60 * 1000 && (order.trackingEvents && order.trackingEvents.length > 0);

    if (isCacheValid) {
      const status = order.shippingStatus || 'IN_TRANSIT';
      return res.json({
        success: true,
        orderId: String(order._id),
        orderNumber,
        orderDate: order.createdAt,
        awbCode: order.awbCode,
        courierName: order.courierName || 'Shiprocket Partner',
        status,
        statusLabel: STATUS_LABELS[status] || status,
        currentLocation: order.currentLocation || 'In Transit',
        estimatedDeliveryDate: order.estimatedDeliveryDate || '3-5 Business Days',
        lastUpdated: order.lastTrackingUpdate || order.updatedAt,
        isCached: true,
        events: order.trackingEvents || [],
        ...orderDetails,
      });
    }

    // Fetch fresh tracking from Shiprocket service
    try {
      console.log(`[TRACKING] Order: ${orderNumber} | AWB: ${order.awbCode} | Fetching live tracking updates...`);
      const trackingData = await shiprocketService.trackShipment(order.awbCode);

      // Update Order model fields in MongoDB
      if (trackingData.status) {
        order.shippingStatus = trackingData.status;
      }
      if (trackingData.currentLocation && trackingData.currentLocation !== 'Not available') {
        order.currentLocation = trackingData.currentLocation;
      }
      if (trackingData.estimatedDeliveryDate) {
        order.estimatedDeliveryDate = trackingData.estimatedDeliveryDate;
      }
      order.lastTrackingUpdate = new Date();

      // Milestone timestamp updates
      if (trackingData.status === 'PICKED_UP' && !order.pickedUpAt) {
        order.pickedUpAt = new Date();
      }
      if (trackingData.status === 'OUT_FOR_DELIVERY' && !order.outForDeliveryAt) {
        order.outForDeliveryAt = new Date();
      }
      if (trackingData.status === 'DELIVERED' && !order.deliveredAt) {
        order.deliveredAt = new Date();
        order.isDelivered = true;
        order.orderStatus = 'delivered';
      }

      // Append new tracking events with duplicate protection
      if (Array.isArray(trackingData.trackingEvents)) {
        trackingData.trackingEvents.forEach((ev) => {
          order.addTrackingEvent(ev);
        });
      }

      await order.save();

      res.json({
        success: true,
        orderId: String(order._id),
        orderNumber,
        orderDate: order.createdAt,
        awbCode: order.awbCode,
        courierName: trackingData.courierName || order.courierName,
        status: order.shippingStatus,
        statusLabel: STATUS_LABELS[order.shippingStatus] || trackingData.statusLabel || order.shippingStatus,
        currentLocation: order.currentLocation || 'Not available',
        estimatedDeliveryDate: order.estimatedDeliveryDate || trackingData.estimatedDeliveryDate,
        lastUpdated: order.lastTrackingUpdate,
        isCached: false,
        events: order.trackingEvents || [],
        ...orderDetails,
        orderStatus: order.orderStatus,
        isDelivered: order.isDelivered,
        deliveredAt: order.deliveredAt,
      });
    } catch (err) {
      console.error(`[TRACKING] Error fetching tracking for order ${order._id}:`, err.message);
      const status = order.shippingStatus || 'IN_TRANSIT';
      res.json({
        success: true,
        orderId: String(order._id),
        orderNumber,
        orderDate: order.createdAt,
        awbCode: order.awbCode,
        courierName: order.courierName || 'Shiprocket Partner',
        status,
        statusLabel: STATUS_LABELS[status] || status,
        currentLocation: order.currentLocation || 'Not available',
        estimatedDeliveryDate: order.estimatedDeliveryDate || '3-5 Business Days',
        lastUpdated: order.lastTrackingUpdate || order.updatedAt,
        errorNotice: "Couldn't fetch latest live update; displaying latest recorded tracking.",
        events: order.trackingEvents || [],
        ...orderDetails,
      });
    }
  })
);

// @desc    Update order tracking and shipping history (Admin)
// @route   PUT /api/orders/:id/tracking
// @access  Private/Admin
router.put(
  '/:id/tracking',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    let order = null;
    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      order = await Order.findById(req.params.id);
    }
    if (!order) {
      order = await Order.findOne({
        $or: [
          { supabaseOrderId: req.params.id },
          { awbCode: req.params.id },
          { shiprocketOrderId: req.params.id },
          { trackingNumber: req.params.id },
        ],
      });
    }

    if (!order) {
      res.status(404);
      throw new Error('Order not found');
    }

    const {
      shippingStatus,
      currentLocation,
      courierName,
      awbCode,
      trackingNumber,
      estimatedDeliveryDate,
      orderStatus,
      trackingEvents,
      newEvent,
    } = req.body;

    const prevShippingStatus = order.shippingStatus;

    if (shippingStatus) {
      order.shippingStatus = shippingStatus.toUpperCase();
    }
    if (currentLocation !== undefined) {
      order.currentLocation = currentLocation;
    }
    if (courierName !== undefined) {
      order.courierName = courierName;
    }
    if (awbCode !== undefined) {
      order.awbCode = awbCode || null;
      if (awbCode && !order.trackingNumber) order.trackingNumber = awbCode;
    }
    if (trackingNumber !== undefined) {
      order.trackingNumber = trackingNumber || null;
      if (trackingNumber && !order.awbCode) order.awbCode = trackingNumber;
    }
    if (estimatedDeliveryDate !== undefined) {
      order.estimatedDeliveryDate = estimatedDeliveryDate;
    }
    if (orderStatus) {
      order.orderStatus = orderStatus.toLowerCase();
    }

    // Milestone auto-synchronization
    const effectiveStatus = order.shippingStatus;
    if (effectiveStatus === 'DELIVERED') {
      order.isDelivered = true;
      if (!order.deliveredAt) order.deliveredAt = new Date();
      order.orderStatus = 'delivered';
    } else if (effectiveStatus === 'OUT_FOR_DELIVERY') {
      if (!order.outForDeliveryAt) order.outForDeliveryAt = new Date();
      if (order.orderStatus === 'pending') order.orderStatus = 'shipped';
    } else if (effectiveStatus === 'PICKED_UP' || effectiveStatus === 'IN_TRANSIT') {
      if (!order.pickedUpAt) order.pickedUpAt = new Date();
      if (order.orderStatus === 'pending') order.orderStatus = 'shipped';
    } else if (effectiveStatus === 'CANCELLED') {
      order.orderStatus = 'cancelled';
    }

    // If a full trackingEvents array was sent (e.g. from editing or deleting checkpoints)
    if (Array.isArray(trackingEvents)) {
      order.trackingEvents = trackingEvents.map((e) => ({
        timestamp: new Date(e.timestamp || Date.now()),
        status: (e.status || order.shippingStatus || 'IN_TRANSIT').toUpperCase(),
        description: e.description || '',
        location: e.location || order.currentLocation || '',
        eventId: e.eventId || null,
      })).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    // If a single new checkpoint event was provided
    if (newEvent && (newEvent.status || newEvent.description)) {
      order.addTrackingEvent({
        timestamp: newEvent.timestamp || new Date(),
        status: (newEvent.status || order.shippingStatus || 'IN_TRANSIT').toUpperCase(),
        description: newEvent.description || `Shipment status updated to ${order.shippingStatus}`,
        location: newEvent.location || order.currentLocation || '',
      });
    } else if (shippingStatus && shippingStatus !== prevShippingStatus) {
      // If shipping status changed and no explicit event was provided, automatically append checkpoint
      const defaultDesc = {
        ORDER_CONFIRMED: 'Order confirmed and registered for fulfillment',
        AWB_ASSIGNED: `AWB tracking assigned with ${order.courierName || 'Courier Partner'}`,
        PICKUP_SCHEDULED: 'Pickup requested and scheduled with courier partner',
        PICKED_UP: 'Package picked up by courier from fulfillment warehouse',
        IN_TRANSIT: 'Shipment in transit to destination sorting hub',
        OUT_FOR_DELIVERY: 'Shipment is out for delivery to customer address',
        DELIVERED: 'Shipment successfully delivered to recipient',
        CANCELLED: 'Shipment has been cancelled',
        RTO_INITIATED: 'Return to Origin (RTO) initiated',
      }[order.shippingStatus] || `Shipment updated: ${order.shippingStatus}`;

      order.addTrackingEvent({
        timestamp: new Date(),
        status: order.shippingStatus,
        description: defaultDesc,
        location: order.currentLocation || '',
      });
    }

    order.lastTrackingUpdate = new Date();
    const updatedOrder = await order.save();

    // Automated WhatsApp Notification if shipping status or orderStatus changed
    const currentOrderStatus = (order.orderStatus || '').toLowerCase();
    if (['shipped', 'delivered', 'cancelled'].includes(currentOrderStatus)) {
      try {
        await sendOrderNotification({ order: updatedOrder, eventType: currentOrderStatus });
      } catch (waErr) {
        console.warn(`[WHATSAPP] Failed to send tracking status notification for order #${order._id}:`, waErr.message);
      }
    }

    res.json({
      success: true,
      message: 'Order tracking & history updated successfully',
      order: updatedOrder,
    });
  })
);

// @desc    Update order status
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
router.put(
  '/:id/status',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    let order = null;
    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      order = await Order.findById(req.params.id);
    }
    if (!order) {
      order = await Order.findOne({
        $or: [
          { supabaseOrderId: req.params.id },
          { awbCode: req.params.id },
          { trackingNumber: req.params.id },
        ],
      });
    }

    if (order) {
      const prevStatus = order.orderStatus;
      const newStatus = req.body.status || req.body.orderStatus;
      if (newStatus) {
        order.orderStatus = newStatus;
      }
      if (req.body.shippingStatus) {
        order.shippingStatus = req.body.shippingStatus.toUpperCase();
      }
      if (req.body.currentLocation) {
        order.currentLocation = req.body.currentLocation;
      }
      if (req.body.courierName) {
        order.courierName = req.body.courierName;
      }
      if (req.body.trackingNumber) {
        order.trackingNumber = req.body.trackingNumber;
        if (!order.awbCode) order.awbCode = req.body.trackingNumber;
      }
      if (newStatus === 'delivered' || order.shippingStatus === 'DELIVERED') {
        order.isDelivered = true;
        if (!order.deliveredAt) order.deliveredAt = Date.now();
        order.orderStatus = 'delivered';
        order.shippingStatus = 'DELIVERED';
      }

      order.lastTrackingUpdate = new Date();
      const updatedOrder = await order.save();

      // Automated WhatsApp Notification on order status transition
      if (newStatus && newStatus !== prevStatus) {
        try {
          await sendOrderNotification({ order: updatedOrder, eventType: newStatus });
        } catch (waErr) {
          console.warn(`[WHATSAPP] Failed to send ${newStatus} notification for order #${order._id}:`, waErr.message);
        }
      }

      res.json(updatedOrder);
    } else {
      res.status(404);
      throw new Error('Order not found');
    }
  })
);

module.exports = router;

