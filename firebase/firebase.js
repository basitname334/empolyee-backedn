// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCkH9Y2KVCuzjxsRGTQFG5wa0yhWAdjNxQ",
  authDomain: "employee-42033.firebaseapp.com",
  projectId: "employee-42033",
  storageBucket: "employee-42033.firebasestorage.app",
  messagingSenderId: "573790334198",
  appId: "1:573790334198:web:79ed707fb0447d52bd10d7",
  measurementId: "G-VH8YFHVWLD"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);