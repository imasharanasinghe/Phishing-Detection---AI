
# Phishing Detection AI

A production-leaning MVP for AI-powered phishing detection with hybrid ML and rule-based analysis.

## 🚀 Quick Start

### Prerequisites

- Python 3.8+
- MongoDB (local or Atlas)
- Node.js (for frontend development)
- Chrome browser (for extension)

### Backend Setup

1. **Install dependencies:**
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

2. **Download spaCy model:**
   ```bash
   python -m spacy download en_core_web_sm
   ```

3. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your MongoDB URI and other settings
   ```

4. **Start the backend:**
   ```bash
   uvicorn app.main:app --reload --port 3000
   ```

### Frontend Setup

1. **Open the frontend:**
   ```bash
   cd frontend
   # Open index.html in your browser
   # Or serve with a simple HTTP server:
   python -m http.server 8080
   ```

2. **Access the dashboard:**
   - Open `http://localhost:8080` in your browser
   - The dashboard will connect to the backend at `http://localhost:3000`

### Chrome Extension Setup

1. **Load the extension:**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `chrome_extension` folder

2. **Use the extension:**
   - Click the extension icon in your browser toolbar
   - Enter your backend URL (default: `http://localhost:3000`)
   - Paste email content and click "Analyze Email"

## 🏗️ Architecture

### Backend Components

- **Email Parser Agent** (`app/agents/email_parser.py`)
  - Proper header parsing with Python's email module
  - URL extraction with metadata (domain, TLD analysis)
  - spaCy NER for entity extraction
  - FAISS similarity search (if corpus available)
  - MIME/attachment detection

- **Risk Scorer Agent** (`app/agents/risk_scorer.py`)
  - Hybrid ML + rule-based scoring
  - Logistic Regression baseline (XGBoost ready)
  - Feature extraction: TF-IDF + hand-crafted rules
  - Suspicious keyword/domain detection
  - Lookalike domain patterns
  - Calibrated 0-1 risk scores

- **Alert Generator Agent** (`app/agents/alert_generator.py`)
  - Ollama LLaMA3-8B integration (if available)
  - Template-based fallback
  - Human-friendly summaries
  - Safe truncation to 400 chars

### API Endpoints

- `POST /api/analyze` - Analyze email for phishing risk
- `POST /api/gmail/parse` - Gmail integration endpoint
- `GET /api/emails` - Retrieve analyzed emails
- `GET /api/stats` - Get analysis statistics
- `GET /api/health` - Health check

### Frontend Features

- **Interactive Dashboard** with Chart.js donut chart
- **Real-time Analysis** with loading states
- **History Tracking** with localStorage persistence
- **Responsive Design** with modern UI
- **Error Handling** with user-friendly messages

### Chrome Extension (MV3)

- **Manifest V3** compliant
- **Gmail Integration** ready
- **Backend URL Configuration**
- **Real-time Analysis** in popup
- **Storage API** for settings

## 🧪 Testing

### Run Tests

```bash
cd backend
pytest tests/ -v
```

### Test Coverage

- Unit tests for all agents
- API endpoint tests
- Mocked external dependencies
- Error handling scenarios

### Development Examples

See `dev/http-examples.http` for API testing examples.

## 🔧 Configuration

### Environment Variables

```bash
# MongoDB Configuration
MONGO_URI=mongodb://localhost:27017
DB_NAME=phishing_ai

# Ollama Configuration (optional)
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b

# Development
DEBUG=True
LOG_LEVEL=INFO
```

### Model Training

The system includes a baseline Logistic Regression model trained on synthetic data. For production:

1. Collect labeled phishing/legitimate emails
2. Train XGBoost model with real data
3. Save model to `models/risk_scorer_model.pkl`
4. Update feature extraction as needed

### FAISS Index

To enable similarity search:

1. Create `data/phishing_corpus.index` with your phishing email corpus
2. The system will automatically use it for similarity scoring

## 📊 Usage Examples

### Analyze Email via API

```bash
curl -X POST "http://localhost:3000/api/analyze" \
  -H "Content-Type: application/json" \
  -d '{"email_text": "Subject: URGENT: Verify Account\n\nYour account has been suspended. Click here: https://paypa1.com/verify"}'
```

### Frontend Dashboard

1. Open `frontend/index.html`
2. Paste email content in the textarea
3. Click "Run Analysis"
4. View results and history

### Chrome Extension

1. Install the extension
2. Configure backend URL
3. Paste email content
4. Click "Analyze Email"

## 🚀 Production Deployment

### Backend Deployment

- Use `uvicorn app.main:app --host 0.0.0.0 --port 3000` for production
- Set up MongoDB Atlas for database
- Configure proper CORS origins
- Use environment variables for secrets

### Frontend Deployment

- Serve static files with nginx/Apache
- Update API_BASE in frontend for production URL
- Enable HTTPS for security

### Chrome Extension

- Package extension for Chrome Web Store
- Update host_permissions for production domains
- Test on different Gmail layouts

## 🔍 Monitoring & Logging

- Structured logging with Python's logging module
- Health check endpoint for monitoring
- Error tracking and alerting
- Performance metrics collection

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Troubleshooting

### Common Issues

1. **spaCy model not found:**
   ```bash
   python -m spacy download en_core_web_sm
   ```

2. **MongoDB connection failed:**
   - Check MONGO_URI in .env
   - Ensure MongoDB is running
   - Verify network connectivity

3. **Ollama not responding:**
   - Check OLLAMA_HOST in .env
   - Ensure Ollama is running
   - Verify model is available

4. **Chrome extension not working:**
   - Check host_permissions in manifest.json
   - Verify backend URL is correct
   - Check browser console for errors

### Support

For issues and questions:
- Check the troubleshooting section
- Review the test files for examples
- Open an issue on GitHub
