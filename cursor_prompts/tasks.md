
# Cursor Task Plan

1) Backend
- Implement `/api/analyze` to accept `email_text`, parse, score, summarize, and persist.
- Implement `/api/gmail/parse` as a placeholder (later: OAuth/Gmail API).
- Add unit tests for agents.
- Add JWT auth later (scaffold only).

2) Agents
- `email_parser.py`: replace heuristic parser with spaCy NER, URL extraction, headers, attachments.
- `risk_scorer.py`: implement ML (e.g., Logistic Regression/XGBoost) + rules; compute final score 0..1.
- `alert_generator.py`: call Ollama for natural-language summaries. Provide fallback string if Ollama disabled.

3) Frontend
- Fetch to `/api/analyze`.
- Render donut chart and history list.
- Improve UX states (loading, error).

4) Chrome Extension
- Allow user to select email text in Gmail and send to backend.
- Store backend URL in extension storage.
