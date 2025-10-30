# Firebase Setup Guide for Phishing Detection AI

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" or "Add project"
3. Enter project name: `phishing-detection-ai`
4. Enable Google Analytics (optional)
5. Click "Create project"

## Step 2: Enable Authentication

1. In your Firebase project, go to "Authentication" in the left sidebar
2. Click "Get started"
3. Go to "Sign-in method" tab
4. Enable "Email/Password" authentication
5. Click "Save"

## Step 3: Create Firestore Database

1. Go to "Firestore Database" in the left sidebar
2. Click "Create database"
3. Choose "Start in test mode" (for development)
4. Select a location (choose closest to your users)
5. Click "Done"

## Step 4: Get Firebase Configuration

1. Go to Project Settings (gear icon)
2. Scroll down to "Your apps" section
3. Click "Web" icon (`</>`)
4. Enter app nickname: `phishing-detection-web`
5. Click "Register app"
6. Copy the Firebase configuration object

## Step 5: Update Frontend Configuration

Replace the placeholder values in `frontend/firebase-config.js` with your actual Firebase config:

```javascript
const firebaseConfig = {
  apiKey: "your-actual-api-key",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};
```

## Step 6: Set Up Firestore Security Rules

In Firestore Database > Rules, replace the default rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only access their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Email analysis results (optional - for future features)
    match /emails/{emailId} {
      allow read, write: if request.auth != null && 
        request.auth.uid == resource.data.userId;
    }
  }
}
```

## Step 7: Test the Setup

1. Start your backend server: `cd backend && python -m uvicorn app.main:app --reload --port 3000`
2. Start your frontend server: `cd frontend && python -m http.server 8081`
3. Open `http://localhost:8081/phishing-detection-ai-starter/frontend/index.html`
4. Try signing up with a test email
5. Check Firebase Console to see if the user was created

## Step 8: Production Considerations

### Security Rules for Production
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && 
        request.auth.uid == userId &&
        request.auth.token.email_verified == true;
    }
  }
}
```

### Environment Variables
For production, consider using environment variables:

```javascript
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};
```

## Troubleshooting

### Common Issues:

1. **"Firebase not initialized" error**
   - Make sure you've updated `firebase-config.js` with your actual config
   - Check that Firebase SDK is loaded before your scripts

2. **Authentication not working**
   - Verify Email/Password is enabled in Firebase Console
   - Check browser console for specific error messages

3. **Firestore permission denied**
   - Update your Firestore security rules
   - Make sure user is authenticated before accessing data

4. **CORS errors**
   - Add your domain to Firebase authorized domains
   - Go to Authentication > Settings > Authorized domains

### Testing Commands:

```bash
# Test Firebase connection
curl -X GET "https://your-project-id.firebaseio.com/.json"

# Test authentication (in browser console)
firebase.auth().signInWithEmailAndPassword('test@example.com', 'password123')
```

## Next Steps

1. **Email Verification**: Add email verification flow
2. **Password Reset**: Implement password reset functionality  
3. **User Profiles**: Add user profile management
4. **Analytics**: Integrate Firebase Analytics
5. **Push Notifications**: Add real-time notifications
6. **Offline Support**: Enable offline data persistence

## Support

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firebase Auth Guide](https://firebase.google.com/docs/auth)
- [Firestore Documentation](https://firebase.google.com/docs/firestore)
