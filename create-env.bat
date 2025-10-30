@echo off
echo 🛡️  Phishing Detection AI - Environment Setup
echo ==========================================
echo.

echo 📋 Creating .env file for backend...
echo.

REM Create .env file with your actual credentials
(
echo # ==========================================================
echo # 🚀 PHISHING DETECTION AI - ENVIRONMENT CONFIGURATION
echo # ==========================================================
echo.
echo # ==== MongoDB Atlas Configuration ====
echo MONGODB_URL=mongodb+srv://wijesinghesachithra_db_user:m1voiRa2Fokbg9yd@phishing-detection01.io6hcx8.mongodb.net/?retryWrites=true^&w=majority^&appName=phishing-detection01
echo DATABASE_NAME=phishing_ai
echo.
echo # ==== JWT / Security ====
echo SECRET_KEY=super_secret_key_change_me
echo.
echo # ==== Ollama ^(optional AI summarizer^) ====
echo OLLAMA_HOST=http://localhost:11434
echo OLLAMA_MODEL=llama3.1:8b
echo.
echo # ==== Backend Development ====
echo DEBUG=True
echo LOG_LEVEL=INFO
echo API_PORT=3000
echo.
echo # ==== Frontend CORS Origin ====
echo FRONTEND_ORIGIN=http://localhost:8081
echo.
echo # ==========================================================
echo # 🔥 FIREBASE CONFIGURATION ^(Frontend + Backend Integration^)
echo # ==========================================================
echo.
echo # ---- Web App Config ^(from Firebase SDK snippet^) ----
echo FIREBASE_API_KEY=AIzaSyDsMfis_O6zi9_2b_a3MvFFzAH0xga8h_M
echo FIREBASE_AUTH_DOMAIN=phishing-detection-ai.firebaseapp.com
echo FIREBASE_PROJECT_ID=phishing-detection-ai
echo FIREBASE_STORAGE_BUCKET=phishing-detection-ai.firebasestorage.app
echo FIREBASE_MESSAGING_SENDER_ID=360977256914
echo FIREBASE_APP_ID=1:360977256914:web:383f60bde5b0d9515a780b
echo FIREBASE_MEASUREMENT_ID=G-CGLMJMPN9J
echo.
echo # ---- Service Account ^(Backend only^) ----
echo # Place your Firebase Admin SDK JSON file in backend/firebase-service-account.json
echo # Then reference it here:
echo FIREBASE_CREDENTIALS_PATH=backend/firebase-service-account.json
echo.
echo # ==========================================================
echo # 🧠 NOTES:
echo # - Do NOT commit this file to GitHub ^(add to .gitignore^)
echo # - Make sure the firebase-service-account.json file is downloaded
echo #   from Firebase Console → Project Settings → Service Accounts → Generate new key
echo # - FRONTEND_ORIGIN should be updated after deploying frontend, e.g.:
echo #   FRONTEND_ORIGIN=https://phishing-detection-ai.web.app
echo # ==========================================================
) > backend\.env

echo ✅ .env file created successfully!
echo.
echo 📁 File location: backend\.env
echo.
echo 🔧 Next steps:
echo 1. The .env file contains your MongoDB Atlas credentials
echo 2. The .env file contains your Firebase configuration
echo 3. Restart your backend server to load the new environment variables
echo.
echo 🚀 To restart backend:
echo    cd backend
echo    python -m uvicorn app.main:app --reload --port 3000
echo.
echo ✅ Your Phishing Detection AI is now fully configured!
pause
