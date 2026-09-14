const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Product = require('../models/Product');
const User = require('../models/User');
const Review = require('../models/Review');
const connectDB = require('../config/db');

dotenv.config();

const BASE = 'http://localhost:5001/images/products';

const products = [
  // 1. BRIGHT-UP FACE WASH
  {
    slug: 'bright-up-face-wash',
    name: 'Bright-Up Face Wash',
    category: 'Skin',
    concern: ['Dull Skin', 'Oily Skin', 'Acne'],
    benefit: 'Cleanses gently & energizes skin for bright, refreshed tone.',
    price: 449,
    mrp: 599,
    rating: 4.8,
    reviews: 2438,
    folder: 'face-wash',
    image: `${BASE}/anti-pollution-face-wash.png`,
    images: [`${BASE}/anti-pollution-face-wash.png`, `${BASE}/anti-pollution-face-wash.svg`],
    description: 'A 30-second daily face wash formulated with Niacinamide and Alpha Arbutin. Lifts dirt and pollution while brightening dull male skin.',
    bullets: [
      'Niacinamide + Alpha Arbutin formula',
      'Sulfate & paraben free',
      'Gentle non-drying, pH-balanced routine',
      'Dermatologist tested',
    ],
    ingredients: [
      { name: 'Niacinamide', note: 'Refines skin texture and tone' },
      { name: 'Alpha Arbutin', note: 'Fades dullness & brightens' },
    ],
    howToUse: [
      'Wet face with lukewarm water.',
      'Massage a small amount in circular motions for 30 seconds.',
      'Rinse thoroughly. Use AM & PM.',
    ],
    badge: 'Best Seller',
    stock: 200,
    isActive: true,
  },

  // 2. HYDRA FACE CREAM
  {
    slug: 'hydra-face-cream',
    name: 'Hydra Face Cream',
    category: 'Skin',
    concern: ['Dry Skin', 'Dull Skin'],
    benefit: '48-hour hydration with a clean matte finish.',
    price: 599,
    mrp: 799,
    rating: 4.7,
    reviews: 1812,
    folder: 'face-cream',
    image: `${BASE}/hydrating-face-creme.png`,
    images: [`${BASE}/hydrating-face-creme.png`],
    description: 'Lightweight gel-cream that locks in moisture for 48 hours with a clean, matte finish.',
    bullets: [
      'Hyaluronic acid + ceramides',
      'Non-comedogenic',
      'Absorbs in 30 seconds',
      'Fragrance free',
    ],
    ingredients: [
      { name: 'Hyaluronic Acid', note: 'Deep hydration' },
      { name: 'Ceramides', note: 'Repairs barrier' },
      { name: 'Squalane', note: 'Soft, matte finish' },
    ],
    howToUse: [
      'Apply on cleansed skin.',
      'Smooth over face and neck.',
      'Use morning and night.',
    ],
    badge: 'Best Seller',
    stock: 150,
    isActive: true,
  },

  // 3. DAILY DEFENSE SUNSCREEN SPF 50
  {
    slug: 'daily-defense-spf-50',
    name: 'Daily Defense Sunscreen SPF 50',
    category: 'Skin',
    concern: ['Sun Protection', 'Tanning'],
    benefit: 'Broad-spectrum, no white cast.',
    price: 549,
    mrp: 699,
    rating: 4.9,
    reviews: 3201,
    folder: 'sunscreen',
    image: `${BASE}/invisible-sunscreen-spf50.jpg`,
    images: [`${BASE}/invisible-sunscreen-spf50.jpg`],
    description: 'An invisible SPF 50 PA+++ sunscreen designed for men. No white cast, no greasy feel.',
    bullets: [
      'SPF 50 PA+++',
      'Invisible finish',
      'Sweat & water resistant',
      'Reef safe',
    ],
    ingredients: [
      { name: 'Zinc Oxide', note: 'Broad-spectrum UV block' },
      { name: 'Vitamin E', note: 'Antioxidant defense' },
    ],
    howToUse: [
      'Apply 2 finger-lengths to face & neck.',
      'Reapply every 3 hours outdoors.',
    ],
    badge: 'Best Seller',
    stock: 180,
    isActive: true,
  },

  // 4. BEARD MAX (BEARD GROWTH OIL)
  {
    slug: 'beard-growth-oil',
    name: 'Beard Max',
    category: 'Beard',
    concern: ['Dry Skin', 'Hair Fall'],
    benefit: 'Softens beard and supports fuller-looking growth.',
    price: 499,
    mrp: 649,
    rating: 4.6,
    reviews: 942,
    folder: 'beard-oil',
    image: `${BASE}/beard-growth-oil.jpg`,
    images: [`${BASE}/beard-growth-oil.jpg`, `${BASE}/beard-growth-oil.svg`],
    description: 'A featherlight beard serum that softens coarse beard hair, conditions the skin underneath and supports healthier, fuller growth.',
    bullets: [
      'Argan + jojoba + castor oil',
      'Non-greasy, fast absorbing',
      'Subtle cedar scent',
      'Reduces beard itch',
    ],
    ingredients: [
      { name: 'Argan Oil', note: 'Softens & shines' },
      { name: 'Jojoba Oil', note: 'Mimics natural sebum' },
      { name: 'Castor Oil', note: 'Supports growth' },
    ],
    howToUse: [
      'Warm 3–5 drops in palms.',
      'Massage into beard and skin daily.',
    ],
    badge: '',
    stock: 120,
    isActive: true,
  },

  // 5. BEARD RECHARGE BEARD WASH
  {
    slug: 'beard-recharge-wash',
    name: 'Beard Wash',
    category: 'Beard',
    concern: ['Hair Fall', 'Dry Skin'],
    benefit: 'Deep cleans beard without leaving it rough or dry.',
    price: 449,
    mrp: 599,
    rating: 4.7,
    reviews: 736,
    folder: 'beard-wash',
    image: `${BASE}/beard-wash.jpg`,
    images: [`${BASE}/beard-wash.jpg`, `${BASE}/beard-wash.svg`],
    description: 'A beard-first cleanser that removes sweat, dirt and buildup while keeping beard hair soft and the skin below comfortable.',
    bullets: [
      'Biotin + caffeine complex',
      'Daily beard cleansing',
      'Won\'t strip natural oils',
      'Helps reduce beard itch',
    ],
    ingredients: [
      { name: 'Biotin', note: 'Supports stronger-looking hair' },
      { name: 'Caffeine', note: 'Refreshes roots and skin' },
      { name: 'Conditioning Agents', note: 'Keep beard soft' },
    ],
    howToUse: [
      'Wet beard thoroughly.',
      'Massage a small amount through beard and skin.',
      'Rinse well and pat dry.',
    ],
    badge: 'New',
    stock: 110,
    isActive: true,
  },

  // 6. REPAIR LIP BALM
  {
    slug: 'repair-lip-balm',
    name: 'Repair Lip Balm',
    category: 'Skin',
    concern: ['Dark Lips', 'Dry Skin'],
    benefit: 'Repairs and lightens dark lips.',
    price: 249,
    mrp: 299,
    rating: 4.5,
    reviews: 612,
    folder: 'lipbalm',
    image: `${BASE}/bovato-lip-balm.png`,
    images: [`${BASE}/bovato-lip-balm.png`, `${BASE}/lip-balm.svg`],
    description: 'A nutrient-rich balm that softens dark, chapped lips overnight.',
    bullets: ['Shea butter + vitamin E', 'SPF 15', 'Unscented'],
    ingredients: [
      { name: 'Shea Butter', note: 'Deep moisture' },
      { name: 'Vitamin E', note: 'Lightens darkness' },
    ],
    howToUse: ['Apply throughout the day as needed.'],
    badge: 'New',
    stock: 250,
    isActive: true,
  },

  // 7. ENERGIZING BODY WASH
  {
    slug: 'energizing-body-wash',
    name: 'Energizing Body Wash',
    category: 'Body',
    concern: ['Oily Skin', 'Dull Skin'],
    benefit: 'Cleanses without stripping.',
    price: 399,
    mrp: 499,
    rating: 4.7,
    reviews: 1102,
    folder: 'body-wash',
    image: `${BASE}/anti-pollution-face-wash.svg`,
    images: [`${BASE}/anti-pollution-face-wash.svg`],
    description: 'A rich, sulfate-free body wash with a cool burst of mint and citrus.',
    bullets: ['Sulfate free', 'Cooling menthol', 'Hydrating glycerin'],
    ingredients: [
      { name: 'Menthol', note: 'Cool, fresh wake-up' },
      { name: 'Glycerin', note: 'Locks in moisture' },
    ],
    howToUse: ['Lather, rinse, repeat as needed.'],
    badge: '',
    stock: 140,
    isActive: true,
  },

  // 8. NOURISHING BODY LOTION
  {
    slug: 'nourishing-body-lotion',
    name: 'Nourishing Body Lotion',
    category: 'Body',
    concern: ['Dry Skin', 'Dull Skin'],
    benefit: 'All-day hydration, never sticky.',
    price: 549,
    mrp: 699,
    rating: 4.7,
    reviews: 884,
    folder: 'body-lotion',
    image: `${BASE}/body-lotion.jpg`,
    images: [`${BASE}/body-lotion.jpg`, `${BASE}/body-lotion.svg`],
    description: 'A fast-absorbing daily lotion that softens rough patches and locks in moisture for 24 hours — without the greasy finish.',
    bullets: [
      '24-hour hydration',
      'Shea butter + niacinamide',
      'Non-sticky, fast-absorbing',
      'Light, masculine scent',
    ],
    ingredients: [
      { name: 'Shea Butter', note: 'Rich nourishment' },
      { name: 'Niacinamide', note: 'Evens body skin tone' },
      { name: 'Glycerin', note: 'Long-lasting moisture' },
    ],
    howToUse: [
      'Apply on clean, dry skin.',
      'Massage in until fully absorbed.',
      'Use daily after shower.',
    ],
    badge: 'New',
    stock: 130,
    isActive: true,
  },

  // 9. ANTI DANDRUFF SHAMPOO
  {
    slug: 'anti-dandruff-shampoo',
    name: 'Anti Dandruff Shampoo',
    category: 'Hair',
    concern: ['Hair Fall', 'Dry Skin'],
    benefit: 'Cleans scalp, removes flakes and soothes itching.',
    price: 549,
    mrp: 699,
    rating: 4.8,
    reviews: 1186,
    folder: 'anti-dandruff-shampoo',
    image: `${BASE}/hair-fall-shampoo.jpg`,
    images: [`${BASE}/hair-fall-shampoo.jpg`, `${BASE}/hair-fall-shampoo.svg`],
    description: 'A scalp-clearing anti dandruff shampoo that removes flakes, helps reduce itching and leaves hair clean without feeling stripped.',
    bullets: [
      'Anti-dandruff daily cleanser',
      'Niacinamide + moringa',
      'Soothes itchy scalp',
      'Strengthens hair feel',
    ],
    ingredients: [
      { name: 'Niacinamide', note: 'Helps support scalp balance' },
      { name: 'Moringa', note: 'Cleanses and conditions' },
      { name: 'Scalp Actives', note: 'Reduce visible flakes' },
    ],
    howToUse: [
      'Apply to wet scalp and hair.',
      'Massage gently for 1–2 minutes.',
      'Rinse thoroughly and repeat if needed.',
    ],
    badge: 'Best Seller',
    stock: 160,
    isActive: true,
  },

  // 10. D-TAN CREAM
  {
    slug: 'd-tan-cream',
    name: 'D-Tan Cream',
    category: 'Skin',
    concern: ['Tanning', 'Dull Skin', 'Sun Protection'],
    benefit: 'Removes tan, restores natural tone.',
    price: 649,
    mrp: 849,
    rating: 4.8,
    reviews: 1320,
    folder: 'd-tan',
    image: `${BASE}/skin-brightening-cream.png`,
    images: [`${BASE}/skin-brightening-cream.png`, `${BASE}/detan-pack.svg`],
    description: 'A potent de-tan cream that lifts stubborn sun tan, brightens dull skin and restores your natural complexion in as little as 2 weeks.',
    bullets: [
      'Visible de-tan in 2 weeks',
      'Liquorice + vitamin C',
      'Safe for daily use',
      'Brightens & evens tone',
    ],
    ingredients: [
      { name: 'Liquorice Extract', note: 'Lightens pigmentation' },
      { name: 'Vitamin C', note: 'Brightens & evens tone' },
      { name: 'Kojic Acid', note: 'Fades dark spots' },
    ],
    howToUse: [
      'Apply on cleansed face & neck.',
      'Massage gently for 1 minute.',
      'Use 3–4 times a week, follow with sunscreen.',
    ],
    badge: 'Best Seller',
    stock: 175,
    isActive: true,
  },
];

