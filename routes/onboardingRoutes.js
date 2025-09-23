const express = require('express');
const router = express.Router();
const {
  storeOnboardingStep,
  storeMultipleOnboardingSteps,
  getUserOnboardingProgress,
  getOnboardingStep,
  deleteOnboardingStep
} = require('../controllers/onboardingController');
router.get('/', (req,res)=>{
    res.send("onboarding routes")
})
// Store single onboarding step
router.post('/store', storeOnboardingStep);

// Store multiple onboarding steps (bulk operation)
router.post('/store-multiple', storeMultipleOnboardingSteps);

// Get user's complete onboarding progress
router.get('/progress/:userId', getUserOnboardingProgress);

// Get specific step data
router.get('/step/:userId/:step', getOnboardingStep);

// Delete specific step
router.delete('/step/:userId/:step', deleteOnboardingStep);

// Health check route
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Onboarding routes are working',
    timestamp: new Date().toISOString()
  });
});

if (process.env.NODE_ENV !== 'production') {
  console.log('✅ Onboarding routes registered:');
  router.stack
    .filter(r => r.route)
    .forEach(r => {
      const method = r.route.stack[0].method.toUpperCase();
      const path = r.route.path;
      console.log(`   ${method} ${path}`);
    });
}

module.exports = router;
