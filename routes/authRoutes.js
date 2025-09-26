const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Poll = require('../models/PollSchema');
const validator = require('validator');
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
const {
  storeOnboardingStep,
  hasOnboardingStep,
  getUserOnboardingSteps,
  storeMultipleOnboardingSteps,
  getUserOnboardingProgress,
  getOnboardingStep,
  deleteOnboardingStep
} = require('../controllers/onboardingController');
require('dotenv').config();
/// Validate environment variables
// if (!process.env.EMAIL_HOST || !process.env.EMAIL_PORT || !process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
//   console.error('Missing required email environment variables');
//   process.exit(1);
// }

// Email configuration
// Configure Nodemailer transporter (example for Gmail)
const transporter = nodemailer.createTransport({
  service: 'gmail', // Use 'smtp' for custom SMTP server
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465, false for 587 with STARTTLS
  auth: {
    user: process.env.EMAIL_USER, // e.g., 'halfmina368@gmail.com'
    pass: process.env.EMAIL_PASSWORD, // App-specific password for Gmail
  },
  tls: {
    rejectUnauthorized: false, // For development; remove in production
  },
});

// Verify transporter configuration
transporter.verify((error, success) => {
  if (error) {
    console.error('SMTP configuration error:', error);
  } else {
    console.log('SMTP server is ready to send emails');
  }
});
// -------------------
// Public Routes
// -------------------

router.post('/register', register);
router.post('/login', login);
router.post('/verify-otp', verifyOTP);
router.post('/resend-otp', resendOTP);
router.post('/store', storeOnboardingStep);
router.get('/check_onboard', hasOnboardingStep);
router.get('/get_onboard_data', getUserOnboardingSteps)

// Forgot Password
// Forgot Password



// Verify transporter configuration
transporter.verify((error, success) => {
  if (error) {
    console.error('SMTP Transporter Error:', error);
  } else {
    console.log('SMTP Transporter is ready');
  }
});

// Forgot Password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email
    if (!email || !validator.isEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    
    // Prevent email enumeration
  if (!user) {
  return res.status(404).json({
    success: false,
    message: 'No account found with that email',
  });
}


    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Set token and expiry on user
    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour expiry
    await user.save({ validateBeforeSave: false });


    // Use environment variable for frontend URL
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;

    const mailOptions = {
      from: `"${process.env.APP_NAME || 'Employee Health'}" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Password Reset Request',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #2563eb;">Password Reset Request</h2>
          <p>You requested a password reset for your account. Click the button below to reset your password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background-color: #2563eb; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p style="color: #666;">This link will expire in 1 hour.</p>
          <p style="color: #666;">If you didn't request this, please ignore this email and your password will remain unchanged.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
          <p style="color: #999; font-size: 12px;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <a href="${resetUrl}">${resetUrl}</a>
          </p>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      return res.status(500).json({
        success: false,
        message: 'Failed to send reset email. Please try again later.',
      });
    }

    res.status(200).json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent',
    });
  } catch (error) {
    console.error('Error in forgot password:', error.message, error.stack);
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.',
    });
  }
});

// Reset Password
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword, confirmPassword } = req.body;

    // Validate inputs
    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ 
        success: false,
        message: 'Both password fields are required' 
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ 
        success: false,
        message: 'Passwords do not match' 
      });
    }

    // Enhanced password validation
    if (!validator.isStrongPassword(newPassword, {
      minLength: 8,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1,
    })) {
      return res.status(400).json({ 
        success: false,
        message: 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character' 
      });
    }

    const resetTokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordToken: resetTokenHash,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid or expired reset token' 
      });
    }

    // Check if new password is same as current password
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({ 
        success: false,
        message: 'New password must be different from your current password' 
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update user
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.passwordChangedAt = new Date();
    await user.save({ validateBeforeSave: false });


    res.status(200).json({ 
      success: true,
      message: 'Password reset successfully. You can now login with your new password.' 
    });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error. Please try again later.' 
    });
  }
});
router.post('/change-password', async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;

    if (!email || !currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false,
        message: 'Email, currentPassword, and newPassword are required' 
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ 
        success: false,
        message: 'Current password is incorrect' 
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ 
        success: false,
        message: 'New password must be at least 8 characters long' 
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

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

router.get('/online-doctors', async (req, res) => {
  try {
 const onlineDoctorsAndAdmins = await User.find(
  { 
    isOnline: true, 
    role: { $in: ['doctor', 'admin'] } 
  },
  '_id socketId role'
)

    res.status(200).json({
      success: true,
      message: 'Online doctors fetched successfully',
      data: onlineDoctorsAndAdmins,
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


router.get('/login', (req, res) => {
  res.status(400).json({ 
    success: false,
    message: 'Invalid method. Use POST /api/auth/login to authenticate.' 
  });
});

// Poll response endpoint
router.post('/poll-choose', async (req, res) => {
  try {
    const { userId, pollId, selectedChoice } = req.body;

    // Validate required fields
    if (!userId || !pollId || !selectedChoice) {
      return res.status(400).json({
        success: false,
        message: 'userId, pollId, and selectedChoice are required'
      });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if poll exists
    const poll = await Poll.findById(pollId);
    if (!poll) {
      return res.status(404).json({
        success: false,
        message: 'Poll not found'
      });
    }

    // Check if choice exists in poll
    const choiceExists = poll.choices.some(choice => 
      choice.text === selectedChoice || choice._id.toString() === selectedChoice
    );
    
    if (!choiceExists) {
      return res.status(400).json({
        success: false,
        message: 'Invalid choice for this poll'
      });
    }

    // Initialize pollResponses if it doesn't exist
    if (!user.pollResponses) {
      user.pollResponses = new Map();
    }

    // Store the response
    user.pollResponses.set(pollId.toString(), {
      pollId: pollId,
      selectedChoice: selectedChoice,
      respondedAt: new Date()
    });

    // Save user with updated poll responses
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Poll response saved successfully',
      data: {
        pollId: pollId,
        selectedChoice: selectedChoice,
        respondedAt: new Date()
      }
    });

  } catch (error) {
    console.error('Error saving poll response:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Get user's poll responses
router.get('/poll-responses/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get user's poll responses
    const pollResponses = user.pollResponses || new Map();
    
    // Convert Map to Object for JSON response
    const responsesObject = {};
    pollResponses.forEach((value, key) => {
      responsesObject[key] = {
        pollId: value.pollId,
        selectedChoice: value.selectedChoice,
        respondedAt: value.respondedAt
      };
    });

    res.status(200).json({
      success: true,
      message: 'Poll responses fetched successfully',
      data: responsesObject
    });

  } catch (error) {
    console.error('Error fetching poll responses:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

router.get('/test', (req, res) => {
  res.status(200).json({ message: 'Auth test route working' });
});

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