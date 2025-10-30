# Gmail Integration Setup Guide

This guide will help you set up real Gmail integration with Google OAuth and Gmail API.

## 🚀 Step 1: Google Cloud Console Setup

### 1.1 Create a Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Enter project name: `phishing-detection-ai`
4. Click "Create"

### 1.2 Enable Gmail API
1. In the Google Cloud Console, go to "APIs & Services" → "Library"
2. Search for "Gmail API"
3. Click on "Gmail API" → "Enable"

### 1.3 Create OAuth 2.0 Credentials
1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Choose "Web application"
4. Add these Authorized redirect URIs:
   ```
   http://localhost:8081/phishing-detection-ai-starter/frontend/dashboard.html
   http://localhost:8081/phishing-detection-ai-starter/frontend/
   https://yourdomain.com/dashboard.html (replace with your production domain)
   ```
5. Click "Create"
6. Copy the **Client ID** and **Client Secret**

### 1.4 Create API Key
1. In "Credentials", click "Create Credentials" → "API key"
2. Copy the **API Key**
3. (Optional) Restrict the API key to Gmail API for security

## 🔧 Step 2: Update Configuration

### 2.1 Update gmail-config.js
Replace the placeholder values in `frontend/gmail-config.js`:

```javascript
const GMAIL_CONFIG = {
    CLIENT_ID: 'YOUR_ACTUAL_CLIENT_ID.apps.googleusercontent.com',
    API_KEY: 'YOUR_ACTUAL_API_KEY',
    // ... rest stays the same
};
```

### 2.2 Test the Integration
1. Start your backend: `cd backend && python -m uvicorn app.main:app --reload --port 3000`
2. Start your frontend: `cd frontend && python -m http.server 8081`
3. Go to `http://localhost:8081/phishing-detection-ai-starter/frontend/dashboard.html`
4. Click "Connect Gmail"
5. Complete the OAuth flow
6. Your real Gmail emails should appear!

## 🔒 Security Notes

- **Never commit** your actual credentials to version control
- Use environment variables in production
- Restrict API keys to specific domains/IPs
- Regularly rotate your credentials
- Monitor API usage in Google Cloud Console

## 🐛 Troubleshooting

### Common Issues:

1. **"This app isn't verified"**
   - Click "Advanced" → "Go to phishing-detection-ai (unsafe)"
   - This is normal for development

2. **"redirect_uri_mismatch"**
   - Check that your redirect URIs in Google Cloud Console match exactly
   - Include both with and without trailing slashes

3. **"access_denied"**
   - User denied permission - this is normal behavior
   - Try again and make sure to grant all requested permissions

4. **"API key not valid"**
   - Double-check your API key in gmail-config.js
   - Make sure Gmail API is enabled

5. **"Client ID not found"**
   - Verify your Client ID is correct
   - Make sure the project is active

## 📧 What You'll See

Once connected, the dashboard will show:
- **Real Gmail emails** from your inbox
- **Automatic risk analysis** of each email
- **Risk scores** based on content analysis
- **Click to analyze** any email in detail

## 🎯 Next Steps

After basic Gmail integration works:
1. Implement more sophisticated phishing detection
2. Add email filtering and categorization
3. Set up automated alerts for high-risk emails
4. Add support for multiple email accounts
5. Implement email quarantine functionality

---

**Need Help?** Check the browser console for detailed error messages and refer to the [Gmail API documentation](https://developers.google.com/gmail/api).
