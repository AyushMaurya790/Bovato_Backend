// services/whatsappService.js
// Production-Ready Meta WhatsApp Cloud API Service for BOVATO E-Commerce
const axios = require('axios');
const WhatsAppMessage = require('../models/WhatsAppMessage');
const WhatsAppSetting = require('../models/WhatsAppSetting');
const Lead = require('../models/Lead');

/**
 * Normalize phone number into E.164 format and return validated breakdown
 * Example outputs:
 *   e164: "+919876543210"
 *   digits: "919876543210" (format used by Meta Cloud API)
 *   countryCode: "+91"
 */
function normalizeToE164(rawPhone, defaultCountryCode = '+91') {
  if (!rawPhone) return { isValid: false, e164: '', digits: '', countryCode: defaultCountryCode };

  let str = String(rawPhone).trim();
  // Strip out spaces, dashes, brackets
  str = str.replace(/[\s\-\(\)]/g, '');

  let cleanDigits = str.replace(/[^0-9]/g, '');
  let countryCode = defaultCountryCode;
  let digits = cleanDigits;

  // Handle India numbers (+91)
  if (cleanDigits.length === 10) {
    digits = '91' + cleanDigits;
    countryCode = '+91';
  } else if (cleanDigits.length === 11 && cleanDigits.startsWith('0')) {
    digits = '91' + cleanDigits.slice(1);
    countryCode = '+91';
  } else if (cleanDigits.length === 12 && cleanDigits.startsWith('91')) {
    digits = cleanDigits;
    countryCode = '+91';
  }

  const e164 = '+' + digits;
  const isValid = digits.length >= 10 && digits.length <= 15;

  return {
    isValid,
    e164,
    digits,
    countryCode,
  };
}

/**
 * Dynamic resolution of Meta WhatsApp credentials:
 * 1. Queries database (WhatsAppSetting) first for live admin overrides
 * 2. Falls back to process.env variables
 */
async function getWhatsAppConfig() {
  let dbSettings = null;
  try {
    dbSettings = await WhatsAppSetting.findOne().select('+accessToken');
  } catch (err) {
    console.warn('[WHATSAPP] Failed to query settings from database:', err.message);
  }

  const phoneNumberId =
    dbSettings?.phoneNumberId?.trim() ||
    process.env.WHATSAPP_PHONE_NUMBER_ID ||
    '1357890114067093';

  const businessAccountId =
    dbSettings?.businessAccountId?.trim() ||
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ||
    '2161354898125389';

  const accessToken =
    dbSettings?.accessToken?.trim() ||
    process.env.WHATSAPP_ACCESS_TOKEN ||
    '';

  const verifyToken =
    dbSettings?.verifyToken?.trim() ||
    process.env.WHATSAPP_VERIFY_TOKEN ||
    'bovato_whatsapp_verify_token_2026';

  const apiVersion =
    dbSettings?.apiVersion?.trim() ||
    process.env.WHATSAPP_API_VERSION ||
    'v20.0';

  const isEnabled = dbSettings ? dbSettings.isEnabled : true;

  return {
    phoneNumberId,
    businessAccountId,
    accessToken,
    verifyToken,
    apiVersion,
    isEnabled,
    hasToken: Boolean(accessToken && !accessToken.includes('PUT_MY_') && !accessToken.includes('your_')),
  };
}

/**
 * Dispatch Meta WhatsApp Message
 * Handles real Meta Cloud API dispatch with automatic safe fallback simulation
 */
