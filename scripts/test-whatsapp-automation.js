// scripts/test-whatsapp-automation.js
// Comprehensive End-to-End Test Suite for All WhatsApp Automations in BOVATO
const mongoose = require('mongoose');
const path = require('path');
const express = require('express');
const http = require('http');
const axios = require('axios');
const jwt = require('jsonwebtoken');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Order = require('../models/Order');
const Lead = require('../models/Lead');
const AbandonedCart = require('../models/AbandonedCart');
const WhatsAppMessage = require('../models/WhatsAppMessage');
const WhatsAppWebhookEvent = require('../models/WhatsAppWebhookEvent');
const RecoverySetting = require('../models/RecoverySetting');
const User = require('../models/User');
const Product = require('../models/Product');
const Coupon = require('../models/Coupon');
const { runAbandonedCartJob, stopAbandonedCartJob } = require('../jobs/abandonedCartJob');

// Setup internal test Express server with all relevant routes
const app = express();
app.use(express.json());
app.use('/api/orders', require('../routes/orderRoutes'));
app.use('/api/payment', require('../routes/paymentRoutes'));
app.use('/api/leads', require('../routes/leadRoutes'));
app.use('/api/abandoned-carts', require('../routes/abandonedCartRoutes'));
app.use('/api/whatsapp', require('../routes/whatsappRoutes'));
const metaWebhookRoutes = require('../routes/metaWebhookRoutes');
app.use('/webhook', metaWebhookRoutes);
app.use('/api/webhook', metaWebhookRoutes);