const initialReviews = [
  {
    name: 'Arjun M.',
    location: 'Bengaluru',
    rating: 5,
    title: 'Finally, skincare made for us.',
    body: 'I\'ve tried half a dozen brands. BOVATO is the first one where everything just works — the routine takes 3 minutes and my skin looks visibly better.',
    productSlug: 'bright-up-face-wash',
    productName: 'Bright-Up Face Wash',
    isVerified: true,
  },
  {
    name: 'Rohan K.',
    location: 'Mumbai',
    rating: 5,
    title: 'Sunscreen is undefeated.',
    body: 'No white cast, no stickiness, no breaking out. I wear it every single day under helmets, masks, everything.',
    productSlug: 'daily-defense-spf-50',
    productName: 'Daily Defense Sunscreen SPF 50',
    isVerified: true,
  },
  {
    name: 'Vikram S.',
    location: 'Delhi',
    rating: 5,
    title: 'Premium feel, real results.',
    body: 'The packaging alone makes you want to use it. The de-tan routine visibly cleaned up my tan lines in a few weeks.',
    productSlug: 'd-tan-cream',
    productName: 'D-Tan Cream',
    isVerified: true,
  },
  {
    name: 'Aditya R.',
    location: 'Pune',
    rating: 4,
    title: 'Beard oil is incredible.',
    body: 'Soft beard, no itch, subtle scent. Switched my whole shelf.',
    productSlug: 'beard-growth-oil',
    productName: 'Beard Max',
    isVerified: true,
  },
  {
    name: 'Siddharth',
    location: 'Bengaluru',
    rating: 5,
    title: 'It feels premium, works fast, and actually fits my routine.',
    body: 'Formulation is top tier and smells subtle and masculine. No unnecessary sticky chemicals.',
    productSlug: 'hydra-face-cream',
    productName: 'Hydra Face Cream',
    isVerified: true,
  },
];

