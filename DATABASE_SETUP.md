# Database Configuration Guide

## 🔧 **MongoDB Setup (Backend)**

### Step 1: Create MongoDB Atlas Account
1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Sign up for a free account
3. Create a new cluster (choose the free tier)
4. Choose a region close to you
5. Create cluster (takes 3-5 minutes)

### Step 2: Get MongoDB Connection String
1. Click "Connect" on your cluster
2. Choose "Connect your application"
3. Copy the connection string (it looks like):
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

### Step 3: Create .env File
Create a file called `.env` in the `backend` folder with this content:

```env
# MongoDB Configuration - REPLACE WITH YOUR ACTUAL VALUES
MONGODB_URL=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/phishing_detection?retryWrites=true&w=majority

# Database Settings
DATABASE_NAME=phishing_detection

# API Settings
API_HOST=0.0.0.0
API_PORT=3000

# Security
SECRET_KEY=your-secret-key-here-change-this

# Ollama Settings (for AI alerts)
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3:8b

# Development
DEBUG=True
```

### Step 4: Update MongoDB Connection
Replace these values in your `.env` file:
- `username` - Your MongoDB Atlas username
- `password` - Your MongoDB Atlas password
- `cluster0.xxxxx` - Your actual cluster URL
- `your-secret-key-here-change-this` - A random secret key

---

## 🔥 **Firebase Setup (Frontend)**

### Step 1: Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" or "Add project"
3. Enter project name: `phishing-detection-ai`
4. Enable Google Analytics (optional)
5. Click "Create project"

### Step 2: Enable Authentication
1. In your Firebase project, go to "Authentication" in the left sidebar
2. Click "Get started"
3. Go to "Sign-in method" tab
4. Enable "Email/Password" authentication
5. Click "Save"

### Step 3: Create Firestore Database
1. Go to "Firestore Database" in the left sidebar
2. Click "Create database"
3. Choose "Start in test mode" (for development)
4. Select a location (choose closest to your users)
5. Click "Done"

### Step 4: Get Firebase Configuration
1. Go to Project Settings (gear icon)
2. Scroll down to "Your apps" section
3. Click "Web" icon (`</>`)
4. Enter app nickname: `phishing-detection-web`
5. Click "Register app"
6. Copy the Firebase configuration object

### Step 5: Update Frontend Configuration
Edit `frontend/firebase-config.js` and replace the placeholder values:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", // Replace with your API key
  authDomain: "phishing-detection-ai.firebaseapp.com", // Replace with your project domain
  projectId: "phishing-detection-ai", // Replace with your project ID
  storageBucket: "phishing-detection-ai.appspot.com", // Replace with your storage bucket
  messagingSenderId: "123456789012", // Replace with your sender ID
  appId: "1:123456789012:web:abcdefghijklmnopqrstuvwxyz" // Replace with your app ID
};
```

---

## 🚀 **Quick Setup Commands**

### For MongoDB:
1. Create `.env` file in `backend` folder
2. Add your MongoDB connection string
3. Restart backend server

### For Firebase:
1. Update `frontend/firebase-config.js` with your config
2. Refresh frontend page
3. Test sign up/sign in

---

## ✅ **Testing Your Setup**

### Test MongoDB Connection:
```bash
cd backend
python -c "from app.db import get_database; print('MongoDB connected successfully!')"
```

### Test Firebase Connection:
1. Open frontend in browser
2. Open browser console (F12)
3. Try signing up with a test email
4. Check Firebase Console for new user

---

## 🔧 **Troubleshooting**

### MongoDB Issues:
- Check your connection string format
- Verify username/password are correct
- Ensure IP is whitelisted in MongoDB Atlas
- Check if cluster is running

### Firebase Issues:
- Verify all config values are correct
- Check if Email/Password auth is enabled
- Look for CORS errors in browser console
- Ensure Firestore rules allow access

---

## 📋 **What You Need to Do:**

1. **MongoDB Atlas:**
   - Create account and cluster
   - Get connection string
   - Create `.env` file in backend folder
   - Add your MongoDB URL

2. **Firebase:**
   - Create Firebase project
   - Enable Email/Password auth
   - Create Firestore database
   - Get Firebase config
   - Update `frontend/firebase-config.js`

3. **Test Both:**
   - Restart backend server
   - Refresh frontend
   - Try creating an account
   - Test email analysis

Your app will then have:
- ✅ User authentication (Firebase)
- ✅ Data persistence (MongoDB)
- ✅ Email analysis (Backend API)
- ✅ Beautiful landing page (Frontend)