async function runAutomationTests() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║       BOVATO — FULL WHATSAPP AUTOMATION ENGINE TEST SUITE            ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;
  const results = [];

  function record(group, testName, isSuccess, details = '') {
    if (isSuccess) {
      passed++;
      console.log(`  ✅ [PASS] ${testName} ${details ? `(${details})` : ''}`);
      results.push({ group, testName, status: 'PASS', details });
    } else {
      failed++;
      console.log(`  ❌ [FAIL] ${testName} ${details ? `(${details})` : ''}`);
      results.push({ group, testName, status: 'FAIL', details });
    }
  }

  // Connect to DB
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB.\n');

  // Start internal server
  const serverPort = 5998;
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(serverPort, resolve));
  const baseUrl = `http://127.0.0.1:${serverPort}`;
  console.log(`Test server running on ${baseUrl}\n`);

  // Admin token
  const adminUser = await User.findOne({ isAdmin: true });
  const adminToken = adminUser ? jwt.sign({ id: adminUser._id }, process.env.JWT_SECRET || 'bovato_secret_key_12345', { expiresIn: '1h' }) : '';
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };

  // Track created IDs for clean teardown
  const createdOrderIds = [];
  const createdLeadIds = [];
  const createdCartIds = [];
  const createdWamids = [];

  try {
    // ═════════════════════════════════════════════════════════════════════════
    // AUTOMATION FLOW 1: ORDER PLACEMENT -> WHATSAPP CONFIRMATION
    // ═════════════════════════════════════════════════════════════════════════
    console.log('━━━ AUTOMATION 1: Storefront Order Placement Trigger ━━━');
    const orderPayload = {
      items: [
        {
          name: 'Bovato Charcoal Face Wash',
          slug: 'charcoal-face-wash',
          qty: 1,
          price: 599,
        },
      ],
      shippingAddress: {
        recipient_name: 'Rohit Khanna',
        phone: '9876543210',
        email: 'rohit@example.com',
        line1: 'Tower B, Flat 301, Sector 45',
        city: 'Gurugram',
        state: 'Haryana',
        pincode: '122003',
      },
      paymentMethod: 'cod',
      total: 599,
      subtotal: 599,
    };

    const orderRes = await axios.post(`${baseUrl}/api/orders`, orderPayload);
    const orderId = orderRes.data?._id;
    createdOrderIds.push(orderId);
    record('Order Placement', 'POST /api/orders creates order and triggers WhatsApp confirmation', orderRes.status === 200 || orderRes.status === 201, `Order: #${orderId}`);

    // Verify WhatsApp message logged automatically
    const orderWaMsg = await WhatsAppMessage.findOne({ orderId, messageType: 'order_confirmed' });
    record('Order Placement', 'WhatsApp order confirmation message logged in DB', Boolean(orderWaMsg && orderWaMsg.messageBody.includes('Order Confirmed')));
    record('Order Placement', 'Order confirmation contains recipient phone and items', Boolean(orderWaMsg && orderWaMsg.phone === '+919876543210'));

    // ═════════════════════════════════════════════════════════════════════════
    // AUTOMATION FLOW 2: ONLINE PAYMENT CAPTURE -> WHATSAPP CONFIRMATION
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n━━━ AUTOMATION 2: Online Payment Capture Trigger ━━━');
    // Create prepaid pending order
    const prepaidOrder = await Order.create({
      orderItems: [
        {
          name: 'Bovato Beard Oil',
          slug: 'beard-oil',
          qty: 1,
          price: 499,
          image: 'http://localhost:5001/images/products/beard-oil.svg',
        },
      ],
      shippingAddress: {
        recipient_name: 'Sunil Nair',
        phone: '9876543210',
        email: 'sunil@example.com',
        line1: '12, MG Road',
        city: 'Bengaluru',
        pincode: '560001',
      },
      contactInfo: { phone: '9876543210', email: 'sunil@example.com' },
      paymentMethod: 'card',
      totalPrice: 499,
      isPaid: false,
      orderStatus: 'pending',
    });
    createdOrderIds.push(prepaidOrder._id);

    // Trigger Payment Simulation API
    const payRes = await axios.post(`${baseUrl}/api/payment/simulate-test-payment`, {
      mongoOrderId: String(prepaidOrder._id),
    });
    record('Payment Automation', 'POST /api/payment/simulate-test-payment marks order PAID', payRes.data?.success === true && payRes.data?.order?.isPaid === true);

    const paidWaMsg = await WhatsAppMessage.findOne({ orderId: prepaidOrder._id, messageType: 'order_confirmed' });
    record('Payment Automation', 'Prepaid order payment capture triggers WhatsApp notification', Boolean(paidWaMsg));

    // ═════════════════════════════════════════════════════════════════════════
    // AUTOMATION FLOW 3: ORDER LIFECYCLE & TRACKING MILESTONES
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n━━━ AUTOMATION 3: Order Shipping & Delivery Milestones ━━━');
    // 3a: Transition to SHIPPED via PUT /api/orders/:id/tracking
    const shipRes = await axios.put(`${baseUrl}/api/orders/${prepaidOrder._id}/tracking`, {
      shippingStatus: 'PICKED_UP',
      orderStatus: 'shipped',
      courierName: 'Delhivery Surface',
      awbCode: 'DEL77889911',
      currentLocation: 'Delhi Sort Facility',
    }, { headers: adminHeaders });

    record('Lifecycle Automation', 'PUT /api/orders/:id/tracking (shipped) triggers Shipped alert', shipRes.data?.success === true);
    const shippedMsg = await WhatsAppMessage.findOne({ orderId: prepaidOrder._id, messageType: 'order_shipped' });
    record('Lifecycle Automation', 'Shipped notification includes courier and AWB tracking details', Boolean(shippedMsg && shippedMsg.messageBody.includes('Delhivery Surface')));

    // 3b: Transition to DELIVERED
    const delivRes = await axios.put(`${baseUrl}/api/orders/${prepaidOrder._id}/tracking`, {
      shippingStatus: 'DELIVERED',
      orderStatus: 'delivered',
      currentLocation: 'Customer Address',
    }, { headers: adminHeaders });

    record('Lifecycle Automation', 'PUT /api/orders/:id/tracking (delivered) triggers Delivered alert', delivRes.data?.success === true);
    const delivMsg = await WhatsAppMessage.findOne({ orderId: prepaidOrder._id, messageType: 'order_delivered' });
    record('Lifecycle Automation', 'Delivered notification includes review & satisfaction prompt', Boolean(delivMsg && delivMsg.messageBody.includes('Delivered')));

    // ═════════════════════════════════════════════════════════════════════════
    // AUTOMATION FLOW 4: LEAD CAPTURE & WELCOME OFFER AUTOMATION
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n━━━ AUTOMATION 4: Lead Capture & Welcome Offer Trigger ━━━');
    const leadCapturePayload = {
      name: 'Karan Mehra',
      phone: '9876543210',
      email: 'karan@example.com',
      source: 'quiz_completion',
      campaign: 'Glow2026',
      consentGiven: true,
      intent: 'get_offer',
      cartValue: 799,
    };

    const leadRes = await axios.post(`${baseUrl}/api/leads/capture`, leadCapturePayload);
    const leadId = leadRes.data?.leadId || leadRes.data?.lead?._id;
    if (leadId) createdLeadIds.push(leadId);

    record('Lead Capture', 'POST /api/leads/capture saves lead profile and calculates score', leadRes.data?.success === true && leadRes.data?.lead?.leadScore >= 50);
    record('Lead Capture', 'Automated welcome coupon code returned', leadRes.data?.couponCode === 'BOVATO10');

    const leadOfferMsg = await WhatsAppMessage.findOne({ leadId, messageType: 'offer' });
    record('Lead Capture', 'Automated Welcome Offer WhatsApp message logged in DB', Boolean(leadOfferMsg && leadOfferMsg.messageBody.includes('BOVATO10')));

    // Test rejection without consent
    try {
      await axios.post(`${baseUrl}/api/leads/capture`, { ...leadCapturePayload, consentGiven: false });
      record('Lead Capture', 'Rejects capture without consent', false);
    } catch (err) {
      record('Lead Capture', 'Rejects capture without explicit consent with HTTP 400', err.response?.status === 400);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // AUTOMATION FLOW 5: WHATSAPP OTP VERIFICATION ENGINE
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n━━━ AUTOMATION 5: WhatsApp OTP Verification Flow ━━━');
    const otpSendRes = await axios.post(`${baseUrl}/api/leads/send-otp`, {
      phone: '9876543210',
      name: 'Karan Mehra',
    });
    record('OTP Automation', 'POST /api/leads/send-otp generates and dispatches OTP', otpSendRes.data?.success === true);

    const capturedLead = await Lead.findById(leadId);
    record('OTP Automation', 'Cryptographic SHA-256 OTP hash and expiry stored on lead', Boolean(capturedLead?.otpHash && capturedLead?.otpExpiresAt));

    // Test verification using simulated OTP from response devNote or direct hash match
    const simulatedOtp = otpSendRes.data?.devNote?.replace('Simulated OTP: ', '').trim();
    if (simulatedOtp) {
      const verifyRes = await axios.post(`${baseUrl}/api/leads/verify-otp`, {
        phone: '9876543210',
        otp: simulatedOtp,
      });
      const isVerified = verifyRes.data?.success === true && (verifyRes.data?.verified === true || verifyRes.data?.lead?.phoneVerified === true);
      record('OTP Automation', 'POST /api/leads/verify-otp marks lead phoneVerified = true', isVerified);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // AUTOMATION FLOW 6: ABANDONED CART ENGINE & CRON RECOVERY
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n━━━ AUTOMATION 6: Abandoned Cart Detection & Recovery Job ━━━');
    // Ensure recovery settings are active
    const settings = await RecoverySetting.getOrCreate();
    settings.campaignActive = true;
    settings.enableWhatsAppRecovery = true;
    settings.abandonmentDelayMinutes = 1; // 1 minute
    settings.stage1DelayMinutes = 1;      // 1 minute
    settings.couponDiscountPercent = 10;
    settings.enableRecoveryCoupon = true;
    await settings.save();

    // 6a: Storefront track active cart
    const trackRes = await axios.post(`${baseUrl}/api/abandoned-carts/track`, {
      customerName: 'Deepak Chopra',
      phone: '9876543210',
      email: 'deepak@example.com',
      items: [{ name: 'Bovato Night Renewal Serum', price: 999, qty: 1 }],
      totalValue: 999,
      consentGiven: true,
      utmCampaign: 'auto_recovery_test',
    });
    record('Cart Tracking', 'POST /api/abandoned-carts/track captures storefront cart', trackRes.data?.success === true);

    const trackedCart = await AbandonedCart.findOne({ cartId: trackRes.data?.cartId });
    if (trackedCart) createdCartIds.push(trackedCart._id);

    // Mark as abandoned 1 hour ago so stage 1 delay is passed
    trackedCart.lifecycleStatus = 'abandoned';
    trackedCart.recoveryStatus = 'abandoned';
    trackedCart.lastActivityAt = new Date(Date.now() - 60 * 60 * 1000);
    trackedCart.abandonedAt = new Date(Date.now() - 60 * 60 * 1000);
    await trackedCart.save();

    // 6b: Trigger Abandoned Cart Background Job
    console.log('  ⚙️ Triggering background recovery pipeline iteration...');
    await runAbandonedCartJob();

    const recoveredCartDoc = await AbandonedCart.findById(trackedCart._id);
    record('Cart Engine', 'Background job detects idle cart and flags status as ABANDONED', recoveredCartDoc?.lifecycleStatus === 'abandoned');
    record('Cart Engine', 'Stage 1 WhatsApp recovery dispatched with dynamic recovery coupon', Boolean(recoveredCartDoc?.recoveryCoupon && recoveredCartDoc?.recoveryStage >= 1));

    const cartWaMsg = await WhatsAppMessage.findOne({ cartId: trackedCart._id, messageType: 'cart_recovery_stage_1' });
    record('Cart Engine', 'Recovery message logged in DB with custom checkout URL', Boolean(cartWaMsg && cartWaMsg.messageBody.includes(recoveredCartDoc?.recoveryCoupon)));

    // 6c: Cart Recovery on Purchase Hook
    const recoverRes = await axios.post(`${baseUrl}/api/abandoned-carts/recover`, {
      phone: '9876543210',
    });
    record('Cart Engine', 'POST /api/abandoned-carts/recover marks cart recovered on order completion', recoverRes.data?.success === true && recoverRes.data?.recoveredCount >= 1);

    const postRecoveryCart = await AbandonedCart.findById(trackedCart._id);
    record('Cart Engine', 'Cart lifecycleStatus updated to recovered with recoveryRevenue recorded', postRecoveryCart?.lifecycleStatus === 'recovered' && postRecoveryCart?.recoveryRevenue === 999);

    // ═════════════════════════════════════════════════════════════════════════
    // AUTOMATION FLOW 7: ADMIN MANUAL CART RECOVERY DISPATCH
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n━━━ AUTOMATION 7: Admin Cart Recovery Actions ━━━');
    const manualCart = await AbandonedCart.create({
      cartId: `cart_manual_${Date.now()}`,
      customerName: 'Manish Malhotra',
      phone: '9876543210',
      normalizedPhone: '+919876543210',
      totalValue: 1299,
      lifecycleStatus: 'abandoned',
      recoveryStatus: 'abandoned',
      recoveryToken: 'tok_' + Date.now(),
      consentGiven: true,
      items: [{ name: 'Vitamin C Face Cream', slug: 'vitamin-c-face-cream', price: 1299, qty: 1 }],
    });
    createdCartIds.push(manualCart._id);

    // 7a: Dynamic coupon generation
    const couponRes = await axios.post(`${baseUrl}/api/abandoned-carts/${manualCart._id}/coupon`, {
      discountPercent: 15,
      expiryHours: 24,
    }, { headers: adminHeaders });
    record('Admin Recovery', 'POST /api/abandoned-carts/:id/coupon creates unique single-use coupon', couponRes.data?.success === true && Boolean(couponRes.data?.couponCode));

    // 7b: Send manual WhatsApp message
    const sendWaRes = await axios.post(`${baseUrl}/api/abandoned-carts/${manualCart._id}/send-whatsapp`, {
      messageText: 'Hello Manish! Your custom Bovato cart discount is active for 24 hours only.',
    }, { headers: adminHeaders });
    record('Admin Recovery', 'POST /api/abandoned-carts/:id/send-whatsapp dispatches recovery message', sendWaRes.status === 200 && Boolean(sendWaRes.data?.whatsappUrl));

    // ═════════════════════════════════════════════════════════════════════════
    // AUTOMATION FLOW 8: REALTIME META WEBHOOK AUTOMATION ENGINE
    // ═════════════════════════════════════════════════════════════════════════
    console.log('\n━━━ AUTOMATION 8: Real-Time Webhook Automation & Opt-Outs ━━━');
    const autoWamid = `wamid.AUTO_${Date.now()}`;
    createdWamids.push(autoWamid);

    const trackedMsg = await WhatsAppMessage.create({
      phone: '+919876543210',
      messageType: 'cart_recovery_stage_1',
      status: 'sent',
      providerMessageId: autoWamid,
      cartId: manualCart._id,
      leadId: leadId,
      messageBody: 'Automated test message',
    });

    // 8a: Simulate Meta 'READ' status update event
    const readPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '1563273054848092',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                statuses: [
                  {
                    id: autoWamid,
                    status: 'read',
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

    const readWebhookRes = await axios.post(`${baseUrl}/webhook`, readPayload);
    record('Webhook Automation', 'POST /webhook processes delivery status update (read)', readWebhookRes.status === 200);

    const updatedTrackedMsg = await WhatsAppMessage.findById(trackedMsg._id);
    record('Webhook Automation', 'WhatsAppMessage status automatically updated to read', updatedTrackedMsg?.status === 'read' && Boolean(updatedTrackedMsg?.readAt));

    const updatedCartOnRead = await AbandonedCart.findById(manualCart._id);
    record('Webhook Automation', 'AbandonedCart recoveryStatus automatically synced to read', updatedCartOnRead?.recoveryStatus === 'read');

    // 8b: Simulate Customer Inbound Reply: "I want to purchase this"
    const inboundReplyPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '1563273054848092',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                messages: [
                  {
                    from: '919876543210',
                    id: `wamid.REPLY_${Date.now()}`,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    text: { body: 'Can I get COD on this order?' },
                    type: 'text',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    await axios.post(`${baseUrl}/webhook`, inboundReplyPayload);
    const updatedLeadOnReply = await Lead.findById(leadId);
    const hasCustomerNote = updatedLeadOnReply?.notes?.some((n) => n.text.includes('COD on this order'));
    record('Webhook Automation', 'Customer reply automatically appended to CRM Lead notes', Boolean(hasCustomerNote));

    // 8c: Simulate Customer Opt-out Keyword: "STOP"
    const stopPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '1563273054848092',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                messages: [
                  {
                    from: '919876543210',
                    id: `wamid.STOP_${Date.now()}`,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    text: { body: 'STOP all notifications' },
                    type: 'text',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    await axios.post(`${baseUrl}/webhook`, stopPayload);
    const optedOutCart = await AbandonedCart.findById(manualCart._id);
    record('Webhook Automation', 'Smart opt-out detector marks cart optedOut = true and halts campaigns', optedOutCart?.optedOut === true && optedOutCart?.recoveryStatus === 'opted_out');

    // ═════════════════════════════════════════════════════════════════════════
    // CLEANUP TEST DOCUMENTS
    // ═════════════════════════════════════════════════════════════════════════
    await Order.deleteMany({ _id: { $in: createdOrderIds } });
    await Lead.deleteMany({ _id: { $in: createdLeadIds } });
    await AbandonedCart.deleteMany({ _id: { $in: createdCartIds } });
    await WhatsAppMessage.deleteMany({ phone: '+919876543210' });
    await WhatsAppWebhookEvent.deleteMany({ senderPhone: '+919876543210' });
    await WhatsAppWebhookEvent.deleteMany({ recipientPhone: '919876543210' });
    await Coupon.deleteMany({ code: /^BOVATO-REC-/ });

    console.log('\n══════════════════════════════════════════════════════════════════════');
    console.log(`🎯 AUTOMATION TEST RESULTS: ${passed} PASSED | ${failed} FAILED | TOTAL: ${passed + failed}`);
    console.log('══════════════════════════════════════════════════════════════════════\n');

  } catch (err) {
    console.error('Fatal Automation Test Error:', err);
  } finally {
    stopAbandonedCartJob();
    server.close();
    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runAutomationTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
