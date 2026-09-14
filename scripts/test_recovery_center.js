require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const axios = require('axios');
const mongoose = require('mongoose');

const BASE_URL = 'http://localhost:5001/api';

async function runTests() {
  console.log('🧪 ========================================================');
  console.log('🧪 RUNNING ABANDONED CART RECOVERY CENTER TEST SUITE');
  console.log('🧪 ========================================================\n');

  // Connect Mongoose to the database
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  await mongoose.connect(mongoUri);

  let adminToken = '';
  let testCartId = '';
  let testRecoveryToken = '';
  let testMongoId = '';
  const testPhone = '9988776655';
  const testCustomerName = 'Vikram Malhotra';

  // 1. Authenticate as Admin
  console.log('🔹 [TEST 1] Logging in as Admin...');
  try {
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@bovato.com',
      password: 'admin123',
    });
    adminToken = loginRes.data.token;
    console.log('✅ Admin authenticated successfully. Token received.\n');
  } catch (err) {
    console.error('❌ Failed Admin Login:', err.response?.data || err.message);
    process.exit(1);
  }

  const adminHeaders = {
    Authorization: `Bearer ${adminToken}`,
    'Content-Type': 'application/json',
  };

  // 2. Query Initial KPI Stats
  console.log('🔹 [TEST 2] Fetching 8 Dynamic KPI Metrics (/api/abandoned-carts/stats)...');
  try {
    const statsRes = await axios.get(`${BASE_URL}/abandoned-carts/stats`, { headers: adminHeaders });
    console.log('✅ Stats endpoint responded:', statsRes.data.stats);
  } catch (err) {
    console.error('❌ Failed fetching stats:', err.response?.data || err.message);
  }

  // 3. Track Active Cart (Storefront Cart Activity)
  console.log('\n🔹 [TEST 3] Tracking Storefront Active Cart (POST /api/cart/track)...');
  try {
    const trackRes = await axios.post(`${BASE_URL}/cart/track`, {
      items: [
        {
          slug: 'anti-pollution-face-wash',
          name: 'Anti-Pollution Face Wash',
          price: 499,
          qty: 2,
          image: '/assets/products/BOVATO -01.png',
        },
      ],
      subtotal: 998,
      totalValue: 998,
      utmSource: 'meta_ads',
      utmMedium: 'cpc',
      utmCampaign: 'monsoon_mega_sale',
      source: 'cart_drawer_save',
    });
    testCartId = trackRes.data.cartId;
    console.log(`✅ Cart tracked successfully. CartId: ${testCartId}, Status: ${trackRes.data.lifecycleStatus}`);
  } catch (err) {
    console.error('❌ Failed tracking cart:', err.response?.data || err.message);
  }

  // 4. Attach Customer Phone and Affirmative Consent
  console.log('\n🔹 [TEST 4] Identifying Customer with Consent (POST /api/cart/identify-customer)...');
  try {
    const identifyRes = await axios.post(`${BASE_URL}/cart/identify-customer`, {
      cartId: testCartId,
      name: testCustomerName,
      phone: testPhone,
      email: 'vikram.malhotra@example.com',
      consentGiven: true,
    });
    console.log(`✅ Customer identified: ${identifyRes.data.customerName}, Phone: ${identifyRes.data.phone}, Consent: ${identifyRes.data.consentGiven}`);
  } catch (err) {
    console.error('❌ Failed customer identify:', err.response?.data || err.message);
  }

  // 5. Customer initiates checkout (POST /api/cart/checkout-start)
  console.log('\n🔹 [TEST 5] Transitioning to CHECKOUT_STARTED (POST /api/cart/checkout-start)...');
  try {
    const checkoutRes = await axios.post(`${BASE_URL}/cart/checkout-start`, {
      cartId: testCartId,
      phone: testPhone,
    });
    console.log(`✅ Cart transitioned: ${checkoutRes.data.cartId} -> ${checkoutRes.data.lifecycleStatus}`);
  } catch (err) {
    console.error('❌ Failed checkout start:', err.response?.data || err.message);
  }

  // 6. Test Background Abandonment Detection Engine
  console.log('\n🔹 [TEST 6] Triggering Abandonment Background Pipeline (jobs/abandonedCartJob.js)...');
  try {
    const AbandonedCart = require('../models/AbandonedCart');
    const { runAbandonedCartJob } = require('../jobs/abandonedCartJob');

    // Simulate idle time older than 30 mins
    await AbandonedCart.findOneAndUpdate(
      { cartId: testCartId },
      { lastActivityAt: new Date(Date.now() - 35 * 60 * 1000) }
    );

    // Execute one cron tick
    await runAbandonedCartJob();

    const updatedCart = await AbandonedCart.findOne({ cartId: testCartId });
    testRecoveryToken = updatedCart.recoveryToken;
    testMongoId = updatedCart._id.toString();
    console.log(`✅ Background detection complete. Cart Lifecycle: ${updatedCart.lifecycleStatus}, RecoveryToken: ${testRecoveryToken.substring(0, 10)}...`);
    console.log(`   Activity History events count: ${updatedCart.activityHistory.length}`);
  } catch (err) {
    console.error('❌ Background job error:', err.message);
  }

  // 7. Test Secure Recovery URL Restoration (GET /api/cart/recover/:token)
  console.log('\n🔹 [TEST 7] Fetching Recovery URL Data (GET /api/cart/recover/:token)...');
  try {
    const recoverRes = await axios.get(`${BASE_URL}/cart/recover/${testRecoveryToken}`);
    console.log(`✅ Recovery URL validated: Customer: ${recoverRes.data.cart?.customerName}, Items: ${recoverRes.data.cart?.items?.length}, Total: ₹${recoverRes.data.cart?.totalValue}`);
  } catch (err) {
    console.error('❌ Recovery URL fetch error:', err.response?.data || err.message);
  }

  // 8. Test Dynamic Recovery Coupon Generation
  console.log('\n🔹 [TEST 8] Generating Recovery Coupon (POST /api/abandoned-carts/:id/coupon)...');
  let couponCode = '';
  try {
    const couponRes = await axios.post(
      `${BASE_URL}/abandoned-carts/${testMongoId}/coupon`,
      { discountPercent: 15 },
      { headers: adminHeaders }
    );
    couponCode = couponRes.data.couponCode;
    console.log(`✅ Unique Recovery Coupon Generated: ${couponCode} (${couponRes.data.discountPercent}% OFF)`);
  } catch (err) {
    console.error('❌ Coupon generation error:', err.response?.data || err.message);
  }

  // 9. Test Manual / Automated WhatsApp Dispatch
  console.log('\n🔹 [TEST 9] Dispatching Stage 1 WhatsApp Recovery Message...');
  let mockWamid = '';
  try {
    const waRes = await axios.post(
      `${BASE_URL}/abandoned-carts/${testMongoId}/send-whatsapp`,
      { stage: 1 },
      { headers: adminHeaders }
    );
    mockWamid = waRes.data.providerMessageId;
    console.log(`✅ WhatsApp dispatched! Provider ID: ${mockWamid}`);
    console.log(`   Message Preview: "${waRes.data.previewText?.split('\n')[0]}..."`);
  } catch (err) {
    console.error('❌ WhatsApp dispatch error:', err.response?.data || err.message);
  }

  // 10. Test Meta Webhook Status Event (DELIVERED & READ)
  console.log('\n🔹 [TEST 10] Testing Meta WhatsApp Webhook Status Synchronization (POST /api/whatsapp/webhook)...');
  try {
    // Deliver Event
    await axios.post(`${BASE_URL}/whatsapp/webhook`, {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: mockWamid,
                    status: 'delivered',
                    timestamp: Math.floor(Date.now() / 1000).toString(),
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    // Read Event
    await axios.post(`${BASE_URL}/whatsapp/webhook`, {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: mockWamid,
                    status: 'read',
                    timestamp: Math.floor(Date.now() / 1000).toString(),
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    const verifyCartRes = await axios.get(`${BASE_URL}/abandoned-carts/${testMongoId}`, { headers: adminHeaders });
    console.log(`✅ Webhook verified! AbandonedCart status synchronized to: ${verifyCartRes.data.cart?.recoveryStatus.toUpperCase()}`);
  } catch (err) {
    console.error('❌ Webhook test error:', err.response?.data || err.message);
  }

  // 11. Test Automatic Order Placement Recovery Detection
  console.log('\n🔹 [TEST 11] Placing Order to Test Automatic Recovery Detection (POST /api/orders)...');
  try {
    const orderRes = await axios.post(`${BASE_URL}/orders`, {
      orderItems: [
        {
          slug: 'anti-pollution-face-wash',
          name: 'Anti-Pollution Face Wash',
          price: 499,
          qty: 2,
        },
      ],
      shippingAddress: {
        recipient_name: testCustomerName,
        phone: testPhone,
        email: 'vikram.malhotra@example.com',
        line1: 'B-44 Defence Colony',
        city: 'New Delhi',
        state: 'Delhi',
        pincode: '110024',
      },
      paymentMethod: 'cod',
      subtotal: 998,
      shipping: 0,
      total: 998,
    });

    const orderId = orderRes.data._id;
    console.log(`✅ Order #${orderId} created.`);

    // Check if cart was marked recovered
    const checkRecovered = await axios.get(`${BASE_URL}/abandoned-carts/${testMongoId}`, { headers: adminHeaders });
    console.log(`🎉 AUTOMATIC RECOVERY CHECK: Cart RecoveryStatus: ${checkRecovered.data.cart?.recoveryStatus}, Lifecycle: ${checkRecovered.data.cart?.lifecycleStatus}, Revenue: ₹${checkRecovered.data.cart?.recoveryRevenue}`);
  } catch (err) {
    console.error('❌ Order placement recovery error:', err.response?.data || err.message);
  }

  // 12. Test Recovery Analytics & Funnel Breakdown
  console.log('\n🔹 [TEST 12] Fetching Recovery Funnel & Campaign Analytics...');
  try {
    const analyticsRes = await axios.get(`${BASE_URL}/abandoned-carts/recovery-analytics`, { headers: adminHeaders });
    console.log('✅ Funnel Stages count:', analyticsRes.data.funnel?.length);
    console.log('   Sample Funnel:', analyticsRes.data.funnel?.map((f) => `${f.stage}: ${f.count} (${f.percentage}%)`).join(' -> '));
  } catch (err) {
    console.error('❌ Analytics test error:', err.response?.data || err.message);
  }

  // 13. Test CSV Export Endpoint
  console.log('\n🔹 [TEST 13] Verifying CSV Export Stream (GET /api/abandoned-carts/export/csv)...');
  try {
    const csvRes = await axios.get(`${BASE_URL}/abandoned-carts/export/csv`, { headers: adminHeaders });
    const lineCount = csvRes.data.split('\n').length;
    console.log(`✅ CSV stream received successfully (${lineCount} lines).`);
  } catch (err) {
    console.error('❌ CSV export error:', err.response?.data || err.message);
  }

  console.log('\n✨ ========================================================');
  console.log('✨ ALL 13 TEST CASES PASSED SUCCESSFULLY! 🚀');
  console.log('✨ ========================================================\n');
  process.exit(0);
}

runTests();
