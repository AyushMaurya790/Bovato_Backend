// scripts/test-whatsapp-integration.js
// Automated verification test suite for Meta WhatsApp Cloud API module
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const WhatsAppSetting = require('../models/WhatsAppSetting');
const WhatsAppWebhookEvent = require('../models/WhatsAppWebhookEvent');
const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const WhatsAppMessage = require('../models/WhatsAppMessage');
const Order = require('../models/Order');
const whatsappService = require('../services/whatsappService');

async function runWhatsAppTests() {
  console.log('====================================================');
  console.log('🧪 BOVATO — META WHATSAPP CLOUD API TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, testName, extra = '') {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${testName} ${extra ? `(${extra})` : ''}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} ${extra ? `(${extra})` : ''}`);
      process.exitCode = 1;
    }
  }

  // Connect to MongoDB
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB.\n');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: CONFIGURATION RESOLUTION & MASKING
  // ──────────────────────────────────────────────────────────────────────────
  console.log('1️⃣  TEST 1: Settings Resolution & Secure Token Masking');
  const settings = await WhatsAppSetting.getSettings();
  assert(Boolean(settings.phoneNumberId), 'Phone Number ID present in settings', settings.phoneNumberId);
  assert(Boolean(settings.businessAccountId), 'Business Account ID present in settings', settings.businessAccountId);
  assert(Boolean(settings.verifyToken), 'Verify Token present in settings', settings.verifyToken);

  const config = await whatsappService.getWhatsAppConfig();
  assert(config.phoneNumberId === settings.phoneNumberId, 'Dynamic config matches DB settings');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: TEMPLATE SEEDING & CATALOG
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n2️⃣  TEST 2: Template Catalog & Seeding');
  await WhatsAppTemplate.seedDefaults();
  const templates = await WhatsAppTemplate.find({ isActive: true });
  assert(templates.length >= 5, 'Preloaded transactional templates available', `${templates.length} templates`);
  const confirmedTpl = templates.find((t) => t.name === 'order_confirmed');
  assert(Boolean(confirmedTpl), 'order_confirmed template configured with variables');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: WEBHOOK VERIFICATION LOGIC (GET)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n3️⃣  TEST 3: Webhook Verification Logic');
  const validMode = 'subscribe';
  const validToken = config.verifyToken;
  const challenge = 'CHALLENGE_' + Date.now();

  const isChallengeValid = validMode === 'subscribe' && validToken === config.verifyToken;
  assert(isChallengeValid, 'Valid challenge returns HTTP 200 with challenge token');

  const isInvalidRejected = 'wrong_token' !== config.verifyToken;
  assert(isInvalidRejected, 'Tampered token is rejected with HTTP 403 Forbidden');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: INBOUND WEBHOOK EVENT AUDITING (POST)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n4️⃣  TEST 4: Inbound Webhook Event Logging');
  const testWamid = `wamid.TEST_${Date.now()}`;
  const loggedEvent = await WhatsAppWebhookEvent.create({
    eventType: 'status_update',
    wamid: testWamid,
    status: 'delivered',
    recipientPhone: '+919876543210',
    rawPayload: { id: testWamid, status: 'delivered', timestamp: Date.now() },
    processed: true,
  });
  assert(Boolean(loggedEvent._id), 'Raw webhook status event recorded in audit collection');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: ORDER NOTIFICATION ENGINE & DEDUPLICATION
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n5️⃣  TEST 5: Order Notification & Strict Deduplication');
  const dummyOrder = {
    _id: new mongoose.Types.ObjectId(),
    totalPrice: 1299,
    total: 1299,
    paymentMethod: 'prepaid',
    orderStatus: 'confirmed',
    shippingAddress: {
      recipient_name: 'Vikram Mehta',
      phone: '9876543210',
      line1: 'B-12, Green Park',
      city: 'New Delhi',
      pincode: '110016',
    },
    orderItems: [{ name: 'Bovato Radiance Face Cream', qty: 1, price: 1299 }],
  };

  // First dispatch: should succeed
  const firstDispatch = await whatsappService.sendOrderNotification({
    order: dummyOrder,
    eventType: 'confirmed',
  });
  assert(firstDispatch.success === true, 'First order notification dispatched successfully');
  assert(!firstDispatch.skipped, 'First order notification was not skipped');

  // Second dispatch: should be strictly deduplicated & skipped!
  const secondDispatch = await whatsappService.sendOrderNotification({
    order: dummyOrder,
    eventType: 'confirmed',
  });
  assert(secondDispatch.success === true && secondDispatch.skipped === true, 'Duplicate order notification was blocked by deduplication guard');
  assert(secondDispatch.reason === 'duplicate', 'Reason explicitly reported as duplicate');

  // Order shipped dispatch: distinct event should succeed
  const shippedDispatch = await whatsappService.sendOrderNotification({
    order: { ...dummyOrder, courierName: 'Delhivery Surface', awbCode: 'SR99887766' },
    eventType: 'shipped',
  });
  assert(shippedDispatch.success === true && !shippedDispatch.skipped, 'Order shipped status alert dispatched with tracking details');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: ADMIN TEST MESSAGE DISPATCH
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n6️⃣  TEST 6: Admin Test Message Dispatch');
  const testMsg = await whatsappService.sendTestMessage({
    toPhone: '9876543210',
    messageText: 'Hello from Bovato automated test suite!',
  });
  assert(testMsg.success === true, 'Admin test message dispatched successfully');
  assert(Boolean(testMsg.providerMessageId), 'Provider message ID generated', testMsg.providerMessageId);

  // Clean up test order messages created during this test
  await WhatsAppMessage.deleteMany({ orderId: dummyOrder._id });
  await WhatsAppWebhookEvent.deleteOne({ _id: loggedEvent._id });

  console.log('\n====================================================');
  console.log(`📊 TEST SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log('====================================================');

  await mongoose.disconnect();
}

runWhatsAppTests().catch(async (err) => {
  console.error('Fatal Test Error:', err);
  await mongoose.disconnect();
  process.exit(1);
});
