const dns = require('dns');

// Prioritize IPv4 over IPv6 to prevent Windows / ISP DNS ENOTFOUND on MongoDB Atlas replica set hosts
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
// Increase libuv threadpool size to handle parallel DNS lookups and MongoDB socket handshakes
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '64';

const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const compression = require('compression');
const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// Load env vars
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// ── CORS — MUST be first, before WAF & rate limiter ──────────────────────────
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:8080',
  'http://192.168.68.64:8080',
  process.env.CLIENT_URL,
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // open during dev — lock down in prod
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));          // attach CORS headers to every response
app.options('*', cors(corsOptions)); // handle OPTIONS preflight immediately

// 1. BODY PARSER WITH 50MB LIMIT FOR IMAGE UPLOADS — MUST BE BEFORE SANITIZE/WAF
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 2. SECURITY HEADERS (Helmet) — Protects against XSS, Clickjacking, MIME sniffing
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// 3. GZIP COMPRESSION — High performance payload compression (80% smaller size)
app.use(compression());

// 4. NOSQL INJECTION PROTECTION — Sanitizes user input against MongoDB operator injection ($gt, $ne, etc.)
app.use(mongoSanitize({ allowDots: true }));

// 5. RATE LIMITING — Anti-DDoS & Anti-Brute Force Attacks (In-Memory Store)
const globalLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 300,
  message: { message: 'Too many requests from this IP, please try again after 10 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  message: { message: 'Too many login attempts. Please try again after 15 minutes for security.' },
});

app.use('/api', globalLimiter);
app.use('/api/auth/login', authLimiter);

// Static file serving
app.use('/public', express.static(require('path').join(__dirname, 'public')));
app.use('/images', express.static(require('path').join(__dirname, 'public/images')));

// Disable X-Powered-By Express Header to hide backend server signature
app.disable('x-powered-by');

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/cart', require('./routes/cartRoutes'));
app.use('/api/wishlist', require('./routes/wishlistRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/quiz', require('./routes/quizRoutes'));
app.use('/api/payment', require('./routes/paymentRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));
app.use('/api/bundles', require('./routes/bundleRoutes'));
app.use('/api/leads', require('./routes/leadRoutes'));
app.use('/api/admin/leads', require('./routes/adminLeadRoutes'));
app.use('/api/whatsapp', require('./routes/whatsappRoutes'));
app.use('/api/abandoned-carts', require('./routes/abandonedCartRoutes'));
app.use('/api/coupons', require('./routes/couponRoutes'));
app.use('/api/crm', require('./routes/crmRoutes'));
app.use('/api/alerts', require('./routes/alertRoutes'));
app.use('/api/reels', require('./routes/reelRoutes'));
app.use('/api/shipping', require('./routes/shippingRoutes'));
app.use('/api/rewards', require('./routes/rewardRoutes'));
app.use('/api/webhooks', require('./routes/webhookRoutes'));

// Meta WhatsApp Cloud API Webhook (GET & POST /webhook)
const metaWebhookRoutes = require('./routes/metaWebhookRoutes');
app.use('/webhook', metaWebhookRoutes);
app.use('/api/webhook', metaWebhookRoutes);

// Firewall Status Endpoint (Firewall Disabled)
app.get('/api/firewall/status', (req, res) => {
  res.json({
    status: 'DISABLED',
    mode: 'DISABLED',
    message: 'Firewall is disabled',
    bannedIPsCount: 0,
    bannedIPsList: [],
    totalThreatsLogged: 0,
    recentThreatLogs: [],
    activeRules: [],
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'BOVATO Enterprise API is running',
    timestamp: new Date().toISOString(),
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to BOVATO API',
    version: '1.0.0',
    security: 'Helmet + Rate Limiter',
  });
});

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5001;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Process crash prevention handlers
process.on('unhandledRejection', (err) => {
  console.warn('⚠️ [PROCESS] Unhandled Promise Rejection:', err.message);
});

process.on('uncaughtException', (err) => {
  console.error('❌ [PROCESS] Uncaught Exception:', err.message);
});
