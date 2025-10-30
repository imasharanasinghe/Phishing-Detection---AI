const CHATBOT_API_BASE = window.API_BASE || 'http://localhost:3000';
const CHAT_ENDPOINT = `${CHATBOT_API_BASE}/api/chat`;
const SUGGESTED_QUESTIONS = [
  'How do I analyze an email?',
  'What does the risk score mean?',
  'How do I connect Gmail?',
  'Where can I see past analyses?',
  'How do team members get added?'
];
const WELCOME_MESSAGE_TEXT = "Hi! I'm Aegis, the Phishing Detection AI assistant. Ask me about analyzing emails, threat reports, integrations, team access, or staying safe from phishing.";

let chatBotOpen = false;
let chatHistory = [];
let isProcessing = false;

(function initialiseChatbot() {
  document.addEventListener('DOMContentLoaded', () => {
    ensureChatWidget();
    bindChatbot();
    scheduleLandingPageNudge();
  });
})();

function ensureChatWidget() {
  if (document.getElementById('chatBotWidget')) {
    initialiseWelcomeMessage();
    return;
  }

  const widget = document.createElement('div');
  widget.id = 'chatBotWidget';
  widget.className = 'chatbot-widget';
  widget.innerHTML = `
    <div id="chatBotToggle" class="chatbot-toggle">
      <div class="chatbot-icon">🤖</div>
      <div class="chatbot-pulse"></div>
    </div>
    <div id="chatBotWindow" class="chatbot-window" style="display: none;">
      <div class="chatbot-header">
        <div class="chatbot-title">
          <div class="chatbot-avatar">🤖</div>
          <div class="chatbot-info">
            <h4>AI Assistant</h4>
            <span class="chatbot-status">Online</span>
          </div>
        </div>
        <button class="chatbot-close" aria-label="Close chatbot">&times;</button>
      </div>
      <div class="chatbot-messages" id="chatBotMessages"></div>
      <div class="chatbot-input">
        <input type="text" id="chatBotInput" placeholder="Ask about phishing detection or the dashboard..." autocomplete="off" />
        <button id="chatBotSend" class="chatbot-send-btn">Send</button>
      </div>
    </div>
  `;

  document.body.appendChild(widget);
  initialiseWelcomeMessage();
}

function initialiseWelcomeMessage() {
  const messagesContainer = document.getElementById('chatBotMessages');
  if (!messagesContainer || messagesContainer.children.length > 0 || chatHistory.length > 0) {
    return;
  }

  const suggestions = SUGGESTED_QUESTIONS.map((question) =>
    `<button class="quick-btn" data-question="${escapeHTML(question)}">${escapeHTML(question)}</button>`
  ).join('');

  const welcomeHtml = `
    <p>${escapeHTML(WELCOME_MESSAGE_TEXT)}</p>
    <div class="quick-questions">${suggestions}</div>
  `;

  addMessage(welcomeHtml, 'bot', { html: true });
  chatHistory.push({ role: 'assistant', content: WELCOME_MESSAGE_TEXT });
}

function bindChatbot() {
  if (window.__chatBotInitialized) {
    return;
  }

  const toggle = document.getElementById('chatBotToggle');
  const windowEl = document.getElementById('chatBotWindow');
  const closeBtn = document.querySelector('.chatbot-close');
  const sendBtn = document.getElementById('chatBotSend');
  const input = document.getElementById('chatBotInput');
  const messagesContainer = document.getElementById('chatBotMessages');

  if (!toggle || !windowEl || !sendBtn || !input || !messagesContainer) {
    return;
  }

  toggle.addEventListener('click', () => {
    chatBotOpen = !chatBotOpen;
    windowEl.style.display = chatBotOpen ? 'flex' : 'none';
    if (chatBotOpen) {
      input.focus();
    }
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      chatBotOpen = false;
      windowEl.style.display = 'none';
    });
  }

  sendBtn.addEventListener('click', () => handleOutgoingMessage());
  input.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      handleOutgoingMessage();
    }
  });

  messagesContainer.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.question) {
      askQuickQuestion(target.dataset.question);
    }
  });

  document.addEventListener('click', (event) => {
    if (!chatBotOpen) return;
    const target = event.target;
    if (!windowEl.contains(target) && !toggle.contains(target)) {
      chatBotOpen = false;
      windowEl.style.display = 'none';
    }
  });

  window.__chatBotInitialized = true;
}

