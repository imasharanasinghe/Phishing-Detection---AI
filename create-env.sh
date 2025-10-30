#!/bin/bash

echo "🛡️  Phishing Detection AI - Environment Setup"
echo "=========================================="
echo ""

echo "📋 Creating .env file for backend..."
echo ""

# Create .env file with your actual credentials
cat > backend/.env << 'EOF'
# ==========================================================
# 🚀 PHISHING DETECTION AI - ENVIRONMENT CONFIGURATION
# ==========================================================

# ==== MongoDB Atlas Configuration ====
MONGODB_URL=mongodb+srv://wijesinghesachithra_db_user:m1voiRa2Fokbg9yd@phishing-detection01.io6hcx8.mongodb.net/?retryWrites=true&w=majority&appName=phishing-detection01
DATABASE_NAME=phishing_ai

# ==== JWT / Security ====
SECRET_KEY=super_secret_key_change_me

# ==== Ollama (optional AI summarizer) ====
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b

# ==== Backend Development ====
DEBUG=True
LOG_LEVEL=INFO
API_PORT=3000

# ==== Frontend CORS Origin ====
FRONTEND_ORIGIN=http://localhost:8081

# ==========================================================
# 🔥 FIREBASE CONFIGURATION (Frontend + Backend Integration)
# ==========================================================

# ---- Web App Config (from Firebase SDK snippet) ----
FIREBASE_API_KEY=AIzaSyDsMfis_O6zi9_2b_a3MvFFzAH0xga8h_M
FIREBASE_AUTH_DOMAIN=phishing-detection-ai.firebaseapp.com
FIREBASE_PROJECT_ID=phishing-detection-ai
FIREBASE_STORAGE_BUCKET=phishing-detection-ai.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=360977256914
FIREBASE_APP_ID=1:360977256914:web:383f60bde5b0d9515a780b
FIREBASE_MEASUREMENT_ID=G-CGLMJMPN9J

# ---- Service Account (Backend only) ----
# Place your Firebase Admin SDK JSON file in backend/firebase-service-account.json
# Then reference it here:
FIREBASE_CREDENTIALS_PATH=backend/firebase-service-account.json

# ==========================================================
# 🧠 NOTES:
# - Do NOT commit this file to GitHub (add to .gitignore)
# - Make sure the firebase-service-account.json file is downloaded
#   from Firebase Console → Project Settings → Service Accounts → Generate new key
# - FRONTEND_ORIGIN should be updated after deploying frontend, e.g.:
#   FRONTEND_ORIGIN=https://phishing-detection-ai.web.app
# ==========================================================
EOF

echo "✅ .env file created successfully!"
echo ""
echo "📁 File location: backend/.env"
echo ""
echo "🔧 Next steps:"
echo "1. The .env file contains your MongoDB Atlas credentials"
echo "2. The .env file contains your Firebase configuration"
echo "3. Restart your backend server to load the new environment variables"
echo ""
echo "🚀 To restart backend:"
echo "   cd backend"
echo "   python -m uvicorn app.main:app --reload --port 3000"
echo ""
echo "✅ Your Phishing Detection AI is now fully configured!"
