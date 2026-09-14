const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const shiprocketService = require('../services/shiprocketService');

async function runShiprocketVerification() {
  console.log('====================================================');
  console.log('🚀 BOVATO - SHIPROCKET COMPLETE INTEGRATION TEST');
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

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 1: AUTHENTICATION & TOKEN GENERATION
  // ──────────────────────────────────────────────────────────────────────────
  console.log('1️⃣  STEP 1: Authentication & Token Management');
  console.log(`Configured Email: ${process.env.SHIPROCKET_EMAIL}`);
  console.log(`Base URL: ${process.env.SHIPROCKET_BASE_URL || 'https://apiv2.shiprocket.in/v1/external'}`);

  let token = null;
  try {
    token = await shiprocketService.getShiprocketToken(true);
    assert(
      token && !token.startsWith('mock_sr_token'),
      'Shiprocket Live Authentication (POST /auth/login)',
      `Token starts with: ${token ? token.slice(0, 15) : ''}...`
    );
  } catch (err) {
    assert(false, 'Shiprocket Live Authentication', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 2: TOKEN CACHING
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n2️⃣  STEP 2: In-Memory Token Caching');
  try {
    const cachedToken = await shiprocketService.getShiprocketToken(false);
    assert(cachedToken === token, 'Token caching prevents redundant login calls');
  } catch (err) {
    assert(false, 'Token caching verification', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 3: COURIER SERVICEABILITY & RATES (GET /courier/serviceability/)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n3️⃣  STEP 3: Courier Serviceability & Live Rates');
  let serviceabilityResult = null;
  try {
    serviceabilityResult = await shiprocketService.checkServiceability({
      pickup_postcode: process.env.SHIPROCKET_PICKUP_PINCODE || '110001',
      delivery_postcode: '400001', // Mumbai CST
      weight: 0.5,
      cod: 0,
    });

    assert(serviceabilityResult && serviceabilityResult.available === true, 'Serviceability Check (Delhi -> Mumbai)');
    assert(serviceabilityResult && serviceabilityResult.shippingCharge > 0, 'Live Shipping Charge Calculated', `₹${serviceabilityResult?.shippingCharge}`);
    assert(serviceabilityResult && Boolean(serviceabilityResult.courierName), 'Available Courier Returned', serviceabilityResult?.courierName);
  } catch (err) {
    assert(false, 'Courier Serviceability Check', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 4: ORDER CREATION (POST /orders/create/adhoc)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n4️⃣  STEP 4: Adhoc Order Creation in Shiprocket');
  const dummyOrder = {
    _id: 'BOVATO_' + Date.now(),
    createdAt: new Date(),
    shippingAddress: {
      recipient_name: 'Aditi Roy',
      line1: 'House No 12, Park Street',
      city: 'Kolkata',
      state: 'West Bengal',
      pincode: '700016',
      phone: '9876543210',
      email: 'aditi@example.com',
    },
    orderItems: [
      {
        name: 'Bovato Rose Radiance Cream',
        slug: 'bovato-rose-radiance-cream',
        qty: 1,
        price: 799,
      },
    ],
    paymentMethod: 'razorpay',
    totalPrice: 799,
    itemsPrice: 799,
    packageWeight: 0.5,
    packageDimensions: { length: 12, breadth: 10, height: 6 },
  };

  let createdOrder = null;
  try {
    createdOrder = await shiprocketService.createShiprocketOrder(dummyOrder);
    assert(createdOrder && createdOrder.success === true, 'Order created in Shiprocket');
    assert(Boolean(createdOrder.order_id), 'Received Shiprocket order_id', createdOrder.order_id);
    assert(Boolean(createdOrder.shipment_id), 'Received Shiprocket shipment_id', createdOrder.shipment_id);
  } catch (err) {
    assert(false, 'Order creation in Shiprocket', err.message);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 5: INVOICE GENERATION (POST /orders/print/invoice)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n5️⃣  STEP 5: Invoice Generation');
  if (createdOrder && createdOrder.order_id) {
    try {
      const invoiceRes = await shiprocketService.generateInvoice(createdOrder.order_id);
      assert(invoiceRes && invoiceRes.success === true, 'Invoice generation API call');
      assert(Boolean(invoiceRes.invoice_url), 'Invoice PDF URL returned', invoiceRes.invoice_url ? invoiceRes.invoice_url.slice(0, 50) + '...' : 'none');
    } catch (err) {
      assert(false, 'Invoice generation', err.message);
    }
  } else {
    console.log('⚠️ Skipping invoice generation (no test order_id created)');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 6: MANIFEST APIS (POST /manifests/generate & POST /manifests/print)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n6️⃣  STEP 6: Manifest APIs');
  if (createdOrder && createdOrder.shipment_id) {
    try {
      const manifestRes = await shiprocketService.generateManifest(createdOrder.shipment_id);
      assert(manifestRes && manifestRes.success === true, 'Manifest generation API call');
    } catch (err) {
      assert(false, 'Manifest generation API', err.message);
    }

    try {
      const printRes = await shiprocketService.printManifest(createdOrder.order_id);
      assert(printRes && printRes.success === true, 'Manifest print API call');
    } catch (err) {
      assert(false, 'Manifest print API', err.message);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STEP 7: TRACKING API (GET /courier/track/awb/{awb_code})
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n7️⃣  STEP 7: Tracking API');
  try {
    const trackRes = await shiprocketService.trackShipment('TEST_AWB_123');
    assert(trackRes && trackRes.success === true, 'Tracking API handles status & events cleanly');
    assert(Boolean(trackRes.status), 'Tracking status parsed', trackRes.status);
    assert(Array.isArray(trackRes.trackingEvents), 'Tracking events array returned', `${trackRes.trackingEvents.length} events`);
  } catch (err) {
    assert(false, 'Tracking API query', err.message);
  }

  console.log('\n====================================================');
  console.log(`📊 SHIPROCKET TEST SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log('====================================================');

  if (passed === total) {
    console.log('🎉 Shiprocket API Integration is 100% verified and operational!');
  }
}

runShiprocketVerification().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
