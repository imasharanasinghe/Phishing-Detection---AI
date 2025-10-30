// Firebase Configuration
// Your actual Firebase project credentials
const firebaseConfig = {
  apiKey: "AIzaSyDsMfis_O6zi9_2b_a3MvFFzAH0xga8h_M",
  authDomain: "phishing-detection-ai.firebaseapp.com",
  projectId: "phishing-detection-ai",
  storageBucket: "phishing-detection-ai.firebasestorage.app",
  messagingSenderId: "360977256914",
  appId: "1:360977256914:web:383f60bde5b0d9515a780b",
  measurementId: "G-CGLMJMPN9J"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = firebase.auth();
const db = firebase.firestore();

// Export for use in other files
window.auth = auth;
window.db = db;
