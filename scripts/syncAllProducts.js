const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '..', '.env') });
const Product = require('../models/Product');

const BASE = 'http://localhost:5001/images/products';

const all11Products = [
  // 1. BRIGHT-UP FACE WASH
  {
    slug: 'bright-up-face-wash',
    name: 'Bright-Up Face Wash',
    category: 'Skin',
    concern: ['Dull Skin', 'Oily Skin', 'Tanning'],
    benefit: 'Deep Cleansing • Hydrating • Reduces Tan • Boosts Glow',
    price: 449,
    mrp: 599,
    rating: 4.8,
    reviews: 2438,
    folder: 'face-wash',
    image: `${BASE}/anti-pollution-face-wash.png`,
    images: [`${BASE}/anti-pollution-face-wash.png`],
    description: 'A 30-second daily face wash formulated with Niacinamide and Alpha Arbutin. Provides deep cleansing, reduces tan, controls excess oil, and boosts natural skin glow without drying.',
    bullets: [
      'Niacinamide + Alpha Arbutin formula',
      'Deep Cleansing & Tan Reduction',
      'Controls Oil & Boosts Glow',
      '30-Second Routine for All Skin Types',
    ],
    ingredients: [
      { name: 'Niacinamide', note: 'Refines skin texture and controls oil' },
      { name: 'Alpha Arbutin', note: 'Fades dullness and reduces tan' },
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

  // 2. HYDRA CARE FACE CREAM
  {
    slug: 'hydra-face-cream',
    name: 'Hydra Care Face Cream',
    category: 'Skin',
    concern: ['Dry Skin', 'Dull Skin'],
    benefit: 'Retains Moisture • Reduces Dryness • All Day Moisture',
    price: 599,
    mrp: 799,
    rating: 4.7,
    reviews: 1812,
    folder: 'face-cream',
    image: `${BASE}/hydrating-face-creme.png`,
    images: [`${BASE}/hydrating-face-creme.png`],
    description: 'Dermatologically tested moisturizer powered by Ceramide Complex, Hyaluronic Acid, and Korean Ginseng. Delivers all-day moisture with a lightweight, non-sticky feel.',
    bullets: [
      'Ceramide Complex + Hyaluronic Acid + Korean Ginseng',
      'Dermatologically Tested Formula',
      'Retains Moisture & Reduces Dryness',
      'Light Weight & Non-Sticky All Day Moisture',
    ],
    ingredients: [
      { name: 'Ceramide Complex', note: 'Repairs and protects skin barrier' },
      { name: 'Hyaluronic Acid', note: 'Deep, long-lasting cellular hydration' },
      { name: 'Korean Ginseng', note: 'Revitalizes and energizes skin' },
    ],
    howToUse: [
      'Apply on cleansed skin.',
      'Smooth evenly over face and neck.',
      'Use morning and night.',
    ],
    badge: 'Best Seller',
    stock: 150,
    isActive: true,
  },

  // 3. SUNREADY INVISIBLE SUNSCREEN SPF 50 PA++++
  {
    slug: 'daily-defense-spf-50',
    name: 'Sunready Invisible Sunscreen SPF 50 PA++++',
    category: 'Skin',
    concern: ['Sun Protection', 'Tanning'],
    benefit: 'Prevents Sun Tan • Boosts Glow • New-Gen UV Filters',
    price: 549,
    mrp: 699,
    rating: 4.9,
    reviews: 3201,
    folder: 'sunscreen',
    image: `${BASE}/invisible-sunscreen-spf50.jpg`,
    images: [`${BASE}/invisible-sunscreen-spf50.jpg`],
    description: 'Dermatologically tested invisible sunscreen with New-Gen UV Filters, Vitamin C, and Licorice Extract. Shields against premature aging and sun tan with a weightless Layer & Forget finish.',
    bullets: [
      'New-Gen UV Filters with SPF 50 PA++++',
      'Vitamin C + Licorice Extract',
      'Prevents Sun Tan & Boosts Glow',
      'Lightweight UV Defence · Layer & Forget',
    ],
    ingredients: [
      { name: 'New-Gen UV Filters', note: 'Broad-spectrum UV defence without white cast' },
      { name: 'Vitamin C', note: 'Antioxidant protection & glow booster' },
      { name: 'Licorice Extract', note: 'Fades sun tan & pigmentation' },
    ],
    howToUse: [
      'Apply 2 finger-lengths to face & neck.',
      'Reapply every 3–4 hours outdoors.',
    ],
    badge: 'Best Seller',
    stock: 180,
    isActive: true,
  },

  // 4. GREY FIX HAIR & BEARD CONCEALER
  {
    slug: 'beard-growth-oil',
    name: 'Grey Fix Hair & Beard Concealer',
    category: 'Hair',
    concern: ['Hair Fall', 'Dull Skin'],
    benefit: 'Instant Grey Hair & Beard Concealer with Sponge Applicator',
    price: 499,
    mrp: 649,
    rating: 4.6,
    reviews: 942,
    folder: 'beard-oil',
    image: `${BASE}/beard-growth-oil.jpg`,
    images: [`${BASE}/beard-growth-oil.jpg`],
    description: 'Instant grey root touch-up powder with built-in sponge applicator. Covers greys in hair and beard seamlessly with a natural, sweat-resistant matte finish.',
    bullets: [
      'Instant grey coverage for hair & beard',
      'Built-in precision sponge applicator',
      'Natural matte, sweat-resistant formula',
      'Washes off easily with shampoo',
    ],
    ingredients: [
      { name: 'Mineral Pigments', note: 'Natural grey blending without harsh dyes' },
      { name: 'Silica Powder', note: 'Absorbs oil for clean matte hold' },
    ],
    howToUse: [
      'Open compact base to access sponge puff.',
      'Dab applicator onto compact powder.',
      'Gently pat over grey roots, hairline, or beard patches.',
    ],
    badge: '',
    stock: 120,
    isActive: true,
  },

  // 5. BEARD RECHARGE BEARD WASH
  {
    slug: 'beard-recharge-wash',
    name: 'Beard Recharge Beard Wash',
    category: 'Beard',
    concern: ['Hair Fall', 'Dry Skin'],
    benefit: 'Cleansing • Smoothening • Moisturizing • Reduces Itching',
    price: 449,
    mrp: 599,
    rating: 4.7,
    reviews: 736,
    folder: 'beard-wash',
    image: `${BASE}/beard-wash.jpg`,
    images: [`${BASE}/beard-wash.jpg`],
    description: 'Dermatologically tested beard wash powered by Caffeine, Biotin, and Korean Ginseng. Deep cleans coarse beard hair, relieves itch, and keeps your beard fresh all day.',
    bullets: [
      'Caffeine + Biotin + Korean Ginseng',
      'Dermatologically Tested Cleanser',
      'Smoothening & Moisturizing Care',
      'Reduces Itching & Supports Easy Grooming',
    ],
    ingredients: [
      { name: 'Caffeine', note: 'Energizes beard roots' },
      { name: 'Biotin', note: 'Strengthens beard fibers' },
      { name: 'Korean Ginseng', note: 'Conditions skin underneath' },
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

  // 6. ULTRA PROTECT LIP BALM SPF 50 PA++++
  {
    slug: 'repair-lip-balm',
    name: 'Ultra Protect Lip Balm SPF 50 PA++++',
    category: 'Skin',
    concern: ['Dark Lips', 'Dry Skin'],
    benefit: 'Brightens Dark Lips • Softens & Hydrates • Reduces Pigmentation',
    price: 249,
    mrp: 299,
    rating: 4.8,
    reviews: 812,
    folder: 'lipbalm',
    image: `${BASE}/bovato-lip-balm.png`,
    images: [`${BASE}/bovato-lip-balm.png`],
    description: 'Dermatologically tested lip balm with SPF 50 PA++++, Cocoa Butter, and Licorice Extract. Protects lips from sun damage while actively brightening dark, pigmented lips.',
    bullets: [
      'SPF 50 PA++++ Broad-Spectrum Protection',
      'Cocoa Butter + Licorice Extract',
      'Brightens Dark Lips & Softens Dry Chaps',
      'Dermatologically Tested Non-Sticky Formula',
    ],
    ingredients: [
      { name: 'Cocoa Butter', note: 'Intense moisture & soft lips' },
      { name: 'Licorice Extract', note: 'Reduces dark lip pigmentation' },
    ],
    howToUse: ['Apply smoothly on lips throughout the day as needed.'],
    badge: 'New',
    stock: 250,
    isActive: true,
  },

  // 7. SKIN ENERGIZING BODY WASH
  {
    slug: 'energizing-body-wash',
    name: 'Skin Energizing Body Wash',
    category: 'Body',
    concern: ['Oily Skin', 'Dull Skin'],
    benefit: 'Deep Cleansing • Skin Nourishing • Reduces Tanning',
    price: 399,
    mrp: 499,
    rating: 4.7,
    reviews: 1102,
    folder: 'body-wash',
    image: `${BASE}/anti-pollution-face-wash.svg`,
    images: [`${BASE}/anti-pollution-face-wash.svg`],
    description: 'Dermatologically tested body wash with Niacinamide, Kakadu Plum, and Korean Ginseng. Deeply cleanses gym sweat, reduces tanning, and provides antioxidant care for all skin types.',
    bullets: [
      'Niacinamide + Kakadu Plum + Korean Ginseng',
      'Deep Cleansing & Skin Nourishing',
      'Reduces Tanning & Antioxidant Care',
      'Shower-to-Door Ready Freshness',
    ],
    ingredients: [
      { name: 'Niacinamide', note: 'Evens body skin tone' },
      { name: 'Kakadu Plum', note: 'Potent natural Vitamin C source' },
      { name: 'Korean Ginseng', note: 'Revitalizes tired skin' },
    ],
    howToUse: ['Lather onto wet skin, massage across body, and rinse.'],
    badge: '',
    stock: 140,
    isActive: true,
  },

  // 8. ULTRA HYDRATING BODY LOTION - SPF 35+
  {
    slug: 'nourishing-body-lotion',
    name: 'Ultra Hydrating Body Lotion - SPF 35+',
    category: 'Body',
    concern: ['Dry Skin', 'Dull Skin'],
    benefit: 'Hydrating • Nourishing • Strengthens Skin Barrier • UV Defence',
    price: 549,
    mrp: 699,
    rating: 4.7,
    reviews: 884,
    folder: 'body-lotion',
    image: `${BASE}/body-lotion.jpg`,
    images: [`${BASE}/body-lotion.jpg`],
    description: 'Dermatologically tested dual-action body lotion with SPF 35+ UV Defence, Ceramide Complex, and Korean Ginseng. Strengthens the skin barrier and locks in all-day hydration.',
    bullets: [
      'SPF 35+ Everyday UV Protection',
      'Ceramide Complex + Korean Ginseng',
      'Strengthens Skin Barrier & Fast Absorbing',
      'All Day Hydration, Everyday Protection',
    ],
    ingredients: [
      { name: 'Ceramide Complex', note: 'Strengthens protective barrier' },
      { name: 'Korean Ginseng', note: 'Fights dullness and skin fatigue' },
      { name: 'New-Gen UV Filters', note: 'SPF 35+ sun protection' },
    ],
    howToUse: [
      'Apply evenly on clean body skin after shower.',
      'Massage until absorbed.',
    ],
    badge: 'New',
    stock: 130,
    isActive: true,
  },

  // 9. HAIR REVIVE SHAMPOO
  {
    slug: 'anti-dandruff-shampoo',
    name: 'Hair Revive Shampoo',
    category: 'Hair',
    concern: ['Hair Fall', 'Dry Skin'],
    benefit: 'Gentle Cleansing • Nourishing • Reduces Breakage • Sulphate Free',
    price: 549,
    mrp: 699,
    rating: 4.8,
    reviews: 1186,
    folder: 'anti-dandruff-shampoo',
    image: `${BASE}/hair-fall-shampoo.jpg`,
    images: [`${BASE}/hair-fall-shampoo.jpg`],
    description: 'Sulphate-free dermatologically tested shampoo crafted with Korean Rice Water and Collagen Peptide. Gently cleanses scalp buildup, reduces hair breakage, and restores moisture.',
    bullets: [
      'Korean Rice Water + Collagen Peptide',
      'Sulphate Free & Dermatologically Tested',
      'Reduces Breakage & Strengthens Hair',
      'Restores Essential Moisture for All Hair Types',
    ],
    ingredients: [
      { name: 'Korean Rice Water', note: 'Strengthens hair roots & shine' },
      { name: 'Collagen Peptide', note: 'Improves hair resilience & density' },
    ],
    howToUse: [
      'Apply to wet hair and scalp.',
      'Massage gently for 1–2 minutes.',
      'Rinse thoroughly. Safe for daily use.',
    ],
    badge: 'Best Seller',
    stock: 160,
    isActive: true,
  },

  // 10. TAN RESET DE-TAN PACK
  {
    slug: 'd-tan-cream',
    name: 'Tan Reset De-Tan Pack',
    category: 'Skin',
    concern: ['Tanning', 'Dull Skin', 'Sun Protection'],
    benefit: 'Brightens Skin Tone • Reduces Blackheads • Fades Sun Tan',
    price: 649,
    mrp: 849,
    rating: 4.8,
    reviews: 1320,
    folder: 'd-tan',
    image: `${BASE}/skin-brightening-cream.png`,
    images: [`${BASE}/skin-brightening-cream.png`],
    description: 'Dermatologically tested facial clay pack with Pea Peptide and Licorice Extract. Lifts stubborn sun tan, clears blackheads, deeply cleanses pores, and reduces pigmentation in 15 minutes.',
    bullets: [
      '15-Minute Reset Formula',
      'Pea Peptide + Licorice Extract',
      'Reduces Blackheads & Deep Pore Cleansing',
      'Fades Sun Tan & Reduces Pigmentation',
    ],
    ingredients: [
      { name: 'Pea Peptide', note: 'Supports skin renewal & firmness' },
      { name: 'Licorice Extract', note: 'Fades dark spots and sun tan' },
    ],
    howToUse: [
      'Apply evenly to clean face & neck.',
      'Leave on for 15 minutes.',
      'Rinse with water in gentle circular motions. Use 2–3 times a week.',
    ],
    badge: 'Best Seller',
    stock: 175,
    isActive: true,
  },

  // 11. INSTANT GLOW CREAM
  {
    slug: 'instant-glow-cream',
    name: 'Instant Glow Cream',
    category: 'Skin',
    concern: ['Dull Skin', 'Tanning'],
    benefit: 'Instant Hydration • Smoothens Texture • Party Ready in 2 Minutes',
    price: 599,
    mrp: 799,
    rating: 4.8,
    reviews: 1420,
    folder: 'instant-glow-cream',
    image: `${BASE}/skin-brightening-cream.png`,
    images: [`${BASE}/skin-brightening-cream.png`],
    description: 'Dermatologically tested glow cream formulated with Witch Hazel and Milk Protein. Delivers instant hydration, smoothens skin texture, and brightens dull skin for a 2-minute party-ready glow.',
    bullets: [
      'Party Ready in 2 Minutes',
      'Witch Hazel + Milk Protein Formula',
      'Instant Hydration & Glow-Boosting Formula',
      'Smoothens Skin Texture & Brightens Dull Skin',
    ],
    ingredients: [
      { name: 'Witch Hazel', note: 'Tightens pores and tones skin' },
      { name: 'Milk Protein', note: 'Nourishes deeply for radiant glow' },
    ],
    howToUse: [
      'Dot evenly across cleansed face and neck.',
      'Massage in upward circular motions.',
      'Absorbs quickly for an instant party-ready glow.',
    ],
    badge: 'New',
    stock: 150,
    isActive: true,
  },
];

async function sync() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI, {
      family: 4,
      serverSelectionTimeoutMS: 20000,
    });
    console.log('MongoDB Connected!');

    for (const p of all11Products) {
      await Product.findOneAndUpdate(
        { slug: p.slug },
        { $set: { ...p, isActive: true } },
        { upsert: true, new: true, runValidators: true }
      );
      console.log(`✓ Synced: ${p.name}`);
    }

    const count = await Product.countDocuments({ isActive: true });
    console.log(`\n🎉 Total active products in MongoDB: ${count}`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error syncing products:', err);
    process.exit(1);
  }
}

sync();
