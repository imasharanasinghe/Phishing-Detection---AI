// Gmail OAuth Configuration
// Replace these with your actual Google Cloud Console credentials

const GMAIL_CONFIG = {
    // Get these from Google Cloud Console
    CLIENT_ID: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
    API_KEY: 'YOUR_GOOGLE_API_KEY',
    
    // Gmail API scopes
    SCOPES: 'https://www.googleapis.com/auth/gmail.readonly',
    
    // Discovery document for Gmail API
    DISCOVERY_DOC: 'https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest',
    
    // Redirect URIs (must match Google Cloud Console settings)
    REDIRECT_URIS: [
        'http://localhost:8081/phishing-detection-ai-starter/frontend/dashboard.html',
        'http://localhost:8081/phishing-detection-ai-starter/frontend/',
        'https://yourdomain.com/dashboard.html' // Replace with your production domain
    ]
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GMAIL_CONFIG;
}
