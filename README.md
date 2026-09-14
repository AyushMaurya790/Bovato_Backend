# BOVATO Backend API

Complete Node.js + Express + MongoDB backend for BOVATO E-commerce platform with authentication, products, cart, wishlist, orders, and quiz functionality.

## 🚀 Features

- **User Authentication** - JWT-based signup/login
- **User Profile Management** - Multiple addresses, profile updates
- **Product Catalog** - Full CRUD with filtering, sorting, search
- **Shopping Cart** - Add, update, remove items
- **Wishlist** - Save favorite products
- **Order Management** - Complete checkout flow with multiple payment methods
- **Quiz System** - Personalized product recommendations
- **Secure** - Password hashing, JWT tokens, input validation

## � Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or Atlas)
- npm or yarn

## 🛠️ Installation

1. **Install Dependencies**
```bash
cd B-Backend
npm install
```

2. **Environment Setup**
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
NODE_ENV=development
PORT=5000
MONGO_URI=mongodb://localhost:27017/bovato
JWT_SECRET=your_secret_key_here
JWT_EXPIRE=30d
CLIENT_URL=http://localhost:5173
```

3. **Start MongoDB**
```bash
# If using local MongoDB
mongod
```

4. **Seed Database** (Optional)
```bash
npm run seed
```

5. **Start Server**
```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

Server will run on `http://localhost:5000`

## 📚 API Endpoints

### Authentication (`/api/auth`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/signup` | Register new user | Public |
| POST | `/login` | Login user | Public |
| GET | `/me` | Get current user | Private |

**Signup Request:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "9876543210",
  "password": "password123"
}
```

**Login Request:**
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

### User Profile (`/api/users`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| PUT | `/profile` | Update profile | Private |
| POST | `/addresses` | Add address | Private |
| PUT | `/addresses/:id` | Update address | Private |
| DELETE | `/addresses/:id` | Delete address | Private |

**Add Address Request:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "address": "123 Main Street",
  "city": "Mumbai",
  "state": "Maharashtra",
  "pin": "400001",
  "isDefault": true
}
```

### Products (`/api/products`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Get all products | Public |
| GET | `/:slug` | Get product by slug | Public |
| POST | `/` | Create product | Admin |
| PUT | `/:id` | Update product | Admin |
| DELETE | `/:id` | Delete product | Admin |

