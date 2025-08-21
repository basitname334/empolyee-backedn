// backend/routes/notifications.js
const express = require('express');
const router = express.Router();
const firebaseService = require('../services/firebaseService');
const auth = require('../middleware/auth'); // Your auth middleware

// Store FCM token
router.post('/fcm-token', auth, async (req, res) => {
  try {
    const { fcmToken } = req.body;
    const userId = req.user.id;
    
    await firebaseService.storeFCMToken(userId, fcmToken);
    res.json({ success: true, message: 'FCM token stored successfully' });
  } catch (error) {
    console.error('Error storing FCM token:', error);
    res.status(500).json({ error: 'Failed to store FCM token' });
  }
});

// Send identity request notification (Admin to User)
router.post('/request-identity/:reportId', auth, async (req, res) => {
  try {
    const { reportId } = req.params;
    const adminUser = req.user;
    
    // Get report details from your MongoDB
    const report = await Report.findById(reportId).populate('user');
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    if (adminUser.role !== 'admin' && adminUser.role !== 'doctor') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const targetUserId = report.user._id.toString();
    const fcmToken = await firebaseService.getUserFCMToken(targetUserId);

    // Create notification data
    const notificationData = {
      type: 'identity_request',
      title: 'Identity Request',
      message: `${adminUser.name} has requested your identity for incident ${report._id.slice(0, 6)}`,
      data: {
        reportId: report._id.toString(),
        incidentId: `#${report._id.slice(0, 6)}`,
        adminId: adminUser.id,
        adminName: adminUser.name
      }
    };

    // Store notification in Firestore
    const notificationId = await firebaseService.createNotification(targetUserId, notificationData);

    // Send push notification if FCM token exists
    if (fcmToken) {
      await firebaseService.sendPushNotification(fcmToken, notificationData);
    }

    res.json({ 
      success: true, 
      message: 'Identity request sent successfully',
      notificationId 
    });
  } catch (error) {
    console.error('Error sending identity request:', error);
    res.status(500).json({ error: 'Failed to send identity request' });
  }
});

// Respond to identity request (User to Admin)
router.post('/identity-response/:notificationId', auth, async (req, res) => {
  try {
    const { notificationId } = req.params;
    const { approved, reportId } = req.body;
    const user = req.user;

    // Mark original notification as read
    await firebaseService.markAsRead(notificationId);

    // Update report identity status in MongoDB
    await Report.findByIdAndUpdate(reportId, {
      identityStatus: approved ? 'provided' : 'declined'
    });

    // Get report and admin details
    const report = await Report.findById(reportId);
    const adminUser = await User.findOne({ 
      $or: [{ role: 'admin' }, { role: 'doctor' }] 
    });

    if (adminUser) {
      const adminFCMToken = await firebaseService.getUserFCMToken(adminUser._id.toString());

      // Create response notification for admin
      const responseNotificationData = {
        type: 'identity_response',
        title: 'Identity Response',
        message: `${user.name} has ${approved ? 'provided' : 'declined'} identity for incident ${report._id.slice(0, 6)}`,
        data: {
          reportId: report._id.toString(),
          incidentId: `#${report._id.slice(0, 6)}`,
          userId: user.id,
          userName: user.name,
          approved: approved.toString()
        }
      };

      // Store admin notification
      const adminNotificationId = await firebaseService.createNotification(
        adminUser._id.toString(), 
        responseNotificationData
      );

      // Send push notification to admin
      if (adminFCMToken) {
        await firebaseService.sendPushNotification(adminFCMToken, responseNotificationData);
      }
    }

    res.json({ 
      success: true, 
      message: `Identity ${approved ? 'provided' : 'declined'} successfully` 
    });
  } catch (error) {
    console.error('Error responding to identity request:', error);
    res.status(500).json({ error: 'Failed to respond to identity request' });
  }
});

// Get user notifications
router.get('/user/:userId', auth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Check authorization
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const notifications = await firebaseService.getUserNotifications(userId);
    res.json({ notifications });
  } catch (error) {
    console.error('Error getting notifications:', error);
    res.status(500).json({ error: 'Failed to get notifications' });
  }
});

// Mark notification as read
router.patch('/read/:notificationId', auth, async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    await firebaseService.markAsRead(notificationId);
    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

module.exports = router;