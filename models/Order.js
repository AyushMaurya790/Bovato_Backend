const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    orderItems: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product',
          required: false,
        },
        slug: { type: String, required: true },
        product_slug: { type: String },
        name: { type: String, required: true },
        qty: { type: Number, required: true },
        image: { type: String, required: true },
        price: { type: Number, required: true },
      },
    ],
    shippingAddress: {
      recipient_name: { type: String, default: '' },
      phone: { type: String, default: '' },
      line1: { type: String, default: '' },
      line2: { type: String, default: null },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      pincode: { type: String, default: '' },
      email: { type: String, default: '' },

      // Legacy admin compatibility
      firstName: { type: String, default: '' },
      lastName: { type: String, default: '' },
      address: { type: String, default: '' },
      pin: { type: String, default: '' },
    },
    contactInfo: {
      email: { type: String, required: true },
      phone: { type: String, required: false, default: '9876543210' },
    },
    paymentMethod: {
      type: String,
      required: true,
      enum: ['card', 'upi', 'cod', 'razorpay', 'netbanking', 'wallet', 'online'],
    },
    paymentResult: {
      id: String,
      status: String,
      update_time: String,
      email_address: String,
    },
    itemsPrice: {
      type: Number,
      required: true,
      default: 0.0,
    },
    shippingPrice: {
      type: Number,
      required: true,
      default: 0.0,
    },
    totalPrice: {
      type: Number,
      required: true,
      default: 0.0,
    },
    isPaid: {
      type: Boolean,
      default: false,
    },
    paidAt: {
      type: Date,
    },
    isDelivered: {
      type: Boolean,
      default: false,
    },
    deliveredAt: {
      type: Date,
    },
    orderStatus: {
      type: String,
      enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
      default: 'confirmed',
    },
    trackingNumber: {
      type: String,
    },
    supabaseOrderId: {
      type: String,
      default: null,
      index: true,
    },

    // ── Shiprocket Fulfillment Fields ──────────────────────────────────────
    shiprocketOrderId: {
      type: String,
      default: null,
      index: true,
    },
    shiprocketShipmentId: {
      type: String,
      default: null,
      index: true,
    },
    awbCode: {
      type: String,
      default: null,
      index: true,
    },
    courierId: {
      type: String,
      default: null,
    },
    courierName: {
      type: String,
      default: null,
    },
    shippingProvider: {
      type: String,
      default: 'Shiprocket',
    },
    shippingStatus: {
      type: String,
      enum: [
        'PENDING',
        'ORDER_PLACED',
        'ORDER_CONFIRMED',
        'SHIPMENT_CREATED',
        'READY_TO_SHIP',
        'AWB_ASSIGNED',
        'PICKUP_SCHEDULED',
        'PICKED_UP',
        'IN_TRANSIT',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'RTO_INITIATED',
        'RTO_IN_TRANSIT',
        'RTO_DELIVERED',
        'CANCELLED',
      ],
      default: 'PENDING',
    },
    shippingCharge: {
      type: Number,
      default: 0,
    },
    packageWeight: {
      type: Number,
      default: 0.5,
    },
    packageDimensions: {
      length: { type: Number, default: 15 },
      breadth: { type: Number, default: 10 },
      height: { type: Number, default: 5 },
    },
    trackingUrl: {
      type: String,
      default: null,
    },
    labelUrl: {
      type: String,
      default: null,
    },
    invoiceUrl: {
      type: String,
      default: null,
    },
    manifestUrl: {
      type: String,
      default: null,
    },
    estimatedDeliveryDate: {
      type: String,
      default: null,
    },
    pickupScheduledAt: {
      type: Date,
      default: null,
    },
    shippedAt: {
      type: Date,
      default: null,
    },
    rtoStatus: {
      type: String,
      default: null,
    },
    returnStatus: {
      type: String,
      default: null,
    },
    shippingError: {
      type: String,
      default: null,
    },

    // ── Live Tracking & Events ──────────────────────────────────────────────
    currentLocation: {
      type: String,
      default: null,
    },
    pickedUpAt: {
      type: Date,
      default: null,
    },
    outForDeliveryAt: {
      type: Date,
      default: null,
    },
    lastTrackingUpdate: {
      type: Date,
      default: null,
    },
    trackingEvents: [
      {
        timestamp: { type: Date, required: true },
        status: { type: String, required: true },
        description: { type: String, default: '' },
        location: { type: String, default: '' },
        eventId: { type: String, default: null },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Method to safely add tracking event with Duplicate Event Protection
orderSchema.methods.addTrackingEvent = function (event) {
  if (!event || !event.status) return false;
  if (!this.trackingEvents) this.trackingEvents = [];

  const eventTime = new Date(event.timestamp || Date.now()).getTime();
  const desc = (event.description || '').trim();
  const loc = (event.location || '').trim();
  const status = (event.status || '').trim().toUpperCase();

  const exists = this.trackingEvents.some((e) => {
    const existingTime = new Date(e.timestamp).getTime();
    const timeDiff = Math.abs(existingTime - eventTime);
    return (
      timeDiff < 60000 &&
      e.status.toUpperCase() === status &&
      (e.location || '').trim() === loc &&
      (e.description || '').trim() === desc
    );
  });

  if (!exists) {
    this.trackingEvents.push({
      timestamp: new Date(event.timestamp || Date.now()),
      status,
      description: desc,
      location: loc,
      eventId: event.eventId || null,
    });
    if (loc) {
      this.currentLocation = loc;
    }
    this.trackingEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return true;
  }
  return false;
};

// Virtual aliases for bovato frontend
orderSchema.virtual('status')
  .get(function () {
    return this.orderStatus;
  })
  .set(function (v) {
    this.orderStatus = v;
  });

orderSchema.virtual('total')
  .get(function () {
    return this.totalPrice;
  })
  .set(function (v) {
    this.totalPrice = v;
  });

orderSchema.virtual('subtotal')
  .get(function () {
    return this.itemsPrice;
  })
  .set(function (v) {
    this.itemsPrice = v;
  });

orderSchema.virtual('shipping')
  .get(function () {
    return this.shippingPrice;
  })
  .set(function (v) {
    this.shippingPrice = v;
  });

orderSchema.virtual('payment_method')
  .get(function () {
    return this.paymentMethod;
  })
  .set(function (v) {
    this.paymentMethod = v;
  });

orderSchema.virtual('created_at').get(function () {
  return this.createdAt;
});

orderSchema.virtual('order_items').get(function () {
  return (this.orderItems || []).map((item) => ({
    id: item._id,
    _id: item._id,
    product_slug: item.product_slug || item.slug,
    slug: item.slug || item.product_slug,
    name: item.name,
    image: item.image,
    price: item.price,
    qty: item.qty,
  }));
});

orderSchema.virtual('shipping_address').get(function () {
  const sa = this.shippingAddress || {};
  return {
    recipient_name: sa.recipient_name || `${sa.firstName || ''} ${sa.lastName || ''}`.trim(),
    phone: sa.phone || this.contactInfo?.phone || '',
    email: sa.email || this.contactInfo?.email || '',
    line1: sa.line1 || sa.address || '',
    line2: sa.line2 || '',
    city: sa.city || '',
    state: sa.state || '',
    pincode: sa.pincode || sa.pin || '',
  };
});

module.exports = mongoose.model('Order', orderSchema);
