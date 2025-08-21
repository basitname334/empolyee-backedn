// backend/services/firebaseService.js
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
const serviceAccount = require('../path-to-your-service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'your-project-id'
});

const db = admin.firestore();
const messaging = admin.messaging();

class FirebaseService {
  
  // Create notification document in Firestore
  async createNotification(userId, notification) {
    try {
      const notificationRef = db.collection('notifications').doc();
      const notificationData = {
        id: notificationRef.id,
        userId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data || {},
        read: false,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      };
      
      await notificationRef.set(notificationData);
      return notificationRef.id;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  // Send push notification to specific user
  async sendPushNotification(fcmToken, notification) {
    try {
      const message = {
        notification: {
          title: notification.title,
          body: notification.message
        },
        data: {
          type: notification.type,
          ...notification.data
        },
        token: fcmToken
      };

      const response = await messaging.send(message);
      console.log('Successfully sent message:', response);
      return response;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  // Get user notifications
  async getUserNotifications(userId) {
    try {
      const snapshot = await db.collection('notifications')
        .where('userId', '==', userId)
        .orderBy('timestamp', 'desc')
        .get();
      
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting notifications:', error);
      throw error;
    }
  }

  // Mark notification as read
  async markAsRead(notificationId) {
    try {
      await db.collection('notifications').doc(notificationId).update({
        read: true,
        readAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  // Store user FCM token
  async storeFCMToken(userId, fcmToken) {
    try {
      await db.collection('users').doc(userId).update({
        fcmToken,
        tokenUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.error('Error storing FCM token:', error);
      throw error;
    }
  }

  // Get user FCM token
  async getUserFCMToken(userId) {
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      return userDoc.exists ? userDoc.data()?.fcmToken : null;
    } catch (error) {
      console.error('Error getting FCM token:', error);
      throw error;
    }
  }
}

module.exports = new FirebaseService();