@echo off
REM Phishing Detection AI Backend Startup Script for Windows

echo 🛡️ Starting Phishing Detection AI Backend...

REM Check if virtual environment exists
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

REM Install dependencies
echo Installing dependencies...
pip install -r requirements.txt

REM Check if spaCy model is installed
echo Checking spaCy model...
python -c "import spacy; spacy.load('en_core_web_sm')" 2>nul || (
    echo Downloading spaCy model...
    python -m spacy download en_core_web_sm
)

REM Create necessary directories
if not exist "models" mkdir models
if not exist "data" mkdir data

REM Start the server
echo Starting FastAPI server on port 3000...
echo Access the API docs at: http://localhost:3000/docs
echo Press Ctrl+C to stop the server
echo.

uvicorn app.main:app --reload --port 3000 --host 0.0.0.0

pause