**Query Parameters for GET /**:
- `category` - Filter by category (Skin, Body, Hair, Beard, Lips)
- `concern` - Filter by concern (comma-separated)
- `sort` - Sort by (featured, price-asc, price-desc, rating, best-selling)
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)
- `search` - Search term

**Example:**
```
GET /api/products?category=Skin&concern=Acne,Oily Skin&sort=rating&page=1
```

### Cart (`/api/cart`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Get user's cart | Private |
| POST | `/items` | Add item to cart | Private |
| PUT | `/items/:productId` | Update item quantity | Private |
| DELETE | `/items/:productId` | Remove item | Private |
| DELETE | `/` | Clear cart | Private |

**Add to Cart Request:**
```json
{
  "productId": "648f1234567890abcdef1234",
  "qty": 2
}
```

### Wishlist (`/api/wishlist`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Get user's wishlist | Private |
| POST | `/:productId` | Add to wishlist | Private |
| DELETE | `/:productId` | Remove from wishlist | Private |
| PUT | `/:productId/toggle` | Toggle wishlist | Private |

### Orders (`/api/orders`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/` | Create order | Private |
| GET | `/:id` | Get order by ID | Private |
| GET | `/user/myorders` | Get user's orders | Private |
| PUT | `/:id/pay` | Update to paid | Private |
| PUT | `/:id/status` | Update order status | Admin |
| GET | `/` | Get all orders | Admin |

**Create Order Request:**
```json
{
  "orderItems": [
    {
      "product": "648f1234567890abcdef1234",
      "slug": "charcoal-face-wash",
      "name": "Charcoal Face Wash",
      "qty": 2,
      "image": "/images/product.jpg",
      "price": 449
    }
  ],
  "shippingAddress": {
    "firstName": "John",
    "lastName": "Doe",
    "address": "123 Main St",
    "city": "Mumbai",
    "state": "Maharashtra",
    "pin": "400001"
  },
  "contactInfo": {
    "email": "john@example.com",
    "phone": "9876543210"
  },
  "paymentMethod": "card",
  "itemsPrice": 898,
  "shippingPrice": 0,
  "totalPrice": 898
}
```

**Payment Methods:**
- `card` - Credit/Debit Card
- `upi` - UPI (GPay, PhonePe, Paytm)
- `cod` - Cash on Delivery

### Quiz (`/api/quiz`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/` | Save quiz result | Public |
| GET | `/:sessionId` | Get quiz by session | Public |
| GET | `/my-results` | Get user's quizzes | Private |

**Save Quiz Request:**
```json
{
  "sessionId": "unique-session-id",
  "answers": {
    "skin": "Oily",
    "concern": "Acne & breakouts",
    "hair": "Reduce hair fall",
    "lips": "Dark lips"
  },
  "concerns": ["Oily Skin", "Acne", "Hair Fall", "Dark Lips"]
}
```

## 🔐 Authentication

All private routes require a Bearer token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

**Example with curl:**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5000/api/cart
```

**Example with axios:**
```javascript
axios.get('/api/cart', {
  headers: { Authorization: `Bearer ${token}` }
})
```

## 💾 Database Models

### User
- name, email, phone, password (hashed)
- addresses[] (multiple shipping addresses)
- isAdmin flag

### Product
- slug, name, category, concern[]
- price, mrp, rating, reviews
- image, images[], description
- bullets[], ingredients[], howToUse[]
- badge, stock, isActive

### Cart
- user reference
- items[] (product, qty, price, name, image)

### Wishlist
- user reference
- products[] (array of product references)

### Order
- user, orderItems[]
- shippingAddress, contactInfo
- paymentMethod, paymentResult
- itemsPrice, shippingPrice, totalPrice
- isPaid, isDelivered, orderStatus
- trackingNumber

### QuizResult
- user (optional), sessionId
- answers, concerns[]
- recommendedProducts[]

## 🧪 Testing

Run the test script to verify all endpoints:

```bash
npm test
```

This will test:
- Health check
- Product listing
- User registration
- User login
- Add to cart
- Cart retrieval

## 📦 Project Structure

```
B-Backend/
├── config/
│   └── db.js                 # MongoDB connection
├── middleware/
│   ├── authMiddleware.js     # JWT authentication
│   ├── errorMiddleware.js    # Error handling
│   └── validateMiddleware.js # Request validation
├── models/
│   ├── User.js              # User model
│   ├── Product.js           # Product model
│   ├── Cart.js              # Cart model
│   ├── Wishlist.js          # Wishlist model
│   ├── Order.js             # Order model
│   └── QuizResult.js        # Quiz result model
├── routes/
│   ├── authRoutes.js        # Auth endpoints
│   ├── userRoutes.js        # User profile endpoints
│   ├── productRoutes.js     # Product CRUD
│   ├── cartRoutes.js        # Cart management
│   ├── wishlistRoutes.js    # Wishlist management
│   ├── orderRoutes.js       # Order management
│   └── quizRoutes.js        # Quiz endpoints
├── scripts/
│   ├── seed.js              # Database seeding
│   └── test-api.js          # API testing
├── utils/
│   └── generateToken.js     # JWT token generation
├── .env.example             # Environment template
├── .gitignore
├── package.json
├── server.js                # App entry point
└── README.md
```

## 🚢 Deployment

### Environment Variables
Set these in production:
- `NODE_ENV=production`
- `MONGO_URI` - Your MongoDB connection string
- `JWT_SECRET` - Strong secret key
- `CLIENT_URL` - Your frontend URL

### Using MongoDB Atlas

1. Create cluster at [mongodb.com/cloud/atlas](https://mongodb.com/cloud/atlas)
2. Get connection string
3. Update `MONGO_URI` in `.env`

### Deploy to Heroku

```bash
heroku create bovato-api
heroku config:set MONGO_URI=your_mongodb_uri
heroku config:set JWT_SECRET=your_secret
git push heroku main
```

## 📝 Common Issues

**MongoDB Connection Error:**
- Check MongoDB is running: `mongod`
- Verify MONGO_URI in `.env`

**JWT Token Expired:**
- Login again to get new token
- Adjust JWT_EXPIRE in `.env`

**Port Already in Use:**
- Change PORT in `.env`
- Kill process: `lsof -i :5000` then `kill -9 PID`

## 🔧 Development

**Add New Route:**
1. Create route file in `routes/`
2. Import in `server.js`
3. Add middleware: `app.use('/api/endpoint', route)`

**Add New Model:**
1. Create model in `models/`
2. Define schema with validation
3. Export mongoose model

## 📄 License

MIT

## 👥 Support

For issues or questions, create an issue on GitHub.

---

**Built with ❤️ for BOVATO E-commerce Platform**
