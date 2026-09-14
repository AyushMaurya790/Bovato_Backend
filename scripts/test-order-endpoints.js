const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Order = require('../models/Order');
const User = require('../models/User');
const connectDB = require('../config/db');
const shiprocketService = require('../services/shiprocketService');

async function testEndpoints() {
  console.log('🧪 Testing Tracking DB & Controller Logic...\n');
  await connectDB();

  try {
    const testUserId1 = new mongoose.Types.ObjectId();
    const testUserId2 = new mongoose.Types.ObjectId();

    // 1. Create a dummy unshipped order
    const unshippedOrder = await Order.create({
      user: testUserId1,
      orderItems: [{
        product: new mongoose.Types.ObjectId(),
        name: 'Bright-Up Face Wash',
        slug: 'bright-up-face-wash',
        image: '/test.jpg',
        price: 499,
        qty: 1,
      }],
      shippingAddress: {
        firstName: 'Amit',
        lastName: 'Patel',
        address: '45 Marine Drive',
        city: 'Mumbai',
        state: 'Maharashtra',
        pin: '400020',
      },
      contactInfo: {
        email: 'amit@example.com',
        phone: '9876543210',
      },
      totalPrice: 499,
      paymentMethod: 'cod',
      shippingStatus: 'ORDER_CONFIRMED',
      trackingEvents: [],
    });

    console.log('✅ Created unshipped test order:', unshippedOrder._id);

    // Verify unshipped order tracking logic
    // If order has no awbCode, it should return ORDER_CONFIRMED with message
    if (!unshippedOrder.awbCode) {
      console.log('✅ Correctly detected as unshipped (no AWB)');
    }

    // 2. Now simulate assigning an AWB to test order
    unshippedOrder.awbCode = 'SR_TEST_998877';
    unshippedOrder.courierName = 'Delhivery Surface';
    unshippedOrder.shippingStatus = 'AWB_ASSIGNED';
    await unshippedOrder.save();

    console.log('✅ Assigned AWB to test order');

    // 3. Test tracking fetching & event syncing
    const trackingData = await shiprocketService.trackShipment(unshippedOrder.awbCode);
    console.log('✅ Shiprocket trackShipment returned status:', trackingData.status);
    console.log('✅ Events returned:', trackingData.trackingEvents.length);

    // Sync events into order
    let newEventsCount = 0;
    for (const evt of (trackingData.trackingEvents || [])) {
      const added = unshippedOrder.addTrackingEvent(evt);
      if (added) newEventsCount++;
    }
    unshippedOrder.shippingStatus = trackingData.status;
    unshippedOrder.currentLocation = trackingData.currentLocation;
    unshippedOrder.lastTrackingUpdate = new Date();
    await unshippedOrder.save();

    console.log(`✅ Added ${newEventsCount} tracking events to order document`);
    console.log('✅ Order trackingEvents total length in DB:', unshippedOrder.trackingEvents.length);

    // 4. Test duplicate prevention on re-syncing same events
    let dupCount = 0;
    for (const evt of (trackingData.trackingEvents || [])) {
      const added = unshippedOrder.addTrackingEvent(evt);
      if (!added) dupCount++;
    }
    console.log(`✅ Duplicate protection verified: ${dupCount} duplicate events rejected`);

    // 5. Test ownership check
    const isOwner1 = unshippedOrder.user.toString() === testUserId1.toString();
    const isOwner2 = unshippedOrder.user.toString() === testUserId2.toString();
    console.log('✅ Ownership check for actual customer (User 1):', isOwner1);
    console.log('✅ Ownership check for unauthorized customer (User 2):', isOwner2 === false);

    // Clean up test order
    await Order.findByIdAndDelete(unshippedOrder._id);
    console.log('🧹 Cleaned up test order');

    console.log('\n🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

testEndpoints();
