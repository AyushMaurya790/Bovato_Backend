const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, '../public/images/products');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Helper to generate vector SVG product packaging matching exact BOVATO MEN Navy Blue & Metallic Silver Grey theme
function generateProductSVG(config) {
  const { title, subtitle, ingredients, volume, shape } = config;
  
  // Package dimensions & shapes based on container type
  let containerMarkup = '';
  
  if (shape === 'tube') {
    // Squeeze Tube shape (like Anti-Pollution Face Wash / Scrub)
    containerMarkup = `
      <!-- Squeeze Tube Body -->
      <path d="M 120 100 L 280 100 Q 295 110 290 200 L 265 420 Q 260 440 240 440 L 160 440 Q 140 440 135 420 L 110 200 Q 105 110 120 100 Z" fill="url(#navyGradient)" filter="url(#shadow)"/>
      <!-- Tube Crimped Top -->
      <path d="M 118 100 L 282 100 L 282 112 L 118 112 Z" fill="#142338"/>
      <!-- Tube Crimped Lines -->
      <line x1="125" y1="100" x2="125" y2="112" stroke="#1f3554" stroke-width="2"/>
      <line x1="135" y1="100" x2="135" y2="112" stroke="#1f3554" stroke-width="2"/>
      <line x1="145" y1="100" x2="145" y2="112" stroke="#1f3554" stroke-width="2"/>
      <line x1="155" y1="100" x2="155" y2="112" stroke="#1f3554" stroke-width="2"/>
      <line x1="245" y1="100" x2="245" y2="112" stroke="#1f3554" stroke-width="2"/>
      <line x1="255" y1="100" x2="255" y2="112" stroke="#1f3554" stroke-width="2"/>
      <line x1="265" y1="100" x2="265" y2="112" stroke="#1f3554" stroke-width="2"/>
      <line x1="275" y1="100" x2="275" y2="112" stroke="#1f3554" stroke-width="2"/>
      <!-- Metallic Silver Flip Cap -->
      <path d="M 148 440 L 252 440 L 246 490 Q 244 505 200 505 Q 156 505 154 490 Z" fill="url(#silverGradient)" stroke="#8e96a4" stroke-width="1.5"/>
      <ellipse cx="200" cy="442" rx="52" ry="5" fill="#a4acb8"/>
      <!-- Flip Cap Groove -->
      <rect x="180" y="465" width="40" height="15" rx="6" fill="#88909c" opacity="0.6"/>
    `;
  } else if (shape === 'jar') {
    // Tub / Jar shape (like De-Tan Pack / Skin Brightening Cream)
    containerMarkup = `
      <!-- Jar Body -->
      <rect x="110" y="240" width="180" height="230" rx="35" fill="url(#navyGradient)" filter="url(#shadow)"/>
      <!-- Metallic Silver Lid -->
      <rect x="106" y="140" width="188" height="106" rx="22" fill="url(#silverGradient)" filter="url(#shadow)" stroke="#8e96a4" stroke-width="1.5"/>
      <line x1="106" y1="246" x2="294" y2="246" stroke="#9aa2af" stroke-width="2"/>
    `;
  } else if (shape === 'pump-bottle') {
    // Lotion / Serum Pump Bottle
    containerMarkup = `
      <!-- Bottle Body -->
      <rect x="120" y="210" width="160" height="260" rx="36" fill="url(#navyGradient)" filter="url(#shadow)"/>
      <!-- Metallic Silver Neck & Pump -->
      <rect x="175" y="170" width="50" height="42" fill="url(#silverGradient)" stroke="#8e96a4" stroke-width="1"/>
      <rect x="160" y="150" width="80" height="22" rx="4" fill="url(#silverGradient)"/>
      <!-- Pump Head -->
      <path d="M 170 150 L 170 120 Q 170 110 185 110 L 240 110 Q 250 110 248 120 L 242 128 L 195 128 L 195 150 Z" fill="url(#silverGradient)"/>
    `;
  } else if (shape === 'dropper-bottle') {
    // Serum Dropper Bottle
    containerMarkup = `
      <!-- Bottle Body -->
      <rect x="125" y="220" width="150" height="250" rx="32" fill="url(#navyGradient)" filter="url(#shadow)"/>
      <!-- Bottle Neck -->
      <rect x="165" y="180" width="70" height="42" fill="url(#navyGradient)"/>
      <!-- Metallic Silver Collar -->
      <rect x="160" y="155" width="80" height="28" rx="4" fill="url(#silverGradient)" stroke="#8e96a4" stroke-width="1"/>
      <!-- Rubber Dropper Top -->
      <path d="M 180 155 Q 180 115 200 115 Q 220 115 220 155 Z" fill="#2d3748"/>
    `;
  } else {
    // Compact Stick / Bottle
    containerMarkup = `
      <!-- Container Body -->
      <rect x="130" y="220" width="140" height="250" rx="28" fill="url(#navyGradient)" filter="url(#shadow)"/>
      <!-- Metallic Silver Cap -->
      <rect x="128" y="130" width="144" height="92" rx="16" fill="url(#silverGradient)" stroke="#8e96a4" stroke-width="1.5"/>
    `;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 520" width="100%" height="100%">
  <defs>
    <!-- Deep Navy Blue Gradient -->
    <linearGradient id="navyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1f375b"/>
      <stop offset="40%" stop-color="#162a47"/>
      <stop offset="100%" stop-color="#0f1b2e"/>
    </linearGradient>

    <!-- Metallic Silver Grey Gradient -->
    <linearGradient id="silverGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#d4d8e0"/>
      <stop offset="35%" stop-color="#b0b7c3"/>
      <stop offset="70%" stop-color="#8e96a4"/>
      <stop offset="100%" stop-color="#707783"/>
    </linearGradient>

    <!-- Soft Drop Shadow -->
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#091322" flood-opacity="0.25"/>
    </filter>
  </defs>

  <!-- Clean Studio Background -->
  <rect width="400" height="520" fill="#f8fafc"/>
  
  <!-- Subtle Studio Pedestal Shadow -->
  <ellipse cx="200" cy="485" rx="110" ry="14" fill="#cbd5e1" opacity="0.4" filter="blur(6px)"/>

  <!-- Product Container Structure -->
  ${containerMarkup}

  <!-- BOVATO MEN Branding & Labeling -->
  <g text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif">
    <!-- Brand Logo Header -->
    <text x="200" y="275" font-size="21" font-weight="900" fill="#ffffff" letter-spacing="3">BOVATO<tspan font-size="10" dy="-8">™</tspan></text>
    <text x="200" y="292" font-size="10" font-weight="700" fill="#cbd5e1" letter-spacing="4">MEN</text>
    <line x1="160" y1="300" x2="240" y2="300" stroke="#334e77" stroke-width="1.5"/>

    <!-- Product Subtitle / Highlight Title -->
    <text x="200" y="325" font-size="11" font-weight="800" fill="#ffffff" letter-spacing="1.5">${subtitle.toUpperCase()}</text>
    <text x="200" y="348" font-size="15" font-weight="900" fill="#00b4d8" letter-spacing="1">${title.toUpperCase()}</text>

    <line x1="145" y1="362" x2="255" y2="362" stroke="#334e77" stroke-width="1"/>

    <!-- Ingredients Info -->
    <text x="200" y="380" font-size="9" font-weight="700" fill="#94a3b8" letter-spacing="1">WITH</text>
    <text x="200" y="394" font-size="10" font-weight="800" fill="#ffffff" letter-spacing="0.8">${ingredients.toUpperCase()}</text>

    <!-- Volume / Weight -->
    <text x="200" y="425" font-size="9.5" font-weight="600" fill="#cbd5e1" letter-spacing="1">${volume}</text>
  </g>
</svg>`;
}

const productsToGenerate = [
  {
    filename: 'anti-pollution-face-wash.svg',
    shape: 'tube',
    title: 'Face Wash',
    subtitle: 'Anti-Pollution',
    ingredients: 'Niacinamide + Moringa',
    volume: '100 ml / 3.38 fl. oz.'
  },
  {
    filename: 'detan-pack.svg',
    shape: 'jar',
    title: 'De-Tan Pack',
    subtitle: 'Tan Reset',
    ingredients: 'Kaolin Clay + Pea Extract',
    volume: '100 ML'
  },
  {
    filename: 'beard-wash.svg',
    shape: 'jar',
    title: 'Beard Wash',
    subtitle: 'Beard Recharge',
    ingredients: 'Biotin + Caffeine Complex',
    volume: '100 ML'
  },
  {
    filename: 'skin-brightening-cream.svg',
    shape: 'jar',
    title: 'Skin Brightening Cream',
    subtitle: 'Advanced Radiance',
    ingredients: 'Vitamin C + Niacinamide',
    volume: '50 GM'
  },
  {
    filename: 'body-lotion.svg',
    shape: 'pump-bottle',
    title: 'Body Lotion',
    subtitle: 'SPF 35 Defense',
    ingredients: 'Niacinamide + Almond Oil',
    volume: '200 ML'
  },
  {
    filename: 'vitamin-c-serum.svg',
    shape: 'dropper-bottle',
    title: 'Face Serum',
    subtitle: 'Vitamin C 15% Glow',
    ingredients: 'Vitamin C + Hyaluronic Acid',
    volume: '30 ML'
  },
  {
    filename: 'beard-growth-oil.svg',
    shape: 'dropper-bottle',
    title: 'Beard Growth Oil',
    subtitle: 'Follicle Booster',
    ingredients: 'Castor Oil + Argan + Biotin',
    volume: '30 ML'
  },
  {
    filename: 'niacinamide-serum.svg',
    shape: 'pump-bottle',
    title: 'Face Serum 10%',
    subtitle: 'Anti-Acne & Pore Control',
    ingredients: 'Niacinamide + Zinc 1%',
    volume: '30 ML'
  },
  {
    filename: 'hair-fall-shampoo.svg',
    shape: 'pump-bottle',
    title: 'Hair Fall Shampoo',
    subtitle: 'Root Fortifying',
    ingredients: 'Pro-Keratin + Biotin',
    volume: '300 ML'
  },
  {
    filename: 'under-eye-cream.svg',
    shape: 'jar',
    title: 'Under Eye Cream',
    subtitle: 'Dark Circle Reset',
    ingredients: 'Peptides + Caffeine + Vit K',
    volume: '15 ML'
  },
  {
    filename: 'hair-growth-serum.svg',
    shape: 'dropper-bottle',
    title: 'Scalp Growth Serum',
    subtitle: 'Follicle Activator',
    ingredients: 'Biotin + Saw Palmetto',
    volume: '50 ML'
  },
  {
    filename: 'face-scrub.svg',
    shape: 'tube',
    title: 'De-Tan Face Scrub',
    subtitle: 'Exfoliating Detox',
    ingredients: 'Charcoal + Walnut Shell',
    volume: '150 ML'
  },
  {
    filename: 'beard-balm.svg',
    shape: 'jar',
    title: 'Beard Styling Balm',
    subtitle: 'Shape & Condition',
    ingredients: 'Shea Butter + Beeswax',
    volume: '50 GM'
  },
  {
    filename: 'charcoal-face-wash.svg',
    shape: 'tube',
    title: 'Charcoal Face Wash',
    subtitle: 'Deep Pore Cleansing',
    ingredients: 'Activated Charcoal + Salicylic',
    volume: '100 ML'
  },
  {
    filename: 'lip-balm.svg',
    shape: 'stick',
    title: 'Repair Lip Balm',
    subtitle: 'Matte Moisture',
    ingredients: 'Shea Butter + Vitamin E',
    volume: '10 GM'
  }
];

productsToGenerate.forEach((p) => {
  const svgContent = generateProductSVG(p);
  const filePath = path.join(targetDir, p.filename);
  fs.writeFileSync(filePath, svgContent, 'utf-8');
  console.log(`Generated: ${p.filename}`);
});

console.log('✅ All 15 Product SVGs successfully created!');
