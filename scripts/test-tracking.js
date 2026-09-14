const {
  SHIPPING_STATUSES,
  STATUS_LABELS,
  normalizeShiprocketStatus,
  getTimelineStep,
} = require('../utils/shippingStatus');
const shiprocketService = require('../services/shiprocketService');
const Order = require('../models/Order');

function runTrackingTests() {
  console.log('🧪 Running Order Tracking System Tests...\n');
  let passed = 0;
  let total = 0;

  function assert(condition, name) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${name}`);
      process.exitCode = 1;
    }
  }

  // Test 1: Status Normalization
  console.log('--- 1. Status Normalization Tests ---');
  assert(normalizeShiprocketStatus(6) === 'AWB_ASSIGNED', 'Shiprocket code 6 -> AWB_ASSIGNED');
  assert(normalizeShiprocketStatus(19) === 'PICKED_UP', 'Shiprocket code 19 -> PICKED_UP');
  assert(normalizeShiprocketStatus(18) === 'IN_TRANSIT', 'Shiprocket code 18 -> IN_TRANSIT');
  assert(normalizeShiprocketStatus(17) === 'OUT_FOR_DELIVERY', 'Shiprocket code 17 -> OUT_FOR_DELIVERY');
  assert(normalizeShiprocketStatus(7) === 'DELIVERED', 'Shiprocket code 7 -> DELIVERED');
  assert(normalizeShiprocketStatus('in transit') === 'IN_TRANSIT', 'String "in transit" -> IN_TRANSIT');
  assert(normalizeShiprocketStatus('pickup_scheduled') === 'PICKUP_SCHEDULED', 'String "pickup_scheduled" -> PICKUP_SCHEDULED');
  assert(normalizeShiprocketStatus('rto initiated') === 'RTO_INITIATED', 'String "rto initiated" -> RTO_INITIATED');
  assert(normalizeShiprocketStatus('random_unknown') === 'IN_TRANSIT', 'Unknown string fallback -> IN_TRANSIT');

  // Test 2: Milestone Steps
  console.log('\n--- 2. Milestone Stepper Calculations ---');
  assert(getTimelineStep('ORDER_CONFIRMED') === 1, 'ORDER_CONFIRMED is Step 1');
  assert(getTimelineStep('AWB_ASSIGNED') === 2, 'AWB_ASSIGNED is Step 2');
  assert(getTimelineStep('PICKED_UP') === 3, 'PICKED_UP is Step 3');
  assert(getTimelineStep('IN_TRANSIT') === 4, 'IN_TRANSIT is Step 4');
  assert(getTimelineStep('OUT_FOR_DELIVERY') === 5, 'OUT_FOR_DELIVERY is Step 5');
  assert(getTimelineStep('DELIVERED') === 6, 'DELIVERED is Step 6');
  assert(getTimelineStep('CANCELLED') === -1, 'CANCELLED is Step -1');
  assert(getTimelineStep('RTO_INITIATED') === 99, 'RTO_INITIATED is Step 99');

  // Test 3: Labels
  console.log('\n--- 3. Status Labels ---');
  assert(STATUS_LABELS['OUT_FOR_DELIVERY'] === 'Out for Delivery', 'Label for OUT_FOR_DELIVERY');
  assert(STATUS_LABELS['AWB_ASSIGNED'] === 'AWB Assigned', 'Label for AWB_ASSIGNED');

  // Test 4: Shiprocket Mock/Fallback Tracking Normalization
  console.log('\n--- 4. Shiprocket Service Normalization ---');
  const mockTracking = shiprocketService.getMockTracking('DELHIVERY123456');
  assert(mockTracking.awbCode === 'DELHIVERY123456', 'AWB code correctly mapped');
  assert(mockTracking.status === 'IN_TRANSIT', 'Status normalized to IN_TRANSIT');
  assert(mockTracking.courierName === 'Delhivery Surface', 'Courier name present');
  assert(Array.isArray(mockTracking.trackingEvents), 'Tracking events is array');
  assert(mockTracking.trackingEvents.length > 0, 'Tracking events has history');
  assert(mockTracking.currentLocation.length > 0, 'Current location is populated');

  // Test 5: Order Tracking Event Deduplication
  console.log('\n--- 5. Order Model Tracking Event Deduplication ---');
  const dummyOrder = new Order({
    user: '507f1f77bcf86cd799439011',
    orderItems: [{
      product: '507f1f77bcf86cd799439012',
      name: 'Bright-Up Face Wash',
      slug: 'bright-up-face-wash',
      image: '/test.jpg',
      price: 499,
      quantity: 1,
    }],
    shippingAddress: {
      firstName: 'Rahul',
      lastName: 'Sharma',
      address: '123 Test St',
      city: 'Mumbai',
      state: 'Maharashtra',
      pin: '400001',
    },
    contactInfo: {
      email: 'rahul@example.com',
      phone: '9876543210',
    },
    totalPrice: 499,
    paymentMethod: 'cod',
    trackingEvents: [],
  });

  const now = new Date();
  // Add first event
  const added1 = dummyOrder.addTrackingEvent({
    timestamp: now,
    status: 'IN_TRANSIT',
    description: 'Shipment arrived at Mumbai Hub',
    location: 'Mumbai Hub',
    eventId: 'evt_1',
  });
  assert(added1 === true, 'First event added successfully');
  assert(dummyOrder.trackingEvents.length === 1, 'Length is 1');

  // Attempt to add duplicate event with same eventId
  const addedDuplicateId = dummyOrder.addTrackingEvent({
    timestamp: now,
    status: 'IN_TRANSIT',
    description: 'Shipment arrived at Mumbai Hub',
    location: 'Mumbai Hub',
    eventId: 'evt_1',
  });
  assert(addedDuplicateId === false, 'Duplicate eventId rejected');
  assert(dummyOrder.trackingEvents.length === 1, 'Length still 1');

  // Attempt to add duplicate event with same status, location within 30 seconds
  const thirtySecsLater = new Date(now.getTime() + 30000);
  const addedDuplicateContent = dummyOrder.addTrackingEvent({
    timestamp: thirtySecsLater,
    status: 'IN_TRANSIT',
    description: 'Shipment arrived at Mumbai Hub',
    location: 'Mumbai Hub',
  });
  assert(addedDuplicateContent === false, 'Duplicate event content within 60s rejected');
  assert(dummyOrder.trackingEvents.length === 1, 'Length still 1');

  // Add distinct event
  const oneHourLater = new Date(now.getTime() + 3600000);
  const addedDistinct = dummyOrder.addTrackingEvent({
    timestamp: oneHourLater,
    status: 'OUT_FOR_DELIVERY',
    description: 'Out for delivery with courier agent',
    location: 'Bandra Delivery Center',
  });
  assert(addedDistinct === true, 'Distinct new event added successfully');
  assert(dummyOrder.trackingEvents.length === 2, 'Length is now 2');

  console.log(`\n📊 Tests Finished: ${passed}/${total} passed`);
  if (passed === total) {
    console.log('🎉 ALL TRACKING TESTS PASSED PERFECTLY!\n');
  }
}

runTrackingTests();