async function handleOutgoingMessage() {
  if (isProcessing) {
    return;
  }

  const input = document.getElementById('chatBotInput');
  const message = input ? input.value.trim() : '';
  if (!message) {
    return;
  }

  addMessage(message, 'user');
  chatHistory.push({ role: 'user', content: message });
  input.value = '';
  await requestAssistantResponse(message);
}

async function requestAssistantResponse(message) {
  const sendBtn = document.getElementById('chatBotSend');
  const input = document.getElementById('chatBotInput');

  setProcessingState(true, sendBtn, input);
  showTypingIndicator();

  const priorMessages = chatHistory.slice(0, -1).slice(-8);
  const payload = {
    message,
    conversation: priorMessages,
    page_context: window.location.pathname
  };

  const headers = {
    'Content-Type': 'application/json'
  };
  const token = window.localStorage ? localStorage.getItem('JWT') : null;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const replyText = typeof data.reply === 'string' ? data.reply : 'I had trouble understanding that request.';

    hideTypingIndicator();
    addMessage(formatAssistantText(replyText), 'bot', { html: true });
    chatHistory.push({ role: 'assistant', content: replyText });

    if (data.refused) {
      // Keep suggestions visible if we refused to answer
      addFollowUpPrompt();
    }
  } catch (error) {
    console.error('Chat assistant error:', error);
    hideTypingIndicator();
    addMessage(
      'I\'m having trouble connecting to the assistant right now. Please try again shortly or email support@phishing-detection-ai.com.',
      'bot'
    );
    const last = chatHistory[chatHistory.length - 1];
    if (last && last.role === 'user' && last.content === message) {
      chatHistory.pop();
    }
  } finally {
    setProcessingState(false, sendBtn, input);
  }
}

function addFollowUpPrompt() {
  const messagesContainer = document.getElementById('chatBotMessages');
  if (!messagesContainer) return;
  const suggestions = SUGGESTED_QUESTIONS.map((question) =>
    `<button class=\"quick-btn\" data-question=\"${escapeHTML(question)}\">${escapeHTML(question)}</button>`
  ).join('');
  addMessage(`<p>Here are a few things I can help with:</p><div class=\"quick-questions\">${suggestions}</div>`, 'bot', { html: true });
}

function addMessage(content, sender, options = {}) {
  const { html = false } = options;
  const messagesContainer = document.getElementById('chatBotMessages');
  if (!messagesContainer) {
    return;
  }

  const messageDiv = document.createElement('div');
  messageDiv.className = `chatbot-message ${sender}-message`;

  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';

  if (html) {
    contentDiv.innerHTML = content;
  } else {
    contentDiv.textContent = content;
  }

  messageDiv.appendChild(contentDiv);
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showTypingIndicator() {
  const messagesContainer = document.getElementById('chatBotMessages');
  if (!messagesContainer) {
    return;
  }

  const typingDiv = document.createElement('div');
  typingDiv.className = 'chatbot-message bot-message typing-indicator';
  typingDiv.id = 'typingIndicator';
  typingDiv.innerHTML = `
    <div class="message-content">
      <div class="typing-indicator">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;
  messagesContainer.appendChild(typingDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function hideTypingIndicator() {
  const typingIndicator = document.getElementById('typingIndicator');
  if (typingIndicator) {
    typingIndicator.remove();
  }
}

function escapeHTML(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatAssistantText(text) {
  const safe = escapeHTML(text);
  return safe.replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>');
}

function setProcessingState(active, button, input) {
  isProcessing = active;
  if (button) {
    button.disabled = active;
  }
  if (input) {
    input.disabled = active;
  }
}

function askQuickQuestion(question) {
  const input = document.getElementById('chatBotInput');
  if (!input) {
    return;
  }
  input.value = question;
  handleOutgoingMessage();
}

function scheduleLandingPageNudge() {
  setTimeout(() => {
    const toggle = document.getElementById('chatBotToggle');
    if (!chatBotOpen && toggle && window.location.pathname.includes('index.html')) {
      toggle.style.animation = 'chatbotPulse 1s ease-in-out 3';
    }
  }, 10000);
}

window.askQuickQuestion = askQuickQuestion;
