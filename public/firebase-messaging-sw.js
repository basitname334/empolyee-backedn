// public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyCkH9Y2KVCuzjxsRGTQFG5wa0yhWAdjNxQ",
  authDomain: "employee-42033.firebaseapp.com",
  projectId: "employee-42033",
  storageBucket: "employee-42033.firebasestorage.app",
  messagingSenderId: "573790334198",
  appId: "1:573790334198:web:79ed707fb0447d52bd10d7"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('Received background message ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/firebase-logo.png', // Add your app icon
    badge: '/firebase-logo.png',
    tag: 'notification-tag'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});