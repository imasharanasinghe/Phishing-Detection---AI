#!/bin/bash

# Phishing Detection AI Backend Startup Script

echo "🛡️ Starting Phishing Detection AI Backend..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Check if spaCy model is installed
echo "Checking spaCy model..."
python -c "import spacy; spacy.load('en_core_web_sm')" 2>/dev/null || {
    echo "Downloading spaCy model..."
    python -m spacy download en_core_web_sm
}

# Create necessary directories
mkdir -p models data

# Start the server
echo "Starting FastAPI server on port 3000..."
echo "Access the API docs at: http://localhost:3000/docs"
echo "Press Ctrl+C to stop the server"
echo ""

uvicorn app.main:app --reload --port 3000 --host 0.0.0.0