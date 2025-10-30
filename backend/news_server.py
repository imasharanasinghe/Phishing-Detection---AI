#!/usr/bin/env python3
"""Standalone news server for phishing detection AI."""

import asyncio
import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.news import router as news_router
import uvicorn

app = FastAPI(title="Phishing Detection AI - News Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(news_router, prefix="/api", tags=["news"])

@app.get("/")
async def root():
    return {"message": "Phishing Detection AI News Server", "status": "running"}

@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "news-server", "version": "1.0.0"}

if __name__ == "__main__":
    print("🚀 Starting Phishing Detection AI News Server...")
    print("📡 Serving live RSS feeds from 20+ cybersecurity sources")
    print("🌐 Server will be available at: http://localhost:3000")
    print("📰 News API endpoint: http://localhost:3000/api/news")
    uvicorn.run(app, host="127.0.0.1", port=3000, log_level="info")
