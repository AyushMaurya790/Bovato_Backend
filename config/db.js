const mongoose = require('mongoose');
const dns = require('dns');

// Prioritize IPv4 to prevent Atlas shard host DNS timeouts
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

// Increase buffer timeout to 30s to prevent early query timeout on cold starts
mongoose.set('bufferTimeoutMS', 30000);

// Global connection event listeners to prevent unhandled error event crashes
mongoose.connection.on('error', (err) => {
  console.warn('⚠️ [MongoDB Connection Warning]:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ [MongoDB Disconnected] Driver is attempting reconnection...');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ [MongoDB Reconnected]');
});

const connectDB = async () => {
  try {
    const mongoUri = (process.env.MONGO_URI || '').trim();
    const options = {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      family: 4, // Force IPv4 to prevent ENOTFOUND on Atlas shard nodes
      maxPoolSize: 10,
      retryWrites: true,
      w: 'majority',
    };

    const conn = await mongoose.connect(mongoUri, options);

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
};

module.exports = connectDB;
