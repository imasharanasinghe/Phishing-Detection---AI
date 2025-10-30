import pytest
import asyncio
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch
from app.main import app

client = TestClient(app)

class TestAPI:
    def test_health_endpoint(self):
        """Test health check endpoint."""
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert "timestamp" in data
        assert data["service"] == "phishing-detection-ai"

    def test_analyze_endpoint_success(self):
        """Test successful email analysis."""
        email_text = """Subject: Test Email
From: test@example.com

This is a test email with a link: https://example.com
"""
        
        response = client.post("/api/analyze", json={"email_text": email_text})
        
        assert response.status_code == 200
        data = response.json()
        
        assert "score" in data
        assert "level" in data
        assert "reason" in data
        assert "alert_summary" in data
        assert "parsed" in data
        
        assert 0 <= data["score"] <= 1
        assert data["level"] in ["Low", "Medium", "High"]
        assert isinstance(data["reason"], str)
        assert isinstance(data["alert_summary"], str)

    def test_analyze_endpoint_empty_email(self):
        """Test analysis with empty email."""
        response = client.post("/api/analyze", json={"email_text": ""})
        
        # Should still work but with low risk
        assert response.status_code == 200
        data = response.json()
        assert data["level"] == "Low"

    def test_analyze_endpoint_suspicious_email(self):
        """Test analysis with suspicious email."""
        email_text = """Subject: URGENT: Verify your account
From: security@paypa1.com

Your account has been suspended. Click here to verify: https://paypa1.com/verify
"""
        
        response = client.post("/api/analyze", json={"email_text": email_text})
        
        assert response.status_code == 200
        data = response.json()
        
        # Should detect suspicious elements
        assert data["score"] > 0.2
        assert data["level"] in ["Medium", "High"]

    def test_gmail_parse_endpoint(self):
        """Test Gmail parse endpoint."""
        email_text = "Test Gmail content"
        
        response = client.post("/api/gmail/parse", json={"email_text": email_text})
        
        assert response.status_code == 200
        data = response.json()
        
        assert "score" in data
        assert "level" in data

    @patch('app.main.get_db')
    def test_analyze_with_database_error(self, mock_get_db):
        """Test analysis when database fails."""
        # Mock database to raise exception
        mock_db = Mock()
        mock_db.emails.insert_one.side_effect = Exception("Database error")
        mock_get_db.return_value = mock_db
        
        email_text = "Test email"
        
        response = client.post("/api/analyze", json={"email_text": email_text})
        
        # Should still succeed even if database fails
        assert response.status_code == 200
        data = response.json()
        assert "score" in data

    def test_analyze_invalid_json(self):
        """Test analysis with invalid JSON."""
        response = client.post("/api/analyze", json={"invalid": "data"})
        
        # Should return 422 for validation error
        assert response.status_code == 422

    def test_analyze_missing_email_text(self):
        """Test analysis without email_text field."""
        response = client.post("/api/analyze", json={})
        
        assert response.status_code == 422

if __name__ == "__main__":
    pytest.main([__file__])
