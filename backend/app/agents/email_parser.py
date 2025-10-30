from typing import Dict, Any, List, Optional
import re
import email
from urllib.parse import urlparse
from bs4 import BeautifulSoup
import os

# Simplified version without faiss and spacy dependencies

def extract_headers(email_text: str) -> Dict[str, str]:
    """Extract email headers using Python's email module."""
    try:
        msg = email.message_from_string(email_text)
        headers = {}
        
        # Extract common headers
        for header in ['subject', 'from', 'to', 'date', 'message-id', 'reply-to']:
            value = msg.get(header)
            if value:
                headers[header] = str(value)
        
        return headers
    except Exception:
        # Fallback to regex if email parsing fails
        headers = {}
        subject_match = re.search(r"Subject:\s*(.*)", email_text, re.IGNORECASE | re.MULTILINE)
        if subject_match:
            headers['subject'] = subject_match.group(1).strip()
        return headers

def extract_urls(text: str) -> List[Dict[str, Any]]:
    """Extract URLs with additional metadata."""
    url_pattern = r'https?://[^\s<>"{}|\\^`\[\]]+'
    urls = re.findall(url_pattern, text)
    
    url_data = []
    for url in urls:
        try:
            parsed = urlparse(url)
            url_data.append({
                "url": url,
                "domain": parsed.netloc,
                "path": parsed.path,
                "scheme": parsed.scheme,
                "is_shortened": len(url) < 30,  # Basic heuristic
                "has_suspicious_tld": any(tld in parsed.netloc.lower() for tld in ['.tk', '.ml', '.ga', '.cf'])
            })
        except Exception:
            url_data.append({"url": url, "domain": "", "path": "", "scheme": "", "is_shortened": False, "has_suspicious_tld": False})
    
    return url_data

def extract_attachments(email_text: str) -> List[Dict[str, str]]:
    """Extract attachment information from email."""
    attachments = []
    
    # Look for Content-Disposition: attachment
    attachment_pattern = r'Content-Disposition:\s*attachment[^;]*filename[=:]\s*["\']?([^"\'\s]+)["\']?'
    matches = re.findall(attachment_pattern, email_text, re.IGNORECASE)
    
    for filename in matches:
        attachments.append({
            "name": filename,
            "type": filename.split('.')[-1] if '.' in filename else "unknown"
        })
    
    return attachments

def extract_entities(text: str) -> List[Dict[str, Any]]:
    """Extract basic entities using regex patterns (simplified version)."""
    entities = []
    
    # Email patterns
    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    emails = re.findall(email_pattern, text)
    for email_addr in emails:
        entities.append({
            "type": "EMAIL",
            "text": email_addr,
            "confidence": 0.9
        })
    
    # Phone patterns
    phone_pattern = r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b'
    phones = re.findall(phone_pattern, text)
    for phone in phones:
        entities.append({
            "type": "PHONE",
            "text": phone,
            "confidence": 0.8
        })
    
    # Money patterns
    money_pattern = r'\$\d+(?:,\d{3})*(?:\.\d{2})?'
    money = re.findall(money_pattern, text)
    for amount in money:
        entities.append({
            "type": "MONEY",
            "text": amount,
            "confidence": 0.8
        })
    
    return entities

def extract_body_text(email_text: str) -> str:
    """Extract clean body text from email."""
    try:
        msg = email.message_from_string(email_text)
        
        if msg.is_multipart():
            body_parts = []
            for part in msg.walk():
                if part.get_content_type() == "text/plain":
                    body_parts.append(part.get_payload(decode=True).decode('utf-8', errors='ignore'))
                elif part.get_content_type() == "text/html":
                    # Extract text from HTML
                    html_content = part.get_payload(decode=True).decode('utf-8', errors='ignore')
                    soup = BeautifulSoup(html_content, 'html.parser')
                    body_parts.append(soup.get_text())
            
            return "\n".join(body_parts)
        else:
            content_type = msg.get_content_type()
            if content_type == "text/html":
                soup = BeautifulSoup(msg.get_payload(decode=True).decode('utf-8', errors='ignore'), 'html.parser')
                return soup.get_text()
            else:
                return msg.get_payload(decode=True).decode('utf-8', errors='ignore')
    except Exception:
        # Fallback: return original text
        return email_text

def parse_email(raw: str) -> Dict[str, Any]:
    """
    Parse email with comprehensive extraction of headers, URLs, entities, and attachments.
    
    Args:
        raw: Raw email text
        
    Returns:
        Dictionary containing parsed email data
    """
    # Extract headers
    headers = extract_headers(raw)
    
    # Extract body text
    body_text = extract_body_text(raw)
    
    # Extract URLs with metadata
    urls = extract_urls(body_text)
    
    # Extract attachments
    attachments = extract_attachments(raw)
    
    # Extract named entities (simplified version)
    entities = extract_entities(body_text)
    
    parsed = {
        "headers": headers,
        "body_text": body_text,
        "urls": urls,
        "attachments": attachments,
        "entities": entities,
        "context": None,  # No FAISS similarity in simplified version
        "metadata": {
            "has_html": "text/html" in raw.lower(),
            "is_multipart": "multipart" in raw.lower(),
            "url_count": len(urls),
            "attachment_count": len(attachments),
            "entity_count": len(entities)
        }
    }
    
    return parsed