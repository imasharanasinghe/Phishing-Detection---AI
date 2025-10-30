from os import getenv
from typing import Optional

RESEND_API_KEY = getenv("RESEND_API_KEY")
EMAIL_FROM = getenv("EMAIL_FROM", "Phishing AI <no-reply@example.com>")
APP_URL = getenv("APP_URL", "http://localhost:8080")

try:
    import resend  # type: ignore
    resend.api_key = RESEND_API_KEY
except Exception:
    resend = None  # graceful fallback


def _send(subject: str, html: str, to: str) -> None:
    if resend and RESEND_API_KEY:
        try:
            resend.Emails.send({
                "from": EMAIL_FROM,
                "to": [to],
                "subject": subject,
                "html": html,
            })
        except Exception as e:
            print(f"Email send failed: {e}")
    else:
        print(f"[Email Mock] To:{to} Subj:{subject}\n{html}")


def send_welcome_email(email: str) -> None:
    subject = "Welcome to Phishing Detection AI"
    html = f"""
    <div style='font-family:Inter,Arial,sans-serif;padding:24px'>
      <h2>Welcome to Phishing Detection AI</h2>
      <p>Your account is ready. You can sign in anytime.</p>
      <p><a href='{APP_URL}/auth-signin.html' style='display:inline-block;padding:10px 16px;background:#2a4a78;color:#fff;border-radius:8px;text-decoration:none'>Sign In</a></p>
    </div>
    """
    _send(subject, html, email)


def send_reset_email(email: str, link: str) -> None:
    subject = "Reset your password"
    html = f"""
    <div style='font-family:Inter,Arial,sans-serif;padding:24px'>
      <h2>Password Reset</h2>
      <p>We received a request to reset your password. This link expires soon.</p>
      <p><a href='{link}' style='display:inline-block;padding:10px 16px;background:#2a4a78;color:#fff;border-radius:8px;text-decoration:none'>Reset Password</a></p>
    </div>
    """
    _send(subject, html, email)
