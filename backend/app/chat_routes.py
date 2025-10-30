from fastapi import APIRouter, HTTPException
from os import getenv
import httpx
import logging
from typing import List
from app.schemas import ChatRequest, ChatResponse

router = APIRouter()
logger = logging.getLogger(__name__)

MAX_HISTORY_MESSAGES = 8
GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"
KEY_TERMS = {
    "phish", "email", "inbox", "threat", "analysis", "analyze", "risk", "score",
    "alert", "summary", "history", "report", "dashboard", "team", "member",
    "billing", "plan", "pricing", "account", "login", "signup", "reset", "security",
    "fraud", "scam", "spoof", "integrations", "gmail", "chrome", "extension",
    "attachment", "url", "domain", "workflow", "automation", "faiss", "spacy",
    "ollama", "motor", "mongodb", "jwt", "firebase", "support", "privacy"
}
DEFAULT_REFUSAL = (
    "I'm here to help with Phishing Detection AI—its phishing analysis, dashboards, integrations, "
    "security guidance, and account support. Ask me something in that space and I'll be glad to help."
)

SYSTEM_PROMPT = """
You are \"Aegis\", the virtual assistant for Phishing Detection AI.
You help users understand and use the Phishing Detection AI platform, which provides:
- Manual email analysis where users paste raw email headers and body to receive an AI-driven phishing risk score and alert summary.
- Automated Gmail integration through the Chrome extension and Gmail API for pulling recent messages.
- A risk-scoring pipeline that parses headers, URLs, attachments, and semantic cues via spaCy, FAISS similarity checks, and machine-learning models to label emails as low/medium/high risk.
- Dashboards for analysis results, historical timelines, threat intelligence/news, reporting, integrations, billing/plan management, and team collaboration.
- Backend services implemented in FastAPI with MongoDB, Motor, and asynchronous agents (email_parser, risk_scorer, alert_generator).
- Security controls including JWT auth, password reset flows, Firebase syncing, and optional Ollama-powered alert summaries.

Assistant policies:
1. Confine answers to phishing protection, email security, platform features, onboarding, account/billing, integrations, Chrome extension use, or troubleshooting the app.
2. If asked about anything unrelated (e.g., random trivia, politics, code unrelated to the product), politely refuse and restate your scope.
3. Prefer concise, actionable steps. Reference relevant dashboard sections (Analysis, History, Reports, Threats, Integrations, Team, Billing) or backend endpoints when helpful.
4. Offer best-practice guidance on phishing identification, incident response, and safe usage of the service. Encourage following up with the security team for critical incidents.
5. When unsure, ask clarifying questions instead of guessing. Encourage contacting support@phishing-detection-ai.com for unresolved issues.
6. Mention {page_context} only when it helps tailor the answer (e.g., the user is on the analysis dashboard).
"""


def _is_relevant(text: str) -> bool:
    if not text:
        return False
    lowered = text.lower()
    return any(term in lowered for term in KEY_TERMS)


def _build_messages(request: ChatRequest) -> List[dict]:
    prior_messages: List[dict] = []
    for message in request.conversation or []:
        role = message.role.lower()
        content = (message.content or "").strip()
        if role in {"user", "assistant"} and content:
            prior_messages.append({"role": role, "content": content})
    return prior_messages[-MAX_HISTORY_MESSAGES:]


@router.post("/chat", response_model=ChatResponse)
async def chat_with_assistant(payload: ChatRequest) -> ChatResponse:
    message = (payload.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    prior_messages = _build_messages(payload)
    has_relevant_history = any(
        _is_relevant(msg["content"]) for msg in prior_messages if msg["role"] == "user"
    )

    if not _is_relevant(message) and not has_relevant_history:
        return ChatResponse(reply=DEFAULT_REFUSAL, refused=True)

    api_key = getenv("GROQ_API")
    if not api_key:
        logger.error("GROQ_API key is not configured")
        raise HTTPException(status_code=503, detail="Chat service is not configured")

    model = getenv("GROQ_MODEL", "llama3-70b-8192")
    page_context = payload.page_context or "the Phishing Detection AI application"
    system_prompt = SYSTEM_PROMPT.format(page_context=page_context)

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(prior_messages)
    messages.append({"role": "user", "content": message})

    request_body = {
        "model": model,
        "messages": messages,
        "temperature": 0.2,
        "top_p": 0.9,
        "max_tokens": 600,
        "stream": False,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=40.0) as client:
            response = await client.post(GROQ_ENDPOINT, headers=headers, json=request_body)
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.error("Groq returned %s: %s", exc.response.status_code, exc.response.text)
        raise HTTPException(status_code=502, detail="Chat service error") from exc
    except httpx.RequestError as exc:
        logger.error("Groq request failed: %s", exc)
        raise HTTPException(status_code=502, detail="Unable to reach chat service") from exc

    data = response.json()
    try:
        reply = data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError) as exc:
        logger.error("Unexpected chat response format: %s", exc)
        raise HTTPException(status_code=502, detail="Invalid chat response") from exc

    return ChatResponse(reply=reply)
