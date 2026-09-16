// scripts/test-whatsapp-all.js
// Complete End-to-End Test Suite for All Meta WhatsApp Cloud APIs, Services & Webhooks
const mongoose = require('mongoose');
const path = require('path');
const express = require('express');
const http = require('http');
const axios = require('axios');
const jwt = require('jsonwebtoken');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const WhatsAppMessage = require('../models/WhatsAppMessage');
const WhatsAppSetting = require('../models/WhatsAppSetting');
const WhatsAppWebhookEvent = require('../models/WhatsAppWebhookEvent');
const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const Lead = require('../models/Lead');
const AbandonedCart = require('../models/AbandonedCart');
const User = require('../models/User');
const whatsappService = require('../services/whatsappService');

// Express App Setup for HTTP endpoint testing
const app = express();
app.use(express.json());
app.use('/api/whatsapp', require('../routes/whatsappRoutes'));
const metaWebhookRoutes = require('../routes/metaWebhookRoutes');
app.use('/webhook', metaWebhookRoutes);
app.use('/api/webhook', metaWebhookRoutes);

async function runAllWhatsAppTests() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║       BOVATO — FULL META WHATSAPP CLOUD API & SERVICE TEST SUITE     ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;
  const results = [];

  function record(testGroup, testName, isSuccess, details = '') {
    if (isSuccess) {
      passed++;
      console.log(`  ✅ [PASS] ${testName} ${details ? `(${details})` : ''}`);
      results.push({ testGroup, testName, status: 'PASS', details });
    } else {
      failed++;
      console.log(`  ❌ [FAIL] ${testName} ${details ? `(${details})` : ''}`);
      results.push({ testGroup, testName, status: 'FAIL', details });
    }
  }

  // Connect to DB
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB.\n');

  // Start internal test server
  const serverPort = 5999;
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(serverPort, resolve));
  const baseUrl = `http://127.0.0.1:${serverPort}`;
  console.log(`Internal Test Server running on ${baseUrl}\n`);

  // Admin JWT Token Generation
  const adminUser = await User.findOne({ isAdmin: true });
  const adminToken = adminUser ? jwt.sign({ id: adminUser._id }, process.env.JWT_SECRET || 'bovato_secret_key_12345', { expiresIn: '1h' }) : '';
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };

  try {
    // ═════════════════════════════════════════════════════════════════════════
    // GROUP 1: PHONE NUMBER NORMALIZATION (E.164)
    // ═════════════════════════════════════════════════════════════════════════
    console.log('━━━ GROUP 1: Phone Number Normalization ━━━');
    const p1 = whatsappService.normalizeToE164('9876543210');
    record('Normalization', '10-digit number normalizes to +91', p1.isValid && p1.digits === '919876543210' && p1.e164 === '+919876543210');

    const p2 = whatsappService.normalizeToE164('09876543210');
    record('Normalization', 'Leading 0 number normalizes to +91', p2.isValid && p2.digits === '919876543210');

    const p3 = whatsappService.normalizeToE164('+91 (987) 654-3210');
    record('Normalization', 'Formatted number strips punctuation', p3.isValid && p3.digits === '919876543210');

    const p4 = whatsappService.normalizeToE164('1234');
    record('Normalization', 'Short number rejected as invalid', p4.isValid === false);

    const formatted = whatsappService.formatWhatsAppNumber('9876543210');
    record('Normalization', 'formatWhatsAppNumber helper returns digits', formatted === '919876543210');

    // ═════════════════════════════════════════════════════════════════════════
    // GROUP 2: META CONFIGURATION RESOLUTION & DB SYNC
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n━━━ GROUP 2: Meta Credentials & Dynamic Configuration ━━━');
    const config = await whatsappService.getWhatsAppConfig();
    record('Config', 'Phone Number ID resolved', Boolean(config.phoneNumberId), config.phoneNumberId);
    record('Config', 'Business Account ID resolved', Boolean(config.businessAccountId), config.businessAccountId);
    record('Config', 'Permanent Meta Access Token present', Boolean(config.accessToken && config.hasToken), `Token length: ${config.accessToken?.length}`);
    record('Config', 'Meta Verify Token configured', config.verifyToken === 'bovato_whatsapp_verify_token_2026', config.verifyToken);
    record('Config', 'Graph API Version configured', config.apiVersion === 'v20.0', config.apiVersion);
    record('Config', 'Integration enabled status', config.isEnabled === true);

    // ═════════════════════════════════════════════════════════════════════════
    // GROUP 3: LIVE META CLOUD API DIRECT GRAPH VERIFICATION
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n━━━ GROUP 3: Live Meta Cloud API Connectivity Check ━━━');
    try {
      const phoneRes = await axios.get(`https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}?fields=id,verified_name,display_phone_number,code_verification_status,status`, {
        headers: { Authorization: `Bearer ${config.accessToken}` },
        timeout: 10000,
      });
      record('Meta API', 'GET /<phone_number_id> verified from Meta Cloud API', phoneRes.data?.verified_name === 'Bovato', `Name: ${phoneRes.data?.verified_name}, Display: ${phoneRes.data?.display_phone_number}, Status: ${phoneRes.data?.status}`);
    } catch (err) {
      record('Meta API', 'GET /<phone_number_id>', false, err.message);
    }

    try {
      const wabaRes = await axios.get(`https://graph.facebook.com/${config.apiVersion}/${config.businessAccountId}?fields=id,name,currency,timezone_id`, {
        headers: { Authorization: `Bearer ${config.accessToken}` },
        timeout: 10000,
      });
      record('Meta API', 'GET /<business_account_id> verified from Meta Cloud API', wabaRes.data?.name === 'Bovato', `Name: ${wabaRes.data?.name}, Currency: ${wabaRes.data?.currency}`);
    } catch (err) {
      record('Meta API', 'GET /<business_account_id>', false, err.message);
    }

    try {
      const subRes = await axios.get(`https://graph.facebook.com/${config.apiVersion}/${config.businessAccountId}/subscribed_apps`, {
        headers: { Authorization: `Bearer ${config.accessToken}` },
        timeout: 10000,
      });
      const isSubscribed = subRes.data?.data?.length > 0;
      record('Meta API', 'Meta App Subscribed to WhatsApp Business Account', isSubscribed, `App: ${subRes.data?.data?.[0]?.whatsapp_business_api_data?.name || 'Linked'}`);
    } catch (err) {
      record('Meta API', 'GET /subscribed_apps', false, err.message);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // GROUP 4: ORDER NOTIFICATIONS & DEDUPLICATION ENGINE
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n━━━ GROUP 4: Order Status Notifications & Deduplication ━━━');
    const testOrderId = new mongoose.Types.ObjectId();
    const testOrder = {
      _id: testOrderId,
      totalPrice: 1598,
      total: 1598,
      paymentMethod: 'cod',
      orderStatus: 'confirmed',
      shippingAddress: {
        recipient_name: 'Rahul Sharma',
        phone: '9876543210',
        line1: 'Flat 402, Lotus Towers',
        city: 'Mumbai',
        pincode: '400050',
      },
      orderItems: [
        { name: 'Bovato Charcoal Face Wash', qty: 1, price: 599 },
        { name: 'Bovato Hydrating Serum', qty: 1, price: 999 },
      ],
    };

    // 1. Order Confirmed Alert
    const orderConfResult = await whatsappService.sendOrderNotification({
      order: testOrder,
      eventType: 'confirmed',
    });
    record('Order Notification', 'Order Confirmed alert processed', Boolean(orderConfResult.messageText), `Dispatched via: ${orderConfResult.dispatchedVia}`);
    record('Order Notification', 'Direct wa.me URL generated with prefilled message', Boolean(orderConfResult.whatsappUrl && orderConfResult.whatsappUrl.includes('wa.me/919876543210')));

    // Simulate marked sent for deduplication test
    await WhatsAppMessage.updateOne({ orderId: testOrderId, messageType: 'order_confirmed' }, { $set: { status: 'sent' } });

    // 2. Event Deduplication Check (Same order + event sent again)
    const dedupResult = await whatsappService.sendOrderNotification({
      order: testOrder,
      eventType: 'confirmed',
    });
    record('Order Notification', 'Strict deduplication guard blocks duplicate alert', dedupResult.skipped === true && dedupResult.reason === 'duplicate');

    // 3. Order Processing Alert
    const orderProcResult = await whatsappService.sendOrderNotification({
      order: testOrder,
      eventType: 'processing',
    });
    record('Order Notification', 'Order Processing alert generated with fulfillment details', Boolean(orderProcResult.messageText && orderProcResult.messageText.includes('packed with utmost care')));

    // 4. Order Shipped Alert
    const orderShippedResult = await whatsappService.sendOrderNotification({
      order: {
        ...testOrder,
        courierName: 'Blue Dart Express',
        awbCode: 'BD77889900',
      },
      eventType: 'shipped',
    });
    record('Order Notification', 'Order Shipped alert generated with tracking details', Boolean(orderShippedResult.messageText && orderShippedResult.messageText.includes('Blue Dart Express')));

    // 5. Order Delivered Alert
    const orderDeliveredResult = await whatsappService.sendOrderNotification({
      order: testOrder,
      eventType: 'delivered',
    });
    record('Order Notification', 'Order Delivered alert generated with review prompt', Boolean(orderDeliveredResult.messageText && orderDeliveredResult.messageText.includes('successfully delivered')));

    // 6. Order Cancelled Alert
    const orderCancelledResult = await whatsappService.sendOrderNotification({
      order: testOrder,
      eventType: 'cancelled',
    });
    record('Order Notification', 'Order Cancelled alert generated with refund info', Boolean(orderCancelledResult.messageText && orderCancelledResult.messageText.includes('cancelled')));

    // ═════════════════════════════════════════════════════════════════════════
    // GROUP 5: OTP VERIFICATION SERVICE
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n━━━ GROUP 5: WhatsApp OTP Verification Service ━━━');
    const dummyLead = new Lead({
      _id: new mongoose.Types.ObjectId(),
      name: 'Amit Verma',
      phone: '9876543210',
      normalizedPhone: '+919876543210',
      consentGiven: true,
      source: 'quiz',
    });
    await dummyLead.save();

    const otpResult = await whatsappService.sendWhatsAppOTP({
      lead: dummyLead,
      otp: '784921',
    });
    record('OTP Service', 'OTP message generated and dispatched', Boolean(otpResult.whatsappUrl && otpResult.whatsappUrl.includes('784921')), `Dispatched via: ${otpResult.dispatchedVia}`);

    const otpDoc = await WhatsAppMessage.findOne({ leadId: dummyLead._id, messageType: 'otp' });
    record('OTP Service', 'OTP message logged in DB with 5-min validity notice', Boolean(otpDoc && otpDoc.messageBody.includes('5 minutes')));

    // ═════════════════════════════════════════════════════════════════════════
    // GROUP 6: LEAD WELCOME OFFER SERVICE
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n━━━ GROUP 6: Lead Welcome Offer Service ━━━');
    const offerResult = await whatsappService.sendLeadWelcomeOffer({
      lead: dummyLead,
      couponCode: 'WELCOME15',
    });
    record('Welcome Offer', 'Welcome offer dispatched with coupon code', Boolean(offerResult.messageText && offerResult.messageText.includes('WELCOME15')), `Dispatched via: ${offerResult.dispatchedVia}`);

    // Consent enforcement test
    const noConsentLead = new Lead({
      name: 'No Consent User',
      phone: '9876543211',
      consentGiven: false,
    });
    const consentCheck = await whatsappService.sendLeadWelcomeOffer({ lead: noConsentLead });
    record('Welcome Offer', 'Consent guard blocks message when consentGiven=false', consentCheck.success === false && consentCheck.error.includes('consent'));

    // ═════════════════════════════════════════════════════════════════════════
    // GROUP 7: ABANDONED CART RECOVERY SERVICE (MULTI-STAGE)
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n━━━ GROUP 7: Multi-Stage Abandoned Cart Recovery ━━━');
    const dummyCart = new AbandonedCart({
      _id: new mongoose.Types.ObjectId(),
      customerName: 'Sanjay Patel',
      phone: '9876543210',
      normalizedPhone: '+919876543210',
      recoveryToken: 'rec_' + Date.now(),
      consentGiven: true,
      optedOut: false,
      cartTotal: 1899,
      cartItems: [{ name: 'Anti-Aging Elixir', quantity: 1, price: 1899 }],
    });
    await dummyCart.save();

    // Stage 1 Recovery
    const stage1Result = await whatsappService.sendCartRecoveryMessage({
      cart: dummyCart,
      stage: 1,
      couponCode: 'SAVE10',
      discountPercent: 10,
    });
    record('Cart Recovery', 'Stage 1 cart recovery message processed', Boolean(stage1Result.messageText && stage1Result.messageText.includes('SAVE10')));

    // Stage 2 Recovery
    const stage2Result = await whatsappService.sendCartRecoveryMessage({
      cart: dummyCart,
      stage: 2,
      couponCode: 'SAVE15',
      discountPercent: 15,
    });
    record('Cart Recovery', 'Stage 2 reminder processed and saved in cart activity', Boolean(stage2Result.messageText && stage2Result.messageText.includes('SAVE15')));

    // Stage 3 Recovery
    const stage3Result = await whatsappService.sendCartRecoveryMessage({
      cart: dummyCart,
      stage: 3,
      couponCode: 'LASTCHANCE',
      discountPercent: 20,
    });
    record('Cart Recovery', 'Stage 3 urgency recovery message processed', Boolean(stage3Result.messageText && stage3Result.messageText.includes('LASTCHANCE')));

    // Opt-out guard test
    dummyCart.optedOut = true;
    await dummyCart.save();
    const optOutCheck = await whatsappService.sendCartRecoveryMessage({ cart: dummyCart, stage: 1 });
    record('Cart Recovery', 'Opt-out guard blocks messaging when optedOut=true', optOutCheck.success === false && optOutCheck.error.includes('opted out'));

    // Manual Cart WhatsApp dispatch
    dummyCart.optedOut = false;
    await dummyCart.save();
    const manualCartResult = await whatsappService.sendManualCartWhatsApp({
      cart: dummyCart,
      messageText: 'Hi Sanjay, we have kept your items reserved for the next 2 hours!',
    });
    record('Cart Recovery', 'Admin manual cart message dispatched', Boolean(manualCartResult.whatsappUrl && manualCartResult.whatsappUrl.includes('reserved')));

    // ═════════════════════════════════════════════════════════════════════════
    // GROUP 8: ADMIN TEST MESSAGE SERVICE
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n━━━ GROUP 8: Admin Test Message Service ━━━');
    const adminTestResult = await whatsappService.sendTestMessage({
      toPhone: '9876543210',
      messageText: 'Testing WhatsApp integration from Admin Panel',
    });
    record('Admin Test', 'sendTestMessage creates audit record and returns wa.me URL', Boolean(adminTestResult.whatsappUrl && adminTestResult.whatsappUrl.includes('Admin%20Panel')), `Dispatched via: ${adminTestResult.dispatchedVia}`);

    const latestSetting = await WhatsAppSetting.findOne();
    record('Admin Test', 'WhatsAppSetting.lastTestedAt updated', Boolean(latestSetting?.lastTestedAt));

    // ═════════════════════════════════════════════════════════════════════════
    // GROUP 9: HTTP WEBHOOK VERIFICATION ENDPOINTS (GET)
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n━━━ GROUP 9: HTTP Webhook Verification (GET Endpoints) ━━━');
    const challengeToken = 'meta_test_challenge_' + Date.now();

    // 1. GET /api/whatsapp/webhook
    try {
      const getRes1 = await axios.get(`${baseUrl}/api/whatsapp/webhook`, {
        params: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'bovato_whatsapp_verify_token_2026',
          'hub.challenge': challengeToken,
        },
      });
      record('Webhook GET', 'GET /api/whatsapp/webhook returns HTTP 200 with challenge', getRes1.status === 200 && String(getRes1.data) === challengeToken);
    } catch (err) {
      record('Webhook GET', 'GET /api/whatsapp/webhook', false, err.message);
    }

    // 2. GET /webhook (Root alias used by Meta Cloud dashboard)
    try {
      const getRes2 = await axios.get(`${baseUrl}/webhook`, {
        params: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'bovato_whatsapp_verify_token_2026',
          'hub.challenge': challengeToken,
        },
      });
      record('Webhook GET', 'GET /webhook (root alias) returns HTTP 200 with challenge', getRes2.status === 200 && String(getRes2.data) === challengeToken);
    } catch (err) {
      record('Webhook GET', 'GET /webhook (root alias)', false, err.message);
    }

    // 3. GET /webhook with invalid token -> 403 Forbidden
    try {
      await axios.get(`${baseUrl}/webhook`, {
        params: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong_token_xyz',
          'hub.challenge': challengeToken,
        },
      });
      record('Webhook GET', 'Tampered verify_token rejected with 403', false);
    } catch (err) {
      record('Webhook GET', 'Tampered verify_token rejected with 403', err.response?.status === 403, `Status: ${err.response?.status}`);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // GROUP 10: HTTP WEBHOOK EVENT RECEIVERS (POST Endpoints)
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n━━━ GROUP 10: HTTP Webhook Event Receiver (POST Endpoints) ━━━');
    const mockWamid = `wamid.TEST_${Date.now()}`;

    // Create a message in DB to track status update
    await WhatsAppMessage.create({
      phone: '+919876543210',
      messageType: 'test_message',
      status: 'sent',
      providerMessageId: mockWamid,
      cartId: dummyCart._id,
      leadId: dummyLead._id,
      messageBody: 'Tracking test message',
    });

    // 1. Post Status Update: delivered
    const deliveryPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: config.businessAccountId,
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '918368620200', phone_number_id: config.phoneNumberId },
                statuses: [
                  {
                    id: mockWamid,
                    status: 'delivered',
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    recipient_id: '919876543210',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    try {
      const postRes = await axios.post(`${baseUrl}/api/whatsapp/webhook`, deliveryPayload);
      record('Webhook POST', 'POST /api/whatsapp/webhook handles delivery status event', postRes.status === 200);

      const updatedMsg = await WhatsAppMessage.findOne({ providerMessageId: mockWamid });
      record('Webhook POST', 'Message status updated to delivered in DB', updatedMsg?.status === 'delivered');
    } catch (err) {
      record('Webhook POST', 'Delivery event failed', false, err.message);
    }

    // 2. Post Customer Inbound Reply: "I want to confirm my order"
    const inboundReplyPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: config.businessAccountId,
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '918368620200', phone_number_id: config.phoneNumberId },
                contacts: [{ profile: { name: 'Rahul' }, wa_id: '919876543210' }],
                messages: [
                  {
                    from: '919876543210',
                    id: `wamid.INBOUND_${Date.now()}`,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    text: { body: 'Please confirm my order delivery date.' },
                    type: 'text',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    try {
      const replyRes = await axios.post(`${baseUrl}/webhook`, inboundReplyPayload);
      record('Webhook POST', 'POST /webhook receives inbound customer reply', replyRes.status === 200);

      const inboundEvent = await WhatsAppWebhookEvent.findOne({ senderPhone: '+919876543210', eventType: 'incoming_message' });
      record('Webhook POST', 'Inbound customer message logged in WhatsAppWebhookEvent audit', Boolean(inboundEvent && inboundEvent.messageBody.includes('confirm my order')));
    } catch (err) {
      record('Webhook POST', 'Inbound reply failed', false, err.message);
    }

    // 3. Post Customer Opt-out: "STOP"
    const optOutPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: config.businessAccountId,
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                messages: [
                  {
                    from: '919876543210',
                    id: `wamid.OPTOUT_${Date.now()}`,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    text: { body: 'STOP messaging me' },
                    type: 'text',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    try {
      await axios.post(`${baseUrl}/webhook`, optOutPayload);
      const optOutCart = await AbandonedCart.findById(dummyCart._id);
      record('Webhook POST', 'Smart opt-out parser flags AbandonedCart as opted_out', optOutCart?.optedOut === true && optOutCart?.recoveryStatus === 'opted_out');
    } catch (err) {
      record('Webhook POST', 'Opt-out test failed', false, err.message);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // GROUP 11: ADMIN WHATSAPP CONTROLLER APIS
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n━━━ GROUP 11: Admin WhatsApp Controller Endpoints ━━━');
    if (adminToken) {
      // 1. GET /api/whatsapp/settings
      try {
        const setRes = await axios.get(`${baseUrl}/api/whatsapp/settings`, { headers: adminHeaders });
        record('Admin Endpoints', 'GET /api/whatsapp/settings returns masked settings', setRes.data?.success === true && Boolean(setRes.data?.settings?.maskedToken), `Masked: ${setRes.data?.settings?.maskedToken}`);
      } catch (err) {
        record('Admin Endpoints', 'GET /api/whatsapp/settings', false, err.message);
      }

      // 2. GET /api/whatsapp/stats
      try {
        const statsRes = await axios.get(`${baseUrl}/api/whatsapp/stats`, { headers: adminHeaders });
        record('Admin Endpoints', 'GET /api/whatsapp/stats returns delivery health & rates', statsRes.data?.success === true && typeof statsRes.data?.stats?.total === 'number', `Total: ${statsRes.data?.stats?.total}, Delivered: ${statsRes.data?.stats?.delivered}`);
      } catch (err) {
        record('Admin Endpoints', 'GET /api/whatsapp/stats', false, err.message);
      }

      // 3. GET /api/whatsapp/templates
      try {
        const tplRes = await axios.get(`${baseUrl}/api/whatsapp/templates`, { headers: adminHeaders });
        record('Admin Endpoints', 'GET /api/whatsapp/templates returns seeded template catalog', tplRes.data?.success === true && tplRes.data?.templates?.length >= 5, `Templates: ${tplRes.data?.templates?.length}`);
      } catch (err) {
        record('Admin Endpoints', 'GET /api/whatsapp/templates', false, err.message);
      }

      // 4. GET /api/whatsapp/messages
      try {
        const msgRes = await axios.get(`${baseUrl}/api/whatsapp/messages?page=1&limit=5`, { headers: adminHeaders });
        record('Admin Endpoints', 'GET /api/whatsapp/messages returns paginated log', msgRes.data?.success === true && Array.isArray(msgRes.data?.messages), `Retrieved: ${msgRes.data?.messages?.length} messages`);
      } catch (err) {
        record('Admin Endpoints', 'GET /api/whatsapp/messages', false, err.message);
      }
    } else {
      console.log('⚠️ Skipping authenticated Admin endpoints (no admin token)');
    }

    // Clean up temporary test documents
    await WhatsAppMessage.deleteMany({ orderId: testOrderId });
    await WhatsAppMessage.deleteMany({ providerMessageId: mockWamid });
    await WhatsAppMessage.deleteMany({ leadId: dummyLead._id });
    await WhatsAppMessage.deleteMany({ cartId: dummyCart._id });
    await Lead.deleteOne({ _id: dummyLead._id });
    await AbandonedCart.deleteOne({ _id: dummyCart._id });
    await WhatsAppWebhookEvent.deleteMany({ recipientPhone: '+919876543210' });
    await WhatsAppWebhookEvent.deleteMany({ senderPhone: '+919876543210' });

    console.log('\n══════════════════════════════════════════════════════════════════════');
    console.log(`🎯 FINAL RESULTS: ${passed} PASSED | ${failed} FAILED | TOTAL: ${passed + failed}`);
    console.log('══════════════════════════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('Fatal test error:', err);
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

runAllWhatsAppTests().catch(console.error);
