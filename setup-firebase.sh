#!/bin/bash

# Phishing Detection AI - Firebase Setup Script
# This script helps you set up Firebase for the Phishing Detection AI application

echo "🛡️  Phishing Detection AI - Firebase Setup"
echo "========================================"
echo ""

echo "📋 Prerequisites:"
echo "1. Google account"
echo "2. Backend server running on port 3000"
echo "3. Frontend server running on port 8081"
echo ""

echo "🚀 Step-by-Step Setup:"
echo ""

echo "1️⃣  Create Firebase Project:"
echo "   • Go to: https://console.firebase.google.com/"
echo "   • Click 'Create a project'"
echo "   • Name: phishing-detection-ai"
echo "   • Enable Google Analytics (optional)"
echo ""

echo "2️⃣  Enable Authentication:"
echo "   • Go to Authentication > Sign-in method"
echo "   • Enable 'Email/Password'"
echo "   • Click 'Save'"
echo ""

echo "3️⃣  Create Firestore Database:"
echo "   • Go to Firestore Database"
echo "   • Click 'Create database'"
echo "   • Choose 'Start in test mode'"
echo "   • Select location"
echo ""

echo "4️⃣  Get Firebase Config:"
echo "   • Go to Project Settings (gear icon)"
echo "   • Scroll to 'Your apps'"
echo "   • Click Web icon (</>)"
echo "   • App nickname: phishing-detection-web"
echo "   • Copy the config object"
echo ""

echo "5️⃣  Update Configuration:"
echo "   • Edit: frontend/firebase-config.js"
echo "   • Replace placeholder values with your config"
echo ""

echo "6️⃣  Test the Setup:"
echo "   • Open: http://localhost:8081/phishing-detection-ai-starter/frontend/index.html"
echo "   • Try signing up with a test email"
echo "   • Check Firebase Console for new user"
echo ""

echo "✅ Setup Complete!"
echo ""
echo "📚 For detailed instructions, see: FIREBASE_SETUP.md"
echo ""
echo "🔧 Troubleshooting:"
echo "   • Check browser console for errors"
echo "   • Verify Firebase config is correct"
echo "   • Ensure Email/Password auth is enabled"
echo "   • Check Firestore security rules"
echo ""

echo "🎉 Your Phishing Detection AI app is ready!"
echo "   Landing Page: http://localhost:8081/phishing-detection-ai-starter/frontend/index.html"
echo "   Backend API: http://localhost:3000"
echo ""
