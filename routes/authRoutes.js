const express = require('express');
const router = express.Router();

const { 
  register, 
  login, 
  verifyOTP, 
  resendOTP, 
  getProfile, 
  getAllUsers,
  acceptTerms,
  determineQuestionnaire
} = require('../controllers/authController');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

// -------------------
// Public Routes
// -------------------

router.post('/register', register);
router.post('/login', login);
router.post('/verify-otp', verifyOTP);
router.post('/resend-otp', resendOTP);
router.post('/forget-password', async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;

    if (!email || !currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false,
        message: 'Email, currentPassword, and newPassword are required' 
      });
    }

    // Find user by email (case-insensitive)
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ 
        success: false,
        message: 'Current password is incorrect' 
      });
    }

    // Validate new password
    if (newPassword.length < 8) {
      return res.status(400).json({ 
        success: false,
        message: 'New password must be at least 8 characters long' 
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    user.password = hashedPassword;
    await user.save();

    res.status(200).json({ 
      success: true,
      message: 'Password updated successfully' 
    });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
});




router.post('/store_socket_id', async (req, res) => {
  try {
    const { userId, socketId } = req.body;

    if (!userId || !socketId) {
      return res.status(400).json({
        success: false,
        message: 'User ID and Socket ID are required',
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { socketId, isOnline: true, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Socket ID updated successfully',
      data: {
        userId: updatedUser._id,
        socketId: updatedUser.socketId,
        isOnline: updatedUser.isOnline,
      },
    });
  } catch (error) {
    console.error('Error updating socket ID:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});

// Fetch online users
router.get('/online-users', async (req, res) => {
  try {
    const onlineUsers = await User.find({ isOnline: true, role: 'user' }, '_id socketId role');
    res.status(200).json({
      success: true,
      message: 'Online users fetched successfully',
      data: onlineUsers,
    });
  } catch (error) {
    console.error('Error fetching online users:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});
// Backend: routes/auth.js
router.post('/leave', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { socketId: null, isOnline: false, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'User disconnected successfully',
      data: {
        userId: updatedUser._id,
        socketId: updatedUser.socketId,
        isOnline: updatedUser.isOnline,
      },
    });
  } catch (error) {
    console.error('Error disconnecting user:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});
// Fetch online doctors
router.get('/online-doctors', async (req, res) => {
  try {
    const onlineDoctors = await User.find({ isOnline: true, role: 'doctor' }, '_id socketId role');
    res.status(200).json({
      success: true,
      message: 'Online doctors fetched successfully',
      data: onlineDoctors,
    });
  } catch (error) {
    console.error('Error fetching online doctors:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});
// Optional: Fallback GET for /login to prevent 404s from browser misfires
router.get('/login', (req, res) => {
  res.status(400).json({ 
    success: false,
    message: 'Invalid method. Use POST /api/auth/login to authenticate.' 
  });
});

// Test route for health check
router.get('/test', (req, res) => {
  res.status(200).json({ message: 'Auth test route working' });
});

// -------------------
// Debug Registered Routes (for dev only)
// -------------------

if (process.env.NODE_ENV !== 'production') {
  console.log('✅ Auth routes registered:');
  router.stack
    .filter(r => r.route)
    .forEach(r => {
      const method = r.route.stack[0].method.toUpperCase();
      const path = r.route.path;
      console.log(`   ${method} ${path}`);
    });
}

module.exports = router;
