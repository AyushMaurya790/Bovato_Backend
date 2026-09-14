const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

const testAPI = async () => {
  console.log('🧪 Testing BOVATO API...\n');

  try {
    // 1. Health Check
    console.log('1️⃣ Health Check...');
    const health = await axios.get(`${BASE_URL}/health`);
    console.log('✅', health.data.message, '\n');

    // 2. Get Products
    console.log('2️⃣ Fetching Products...');
    const products = await axios.get(`${BASE_URL}/products`);
    console.log(`✅ Found ${products.data.products.length} products\n`);

    // 3. Register User
    console.log('3️⃣ Registering User...');
    const signupData = {
      name: 'Test User',
      email: `test${Date.now()}@example.com`,
      phone: `98765${Math.floor(10000 + Math.random() * 90000)}`,
      password: 'password123',
    };
    const signup = await axios.post(`${BASE_URL}/auth/signup`, signupData);
    const token = signup.data.token;
    console.log('✅ User registered:', signup.data.name, '\n');

    // 4. Get User Profile
    console.log('4️⃣ Fetching User Profile...');
    const profile = await axios.get(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log('✅ Profile:', profile.data.name, '\n');

    // 5. Add to Cart
    if (products.data.products.length > 0) {
      console.log('5️⃣ Adding Product to Cart...');
      const productId = products.data.products[0]._id;
      const cartAdd = await axios.post(
        `${BASE_URL}/cart/items`,
        { productId, qty: 2 },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log(`✅ Cart has ${cartAdd.data.items.length} items\n`);
    }

    // 6. Get Cart
    console.log('6️⃣ Fetching Cart...');
    const cart = await axios.get(`${BASE_URL}/cart`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log(`✅ Cart total: ₹${cart.data.subtotal}\n`);

    console.log('🎉 All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
};

testAPI();
