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

// -------------------
// Public Routes
// -------------------

router.post('/register', register);
router.post('/login', login);
router.post('/verify-otp', verifyOTP);
router.post('/resend-otp', resendOTP);

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