const seedDB = async () => {
  try {
    await connectDB();

    console.log('🔄 Cleaning up existing Products and Reviews...');
    await Product.deleteMany({});
    await Review.deleteMany({});

    console.log(`📦 Seeding ${products.length} BOVATO storefront products...`);
    const createdProducts = await Product.insertMany(products);
    console.log(`✅ Successfully seeded ${createdProducts.length} products!`);

    console.log(`💬 Seeding ${initialReviews.length} customer reviews...`);
    const createdReviews = await Review.insertMany(initialReviews);
    console.log(`✅ Successfully seeded ${createdReviews.length} customer reviews!`);

    // Ensure Admin & Test User
    const adminEmail = 'admin@bovato.com';
    let adminUser = await User.findOne({ email: adminEmail });
    if (!adminUser) {
      await User.create({
        name: 'BOVATO Admin',
        email: adminEmail,
        phone: '9876543210',
        password: 'admin123',
        isAdmin: true,
      });
      console.log('✅ Admin user created: admin@bovato.com / admin123');
    }

    const testEmail = 'user@bovato.com';
    let testUser = await User.findOne({ email: testEmail });
    if (!testUser) {
      await User.create({
        name: 'Aditya Sharma',
        email: testEmail,
        phone: '9876543211',
        password: 'userpassword123',
        isAdmin: false,
        addresses: [
          {
            label: 'Home',
            recipient_name: 'Aditya Sharma',
            phone: '9876543211',
            line1: '402, Green Glen Layout, Bellandur',
            line2: 'Outer Ring Road',
            city: 'Bengaluru',
            state: 'Karnataka',
            pincode: '560103',
            is_default: true,
          },
        ],
      });
      console.log('✅ Demo customer created: user@bovato.com / userpassword123');
    }

    // Seed Demo CRM Leads
    const Lead = require('../models/Lead');
    const AbandonedCart = require('../models/AbandonedCart');
    const Coupon = require('../models/Coupon');

    await Lead.deleteMany({});
    await AbandonedCart.deleteMany({});

    await Lead.insertMany([
      {
        name: 'Rahul Verma',
        phone: '9876543220',
        email: 'rahul.v@gmail.com',
        source: 'instagram',
        productSlug: 'bright-up-face-wash',
        productName: 'Bright-Up Face Wash',
        productPrice: 449,
        intent: 'get_offer',
        leadScore: 85,
        category: 'HOT',
        status: 'new',
        cartValue: 898,
        whatsappOptIn: true,
      },
      {
        name: 'Sameer Khan',
        phone: '9876543221',
        email: 'sameer.k@outlook.com',
        source: 'whatsapp',
        productSlug: 'beard-growth-oil',
        productName: 'Beard Max',
        productPrice: 499,
        intent: 'whatsapp_enquiry',
        leadScore: 90,
        category: 'HOT',
        status: 'contacted',
        cartValue: 499,
        whatsappOptIn: true,
      },
      {
        name: 'Aman Gupta',
        phone: '9876543222',
        email: 'aman.g@gmail.com',
        source: 'google',
        productSlug: 'daily-defense-spf-50',
        productName: 'Daily Defense Sunscreen SPF 50',
        productPrice: 549,
        intent: 'price_drop_alert',
        leadScore: 65,
        category: 'WARM',
        status: 'new',
        cartValue: 549,
        whatsappOptIn: true,
      },
      {
        name: 'Tarun Patel',
        phone: '9876543223',
        email: 'tarun.p@yahoo.com',
        source: 'direct',
        productSlug: 'anti-dandruff-shampoo',
        productName: 'Anti Dandruff Shampoo',
        productPrice: 549,
        intent: 'general_enquiry',
        leadScore: 35,
        category: 'COLD',
        status: 'new',
        cartValue: 0,
        whatsappOptIn: true,
      },
    ]);
    console.log('✅ Demo CRM leads seeded (HOT, WARM, COLD)!');

    await AbandonedCart.create({
      customerName: 'Karan Mehra',
      phone: '9876543225',
      email: 'karan.m@gmail.com',
      items: [
        {
          slug: 'bright-up-face-wash',
          name: 'Bright-Up Face Wash',
          price: 449,
          qty: 1,
          image: 'http://localhost:5001/images/products/anti-pollution-face-wash.png',
        },
        {
          slug: 'hydra-face-cream',
          name: 'Hydra Face Cream',
          price: 599,
          qty: 1,
          image: 'http://localhost:5001/images/products/hydrating-face-creme.png',
        },
      ],
      totalValue: 1048,
      recoveryStatus: 'abandoned',
      source: 'cart_drawer',
    });
    console.log('✅ Demo Abandoned Cart seeded for CRM recovery testing!');

    console.log('🎉 Database seeding complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
};

seedDB();
