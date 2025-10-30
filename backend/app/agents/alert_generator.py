
from typing import Dict, Any
import os
import httpx
import json
from datetime import datetime

# Ollama configuration
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b")

def truncate_text(text: str, max_length: int = 400) -> str:
    """Safely truncate text to maximum length."""
    if len(text) <= max_length:
        return text
    return text[:max_length-3] + "..."

def generate_llm_alert(score: float, level: str, reason: str, parsed: Dict[str, Any]) -> str:
    """Generate alert using Ollama LLaMA3-8B."""
    try:
        # Prepare context
        subject = parsed.get("headers", {}).get("subject", "No subject")
        urls = parsed.get("urls", [])
        url_count = len(urls)
        
        # Create concise prompt (≤80 tokens)
        prompt = f"""Email: "{subject[:50]}..."
Risk: {level} ({score:.2f})
Issues: {reason[:100]}

Generate a brief phishing alert (max 200 chars):"""

        # Call Ollama API
        with httpx.Client(timeout=10.0) as client:
            response = client.post(
                f"{OLLAMA_HOST}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.7,
                        "max_tokens": 100,
                        "stop": ["\n\n", "Email:", "Risk:"]
                    }
                }
            )
            
            if response.status_code == 200:
                result = response.json()
                alert_text = result.get("response", "").strip()
                
                # Clean up the response
                alert_text = alert_text.replace("Generate a brief phishing alert:", "").strip()
                alert_text = alert_text.replace("Brief phishing alert:", "").strip()
                
                # Ensure it's not empty and add context
                if not alert_text:
                    return generate_fallback_alert(score, level, reason, parsed)
                
                # Add risk level prefix
                alert_text = f"[{level.upper()}] {alert_text}"
                
                return truncate_text(alert_text)
            else:
                return generate_fallback_alert(score, level, reason, parsed)
                
    except Exception as e:
        # Fallback to template if LLM fails
        return generate_fallback_alert(score, level, reason, parsed)

def generate_fallback_alert(score: float, level: str, reason: str, parsed: Dict[str, Any]) -> str:
    """Generate fallback alert using templates."""
    subject = parsed.get("headers", {}).get("subject", "No subject")
    urls = parsed.get("urls", [])
    attachments = parsed.get("attachments", [])
    
    # Template-based alert generation
    if level == "High":
        alert = f"🚨 HIGH RISK: Email '{subject[:30]}...' shows strong phishing indicators. "
        if urls:
            alert += f"Contains {len(urls)} suspicious link(s). "
        if attachments:
            alert += f"Has {len(attachments)} attachment(s). "
        alert += "DO NOT click links or download files. Delete immediately."
        
    elif level == "Medium":
        alert = f"⚠️ MEDIUM RISK: Email '{subject[:30]}...' has some suspicious elements. "
        if urls:
            alert += f"Contains {len(urls)} link(s). "
        alert += "Be cautious and verify sender before taking action."
        
    else:
        alert = f"✅ LOW RISK: Email '{subject[:30]}...' appears legitimate. "
        if urls:
            alert += f"Contains {len(urls)} link(s). "
        alert += "Standard precautions recommended."
    
    # Add specific reason if available
    if reason and len(reason) < 100:
        alert += f" Details: {reason}"
    
    return truncate_text(alert)

def make_alert(score: float, level: str, reason: str, parsed: Dict[str, Any]) -> str:
    """
    Generate human-friendly phishing alert summary.
    
    Args:
        score: Risk score (0.0-1.0)
        level: Risk level (Low/Medium/High)
        reason: Reason for the risk assessment
        parsed: Parsed email data
        
    Returns:
        Human-friendly alert summary (max 400 chars)
    """
    # Check if Ollama is available
    ollama_available = False
    try:
        with httpx.Client(timeout=2.0) as client:
            response = client.get(f"{OLLAMA_HOST}/api/tags")
            if response.status_code == 200:
                models = response.json().get("models", [])
                ollama_available = any(model["name"].startswith("llama3") for model in models)
    except Exception:
        ollama_available = False
    
    # Use LLM if available, otherwise fallback
    if ollama_available and OLLAMA_HOST:
        return generate_llm_alert(score, level, reason, parsed)
    else:
        return generate_fallback_alert(score, level, reason, parsed)
