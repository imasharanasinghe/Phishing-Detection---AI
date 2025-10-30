from typing import Dict, Any, Tuple, List
import re
import os
from urllib.parse import urlparse

# Rule-based features
SUSPICIOUS_KEYWORDS = [
    "urgent", "verify", "password", "suspended", "invoice", "payment", 
    "account", "security", "update", "confirm", "immediately", "expired",
    "click here", "verify now", "unusual activity", "suspicious login",
    "reset password", "account locked", "verify identity", "tax refund",
    "lottery winner", "congratulations", "free money", "act now"
]

SUSPICIOUS_DOMAINS = [
    "paypa1.com", "apple-id.support", "microsofft.com", "amazom.com",
    "goog1e.com", "faceb00k.com", "twitt3r.com", "instagr4m.com"
]

SUSPICIOUS_TLDS = [".tk", ".ml", ".ga", ".cf", ".bit", ".onion"]

LOOKALIKE_PATTERNS = [
    r'[0-9]+[a-z]+[0-9]+',  # Numbers mixed with letters
    r'[a-z]+[0-9]+[a-z]+',  # Letters mixed with numbers
    r'(.)\1{2,}',  # Repeated characters
]

class RiskScorer:
    def __init__(self):
        # ML components removed for lightweight runtime compatibility.
        # Scoring will be purely rule-based for now.
        pass
    
    def extract_rule_features(self, parsed: Dict[str, Any]) -> Dict[str, float]:
        """Extract rule-based features."""
        features = {}
        
        # Get text content
        subject = parsed.get("headers", {}).get("subject", "").lower()
        body_text = parsed.get("body_text", "").lower()
        full_text = f"{subject} {body_text}"
        
        urls = parsed.get("urls", [])
        entities = parsed.get("entities", [])
        
        # Keyword-based features
        features['suspicious_keyword_count'] = sum(1 for kw in SUSPICIOUS_KEYWORDS if kw in full_text)
        features['suspicious_keyword_ratio'] = features['suspicious_keyword_count'] / max(len(full_text.split()), 1)
        
        # URL-based features
        features['url_count'] = len(urls)
        features['suspicious_domain_count'] = 0
        features['suspicious_tld_count'] = 0
        features['shortened_url_count'] = 0
        
        for url_data in urls:
            domain = url_data.get("domain", "").lower()
            if any(susp_domain in domain for susp_domain in SUSPICIOUS_DOMAINS):
                features['suspicious_domain_count'] += 1
            if any(tld in domain for tld in SUSPICIOUS_TLDS):
                features['suspicious_tld_count'] += 1
            if url_data.get("is_shortened", False):
                features['shortened_url_count'] += 1
        
        # Lookalike domain detection
        features['lookalike_score'] = 0
        for url_data in urls:
            domain = url_data.get("domain", "")
            for pattern in LOOKALIKE_PATTERNS:
                if re.search(pattern, domain):
                    features['lookalike_score'] += 1
        
        # Entity-based features
        features['email_count'] = sum(1 for ent in entities if ent.get("type") == "EMAIL")
        features['phone_count'] = sum(1 for ent in entities if ent.get("type") == "PHONE")
        features['money_count'] = sum(1 for ent in entities if ent.get("type") == "MONEY")
        
        # Text-based features
        features['exclamation_count'] = full_text.count('!')
        features['question_count'] = full_text.count('?')
        features['caps_ratio'] = sum(1 for c in full_text if c.isupper()) / max(len(full_text), 1)
        
        # Length features
        features['subject_length'] = len(subject)
        features['body_length'] = len(body_text)
        features['total_length'] = len(full_text)
        
        return features
    
    def predict_ml_score(self, parsed: Dict[str, Any]) -> float:
        """Placeholder for ML-based risk score (disabled)."""
        return 0.0
    
    def calculate_final_score(self, parsed: Dict[str, Any]) -> Tuple[float, str, str]:
        """Calculate final risk score combining ML and rule-based features."""
        # Get rule-based features
        rule_features = self.extract_rule_features(parsed)
        
        # Rule-based scoring
        rule_score = 0.0
        reasons = []
        
        # Keyword-based scoring
        if rule_features['suspicious_keyword_count'] > 0:
            rule_score += 0.2 * min(rule_features['suspicious_keyword_count'], 5)
            reasons.append(f"Suspicious keywords detected ({rule_features['suspicious_keyword_count']})")
        
        # URL-based scoring
        if rule_features['suspicious_domain_count'] > 0:
            rule_score += 0.3 * rule_features['suspicious_domain_count']
            reasons.append(f"Suspicious domains detected ({rule_features['suspicious_domain_count']})")
        
        if rule_features['suspicious_tld_count'] > 0:
            rule_score += 0.2 * rule_features['suspicious_tld_count']
            reasons.append(f"Suspicious TLDs detected ({rule_features['suspicious_tld_count']})")
        
        if rule_features['shortened_url_count'] > 0:
            rule_score += 0.1 * rule_features['shortened_url_count']
            reasons.append(f"Shortened URLs detected ({rule_features['shortened_url_count']})")
        
        # Lookalike scoring
        if rule_features['lookalike_score'] > 0:
            rule_score += 0.2 * rule_features['lookalike_score']
            reasons.append(f"Lookalike domains detected ({rule_features['lookalike_score']})")
        
        # Entity-based scoring
        if rule_features['money_count'] > 0:
            rule_score += 0.15 * rule_features['money_count']
            reasons.append(f"Money amounts mentioned ({rule_features['money_count']})")
        
        # Text-based scoring
        if rule_features['exclamation_count'] > 3:
            rule_score += 0.1
            reasons.append("Excessive exclamation marks")
        
        if rule_features['caps_ratio'] > 0.3:
            rule_score += 0.1
            reasons.append("Excessive capitalization")
        
        # Final score based purely on rule-based features
        final_score = min(rule_score, 1.0)  # Cap at 1.0
        
        # Determine risk level
        if final_score >= 0.7:
            level = "High"
        elif final_score >= 0.4:
            level = "Medium"
        else:
            level = "Low"
        
        # Create reason string
        if not reasons:
            reasons = ["No suspicious patterns detected"]
        
        reason_text = "; ".join(reasons)
        
        return final_score, level, reason_text

# Global instance
_scorer = None

def get_scorer() -> RiskScorer:
    """Get global scorer instance."""
    global _scorer
    if _scorer is None:
        _scorer = RiskScorer()
    return _scorer

def score(parsed: Dict[str, Any]) -> Tuple[float, str, str]:
    """
    Score email for phishing risk.
    
    Args:
        parsed: Parsed email data
        
    Returns:
        Tuple of (score, level, reason)
    """
    scorer = get_scorer()
    return scorer.calculate_final_score(parsed)