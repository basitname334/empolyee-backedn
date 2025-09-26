const mongoose = require('mongoose');

let isConnected = false;
let retryCount = 0;
const maxRetries = 5;

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000, // Wait 5s before retrying
    });
    isConnected = true; // Set connection status to true
    console.log("✅ MongoDB Connected...");
    console.log("✅ Database connection status: READY");
    
    // Add connection event listeners
    mongoose.connection.on('connected', () => {
      isConnected = true;
      console.log('🟢 MongoDB connection established');
    });
    
    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      console.log('🟡 MongoDB disconnected');
    });
    
    mongoose.connection.on('error', (err) => {
      isConnected = false;
      console.error('🔴 MongoDB connection error:', err);
    });
    
  } catch (error) {
    isConnected = false; // Set connection status to false on error
    console.error("❌ MongoDB Connection Error:", error.message);
    // Retry after 5 seconds
    setTimeout(connectDB, 5000);
  }
};

// Export connection status checker
const isDBConnected = () => isConnected;

module.exports = { connectDB, isDBConnected };