@echo off
echo Starting Phishing Detection AI servers...

echo.
echo Starting Backend Server on port 3000...
start "Backend Server" cmd /k "cd backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 3000 --reload"

echo.
echo Waiting 5 seconds for backend to start...
timeout /t 5 /nobreak > nul

echo.
echo Starting Frontend Server on port 8081...
start "Frontend Server" cmd /k "cd frontend && python -m http.server 8081"

echo.
echo Both servers are starting...
echo Backend: http://127.0.0.1:3000
echo Frontend: http://127.0.0.1:8081
echo.
echo Press any key to continue...
pause > nul
