import pytest
import asyncio
from unittest.mock import Mock, patch
from app.agents.email_parser import parse_email
from app.agents.risk_scorer import score
from app.agents.alert_generator import make_alert

class TestEmailParser:
    def test_parse_simple_email(self):
        """Test parsing a simple email."""
        email_text = """Subject: Test Email
From: test@example.com
To: user@example.com

This is a test email with a link: https://example.com
"""
        result = parse_email(email_text)
        
        assert "headers" in result
        assert "body_text" in result
        assert "urls" in result
        assert "entities" in result
        assert result["headers"]["subject"] == "Test Email"
        assert len(result["urls"]) == 1
        assert result["urls"][0]["url"] == "https://example.com"

    def test_parse_email_with_attachments(self):
        """Test parsing email with attachments."""
        email_text = """Subject: Email with attachment
Content-Disposition: attachment; filename="document.pdf"

This email has an attachment.
"""
        result = parse_email(email_text)
        
        assert len(result["attachments"]) == 1
        assert result["attachments"][0]["name"] == "document.pdf"

    def test_parse_suspicious_email(self):
        """Test parsing suspicious email."""
        email_text = """Subject: URGENT: Verify your account
From: security@paypa1.com

Your account has been suspended. Click here to verify: https://paypa1.com/verify
"""
        result = parse_email(email_text)
        
        assert result["headers"]["subject"] == "URGENT: Verify your account"
        assert len(result["urls"]) == 1
        assert "paypa1.com" in result["urls"][0]["domain"]

class TestRiskScorer:
    def test_score_legitimate_email(self):
        """Test scoring a legitimate email."""
        parsed = {
            "headers": {"subject": "Meeting tomorrow"},
            "body_text": "Hi, let's meet tomorrow at 2 PM.",
            "urls": [],
            "entities": []
        }
        
        score_value, level, reason = score(parsed)
        
        assert 0 <= score_value <= 1
        assert level in ["Low", "Medium", "High"]
        assert isinstance(reason, str)

    def test_score_suspicious_email(self):
        """Test scoring a suspicious email."""
        parsed = {
            "headers": {"subject": "URGENT: Verify your account"},
            "body_text": "Your account has been suspended. Click here to verify immediately.",
            "urls": [{"url": "https://paypa1.com/verify", "domain": "paypa1.com"}],
            "entities": []
        }
        
        score_value, level, reason = score(parsed)
        
        assert score_value > 0.3  # Should be higher risk
        assert level in ["Medium", "High"]
        assert "suspicious" in reason.lower() or "urgent" in reason.lower()

    def test_score_high_risk_email(self):
        """Test scoring a high-risk phishing email."""
        parsed = {
            "headers": {"subject": "URGENT: Verify your password NOW"},
            "body_text": "Your account will be deleted. Click here immediately: https://microsofft.com/verify",
            "urls": [{"url": "https://microsofft.com/verify", "domain": "microsofft.com"}],
            "entities": []
        }
        
        score_value, level, reason = score(parsed)
        
        assert score_value >= 0.4  # Should be medium to high risk
        assert level in ["Medium", "High"]

class TestAlertGenerator:
    def test_make_alert_high_risk(self):
        """Test generating alert for high-risk email."""
        parsed = {
            "headers": {"subject": "URGENT: Verify account"},
            "urls": [{"url": "https://suspicious.com"}],
            "attachments": []
        }
        
        alert = make_alert(0.9, "High", "Multiple suspicious indicators", parsed)
        
        assert isinstance(alert, str)
        assert len(alert) <= 400
        assert "HIGH" in alert or "High" in alert

    def test_make_alert_low_risk(self):
        """Test generating alert for low-risk email."""
        parsed = {
            "headers": {"subject": "Meeting reminder"},
            "urls": [],
            "attachments": []
        }
        
        alert = make_alert(0.1, "Low", "No suspicious indicators", parsed)
        
        assert isinstance(alert, str)
        assert len(alert) <= 400
        assert "LOW" in alert or "Low" in alert

    @patch('app.agents.alert_generator.httpx.Client')
    def test_make_alert_with_ollama(self, mock_client):
        """Test generating alert with Ollama (mocked)."""
        # Mock Ollama response
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"response": "This email appears suspicious due to urgent language and suspicious domain."}
        
        mock_client_instance = Mock()
        mock_client_instance.__enter__.return_value = mock_client_instance
        mock_client_instance.post.return_value = mock_response
        mock_client.return_value = mock_client_instance
        
        parsed = {
            "headers": {"subject": "URGENT: Verify account"},
            "urls": [{"url": "https://suspicious.com"}],
            "attachments": []
        }
        
        alert = make_alert(0.8, "High", "Suspicious indicators found", parsed)
        
        assert isinstance(alert, str)
        assert len(alert) <= 400

if __name__ == "__main__":
    pytest.main([__file__])