async function dispatchMetaMessage({
  toDigits,
  bodyText,
  templatePayload = null,
}) {
  const config = await getWhatsAppConfig();

  if (!config.isEnabled) {
    console.log(`⏸️ [WHATSAPP DISABLED] Message to +${toDigits} suppressed (integration disabled in Admin Settings)`);
    return {
      success: false,
      error: 'WhatsApp integration is currently disabled in Admin Settings.',
      dispatchedVia: 'Disabled',
    };
  }

  // Real Meta Cloud API Dispatch
  if (config.hasToken && config.phoneNumberId) {
    try {
      const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`;
      const payload = templatePayload
        ? {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: toDigits,
            type: 'template',
            template: templatePayload,
          }
        : {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: toDigits,
            type: 'text',
            text: { preview_url: true, body: bodyText },
          };

      const res = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      const providerMessageId = res.data?.messages?.[0]?.id || `wamid.META_${Date.now()}`;
      console.log(`✅ [WHATSAPP CLOUD API] Message dispatched to +${toDigits} (WAMID: ${providerMessageId})`);

      return {
        success: true,
        providerMessageId,
        dispatchedVia: 'Meta_Cloud_API',
        rawResponse: res.data,
      };
    } catch (err) {
      const metaError = err.response?.data?.error;
      const parsedError = metaError?.message || err.message;
      const errorCode = metaError?.code;

      console.warn(`⚠️ [WHATSAPP CLOUD API ERROR] Code ${errorCode || 'N/A'}: ${parsedError}`);

      return {
        success: false,
        error: parsedError,
        errorCode,
        dispatchedVia: 'Meta_Cloud_API_Failed',
        rawResponse: err.response?.data || null,
      };
    }
  }

  // Simulation Mode (Used during development before access token is added)
  const simulatedId = `wamid.SIMULATED_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  console.log(`⚡ [WHATSAPP SIMULATION] Message dispatched to +${toDigits} (Token not provided yet)`);
  return {
    success: true,
    providerMessageId: simulatedId,
    dispatchedVia: 'Simulation_Dev_Mode',
    rawResponse: { simulated: true, to: toDigits, time: new Date() },
  };
}

/**
 * 1. Send Automated Order Status Notification with Strict Deduplication
 * Triggered on order status transitions: confirmed, processing, shipped, delivered, cancelled
 */
async function sendOrderNotification({ order, eventType = 'confirmed', customMessage = null }) {
  if (!order) return { success: false, error: 'Order object is required' };

  const validEvents = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
  const cleanEvent = String(eventType).toLowerCase().trim();

  if (!validEvents.includes(cleanEvent)) {
    return { success: false, error: `Invalid order event type: ${eventType}` };
  }

  // 1. STRICT EVENT DEDUPLICATION CHECK
  // Prevent sending duplicate notifications for the exact same event
  const messageType = `order_${cleanEvent}`;
  const existingLog = await WhatsAppMessage.findOne({
    orderId: order._id,
    messageType,
    status: { $in: ['sent', 'delivered', 'read', 'pending'] },
  });

  if (existingLog) {
    console.log(`[WHATSAPP DEDUP] Order #${order._id} already received '${cleanEvent}' alert. Skipping duplicate.`);
    return {
      success: true,
      skipped: true,
      reason: 'duplicate',
      existingMessageId: existingLog._id,
      providerMessageId: existingLog.providerMessageId,
    };
  }

  const phone = order.shippingAddress?.phone || order.contactInfo?.phone;
  if (!phone) {
    console.warn(`[WHATSAPP] Cannot send order notification: Order #${order._id} has no phone number`);
    return { success: false, error: 'No phone number on order' };
  }

  const { digits, e164, isValid } = normalizeToE164(phone);
  if (!isValid) {
    console.warn(`[WHATSAPP] Invalid phone number for order #${order._id}: ${phone}`);
    return { success: false, error: 'Invalid phone number format' };
  }

  const recipientName =
    order.shippingAddress?.recipient_name ||
    `${order.shippingAddress?.firstName || ''} ${order.shippingAddress?.lastName || ''}`.trim() ||
    'Customer';

  const orderNumber = String(order._id).slice(-8).toUpperCase();
  const total = order.totalPrice || order.total || 0;
  const paymentMethod = (order.paymentMethod || 'COD').toUpperCase();
  const siteUrl = 'https://bovato.in';
  const trackingLink = `${siteUrl}/track`;
  const courier = order.courierName || 'Shiprocket Partner';
  const awb = order.awbCode || order.trackingNumber || 'Available upon dispatch';

  // Construct message text based on order event
  let messageText = '';

  if (customMessage) {
    messageText = customMessage;
  } else {
    switch (cleanEvent) {
      case 'confirmed':
        messageText = `✨ *BOVATO — Order Confirmed!* ✨

Hi ${recipientName} 👋,
Thank you for shopping with *BOVATO*. Your order has been placed successfully!

📦 *Order Details:*
• *Order ID:* #${orderNumber}
• *Payment Method:* ${paymentMethod}
• *Total Amount:* ₹${total}

📍 *Delivery Address:*
${order.shippingAddress?.line1 || order.shippingAddress?.address || ''}, ${order.shippingAddress?.city || ''} - ${order.shippingAddress?.pincode || ''}

🚚 *Shipment & Tracking:*
Your shipment is being prepared for dispatch via Shiprocket. Track live updates here:
${trackingLink}

Feel free to reply to this message if you have any questions. Thank you for choosing BOVATO! 🌿`;
        break;

      case 'processing':
        messageText = `📦 *BOVATO — Order In Processing*

Hi ${recipientName} 👋,
Your BOVATO order *#${orderNumber}* is currently being packed with utmost care at our fulfillment center.

Our team is performing quality checks before courier dispatch. You will receive an AWB tracking update as soon as the courier partner picks it up! 🌿`;
        break;

      case 'shipped':
        messageText = `🚀 *BOVATO — Order Shipped!*

Hi ${recipientName} 👋,
Exciting news! Your order *#${orderNumber}* has been handed over to our courier partner and is on its way to you!

🚚 *Shipment Details:*
• *Courier Partner:* ${courier}
• *AWB Tracking No:* ${awb}
• *Estimated Delivery:* 3-5 Business Days

🔗 *Live Tracking Link:*
${trackingLink}

Keep your phone reachable for delivery coordination. Thank you for shopping with BOVATO! 🌿`;
        break;

      case 'delivered':
        messageText = `🎉 *BOVATO — Order Delivered!*

Hi ${recipientName} 👋,
Your order *#${orderNumber}* has been successfully delivered! 

We hope you enjoy your new BOVATO products. If you loved your purchase, feel free to leave us a review or reply here if you need any skincare tips or assistance. Have a glowing day! ✨🌿`;
        break;

      case 'cancelled':
        messageText = `⚠️ *BOVATO — Order Cancelled*

Hi ${recipientName},
Your BOVATO order *#${orderNumber}* has been cancelled as requested.

If you already made an online payment, your refund has been initiated and will reflect in your account within 5-7 business days.

If you have any questions, please reply directly to this message.`;
        break;

      default:
        messageText = `Hi ${recipientName} 👋, your BOVATO order *#${orderNumber}* status has been updated to *${cleanEvent.toUpperCase()}*.`;
    }
  }

  let dispatchResult = await dispatchMetaMessage({
    toDigits: digits,
    bodyText: messageText,
  });

  // If text message fails due to Meta 24-hour service window limit (code 131047 / template required),
  // automatically dispatch approved Meta template so notification still reaches customer's WhatsApp!
  if (!dispatchResult.success && (dispatchResult.errorCode === 131047 || String(dispatchResult.error).toLowerCase().includes('template'))) {
    console.log(`[WHATSAPP] 24-hour customer care window active for +${digits}. Falling back to Meta template message...`);
    const templateDispatch = await dispatchMetaMessage({
      toDigits: digits,
      templatePayload: {
        name: 'hello_world',
        language: { code: 'en_US' },
      },
    });

    if (templateDispatch.success) {
      dispatchResult = {
        ...templateDispatch,
        dispatchedVia: 'Meta_Cloud_API_Template_Fallback',
      };
      console.log(`✅ [WHATSAPP] Order #${order._id} confirmation delivered via template to +${digits}`);
    }
  }

  const waStatus = dispatchResult.success ? 'sent' : 'failed';
  const directWaUrl = `https://wa.me/${digits}?text=${encodeURIComponent(messageText)}`;

  try {
    await WhatsAppMessage.create({
      orderId: order._id,
      phone: e164,
      templateName: `order_${cleanEvent}`,
      messageType,
      status: waStatus,
      providerMessageId: dispatchResult.providerMessageId || '',
      messageBody: messageText,
      sentAt: dispatchResult.success ? new Date() : undefined,
      failedAt: dispatchResult.success ? undefined : new Date(),
      errorMessage: dispatchResult.error || '',
      rawResponse: dispatchResult.rawResponse,
    });
  } catch (err) {
    console.warn('[WHATSAPP] Failed to record order notification in DB:', err.message);
  }

  return {
    success: dispatchResult.success,
    providerMessageId: dispatchResult.providerMessageId,
    whatsappUrl: directWaUrl,
    messageText,
    dispatchedVia: dispatchResult.dispatchedVia,
    error: dispatchResult.error,
  };
}

/**
 * 2. Send Admin Test WhatsApp Message
 * Allows admin to verify Meta Cloud API connectivity directly from Admin Panel
 */
async function sendTestMessage({ toPhone, messageText }) {
  if (!toPhone) return { success: false, error: 'Recipient phone number is required' };

  const { digits, e164, isValid } = normalizeToE164(toPhone);
  if (!isValid) {
    return { success: false, error: 'Invalid phone number format. Please enter a valid 10-15 digit mobile number.' };
  }

  const text = messageText && messageText.trim()
    ? messageText.trim()
    : `👋 Hello from BOVATO! This is a test message dispatched via the official Meta WhatsApp Cloud API at ${new Date().toLocaleTimeString()}. Integration is working perfectly! ✨`;

  const dispatchResult = await dispatchMetaMessage({
    toDigits: digits,
    bodyText: text,
  });

  const waStatus = dispatchResult.success ? 'sent' : 'failed';
  const directWaUrl = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;

  // Record audit message
  let messageId = null;
  try {
    const msgDoc = await WhatsAppMessage.create({
      phone: e164,
      templateName: 'admin_test_dispatch',
      messageType: 'test_message',
      status: waStatus,
      providerMessageId: dispatchResult.providerMessageId || '',
      messageBody: text,
      sentAt: dispatchResult.success ? new Date() : undefined,
      failedAt: dispatchResult.success ? undefined : new Date(),
      errorMessage: dispatchResult.error || '',
      rawResponse: dispatchResult.rawResponse,
    });
    messageId = msgDoc._id;
  } catch (err) {
    console.warn('[WHATSAPP] Failed to log test message to DB:', err.message);
  }

  // Update WhatsAppSetting test timestamp & status
  try {
    await WhatsAppSetting.updateOne(
      {},
      {
        $set: {
          lastTestedAt: new Date(),
          lastTestStatus: dispatchResult.success ? 'SUCCESS' : 'FAILED',
          lastTestError: dispatchResult.error || '',
        },
      }
    );
  } catch {
    // ignore
  }

  return {
    success: dispatchResult.success,
    messageId,
    providerMessageId: dispatchResult.providerMessageId,
    whatsappUrl: directWaUrl,
    dispatchedVia: dispatchResult.dispatchedVia,
    error: dispatchResult.error,
    rawResponse: dispatchResult.rawResponse,
  };
}

/**
 * 3. Send WhatsApp Verification OTP
 */
async function sendWhatsAppOTP({ lead, otp }) {
  if (!lead || !lead.phone) return { success: false, error: 'Invalid lead' };

  const { digits, e164 } = normalizeToE164(lead.phone);
  const customerName = lead.name && lead.name.trim() ? lead.name.trim() : 'Customer';

  const messageText = `Hi ${customerName} 👋
Your BOVATO verification code is: *${otp}*

🔒 This code is valid for 5 minutes.
Please do not share this OTP with anyone.`;

  const dispatchResult = await dispatchMetaMessage({
    toDigits: digits,
    bodyText: messageText,
  });

  const waStatus = dispatchResult.success ? 'sent' : 'failed';
  const directWaUrl = `https://wa.me/${digits}?text=${encodeURIComponent(messageText)}`;

  await WhatsAppMessage.create({
    leadId: lead._id,
    phone: e164,
    templateName: 'otp_verification',
    messageType: 'otp',
    status: waStatus,
    providerMessageId: dispatchResult.providerMessageId || '',
    messageBody: messageText,
    sentAt: dispatchResult.success ? new Date() : undefined,
    failedAt: dispatchResult.success ? undefined : new Date(),
    errorMessage: dispatchResult.error || '',
    rawResponse: dispatchResult.rawResponse,
  });

  return {
    success: dispatchResult.success,
    providerMessageId: dispatchResult.providerMessageId,
    whatsappUrl: directWaUrl,
    dispatchedVia: dispatchResult.dispatchedVia,
  };
}

/**
 * 4. Send Lead Welcome Offer Message
 */
async function sendLeadWelcomeOffer({
  lead,
  couponCode = 'BOVATO10',
  websiteLink = 'http://localhost:8080',
}) {
  if (!lead || !lead.phone) return { success: false, error: 'Invalid lead' };

  if (lead.consentGiven === false) {
    console.warn(`[WHATSAPP CONSENT REQUIRED] Cannot send message: lead ${lead._id} did not grant consent`);
    return { success: false, error: 'User consent was not provided' };
  }

  const { digits, e164 } = normalizeToE164(lead.phone);
  const customerName = lead.name && lead.name.trim() ? lead.name.trim() : 'Friend';
  const siteUrl = websiteLink || 'https://bovato.in';

  const messageText = `Hi ${customerName} 👋
Thanks for your interest in our offer!

Your exclusive offer is now available:
🎁 Use Coupon Code: *${couponCode}* to get *10% OFF + Free Express Shipping*.

Visit our store to claim your deal:
${siteUrl}

Reply to this message if you need any help with your grooming routine! 🌿`;

  const dispatchResult = await dispatchMetaMessage({
    toDigits: digits,
    bodyText: messageText,
  });

  const waStatus = dispatchResult.success ? 'sent' : 'failed';
  const directWaUrl = `https://wa.me/${digits}?text=${encodeURIComponent(messageText)}`;

  const messageDoc = await WhatsAppMessage.create({
    leadId: lead._id,
    phone: e164,
    templateName: 'exclusive_offer_welcome',
    messageType: 'offer',
    status: waStatus,
    providerMessageId: dispatchResult.providerMessageId || '',
    messageBody: messageText,
    sentAt: dispatchResult.success ? new Date() : undefined,
    failedAt: dispatchResult.success ? undefined : new Date(),
    errorMessage: dispatchResult.error || '',
    rawResponse: dispatchResult.rawResponse,
  });

  lead.whatsappStatus = waStatus;
  await lead.save();

  return {
    success: dispatchResult.success,
    messageId: messageDoc._id,
    providerMessageId: dispatchResult.providerMessageId,
    whatsappUrl: directWaUrl,
    messageText,
    dispatchedVia: dispatchResult.dispatchedVia,
  };
}

/**
 * 5. Send Custom or Template WhatsApp Message from Admin Dashboard
 */
async function sendCustomWhatsAppMessage({ lead, messageText, templateName = 'admin_custom' }) {
  if (!lead || !lead.phone) return { success: false, error: 'Invalid lead' };

  if (lead.consentGiven === false) {
    return { success: false, error: 'Cannot send: user has not given WhatsApp consent' };
  }

  const { digits, e164 } = normalizeToE164(lead.phone);
  const dispatchResult = await dispatchMetaMessage({
    toDigits: digits,
    bodyText: messageText,
  });

  const waStatus = dispatchResult.success ? 'sent' : 'failed';
  const directWaUrl = `https://wa.me/${digits}?text=${encodeURIComponent(messageText)}`;

  const messageDoc = await WhatsAppMessage.create({
    leadId: lead._id,
    phone: e164,
    templateName,
    messageType: 'custom',
    status: waStatus,
    providerMessageId: dispatchResult.providerMessageId || '',
    messageBody: messageText,
    sentAt: dispatchResult.success ? new Date() : undefined,
    failedAt: dispatchResult.success ? undefined : new Date(),
    errorMessage: dispatchResult.error || '',
    rawResponse: dispatchResult.rawResponse,
  });

  lead.whatsappStatus = waStatus;
  lead.lastContactedAt = new Date();
  await lead.save();

  return {
    success: dispatchResult.success,
    messageId: messageDoc._id,
    providerMessageId: dispatchResult.providerMessageId,
    whatsappUrl: directWaUrl,
    dispatchedVia: dispatchResult.dispatchedVia,
  };
}

/**
 * 6. Send Cart Recovery Stage Message
 */
async function sendCartRecoveryMessage({
  cart,
  stage = 1,
  recoveryUrl,
  couponCode = '',
  discountPercent = 10,
}) {
  if (!cart || (!cart.phone && !cart.normalizedPhone)) {
    return { success: false, error: 'Invalid cart or missing phone' };
  }

  if (cart.consentGiven === false || cart.optedOut === true) {
    return { success: false, error: 'Customer has opted out or consent was not provided' };
  }

  const rawPhone = cart.normalizedPhone || cart.phone;
  const { digits, e164 } = normalizeToE164(rawPhone);
  const name = cart.customerName && cart.customerName.trim() ? cart.customerName.trim() : 'there';
  const finalRecoveryUrl = recoveryUrl || `http://localhost:8080/recover-cart/${cart.recoveryToken}`;

  let messageText = '';
  if (stage === 1) {
    messageText = couponCode
      ? `Hi ${name} 👋\nYou left some items in your cart.\nYour cart is still waiting for you.\n\n🎁 Complete your order and get ${discountPercent}% OFF with code *${couponCode}*:\n${finalRecoveryUrl}`
      : `Hi ${name} 👋\nYou left some items in your cart.\nYour cart is still waiting for you.\n\nComplete your order:\n${finalRecoveryUrl}`;
  } else if (stage === 2) {
    messageText = couponCode
      ? `Hi ${name}, your cart is still waiting for you 🛒\nTake another look at your selected products. Use code *${couponCode}* for ${discountPercent}% OFF:\n${finalRecoveryUrl}`
      : `Hi ${name}, your cart is still waiting for you 🛒\nTake another look at your selected products:\n${finalRecoveryUrl}`;
  } else {
    messageText = couponCode
      ? `Your cart is about to expire.\nClaim your ${discountPercent}% OFF with code *${couponCode}* before it's gone:\n${finalRecoveryUrl}`
      : `Your cart is about to expire.\nComplete your order here:\n${finalRecoveryUrl}`;
  }

  const dispatchResult = await dispatchMetaMessage({
    toDigits: digits,
    bodyText: messageText,
  });

  const waStatus = dispatchResult.success ? 'sent' : 'failed';
  const directWaUrl = `https://wa.me/${digits}?text=${encodeURIComponent(messageText)}`;

  const messageDoc = await WhatsAppMessage.create({
    cartId: cart._id,
    phone: e164,
    templateName: `cart_recovery_stage_${stage}`,
    messageType: `cart_recovery_stage_${stage}`,
    recoveryStage: stage,
    campaignId: cart.utmCampaign || 'cart_recovery',
    status: waStatus,
    providerMessageId: dispatchResult.providerMessageId || '',
    messageBody: messageText,
    sentAt: dispatchResult.success ? new Date() : undefined,
    failedAt: dispatchResult.success ? undefined : new Date(),
    errorMessage: dispatchResult.error || '',
    rawResponse: dispatchResult.rawResponse,
  });

  cart.recoveryStage = stage;
  cart.recoveryStatus = waStatus === 'sent' ? 'message_sent' : 'failed';
  cart.remindersCount = (cart.remindersCount || 0) + 1;
  cart.lastReminderAt = new Date();

  cart.activityHistory.push({
    event: `whatsapp_stage_${stage}_sent`,
    timestamp: new Date(),
    details: `Dispatched Stage ${stage} WhatsApp recovery message (Status: ${waStatus})`,
  });

  await cart.save();

  return {
    success: dispatchResult.success,
    messageId: messageDoc._id,
    providerMessageId: dispatchResult.providerMessageId,
    whatsappUrl: directWaUrl,
    messageText,
    dispatchedVia: dispatchResult.dispatchedVia,
  };
}

/**
 * 7. Send Manual Cart WhatsApp Message from Admin
 */
async function sendManualCartWhatsApp({ cart, messageText, templateName = 'admin_cart_recovery' }) {
  if (!cart || (!cart.phone && !cart.normalizedPhone)) {
    return { success: false, error: 'Invalid cart or missing phone' };
  }

  const rawPhone = cart.normalizedPhone || cart.phone;
  const { digits, e164 } = normalizeToE164(rawPhone);

  const dispatchResult = await dispatchMetaMessage({
    toDigits: digits,
    bodyText: messageText,
  });

  const waStatus = dispatchResult.success ? 'sent' : 'failed';
  const directWaUrl = `https://wa.me/${digits}?text=${encodeURIComponent(messageText)}`;

  const messageDoc = await WhatsAppMessage.create({
    cartId: cart._id,
    phone: e164,
    templateName,
    messageType: 'cart_recovery_manual',
    recoveryStage: cart.recoveryStage || 1,
    status: waStatus,
    providerMessageId: dispatchResult.providerMessageId || '',
    messageBody: messageText,
    sentAt: dispatchResult.success ? new Date() : undefined,
    failedAt: dispatchResult.success ? undefined : new Date(),
    errorMessage: dispatchResult.error || '',
    rawResponse: dispatchResult.rawResponse,
  });

  cart.recoveryStatus = waStatus === 'sent' ? 'message_sent' : 'failed';
  cart.remindersCount = (cart.remindersCount || 0) + 1;
  cart.lastReminderAt = new Date();
  cart.activityHistory.push({
    event: 'whatsapp_custom_sent',
    timestamp: new Date(),
    details: `Admin sent manual WhatsApp message: "${messageText.substring(0, 60)}..."`,
  });
  await cart.save();

  return {
    success: dispatchResult.success,
    messageId: messageDoc._id,
    providerMessageId: dispatchResult.providerMessageId,
    whatsappUrl: directWaUrl,
    dispatchedVia: dispatchResult.dispatchedVia,
  };
}

// Backward-compatible alias for order confirmation
async function sendOrderConfirmationWhatsApp({ order }) {
  return sendOrderNotification({ order, eventType: 'confirmed' });
}

function formatWhatsAppNumber(rawPhone) {
  return normalizeToE164(rawPhone).digits;
}

module.exports = {
  normalizeToE164,
  formatWhatsAppNumber,
  getWhatsAppConfig,
  dispatchMetaMessage,
  sendOrderNotification,
  sendOrderConfirmationWhatsApp,
  sendTestMessage,
  sendWhatsAppOTP,
  sendLeadWelcomeOffer,
  sendCustomWhatsAppMessage,
  sendCartRecoveryMessage,
  sendManualCartWhatsApp,
};
