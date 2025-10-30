#!/usr/bin/env python3

import uvicorn
from app.main import app

if __name__ == "__main__":
    print("Starting FastAPI server...")
    uvicorn.run(app, host="127.0.0.1", port=3000, log_level="info")
