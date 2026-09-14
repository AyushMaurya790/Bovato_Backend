// jobs/abandonedCartJob.js
// Background Cron / Periodic Detection & Recovery Automation Engine
const crypto = require('crypto');
const AbandonedCart = require('../models/AbandonedCart');
const RecoverySetting = require('../models/RecoverySetting');
const Coupon = require('../models/Coupon');
const { sendCartRecoveryMessage } = require('../services/whatsappService');

let jobInterval = null;
let isJobRunning = false;

/**
 * Generate a unique single-use recovery coupon
 */
async function generateCartCoupon(discountPercent = 10, expiryHours = 48) {
  const code = `BOVATO-REC-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  try {
    await Coupon.create({
      code,
      discountPercent,
      type: 'abandoned_cart',
      expiresAt: new Date(Date.now() + expiryHours * 60 * 60 * 1000),
      minCartValue: 0,
    });
    return code;
  } catch (err) {
    console.warn('[ABANDONED CART JOB] Coupon generation note:', err.message);
    return code;
  }
}

/**
 * Run one iteration of the Abandonment Detection & Recovery Pipeline
 */
async function runAbandonedCartJob() {
  if (isJobRunning) return;
  isJobRunning = true;

  try {
    const settings = await RecoverySetting.getOrCreate();
    const now = Date.now();

    // ----------------------------------------------------
    // STEP 1: DETECT NEWLY ABANDONED CARTS
    // ----------------------------------------------------
    const abandonmentDelayMs = (settings.abandonmentDelayMinutes || 30) * 60 * 1000;
    const abandonmentCutoff = new Date(now - abandonmentDelayMs);

    const idleCarts = await AbandonedCart.find({
      lifecycleStatus: { $in: ['active', 'checkout_started'] },
      'items.0': { $exists: true },
      $or: [{ phone: { $ne: '' } }, { normalizedPhone: { $ne: '' } }],
      lastActivityAt: { $lte: abandonmentCutoff },
    });

    for (const cart of idleCarts) {
      cart.lifecycleStatus = 'abandoned';
      if (cart.recoveryStatus === 'active' || cart.recoveryStatus === 'checkout_started') {
        cart.recoveryStatus = 'abandoned';
      }
      cart.abandonedAt = new Date();

      if (!cart.recoveryToken) {
        cart.recoveryToken = crypto.randomBytes(24).toString('hex');
      }

      cart.activityHistory.push({
        event: 'cart_abandoned',
        timestamp: new Date(),
        details: `Cart marked as ABANDONED after ${settings.abandonmentDelayMinutes} minutes of inactivity.`,
      });

      await cart.save();
      console.log(`🛒 [ABANDONED CART JOB] Cart ${cart.cartId} marked as ABANDONED.`);
    }

    // ----------------------------------------------------
    // STEP 2: WHATSAPP RECOVERY AUTOMATION SEQUENCE
    // ----------------------------------------------------
    if (settings.campaignActive && settings.enableWhatsAppRecovery) {
      const stage1DelayMs = (settings.stage1DelayMinutes || 30) * 60 * 1000;
      const stage2DelayMs = (settings.stage2DelayHours || 6) * 60 * 60 * 1000;
      const stage3DelayMs = (settings.stage3DelayHours || 24) * 60 * 60 * 1000;

      // Find candidates that have consent and haven't opted out or recovered
      const candidates = await AbandonedCart.find({
        lifecycleStatus: 'abandoned',
        recoveryStatus: { $in: ['abandoned', 'message_sent', 'delivered', 'read'] },
        consentGiven: true,
        optedOut: { $ne: true },
        abandonedAt: { $exists: true, $ne: null },
      });

      for (const cart of candidates) {
        const timeSinceAbandonment = now - new Date(cart.abandonedAt).getTime();
        const clientBaseUrl = process.env.CLIENT_URL || 'http://localhost:8080';
        const recoveryUrl = `${clientBaseUrl}/recover-cart/${cart.recoveryToken}?utm_source=whatsapp&utm_medium=automation&utm_campaign=cart_recovery&stage=${cart.recoveryStage + 1}`;

        // STAGE 1: Check if ready
        if (cart.recoveryStage === 0 && timeSinceAbandonment >= stage1DelayMs) {
          console.log(`🚀 [RECOVERY JOB] Dispatching Stage 1 for cart ${cart.cartId}`);

          let couponCode = cart.recoveryCoupon;
          if (!couponCode && settings.enableRecoveryCoupon) {
            couponCode = await generateCartCoupon(settings.couponDiscountPercent, settings.couponExpiryHours);
            cart.recoveryCoupon = couponCode;
            cart.recoveryCouponDiscount = settings.couponDiscountPercent;
          }

          await sendCartRecoveryMessage({
            cart,
            stage: 1,
            recoveryUrl,
            couponCode,
            discountPercent: settings.couponDiscountPercent,
          });
        }
        // STAGE 2: Check if ready
        else if (cart.recoveryStage === 1 && timeSinceAbandonment >= stage2DelayMs) {
          console.log(`🚀 [RECOVERY JOB] Dispatching Stage 2 for cart ${cart.cartId}`);
          await sendCartRecoveryMessage({
            cart,
            stage: 2,
            recoveryUrl,
            couponCode: cart.recoveryCoupon,
            discountPercent: cart.recoveryCouponDiscount || settings.couponDiscountPercent,
          });
        }
        // STAGE 3: Check if ready
        else if (cart.recoveryStage === 2 && timeSinceAbandonment >= stage3DelayMs) {
          console.log(`🚀 [RECOVERY JOB] Dispatching Stage 3 for cart ${cart.cartId}`);
          await sendCartRecoveryMessage({
            cart,
            stage: 3,
            recoveryUrl,
            couponCode: cart.recoveryCoupon,
            discountPercent: cart.recoveryCouponDiscount || settings.couponDiscountPercent,
          });
        }
      }
    }
  } catch (err) {
    console.error('❌ [ABANDONED CART JOB ERROR]:', err.message);
  } finally {
    isJobRunning = false;
  }
}

/**
 * Start the background polling engine (every 60 seconds)
 */
function startAbandonedCartJob(intervalMs = 60000) {
  if (jobInterval) {
    clearInterval(jobInterval);
  }

  console.log(`⚙️ [ABANDONED CART ENGINE] Initialized (Interval: ${intervalMs / 1000}s)`);
  // Run initial check after 5s
  setTimeout(runAbandonedCartJob, 5000);
  jobInterval = setInterval(runAbandonedCartJob, intervalMs);

  return jobInterval;
}

function stopAbandonedCartJob() {
  if (jobInterval) {
    clearInterval(jobInterval);
    jobInterval = null;
  }
}

module.exports = {
  runAbandonedCartJob,
  startAbandonedCartJob,
  stopAbandonedCartJob,
};
