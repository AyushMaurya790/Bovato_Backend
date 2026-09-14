// routes/whatsappRoutes.js
// Meta WhatsApp Cloud API Webhook Handler & Admin Management Controller
const express = require('express');
const router = express.Router();
const WhatsAppMessage = require('../models/WhatsAppMessage');
const WhatsAppSetting = require('../models/WhatsAppSetting');
const WhatsAppWebhookEvent = require('../models/WhatsAppWebhookEvent');
const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const Lead = require('../models/Lead');
const AbandonedCart = require('../models/AbandonedCart');
const whatsappService = require('../services/whatsappService');
const { protect, admin } = require('../middleware/authMiddleware');

// ─────────────────────────────────────────────────────────────────────────────
// 1. PUBLIC META WEBHOOK VERIFICATION (GET /api/whatsapp/webhook)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/webhook', async (req, res) => {
  let mode = req.query['hub.mode'] || req.query.hub?.mode;
  let token = req.query['hub.verify_token'] || req.query.hub?.verify_token;
  let challenge = req.query['hub.challenge'] || req.query.hub?.challenge;

  // Fallback to URL parsing in case query keys were encoded
  if (!mode || !token) {
    try {
      const parsedUrl = new URL(req.originalUrl || req.url, 'http://localhost');
      mode = mode || parsedUrl.searchParams.get('hub.mode');
      token = token || parsedUrl.searchParams.get('hub.verify_token');
      challenge = challenge || parsedUrl.searchParams.get('hub.challenge');
    } catch {
      // ignore
    }
  }

  const config = await whatsappService.getWhatsAppConfig();
  const expectedToken = config.verifyToken || process.env.WHATSAPP_VERIFY_TOKEN || 'bovato_whatsapp_verify_token_2026';

  if (mode && token) {
    if (mode === 'subscribe' && token === expectedToken) {
      console.log('✅ [WHATSAPP WEBHOOK] Challenge verification successful from Meta!');

      // Record successful verification timestamp in DB
      try {
        await WhatsAppSetting.updateOne({}, { $set: { webhookVerifiedAt: new Date() } });
        await WhatsAppWebhookEvent.create({
          eventType: 'verification',
          status: 'verified',
          rawPayload: { mode, tokenPreview: token.slice(0, 4) + '...', challenge },
          processed: true,
        });
      } catch (err) {
        console.warn('[WHATSAPP WEBHOOK] Failed to update verification status in DB:', err.message);
      }

      return res.status(200).send(challenge);
    } else {
      console.warn('❌ [WHATSAPP WEBHOOK] Token mismatch during Meta verification.');
      try {
        await WhatsAppWebhookEvent.create({
          eventType: 'verification',
          status: 'failed',
          rawPayload: { mode, tokenProvided: token },
          errorMessage: 'Token mismatch with expected verify_token',
        });
      } catch {
        // ignore
      }
      return res.sendStatus(403);
    }
  }

  res.sendStatus(400);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. PUBLIC META WEBHOOK EVENT RECEIVER (POST /api/whatsapp/webhook)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
      const entries = body.entry || [];

      for (const entry of entries) {
        const changes = entry.changes || [];

        for (const change of changes) {
          const value = change.value;
          if (!value) continue;

          // A. Process Message Status Updates (sent, delivered, read, failed)
          const statuses = value.statuses || [];
          for (const s of statuses) {
            const wamid = s.id;
            const status = s.status; // 'sent' | 'delivered' | 'read' | 'failed'
            const timestamp = s.timestamp ? new Date(Number(s.timestamp) * 1000) : new Date();

            console.log(`📲 [WHATSAPP STATUS EVENT] WAMID: ${wamid} -> ${status.toUpperCase()}`);

            // Log event audit
            await WhatsAppWebhookEvent.create({
              eventType: 'status_update',
              wamid,
              status,
              recipientPhone: s.recipient_id || '',
              rawPayload: s,
              processed: true,
            });

            // Update matching WhatsAppMessage record
            const message = await WhatsAppMessage.findOne({ providerMessageId: wamid });
            if (message) {
              message.status = status;
              if (status === 'sent' && !message.sentAt) message.sentAt = timestamp;
              if (status === 'delivered') message.deliveredAt = timestamp;
              if (status === 'read') message.readAt = timestamp;
              if (status === 'failed') {
                message.failedAt = timestamp;
                if (s.errors && s.errors.length > 0) {
                  message.errorMessage = s.errors[0].title || s.errors[0].message || 'Delivery failed';
                }
              }
              await message.save();

              // Update parent Lead status if linked
              if (message.leadId) {
                await Lead.findByIdAndUpdate(message.leadId, { whatsappStatus: status });
              }

              // Update AbandonedCart recovery status if linked
              if (message.cartId) {
                const cart = await AbandonedCart.findById(message.cartId);
                if (cart) {
                  if (status === 'delivered') cart.recoveryStatus = 'delivered';
                  else if (status === 'read') cart.recoveryStatus = 'read';
                  else if (status === 'failed') cart.recoveryStatus = 'failed';

                  cart.activityHistory.push({
                    event: `whatsapp_${status}`,
                    timestamp,
                    details: `WhatsApp delivery updated to ${status.toUpperCase()} (WAMID: ${wamid})`,
                  });
                  await cart.save();
                }
              }
            }
          }

          // B. Process Inbound Messages (Customer replies)
          const incomingMessages = value.messages || [];
          for (const msg of incomingMessages) {
            const from = msg.from; // e.g. "919876543210"
            const textBody = msg.text?.body || '';
            const normalizedFrom = `+${from}`;

            console.log(`💬 [WHATSAPP INBOUND MSG] From ${normalizedFrom}: "${textBody}"`);

            await WhatsAppWebhookEvent.create({
              eventType: 'incoming_message',
              wamid: msg.id || '',
              senderPhone: normalizedFrom,
              messageBody: textBody,
              rawPayload: msg,
              processed: true,
            });

            const isOptOut = /^(stop|unsubscribe|cancel|optout|halt)\b/i.test(textBody.trim());

            // Check Abandoned Cart links
            const carts = await AbandonedCart.find({
              $or: [
                { phone: from },
                { normalizedPhone: normalizedFrom },
                { phone: normalizedFrom },
              ],
            });

            for (const c of carts) {
              if (isOptOut) {
                c.optedOut = true;
                c.optedOutAt = new Date();
                c.recoveryStatus = 'opted_out';
                c.activityHistory.push({
                  event: 'customer_opted_out',
                  timestamp: new Date(),
                  details: `Customer requested opt-out via WhatsApp: "${textBody}"`,
                });
              }
              c.notes.push({
                text: `💬 Customer replied on WhatsApp: "${textBody}"`,
                author: 'Customer',
                createdAt: new Date(),
              });
              await c.save();
            }

            // Check Lead links
            const lead = await Lead.findOne({
              $or: [
                { phone: from },
                { normalizedPhone: normalizedFrom },
                { phone: normalizedFrom },
              ],
            });

            if (lead) {
              lead.status = 'contacted';
              lead.lastContactedAt = new Date();
              lead.notes.push({
                text: `💬 Customer replied on WhatsApp: "${textBody}"`,
                author: 'Customer',
                createdAt: new Date(),
              });
              await lead.save();
            }
          }
        }
      }

      return res.status(200).json({ status: 'EVENT_RECEIVED' });
    }

    res.sendStatus(404);
  } catch (error) {
    console.error('❌ [WHATSAPP WEBHOOK ERROR]:', error.message);
    res.status(200).json({ status: 'ERROR_LOGGED' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. ADMIN: GET WHATSAPP SETTINGS (GET /api/whatsapp/settings)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/settings', protect, admin, async (req, res) => {
  try {
    const settings = await WhatsAppSetting.getSettings();
    const config = await whatsappService.getWhatsAppConfig();

    // Mask access token: return only boolean hasAccessToken and preview (e.g. EAAB...4x9Z)
    let maskedToken = '';
    if (config.accessToken && config.accessToken.length > 8) {
      maskedToken = `${config.accessToken.slice(0, 6)}...${config.accessToken.slice(-4)}`;
    }

    const host = req.get('host') || 'localhost:5001';
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const computedWebhookUrl = settings.webhookUrl || `${protocol}://${host}/api/whatsapp/webhook`;

    res.json({
      success: true,
      settings: {
        phoneNumberId: config.phoneNumberId,
        businessAccountId: config.businessAccountId,
        verifyToken: config.verifyToken,
        apiVersion: config.apiVersion,
        isEnabled: config.isEnabled,
        hasAccessToken: config.hasToken,
        maskedToken,
        webhookUrl: computedWebhookUrl,
        webhookVerifiedAt: settings.webhookVerifiedAt,
        lastTestedAt: settings.lastTestedAt,
        lastTestStatus: settings.lastTestStatus,
        lastTestError: settings.lastTestError,
        updatedAt: settings.updatedAt,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve WhatsApp settings: ' + err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. ADMIN: UPDATE WHATSAPP SETTINGS (PUT /api/whatsapp/settings)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/settings', protect, admin, async (req, res) => {
  try {
    const {
      phoneNumberId,
      businessAccountId,
      accessToken,
      verifyToken,
      apiVersion,
      isEnabled,
      webhookUrl,
    } = req.body;

    let settings = await WhatsAppSetting.findOne().select('+accessToken');
    if (!settings) {
      settings = new WhatsAppSetting({});
    }

    if (phoneNumberId !== undefined) settings.phoneNumberId = String(phoneNumberId).trim();
    if (businessAccountId !== undefined) settings.businessAccountId = String(businessAccountId).trim();
    if (verifyToken !== undefined) settings.verifyToken = String(verifyToken).trim();
    if (apiVersion !== undefined) settings.apiVersion = String(apiVersion).trim();
    if (isEnabled !== undefined) settings.isEnabled = Boolean(isEnabled);
    if (webhookUrl !== undefined) settings.webhookUrl = String(webhookUrl).trim();

    // Update access token ONLY if a new, unmasked token is submitted
    if (accessToken && typeof accessToken === 'string' && !accessToken.includes('...')) {
      settings.accessToken = accessToken.trim();
    }

    settings.updatedBy = req.user._id;
    await settings.save();

    res.json({
      success: true,
      message: 'WhatsApp configuration updated successfully!',
      settings: {
        phoneNumberId: settings.phoneNumberId,
        businessAccountId: settings.businessAccountId,
        verifyToken: settings.verifyToken,
        apiVersion: settings.apiVersion,
        isEnabled: settings.isEnabled,
        hasAccessToken: Boolean(settings.accessToken),
        webhookUrl: settings.webhookUrl,
        webhookVerifiedAt: settings.webhookVerifiedAt,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update WhatsApp settings: ' + err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. ADMIN: SEND TEST WHATSAPP MESSAGE (POST /api/whatsapp/test-message)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/test-message', protect, admin, async (req, res) => {
  try {
    const { toPhone, messageText } = req.body;

    if (!toPhone) {
      return res.status(400).json({ success: false, message: 'Recipient phone number is required.' });
    }

    const result = await whatsappService.sendTestMessage({ toPhone, messageText });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || 'Failed to dispatch test message via Meta API.',
        error: result.error,
        dispatchedVia: result.dispatchedVia,
      });
    }

    res.json({
      success: true,
      message: 'Test WhatsApp message sent successfully!',
      providerMessageId: result.providerMessageId,
      dispatchedVia: result.dispatchedVia,
      whatsappUrl: result.whatsappUrl,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error while sending test message: ' + err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. ADMIN: GET WHATSAPP MESSAGES (GET /api/whatsapp/messages)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/messages', protect, admin, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const query = {};

    if (req.query.status) {
      query.status = req.query.status;
    }
    if (req.query.messageType) {
      query.messageType = req.query.messageType;
    }
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search.trim(), 'i');
      query.$or = [{ phone: searchRegex }, { messageBody: searchRegex }, { providerMessageId: searchRegex }];
    }

    const [messages, total] = await Promise.all([
      WhatsAppMessage.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('orderId', 'totalPrice orderStatus')
        .populate('leadId', 'name email'),
      WhatsAppMessage.countDocuments(query),
    ]);

    res.json({
      success: true,
      messages,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch messages: ' + err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. ADMIN: GET WHATSAPP STATS & HEALTH (GET /api/whatsapp/stats)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stats', protect, admin, async (req, res) => {
  try {
    const config = await whatsappService.getWhatsAppConfig();
    const settings = await WhatsAppSetting.findOne();

    const [total, sent, delivered, read, failed, recentActivity] = await Promise.all([
      WhatsAppMessage.countDocuments(),
      WhatsAppMessage.countDocuments({ status: { $in: ['sent', 'delivered', 'read'] } }),
      WhatsAppMessage.countDocuments({ status: { $in: ['delivered', 'read'] } }),
      WhatsAppMessage.countDocuments({ status: 'read' }),
      WhatsAppMessage.countDocuments({ status: 'failed' }),
      WhatsAppMessage.find().sort({ createdAt: -1 }).limit(8),
    ]);

    const deliveryRate = total > 0 ? Math.round((delivered / total) * 100) : 0;
    const readRate = delivered > 0 ? Math.round((read / delivered) * 100) : 0;

    res.json({
      success: true,
      stats: {
        total,
        sent,
        delivered,
        read,
        failed,
        deliveryRate,
        readRate,
        recentActivity,
        connection: {
          isEnabled: config.isEnabled,
          hasToken: config.hasToken,
          phoneNumberId: config.phoneNumberId,
          businessAccountId: config.businessAccountId,
          webhookVerifiedAt: settings?.webhookVerifiedAt || null,
          lastTestedAt: settings?.lastTestedAt || null,
          lastTestStatus: settings?.lastTestStatus || 'NONE',
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to compute WhatsApp stats: ' + err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. ADMIN: GET WHATSAPP TEMPLATES (GET /api/whatsapp/templates)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/templates', protect, admin, async (req, res) => {
  try {
    await WhatsAppTemplate.seedDefaults();
    const templates = await WhatsAppTemplate.find({ isActive: true }).sort({ category: 1, name: 1 });
    res.json({ success: true, templates });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch templates: ' + err.message });
  }
});

module.exports = router;
