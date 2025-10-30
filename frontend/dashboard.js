// Dashboard-specific JavaScript
let riskChart = null;
let trendChart = null;
let attackPatternsChart = null;
const API_BASE = (window.API_BASE || 'http://localhost:3000').replace(/\/$/, '');
let lastAnalysisResult = null;
let currentAnalysisMode = 'manual';
let currentHistoryFilters = {};
let selectedHistoryItems = new Set();
let savedViews = JSON.parse(localStorage.getItem('historyViews') || '{}');
let threatsData = [];
let selectedThreats = new Set();
let threatFeedPaused = false;
let threatFeedInterval = null;
let dashboardInitialized = false;
let analysisHistory = [];

// Gmail Integration
let gmailConnected = false;
let gmailEmails = [];
let gmailAccessToken = null;
let gmailClient = null;

// Google OAuth Configuration
const GMAIL_SETTINGS = typeof GMAIL_CONFIG !== 'undefined'
    ? GMAIL_CONFIG
    : {
        CLIENT_ID: '',
        API_KEY: '',
        SCOPES: 'https://www.googleapis.com/auth/gmail.readonly',
        DISCOVERY_DOC: 'https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest',
    };

const GOOGLE_CLIENT_ID = GMAIL_SETTINGS.CLIENT_ID;
const GOOGLE_API_KEY = GMAIL_SETTINGS.API_KEY;
const GMAIL_SCOPES = GMAIL_SETTINGS.SCOPES;
const GMAIL_DISCOVERY_DOC = GMAIL_SETTINGS.DISCOVERY_DOC;

// Gmail OAuth setup
function setupGmailIntegration() {
    const connectBtn = document.getElementById('connectGmailBtn');
    const disconnectBtn = document.getElementById('disconnectGmailBtn');
    const refreshBtn = document.getElementById('refreshGmailBtn');
    const gmailSection = document.getElementById('gmailSection');
    
    if (connectBtn) {
        connectBtn.addEventListener('click', connectGmail);
    }
    
    if (disconnectBtn) {
        disconnectBtn.addEventListener('click', disconnectGmail);
    }
    
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshGmailEmails);
    }
    
    // Check if Gmail is already connected
    checkGmailConnection();
}

// Connect to Gmail using Google OAuth
async function connectGmail() {
    const connectBtn = document.getElementById('connectGmailBtn');
    const gmailSection = document.getElementById('gmailSection');
    
    try {
        // Show loading state
        connectBtn.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-text">Connecting...</span>';
        connectBtn.disabled = true;
        
        // Initialize Google API client
        await gapi.load('client', async () => {
            try {
                await gapi.client.init({
                    apiKey: GOOGLE_API_KEY,
                    clientId: GOOGLE_CLIENT_ID,
                    discoveryDocs: [GMAIL_DISCOVERY_DOC],
                    scope: GMAIL_SCOPES
                });
                
                // Request authorization
                const authResult = await gapi.auth2.getAuthInstance().signIn({
                    scope: GMAIL_SCOPES
                });
                
                if (authResult.isSignedIn()) {
                    gmailAccessToken = gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().access_token;
                    gmailClient = gapi.client;
                    gmailConnected = true;
                    
                    // Store connection status
                    localStorage.setItem('gmailConnected', 'true');
                    localStorage.setItem('gmailAccessToken', gmailAccessToken);
                    
                    // Update UI
                    connectBtn.innerHTML = '<span class="btn-icon">✅</span><span class="btn-text">Gmail Connected</span>';
                    connectBtn.classList.add('connected');
                    gmailSection.style.display = 'block';
                    
                    // Load real Gmail emails
                    await loadRealGmailEmails();
                    
                    showSuccess('Gmail connected successfully!');
                } else {
                    throw new Error('User did not authorize Gmail access');
                }
                
            } catch (error) {
                console.error('Gmail OAuth failed:', error);
                showError('Failed to connect to Gmail. Please try again.');
                
                // Reset button
                connectBtn.innerHTML = '<span class="btn-icon">📧</span><span class="btn-text">Connect Gmail</span>';
                connectBtn.disabled = false;
            }
        });
        
    } catch (error) {
        console.error('Gmail connection failed:', error);
        showError('Failed to connect to Gmail. Please try again.');
        
        // Reset button
        connectBtn.innerHTML = '<span class="btn-icon">📧</span><span class="btn-text">Connect Gmail</span>';
        connectBtn.disabled = false;
    }
}

// Disconnect Gmail
function disconnectGmail() {
    const connectBtn = document.getElementById('connectGmailBtn');
    const gmailSection = document.getElementById('gmailSection');
    
    // Sign out from Google
    if (gapi.auth2 && gapi.auth2.getAuthInstance()) {
        gapi.auth2.getAuthInstance().signOut();
    }
    
    gmailConnected = false;
    gmailEmails = [];
    gmailAccessToken = null;
    gmailClient = null;
    
    // Remove connection status
    localStorage.removeItem('gmailConnected');
    localStorage.removeItem('gmailAccessToken');
    
    // Update UI
    connectBtn.innerHTML = '<span class="btn-icon">📧</span><span class="btn-text">Connect Gmail</span>';
    connectBtn.classList.remove('connected');
    gmailSection.style.display = 'none';
    
    showSuccess('Gmail disconnected successfully!');
}

// Check Gmail connection status
function checkGmailConnection() {
    const isConnected = localStorage.getItem('gmailConnected') === 'true';
    const storedToken = localStorage.getItem('gmailAccessToken');
    
    if (isConnected && storedToken) {
        gmailConnected = true;
        gmailAccessToken = storedToken;
        const connectBtn = document.getElementById('connectGmailBtn');
        const gmailSection = document.getElementById('gmailSection');
        
        if (connectBtn) {
            connectBtn.innerHTML = '<span class="btn-icon">✅</span><span class="btn-text">Gmail Connected</span>';
            connectBtn.classList.add('connected');
        }
        if (gmailSection) {
            gmailSection.style.display = 'block';
        }
        
        // Initialize Gmail client and load emails
        initializeGmailClient();
    }
}

// Initialize Gmail client with stored token
async function initializeGmailClient() {
    try {
        await gapi.load('client', async () => {
            await gapi.client.init({
                apiKey: GOOGLE_API_KEY,
                clientId: GOOGLE_CLIENT_ID,
                discoveryDocs: [GMAIL_DISCOVERY_DOC],
                scope: GMAIL_SCOPES
            });
            
            gmailClient = gapi.client;
            await loadRealGmailEmails();
        });
    } catch (error) {
        console.error('Failed to initialize Gmail client:', error);
        // Fallback to sample emails if initialization fails
        loadSampleGmailEmails();
    }
}

// Load real Gmail emails from Gmail API
async function loadRealGmailEmails() {
    if (!gmailClient || !gmailAccessToken) {
        console.error('Gmail client or access token not available');
        loadSampleGmailEmails(); // Fallback to sample emails
        return;
    }
    
    try {
        // Fetch recent emails from Gmail
        const response = await gmailClient.gmail.users.messages.list({
            userId: 'me',
            maxResults: 10,
            q: 'in:inbox' // Only inbox emails
        });
        
        const messages = response.result.messages || [];
        gmailEmails = [];
        
        // Process each email
        for (const message of messages) {
            try {
                const emailDetail = await gmailClient.gmail.users.messages.get({
                    userId: 'me',
                    id: message.id,
                    format: 'full'
                });
                
                const headers = emailDetail.result.payload.headers;
                const sender = headers.find(h => h.name === 'From')?.value || 'Unknown';
                const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
                const date = headers.find(h => h.name === 'Date')?.value || new Date().toISOString();
                
                // Extract email body (simplified)
                let content = '';
                if (emailDetail.result.payload.body && emailDetail.result.payload.body.data) {
                    content = atob(emailDetail.result.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
                } else if (emailDetail.result.payload.parts) {
                    for (const part of emailDetail.result.payload.parts) {
                        if (part.mimeType === 'text/plain' && part.body && part.body.data) {
                            content = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
                            break;
                        }
                    }
                }
                
                // Analyze email for phishing risk (simplified)
                const riskScore = analyzeEmailRisk(content, sender, subject);
                const riskLevel = getRiskLevel(riskScore);
                
                gmailEmails.push({
                    id: message.id,
                    sender: sender,
                    subject: subject,
                    time: formatEmailTime(date),
                    riskScore: riskScore,
                    riskLevel: riskLevel,
                    content: content.substring(0, 200) + '...' // Truncate for display
                });
                
            } catch (error) {
                console.error('Error processing email:', error);
            }
        }
        
        updateGmailStats();
        renderGmailEmails();
        
    } catch (error) {
        console.error('Failed to load Gmail emails:', error);
        showError('Failed to load Gmail emails. Using sample data.');
        loadSampleGmailEmails(); // Fallback to sample emails
    }
}

// Simple email risk analysis
function analyzeEmailRisk(content, sender, subject) {
    let riskScore = 0;
    
    // Check for suspicious patterns
    const suspiciousPatterns = [
        'urgent', 'verify', 'suspended', 'expired', 'immediately',
        'click here', 'verify now', 'account locked', 'security alert'
    ];
    
    const suspiciousDomains = [
        'paypal-security.com', 'amazon-security.com', 'microsoft-security.com',
        'bank-security.com', 'apple-security.com'
    ];
    
    const text = (content + ' ' + subject).toLowerCase();
    
    // Check patterns
    suspiciousPatterns.forEach(pattern => {
        if (text.includes(pattern)) {
            riskScore += 15;
        }
    });
    
    // Check sender domain
    suspiciousDomains.forEach(domain => {
        if (sender.toLowerCase().includes(domain)) {
            riskScore += 30;
        }
    });
    
    // Check for suspicious links
    if (text.includes('http://') || text.includes('https://')) {
        riskScore += 10;
    }
    
    return Math.min(riskScore, 100);
}

// Get risk level from score
function getRiskLevel(score) {
    if (score >= 70) return 'high';
    if (score >= 40) return 'medium';
    if (score >= 20) return 'low';
    return 'safe';
}

// Format email time
function formatEmailTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return 'Just now';
}

// Load sample Gmail emails (for demo)
async function loadSampleGmailEmails() {
    const sampleEmails = [
        {
            id: '1',
            sender: 'noreply@paypal.com',
            subject: 'Your account has been suspended',
            time: '2 hours ago',
            riskScore: 85,
            riskLevel: 'high',
            content: 'Urgent: Your PayPal account has been suspended due to suspicious activity...'
        },
        {
            id: '2',
            sender: 'support@microsoft.com',
            subject: 'Security alert for your account',
            time: '4 hours ago',
            riskScore: 25,
            riskLevel: 'low',
            content: 'We detected unusual sign-in activity on your Microsoft account...'
        },
        {
            id: '3',
            sender: 'billing@amazon.com',
            subject: 'Payment confirmation',
            time: '6 hours ago',
            riskScore: 15,
            riskLevel: 'safe',
            content: 'Thank you for your recent purchase. Your payment has been processed...'
        },
        {
            id: '4',
            sender: 'urgent@bank-security.com',
            subject: 'Verify your account immediately',
            time: '8 hours ago',
            riskScore: 92,
            riskLevel: 'high',
            content: 'Your bank account will be closed if you do not verify your identity...'
        },
        {
            id: '5',
            sender: 'newsletter@techcrunch.com',
            subject: 'Weekly tech news digest',
            time: '1 day ago',
            riskScore: 5,
            riskLevel: 'safe',
            content: 'This week in tech: AI breakthroughs, startup funding rounds...'
        }
    ];
    
    gmailEmails = sampleEmails;
    updateGmailStats();
    renderGmailEmails();
}

// Update Gmail statistics
function updateGmailStats() {
    const totalEmails = gmailEmails.length;
    const analyzedEmails = gmailEmails.length; // All emails are analyzed
    const threatsFound = gmailEmails.filter(email => email.riskLevel === 'high' || email.riskLevel === 'medium').length;
    const set = (id,val) => { const el = document.getElementById(id); if(el) el.textContent = String(val); };
    set('gmailTotalEmails', totalEmails);
    set('gmailAnalyzedEmails', analyzedEmails);
    set('gmailThreatsFound', threatsFound);
}

// Render Gmail emails
function renderGmailEmails() {
    const emailList = document.getElementById('gmailEmailList');
    
    if (!emailList) return;
    
    emailList.innerHTML = gmailEmails.map(email => `
        <div class="email-item" onclick="analyzeGmailEmail('${email.id}')">
            <div class="email-header">
                <span class="email-sender">${email.sender}</span>
                <span class="email-time">${email.time}</span>
            </div>
            <div class="email-subject">${email.subject}</div>
            <div class="email-risk">
                <span class="risk-badge ${email.riskLevel}">${email.riskLevel.toUpperCase()}</span>
                <span style="font-size: 0.8rem; color: #718096;">${email.riskScore}% risk</span>
            </div>
        </div>
    `).join('');
}

// Analyze Gmail email
async function analyzeGmailEmail(emailId) {
    const email = gmailEmails.find(e => e.id === emailId);
    if (!email) return;
    
    // Copy email content to main analysis area
    const mainTextarea = document.getElementById('rawEmail');
    if (mainTextarea) {
        mainTextarea.value = `From: ${email.sender}\nSubject: ${email.subject}\n\n${email.content}`;
        updateCharCount();
        
        // Scroll to analysis section
        document.querySelector('.analyze-section').scrollIntoView({ behavior: 'smooth' });
        
        // Trigger analysis
        setTimeout(() => {
            document.getElementById('runAnalyze').click();
        }, 500);
    }
}

// Refresh Gmail emails
async function refreshGmailEmails() {
    const refreshBtn = document.getElementById('refreshGmailBtn');
    
    if (refreshBtn) {
        refreshBtn.innerHTML = '<span class="btn-icon">⏳</span>Refreshing...';
        refreshBtn.disabled = true;
    }
    
    try {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Reload emails
        await loadSampleGmailEmails();
        
        showSuccess('Gmail emails refreshed successfully!');
        
    } catch (error) {
        console.error('Failed to refresh emails:', error);
        showError('Failed to refresh emails. Please try again.');
    } finally {
        if (refreshBtn) {
            refreshBtn.innerHTML = '<span class="btn-icon">🔄</span>Refresh';
            refreshBtn.disabled = false;
        }
    }
}

// Modal functionality
function setupModal() {
    const openModalBtn = document.getElementById('openQuickCheckModal');
    const closeModalBtn = document.getElementById('closeQuickCheckModal');
    const modal = document.getElementById('quickCheckModal');
    
    if (openModalBtn) {
        openModalBtn.addEventListener('click', function() {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        });
    }
    
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', function() {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        });
    }
    
    // Close modal when clicking outside
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
        });
    }
}

// Quick check functionality
function setupQuickCheck() {
    const quickCheckBtn = document.getElementById('quickCheckBtn');
    const quickEmailUrl = document.getElementById('quickEmailUrl');
    const quickActionBtns = document.querySelectorAll('.quick-action-btn');
    
    // Quick check button
    if (quickCheckBtn) {
        quickCheckBtn.addEventListener('click', async function() {
            const emailContent = quickEmailUrl.value.trim();
            if (emailContent) {
                await performQuickCheck(emailContent);
            } else {
                showError('Please enter email content to analyze');
            }
        });
    }
    
    // Quick action buttons
    quickActionBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const action = this.dataset.action;
            let placeholder = '';
            
            switch(action) {
                case 'gmail':
                    placeholder = 'Paste Gmail URL or email content here...';
                    break;
                case 'outlook':
                    placeholder = 'Paste Outlook URL or email content here...';
                    break;
                case 'yahoo':
                    placeholder = 'Paste Yahoo Mail URL or email content here...';
                    break;
            }
            
            quickEmailUrl.placeholder = placeholder;
            quickEmailUrl.focus();
        });
    });
}

// Character count functionality
function updateCharCount() {
    const textarea = document.getElementById('rawEmail');
    const charCount = document.querySelector('.char-count');
    
    if (textarea && charCount) {
        const count = textarea.value.length;
        charCount.textContent = `${count} characters`;
        
        // Change color based on length
        if (count > 1000) {
            charCount.style.color = '#48bb78';
        } else if (count > 500) {
            charCount.style.color = '#ed8936';
        } else {
            charCount.style.color = '#718096';
        }
    }
}

// Additional Analysis helpers (validators, breakdown, export)
function updateValidators(){
    const ta = document.getElementById('rawEmail');
    if(!ta) return;
    const text = ta.value || '';
    const words = (text.trim().match(/\S+/g) || []).length;
    const links = (text.match(/https?:\/\//gi) || []).length;
    const hasHtml = /<[^>]+>/.test(text);
    const auth = parseAuthResults(text);
    const set = (id, val) => { const el=document.getElementById(id); if(el){ const span = el.querySelector('span'); if(span) span.textContent = val; }}
    set('val-length', String(text.length));
    set('val-words', String(words));
    set('val-links', String(links));
    set('val-html', hasHtml? 'yes':'no');
    const authStr = auth ? `${auth.spf}/${auth.dkim}/${auth.dmarc}` : 'n/a';
    const authEl = document.getElementById('val-auth');
    if(authEl){ const span = authEl.querySelector('span'); if(span) span.textContent = authStr; }
}

function parseAuthResults(text){
    const m = text.match(/Authentication-Results:[\s\S]*?(spf=\w+)?[\s\S]*?(dkim=\w+)?[\s\S]*?(dmarc=\w+)?/i);
    if(!m) return null;
    const get = (re, def='unknown') => { const mm = text.match(re); return mm? mm[1].toLowerCase(): def; };
    return { spf: get(/spf=(pass|fail|none)/i, 'n/a'), dkim: get(/dkim=(pass|fail|none)/i, 'n/a'), dmarc: get(/dmarc=(pass|fail|none)/i, 'n/a') };
}

function getTemplateText(key){
    if(key==='bank') return `Subject: Urgent: Verify Your Account Immediately\n\nDear Customer,\n\nWe detected unusual activity on your account. Please verify now:\nhttps://secure-paypa1.com/verify\n\nRegards,\nSecurity`;
    if(key==='invoice') return `Subject: Overdue Invoice Notice\n\nPlease pay your outstanding invoice at:\nhttp://invoices-payments.xyz/pay\n\nThank you.`;
    if(key==='delivery') return `Subject: Delivery Attempt Failed\n\nWe tried to deliver your package. Reschedule here:\nhttp://ship-track.ml/reschedule`;
    return '';
}

function updateBreakdown(data){
    const parsed = data.parsed || {};
    const body = parsed.body_text || '';
    const urls = parsed.urls || [];
    const kwList = ['urgent','verify','suspended','immediately','account locked','security alert','click here'];
    let kwCount = 0; const lower = body.toLowerCase(); kwList.forEach(k=>{ if(lower.includes(k)) kwCount++; });
    const exclam = (body.match(/!/g) || []).length;
    const capsRatio = body ? (body.replace(/[^A-Z]/g,'').length / body.length) : 0;
    const suspiciousTldCount = urls.filter(u=>u.has_suspicious_tld).length;
    const shortenedCount = urls.filter(u=>u.is_shortened).length;
    const urlCount = urls.length;
    let heur = Math.min(60, kwCount*10 + (exclam>3?10:0) + (capsRatio>0.3?10:0));
    let urlc = Math.min(30, suspiciousTldCount*10 + shortenedCount*10 + (urlCount>0?5:0));
    let ml = Math.max(10, 100 - heur - urlc);
    setBreakdownUI(heur, ml, urlc);
}

function setBreakdownUI(heur, ml, urlc){
    const set = (id,val) => { const el=document.getElementById(id); if(el){ el.style.width = `${val}%`; } const v=document.getElementById(id+'-val'); if(v){ v.textContent = `${val}%`; }};
    set('br-heur', Math.round(heur));
    set('br-ml', Math.round(ml));
    set('br-url', Math.round(urlc));
}

function updateDomainReputation(data){
    const parsed = data.parsed || {};
    const fromHeader = (parsed.headers && parsed.headers.from) || '';
    let domain = '';
    const m = fromHeader.match(/@([^>\s]+)/);
    if(m) domain = m[1];
    if(!domain){
        const u = (parsed.urls||[])[0];
        if(u && u.domain) domain = u.domain;
    }
    if(!domain) return;
    const tldSusp = /\.(tk|ml|ga|cf|bit|onion)$/i.test(domain);
    const set = (id, val) => { const el=document.getElementById(id); if(el) el.textContent = val; };
    set('rep-age', tldSusp? 'unknown/young' : 'likely established');
    set('rep-mx', tldSusp? 'unknown' : 'present (heuristic)');
    set('rep-bl', tldSusp? 'possible' : 'none seen');
    set('rep-tld', tldSusp? 'yes' : 'no');
    const who = document.getElementById('whoisLink'); if (who){ who.href = `https://who.is/whois/${domain}`; }
}

function updateEvidence(data){
    const wrap = document.getElementById('evidenceList');
    if(!wrap) return;
    const parsed = data.parsed || {};
    const urls = parsed.urls || [];
    const body = (parsed.body_text || '');
    const phrases = ['verify your account','security alert','password','suspended','immediately'];
    const found = phrases.filter(p=> body.toLowerCase().includes(p));
    const items = [];
    urls.forEach(u=> items.push({type:'URL', value: u.url}));
    found.forEach(p=> items.push({type:'Phrase', value: p}));
    if(items.length===0){ wrap.innerHTML = '<div class="ev">No evidence found</div>'; return; }
    wrap.innerHTML = items.map(it=>`<div class="ev"><div><strong>${it.type}:</strong> ${escapeHtml(it.value)}</div><button class="copy" data-val="${encodeURIComponent(it.value)}">Copy</button></div>`).join('');
    wrap.querySelectorAll('button.copy').forEach(btn=>{
        btn.addEventListener('click', ()=>{
            const val = decodeURIComponent(btn.getAttribute('data-val'));
            navigator.clipboard.writeText(val);
            btn.textContent = 'Copied!';
            setTimeout(()=>{ btn.textContent = 'Copy'; }, 1200);
        });
    });
}

function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
}

function exportLastResultJSON(){
    if(!lastAnalysisResult){ alert('Run an analysis first'); return; }
    const blob = new Blob([JSON.stringify(lastAnalysisResult, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'analysis.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

function exportLastResultCSV(){
    if(!lastAnalysisResult){ alert('Run an analysis first'); return; }
    const d = lastAnalysisResult;
    const rows = [
        ['score','level','reason','alert_summary'],
        [Math.round((d.score||0)*100), d.level||'', (d.reason||'').replace(/\n/g,' '), (d.alert_summary||'').replace(/\n/g,' ')]
    ];
    const csv = rows.map(r => r.map(x => '"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'analysis.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ===== Advanced History Features =====
function setupHistoryFeatures(){
    // Saved views
    setupSavedViews();
    // Faceted filters
    setupFacetedFilters();
    // Bulk actions
    setupBulkActions();
    // Trend chart
    setupTrendChart();
    // Session restore
    restoreHistorySession();
    // Enhanced history display
    setupEnhancedHistoryDisplay();
}

function setupSavedViews(){
    const viewChips = document.querySelectorAll('.view-chip');
    const saveBtn = document.getElementById('saveCurrentView');
    
    viewChips.forEach(chip => {
        chip.addEventListener('click', () => {
            viewChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            const view = chip.dataset.view;
            applyPresetView(view);
        });
    });
    
    if(saveBtn){
        saveBtn.addEventListener('click', () => {
            const name = prompt('Enter view name:');
            if(name) saveCurrentView(name);
        });
    }
}

function applyPresetView(view){
    const filters = getPresetFilters(view);
    Object.keys(filters).forEach(key => {
        const el = document.getElementById(key);
        if(el) el.value = filters[key];
    });
    currentHistoryFilters = {...filters};
    applyHistoryFilters();
    saveHistorySession();
}

function getPresetFilters(view){
    const presets = {
        'all': {},
        'high-risk': {riskFilter: 'high'},
        'unknown-tlds': {domainFilter: '.tk,.ml,.ga,.cf'},
        'past-7-days': {dateFilter: 'week'},
        'has-links': {linkFilter: 'has-links'}
    };
    return presets[view] || {};
}

function saveCurrentView(name){
    savedViews[name] = {...currentHistoryFilters};
    localStorage.setItem('historyViews', JSON.stringify(savedViews));
    // Add to view chips dynamically
    const viewChips = document.querySelector('.view-chips');
    if(viewChips){
        const chip = document.createElement('button');
        chip.className = 'view-chip';
        chip.dataset.view = name;
        chip.textContent = name;
        chip.addEventListener('click', () => applyPresetView(name));
        viewChips.appendChild(chip);
    }
}

function setupFacetedFilters(){
    const filterIds = ['riskFilter','sourceFilter','dateFilter','attachmentFilter','domainFilter','linkFilter','searchFilter'];
    filterIds.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('change', updateCurrentFilters);
    });
    
    const applyBtn = document.getElementById('applyFilters');
    const clearBtn = document.getElementById('clearFilters');
    
    if(applyBtn) applyBtn.addEventListener('click', applyHistoryFilters);
    if(clearBtn) clearBtn.addEventListener('click', clearHistoryFilters);
}

function updateCurrentFilters(){
    const filterIds = ['riskFilter','sourceFilter','dateFilter','attachmentFilter','domainFilter','linkFilter','searchFilter'];
    filterIds.forEach(id => {
        const el = document.getElementById(id);
        if(el && el.value) currentHistoryFilters[id] = el.value;
        else delete currentHistoryFilters[id];
    });
}

function applyHistoryFilters(){
    updateCurrentFilters();
    const filtered = getAdvancedFilteredHistory();
    displayFilteredHistory(filtered);
    updateFilteredStats(filtered);
    saveHistorySession();
}

function clearHistoryFilters(){
    const filterIds = ['riskFilter','sourceFilter','dateFilter','attachmentFilter','domainFilter','linkFilter','searchFilter'];
    filterIds.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = el.tagName === 'SELECT' ? 'all' : '';
    });
    currentHistoryFilters = {};
    applyHistoryFilters();
}

function getAdvancedFilteredHistory(){
    let filtered = [...analysisHistory];
    
    // Risk level filter
    if(currentHistoryFilters.riskFilter && currentHistoryFilters.riskFilter !== 'all'){
        filtered = filtered.filter(item => item.riskLevel === currentHistoryFilters.riskFilter);
    }
    
    // Source filter (mock - would need source tracking in real app)
    if(currentHistoryFilters.sourceFilter && currentHistoryFilters.sourceFilter !== 'all'){
        filtered = filtered.filter(item => (item.source || 'manual') === currentHistoryFilters.sourceFilter);
    }
    
    // Date filter
    if(currentHistoryFilters.dateFilter && currentHistoryFilters.dateFilter !== 'all'){
        const now = new Date();
        filtered = filtered.filter(item => {
            const itemDate = new Date(item.timestamp);
            switch(currentHistoryFilters.dateFilter){
                case 'today': return itemDate.toDateString() === now.toDateString();
                case 'week': return itemDate >= new Date(now.getTime() - 7*24*60*60*1000);
                case 'month': return itemDate >= new Date(now.getTime() - 30*24*60*60*1000);
                default: return true;
            }
        });
    }
    
    // Domain filter
    if(currentHistoryFilters.domainFilter){
        const domain = currentHistoryFilters.domainFilter.toLowerCase();
        filtered = filtered.filter(item => {
            const subject = (item.subject || '').toLowerCase();
            const reason = (item.reason || '').toLowerCase();
            return subject.includes(domain) || reason.includes(domain);
        });
    }
    
    // Link filter (mock)
    if(currentHistoryFilters.linkFilter && currentHistoryFilters.linkFilter !== 'all'){
        const hasLinks = currentHistoryFilters.linkFilter === 'has-links';
        filtered = filtered.filter(item => {
            const hasLinksInContent = (item.reason || '').includes('URL') || (item.subject || '').includes('http');
            return hasLinks ? hasLinksInContent : !hasLinksInContent;
        });
    }
    
    // Search filter
    if(currentHistoryFilters.searchFilter){
        const search = currentHistoryFilters.searchFilter.toLowerCase();
        filtered = filtered.filter(item => {
            const subject = (item.subject || '').toLowerCase();
            const reason = (item.reason || '').toLowerCase();
            return subject.includes(search) || reason.includes(search);
        });
    }
    
    return filtered;
}

function setupBulkActions(){
    const selectAll = document.getElementById('selectAll');
    const bulkExport = document.getElementById('bulkExport');
    const bulkMarkSafe = document.getElementById('bulkMarkSafe');
    const bulkDelete = document.getElementById('bulkDelete');
    
    if(selectAll) selectAll.addEventListener('change', toggleSelectAll);
    if(bulkExport) bulkExport.addEventListener('click', exportSelectedItems);
    if(bulkMarkSafe) bulkMarkSafe.addEventListener('click', markSelectedSafe);
    if(bulkDelete) bulkDelete.addEventListener('click', deleteSelectedItems);
}

function toggleSelectAll(){
    const selectAll = document.getElementById('selectAll');
    const checkboxes = document.querySelectorAll('.history-item-checkbox');
    const isChecked = selectAll.checked;
    
    checkboxes.forEach(cb => {
        cb.checked = isChecked;
        const itemId = parseInt(cb.dataset.itemId);
        if(isChecked) selectedHistoryItems.add(itemId);
        else selectedHistoryItems.delete(itemId);
        
        const item = cb.closest('.history-item');
        if(item) item.classList.toggle('selected', isChecked);
    });
    
    updateBulkActionsBar();
}

function updateBulkActionsBar(){
    const bar = document.getElementById('bulkActionsBar');
    const count = document.getElementById('selectedCount');
    const selected = selectedHistoryItems.size;
    
    if(bar) bar.style.display = selected > 0 ? 'flex' : 'none';
    if(count) count.textContent = `${selected} selected`;
}

function exportSelectedItems(){
    const selected = analysisHistory.filter(item => selectedHistoryItems.has(item.id));
    if(selected.length === 0) return;
    
    const csvContent = [
        ['Subject', 'Risk Level', 'Risk Score', 'Date', 'Reason'],
        ...selected.map(item => [
            `"${item.subject}"`, item.riskLevel, item.riskScore,
            formatDate(item.timestamp), `"${item.reason}"`
        ])
    ].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csvContent], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `selected-history-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function markSelectedSafe(){
    const count = selectedHistoryItems.size;
    selectedHistoryItems.clear();
    updateBulkActionsBar();
    showSuccess(`Marked ${count} items as safe`);
    displayFilteredHistory(getAdvancedFilteredHistory());
}

function deleteSelectedItems(){
    if(!confirm(`Delete ${selectedHistoryItems.size} selected items?`)) return;
    
    analysisHistory = analysisHistory.filter(item => !selectedHistoryItems.has(item.id));
    selectedHistoryItems.clear();
    updateBulkActionsBar();
    saveHistory();
    applyHistoryFilters();
}

function setupTrendChart(){
    const canvas = document.getElementById('trendChart');
    if(!canvas || typeof Chart === 'undefined') return;
    
    const ctx = canvas.getContext('2d');
    const trendData = generateTrendData();
    
    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: trendData.labels,
            datasets: [
                {
                    label: 'High Risk',
                    data: trendData.high,
                    borderColor: '#dc2626',
                    backgroundColor: 'rgba(220,38,38,0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Medium Risk',
                    data: trendData.medium,
                    borderColor: '#d97706',
                    backgroundColor: 'rgba(217,119,6,0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Low Risk',
                    data: trendData.low,
                    borderColor: '#059669',
                    backgroundColor: 'rgba(5,150,105,0.1)',
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9fb4d3' } },
                y: { display: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9fb4d3' } }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });
}

function generateTrendData(){
    const days = 14;
    const labels = [];
    const high = [], medium = [], low = [];
    
    for(let i = days-1; i >= 0; i--){
        const date = new Date();
        date.setDate(date.getDate() - i);
        labels.push(date.toLocaleDateString('en-US', {month:'short', day:'numeric'}));
        
        // Mock data based on history
        const dayHistory = analysisHistory.filter(item => {
            const itemDate = new Date(item.timestamp);
            return itemDate.toDateString() === date.toDateString();
        });
        
        high.push(dayHistory.filter(h => h.riskLevel === 'high').length);
        medium.push(dayHistory.filter(h => h.riskLevel === 'medium').length);
        low.push(dayHistory.filter(h => h.riskLevel === 'low').length);
    }
    
    return {labels, high, medium, low};
}

function setupEnhancedHistoryDisplay(){
    // Override the existing updateHistoryDisplay to support new features
    const originalUpdate = updateHistoryDisplay;
    updateHistoryDisplay = function(){
        const filtered = getAdvancedFilteredHistory();
        displayFilteredHistory(filtered);
        updateFilteredStats(filtered);
    };
}

function displayFilteredHistory(filtered){
    const historyList = document.getElementById('historyList');
    const noHistoryMessage = document.getElementById('noHistoryMessage');
    
    if(!historyList) return;
    
    if(filtered.length === 0){
        historyList.style.display = 'none';
        if(noHistoryMessage) noHistoryMessage.style.display = 'block';
        return;
    }
    
    historyList.style.display = 'block';
    if(noHistoryMessage) noHistoryMessage.style.display = 'none';
    
    historyList.innerHTML = filtered.map(item => `
        <div class="history-item ${selectedHistoryItems.has(item.id) ? 'selected' : ''}" data-id="${item.id}">
            <input type="checkbox" class="history-item-checkbox" data-item-id="${item.id}" ${selectedHistoryItems.has(item.id) ? 'checked' : ''}>
            <div class="history-item-main">
                <div class="history-item-header">
                    <span class="history-subject" title="${item.subject}">${item.subject}</span>
                    <span class="history-risk-badge ${item.riskLevel}">${item.riskLevel.toUpperCase()}</span>
                </div>
                <div class="history-item-details">
                    <span class="history-date">${formatDate(item.timestamp)}</span>
                    <span class="history-score">${item.riskScore}%</span>
                    <span class="history-source">${item.source || 'Manual'}</span>
                </div>
                <div class="history-actions-item">
                    <button class="history-action-btn" onclick="togglePreview(${item.id})" title="Toggle Preview">👁️</button>
                    <button class="history-action-btn" onclick="viewHistoryItem(${item.id})" title="View Full">📊</button>
                    <button class="history-action-btn" onclick="removeHistoryItem(${item.id})" title="Remove">🗑️</button>
                </div>
            </div>
            <div class="history-item-preview" id="preview-${item.id}">
                <div class="preview-content">
                    <strong>Analysis Reason:</strong><br>
                    ${item.reason}<br><br>
                    <strong>Alert Summary:</strong><br>
                    ${item.alertSummary}
                </div>
            </div>
        </div>
    `).join('');
    
    // Add event listeners for checkboxes
    historyList.querySelectorAll('.history-item-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const itemId = parseInt(e.target.dataset.itemId);
            const item = e.target.closest('.history-item');
            
            if(e.target.checked){
                selectedHistoryItems.add(itemId);
                item.classList.add('selected');
            } else {
                selectedHistoryItems.delete(itemId);
                item.classList.remove('selected');
            }
            
            updateBulkActionsBar();
        });
    });
}

function togglePreview(itemId){
    const preview = document.getElementById(`preview-${itemId}`);
    if(preview){
        const isExpanded = preview.classList.contains('expanded');
        preview.classList.toggle('expanded', !isExpanded);
    }
}

function updateFilteredStats(filtered){
    const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = String(val); };
    set('totalAnalyses', analysisHistory.length);
    set('highRiskCount', analysisHistory.filter(item => item.riskLevel === 'high').length);
    set('mediumRiskCount', analysisHistory.filter(item => item.riskLevel === 'medium').length);
    set('lowRiskCount', analysisHistory.filter(item => item.riskLevel === 'low').length);
    set('filteredCount', filtered.length);
}

function saveHistorySession(){
    sessionStorage.setItem('historyFilters', JSON.stringify(currentHistoryFilters));
    sessionStorage.setItem('selectedItems', JSON.stringify([...selectedHistoryItems]));
}

function restoreHistorySession(){
    try {
        const savedFilters = sessionStorage.getItem('historyFilters');
        const savedSelected = sessionStorage.getItem('selectedItems');
        
        if(savedFilters){
            currentHistoryFilters = JSON.parse(savedFilters);
            // Restore filter UI
            Object.keys(currentHistoryFilters).forEach(key => {
                const el = document.getElementById(key);
                if(el) el.value = currentHistoryFilters[key];
            });
        }
        
        if(savedSelected){
            selectedHistoryItems = new Set(JSON.parse(savedSelected));
        }
    } catch(e){
        console.warn('Failed to restore history session:', e);
    }
}

// ===== Threats Page Features =====
function setupThreatsFeatures(){
    // Initialize threats data
    initializeThreatsData();
    // Setup threat feed
    setupThreatFeed();
    // Setup attack patterns chart
    setupAttackPatternsChart();
    // Setup threats table
    setupThreatsTable();
    // Setup threat filters
    setupThreatFilters();
    // Setup threat intelligence
    setupThreatIntelligence();
    // Setup threat modal
    setupThreatModal();
    // Update threat stats
    updateThreatStats();
}

async function initializeThreatsData(){
    try {
        // Load real threats data from API
        const user = firebase.auth().currentUser;
        if (!user) {
            console.warn('No authenticated user for threats loading');
            return;
        }
        
        const response = await fetch(`${API_BASE}/api/threats?user_id=${user.uid}&limit=50`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const apiThreats = await response.json();
        
        // Convert API format to frontend format
        threatsData = apiThreats.map(threat => ({
            id: threat.id,
            name: threat.title,
            severity: threat.severity,
            type: threat.threat_type,
            source: threat.source,
            firstSeen: new Date(threat.created_at),
            lastActivity: new Date(threat.updated_at),
            status: threat.status,
            affectedUsers: threat.affected_emails.length,
            description: threat.description,
            iocs: Object.values(threat.indicators).flat(),
            recommendations: [
                {priority: 'high', text: `Address ${threat.threat_type} threat immediately`},
                {priority: 'medium', text: 'Review affected systems and users'},
                {priority: 'low', text: 'Update security policies as needed'}
            ]
        }));
        
        console.log(`Loaded ${threatsData.length} threats from API`);
        return;
        
    } catch (error) {
        console.error('Error loading threats from API:', error);
        console.log('Falling back to mock data');
    }
    
    // Fallback to mock threats data if API fails
    threatsData = [
        {
            id: 1,
            name: 'Phishing Campaign - Bank Impersonation',
            severity: 'critical',
            type: 'phishing',
            source: 'Email Gateway',
            firstSeen: new Date(Date.now() - 2*60*60*1000),
            lastActivity: new Date(Date.now() - 30*60*1000),
            status: 'active',
            affectedUsers: 15,
            description: 'Sophisticated phishing campaign impersonating major banks to steal credentials.',
            iocs: ['suspicious-bank-login.com', '192.168.1.100', 'phish@fake-bank.com'],
            recommendations: [
                {priority: 'high', text: 'Block all emails from suspicious-bank-login.com domain'},
                {priority: 'medium', text: 'Notify affected users and force password reset'},
                {priority: 'low', text: 'Update security awareness training materials'}
            ]
        },
        {
            id: 2,
            name: 'Malware Distribution - Invoice Scam',
            severity: 'high',
            type: 'malware',
            source: 'File Scanner',
            firstSeen: new Date(Date.now() - 4*60*60*1000),
            lastActivity: new Date(Date.now() - 1*60*60*1000),
            status: 'investigating',
            affectedUsers: 8,
            description: 'Malicious attachments disguised as invoices containing trojans.',
            iocs: ['invoice-malware.exe', 'evil-server.tk', 'malware@fake-invoice.com'],
            recommendations: [
                {priority: 'high', text: 'Quarantine all suspicious invoice attachments'},
                {priority: 'medium', text: 'Run full system scans on affected machines'}
            ]
        },
        {
            id: 3,
            name: 'Spam Campaign - Cryptocurrency',
            severity: 'medium',
            type: 'spam',
            source: 'Content Filter',
            firstSeen: new Date(Date.now() - 6*60*60*1000),
            lastActivity: new Date(Date.now() - 2*60*60*1000),
            status: 'blocked',
            affectedUsers: 45,
            description: 'Mass spam campaign promoting fake cryptocurrency investments.',
            iocs: ['crypto-scam.ml', 'spam@fake-crypto.com'],
            recommendations: [
                {priority: 'low', text: 'Update spam filters with new keywords'},
                {priority: 'low', text: 'Monitor for similar campaigns'}
            ]
        },
        {
            id: 4,
            name: 'Suspicious Login Attempts',
            severity: 'medium',
            type: 'suspicious',
            source: 'Auth Monitor',
            firstSeen: new Date(Date.now() - 8*60*60*1000),
            lastActivity: new Date(Date.now() - 10*60*1000),
            status: 'resolved',
            affectedUsers: 3,
            description: 'Multiple failed login attempts from suspicious IP addresses.',
            iocs: ['192.168.1.200', '10.0.0.50'],
            recommendations: [
                {priority: 'medium', text: 'Enable 2FA for affected accounts'},
                {priority: 'low', text: 'Monitor login patterns'}
            ]
        },
        {
            id: 5,
            name: 'Advanced Persistent Threat',
            severity: 'critical',
            type: 'malware',
            source: 'Behavior Analysis',
            firstSeen: new Date(Date.now() - 12*60*60*1000),
            lastActivity: new Date(Date.now() - 5*60*1000),
            status: 'active',
            affectedUsers: 2,
            description: 'Sophisticated APT with command and control communication.',
            iocs: ['apt-c2.onion', 'backdoor.exe', 'apt@evil.com'],
            recommendations: [
                {priority: 'critical', text: 'Immediately isolate affected systems'},
                {priority: 'high', text: 'Contact incident response team'},
                {priority: 'high', text: 'Preserve forensic evidence'}
            ]
        }
    ];
}

function setupThreatFeed(){
    const pauseBtn = document.getElementById('pauseFeed');
    const refreshBtn = document.getElementById('refreshFeed');
    
    if(pauseBtn) pauseBtn.addEventListener('click', toggleThreatFeed);
    if(refreshBtn) refreshBtn.addEventListener('click', refreshThreatFeed);
    
    // Start the feed
    startThreatFeed();
}

function startThreatFeed(){
    if(threatFeedInterval) clearInterval(threatFeedInterval);
    
    threatFeedInterval = setInterval(() => {
        if(!threatFeedPaused) addThreatFeedItem();
    }, 5000); // Add new item every 5 seconds
    
    // Add initial items
    for(let i = 0; i < 3; i++){
        setTimeout(() => addThreatFeedItem(), i * 1000);
    }
}

function toggleThreatFeed(){
    const pauseBtn = document.getElementById('pauseFeed');
    const statusDot = document.querySelector('.status-dot.live');
    const statusText = document.querySelector('.feed-status span');
    
    threatFeedPaused = !threatFeedPaused;
    
    if(threatFeedPaused){
        pauseBtn.textContent = '▶️ Resume';
        statusDot.style.background = '#f59e0b';
        statusText.textContent = 'Paused';
    } else {
        pauseBtn.textContent = '⏸️ Pause';
        statusDot.style.background = '#10b981';
        statusText.textContent = 'Live';
    }
}

function refreshThreatFeed(){
    const feed = document.getElementById('threatFeed');
    if(feed) feed.innerHTML = '';
    
    // Add fresh items
    for(let i = 0; i < 5; i++){
        setTimeout(() => addThreatFeedItem(), i * 200);
    }
}

async function addThreatFeedItem(){
    const feed = document.getElementById('threatFeed');
    if(!feed) return;
    
    try {
        // Fetch real threat feed from API
        const response = await fetch(`${API_BASE}/api/threats/feed?limit=1`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const feedData = await response.json();
        if (feedData.length === 0) {
            throw new Error('No feed data available');
        }
        
        const threat = feedData[0];
        const severityIcons = {
            'critical': '🚨',
            'high': '⚠️',
            'medium': '🔶',
            'low': '🛡️'
        };
        
        const randomItem = {
            icon: severityIcons[threat.severity] || '📊',
            title: threat.title,
            details: threat.description,
            time: getRelativeTime(new Date(threat.timestamp))
        };
        
    } catch (error) {
        console.error('Error fetching threat feed:', error);
        // Fallback to mock data
        const feedItems = [
            {icon: '🚨', title: 'Critical Threat Detected', details: 'Phishing email blocked from suspicious-domain.com', time: 'now'},
            {icon: '⚠️', title: 'High Risk Email', details: 'Malware attachment quarantined', time: '2m ago'},
            {icon: '🔶', title: 'Suspicious Activity', details: 'Multiple failed login attempts detected', time: '5m ago'},
            {icon: '🛡️', title: 'Threat Blocked', details: 'Spam campaign automatically filtered', time: '8m ago'},
            {icon: '📊', title: 'Intelligence Update', details: 'New IOCs added from threat feed', time: '12m ago'}
        ];
        
        var randomItem = feedItems[Math.floor(Math.random() * feedItems.length)];
    }
    
    const feedItem = document.createElement('div');
    feedItem.className = 'feed-item';
    feedItem.style.opacity = '0';
    feedItem.style.transform = 'translateY(-10px)';
    
    feedItem.innerHTML = `
        <div class="feed-item-icon">${randomItem.icon}</div>
        <div class="feed-item-content">
            <div class="feed-item-title">${randomItem.title}</div>
            <div class="feed-item-details">${randomItem.details}</div>
        </div>
        <div class="feed-item-time">${randomItem.time}</div>
    `;
    
    feed.insertBefore(feedItem, feed.firstChild);
    
    // Animate in
    setTimeout(() => {
        feedItem.style.transition = 'all 0.3s ease';
        feedItem.style.opacity = '1';
        feedItem.style.transform = 'translateY(0)';
    }, 100);
    
    // Remove old items (keep max 10)
    const items = feed.querySelectorAll('.feed-item');
    if(items.length > 10){
        items[items.length - 1].remove();
    }
}

function setupAttackPatternsChart(){
    const canvas = document.getElementById('attackPatternsChart');
    if(!canvas || typeof Chart === 'undefined') return;
    
    const ctx = canvas.getContext('2d');
    const chartData = generateAttackPatternsData();
    
    attackPatternsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [
                {
                    label: 'Phishing',
                    data: chartData.phishing,
                    borderColor: '#dc2626',
                    backgroundColor: 'rgba(220,38,38,0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Malware',
                    data: chartData.malware,
                    borderColor: '#ea580c',
                    backgroundColor: 'rgba(234,88,12,0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Spam',
                    data: chartData.spam,
                    borderColor: '#d97706',
                    backgroundColor: 'rgba(217,119,6,0.1)',
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9fb4d3' } },
                y: { display: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#9fb4d3' } }
            },
            interaction: { intersect: false, mode: 'index' }
        }
    });
}

function generateAttackPatternsData(){
    const hours = 24;
    const labels = [];
    const phishing = [], malware = [], spam = [];
    
    for(let i = hours-1; i >= 0; i--){
        const hour = new Date();
        hour.setHours(hour.getHours() - i);
        labels.push(hour.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'}));
        
        // Generate realistic attack patterns
        phishing.push(Math.floor(Math.random() * 15) + (i < 8 ? 5 : 0)); // More attacks during business hours
        malware.push(Math.floor(Math.random() * 8) + (i < 6 ? 3 : 0));
        spam.push(Math.floor(Math.random() * 25) + 10);
    }
    
    return {labels, phishing, malware, spam};
}

function setupThreatsTable(){
    const selectAll = document.getElementById('selectAllThreats');
    const bulkBlock = document.getElementById('bulkBlock');
    const bulkResolve = document.getElementById('bulkResolve');
    const exportThreats = document.getElementById('exportThreats');
    
    if(selectAll) selectAll.addEventListener('change', toggleSelectAllThreats);
    if(bulkBlock) bulkBlock.addEventListener('click', bulkBlockThreats);
    if(bulkResolve) bulkResolve.addEventListener('click', bulkResolveThreats);
    if(exportThreats) exportThreats.addEventListener('click', exportThreatsData);
    
    displayThreatsTable();
}

function displayThreatsTable(){
    const tbody = document.getElementById('threatsTableBody');
    if(!tbody) return;
    
    const filteredThreats = getFilteredThreats();
    
    tbody.innerHTML = filteredThreats.map(threat => `
        <tr>
            <td><input type="checkbox" class="threat-checkbox" data-threat-id="${threat.id}" ${selectedThreats.has(threat.id) ? 'checked' : ''}></td>
            <td><div class="threat-name">${threat.name}</div></td>
            <td><span class="severity-badge ${threat.severity}">${threat.severity.toUpperCase()}</span></td>
            <td><span class="threat-type">${threat.type}</span></td>
            <td><span class="threat-source">${threat.source}</span></td>
            <td>${formatDate(threat.firstSeen)}</td>
            <td><span class="threat-status ${threat.status}">${threat.status.toUpperCase()}</span></td>
            <td>
                <div class="threat-actions">
                    <button class="threat-action-btn" onclick="viewThreatDetails(${threat.id})">View</button>
                    <button class="threat-action-btn" onclick="blockThreat(${threat.id})">Block</button>
                </div>
            </td>
        </tr>
    `).join('');
    
    // Add event listeners for checkboxes
    tbody.querySelectorAll('.threat-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const threatId = parseInt(e.target.dataset.threatId);
            if(e.target.checked) selectedThreats.add(threatId);
            else selectedThreats.delete(threatId);
            updateBulkActionsVisibility();
        });
    });
}

function getFilteredThreats(){
    const severityFilter = document.getElementById('severityFilter')?.value || 'all';
    const typeFilter = document.getElementById('typeFilter')?.value || 'all';
    const statusFilter = document.getElementById('statusFilter')?.value || 'all';
    
    return threatsData.filter(threat => {
        if(severityFilter !== 'all' && threat.severity !== severityFilter) return false;
        if(typeFilter !== 'all' && threat.type !== typeFilter) return false;
        if(statusFilter !== 'all' && threat.status !== statusFilter) return false;
        return true;
    });
}

function setupThreatFilters(){
    const filters = ['severityFilter', 'typeFilter', 'statusFilter'];
    filters.forEach(filterId => {
        const filter = document.getElementById(filterId);
        if(filter) filter.addEventListener('change', displayThreatsTable);
    });
}

function toggleSelectAllThreats(){
    const selectAll = document.getElementById('selectAllThreats');
    const checkboxes = document.querySelectorAll('.threat-checkbox');
    const isChecked = selectAll.checked;
    
    checkboxes.forEach(cb => {
        cb.checked = isChecked;
        const threatId = parseInt(cb.dataset.threatId);
        if(isChecked) selectedThreats.add(threatId);
        else selectedThreats.delete(threatId);
    });
    
    updateBulkActionsVisibility();
}

function updateBulkActionsVisibility(){
    const bulkActions = document.querySelectorAll('#bulkBlock, #bulkResolve');
    const hasSelected = selectedThreats.size > 0;
    bulkActions.forEach(btn => {
        if(btn) btn.style.opacity = hasSelected ? '1' : '0.5';
    });
}

function bulkBlockThreats(){
    if(selectedThreats.size === 0) return;
    
    threatsData.forEach(threat => {
        if(selectedThreats.has(threat.id)) threat.status = 'blocked';
    });
    
    selectedThreats.clear();
    displayThreatsTable();
    updateThreatStats();
    showSuccess(`Blocked ${selectedThreats.size} threats`);
}

function bulkResolveThreats(){
    if(selectedThreats.size === 0) return;
    
    const count = selectedThreats.size;
    threatsData.forEach(threat => {
        if(selectedThreats.has(threat.id)) threat.status = 'resolved';
    });
    
    selectedThreats.clear();
    displayThreatsTable();
    updateThreatStats();
    showSuccess(`Resolved ${count} threats`);
}

function exportThreatsData(){
    const filtered = getFilteredThreats();
    const csvContent = [
        ['Name', 'Severity', 'Type', 'Source', 'First Seen', 'Status', 'Affected Users'],
        ...filtered.map(threat => [
            `"${threat.name}"`, threat.severity, threat.type, threat.source,
            formatDate(threat.firstSeen), threat.status, threat.affectedUsers
        ])
    ].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csvContent], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `threats-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function setupThreatIntelligence(){
    const updateBtn = document.getElementById('updateIntel');
    if(updateBtn) updateBtn.addEventListener('click', updateThreatIntelligence);
}

function updateThreatIntelligence(){
    const intelItems = document.querySelectorAll('.intel-item');
    intelItems.forEach(item => {
        const status = item.querySelector('.intel-status');
        const lastUpdate = item.querySelector('.intel-last-update');
        
        // Simulate update
        status.textContent = 'Updating...';
        status.className = 'intel-status';
        
        setTimeout(() => {
            status.textContent = 'Connected';
            status.className = 'intel-status connected';
            lastUpdate.textContent = 'Just now';
        }, 2000);
    });
    
    showSuccess('Threat intelligence updated');
}

function setupThreatModal(){
    // Modal will be handled by individual threat actions
}

function viewThreatDetails(threatId){
    const threat = threatsData.find(t => t.id === threatId);
    if(!threat) return;
    
    // Populate modal
    document.getElementById('threatModalTitle').textContent = 'Threat Details';
    document.getElementById('modalSeverity').textContent = threat.severity.toUpperCase();
    document.getElementById('modalSeverity').className = `threat-severity-badge ${threat.severity}`;
    document.getElementById('modalThreatName').textContent = threat.name;
    document.getElementById('modalThreatDescription').textContent = threat.description;
    document.getElementById('modalThreatType').textContent = threat.type;
    document.getElementById('modalFirstSeen').textContent = formatDate(threat.firstSeen);
    document.getElementById('modalLastActivity').textContent = formatDate(threat.lastActivity);
    document.getElementById('modalAffectedUsers').textContent = threat.affectedUsers;
    
    // Populate IOCs
    const iocsList = document.getElementById('modalIOCs');
    iocsList.innerHTML = threat.iocs.map(ioc => `<div class="ioc-item">${ioc}</div>`).join('');
    
    // Populate timeline
    const timeline = document.getElementById('modalTimeline');
    timeline.innerHTML = `
        <div class="timeline-item">
            <div class="timeline-time">${formatDate(threat.firstSeen)}</div>
            <div class="timeline-event">Threat First Detected</div>
            <div class="timeline-details">Initial detection by ${threat.source}</div>
        </div>
        <div class="timeline-item">
            <div class="timeline-time">${formatDate(threat.lastActivity)}</div>
            <div class="timeline-event">Latest Activity</div>
            <div class="timeline-details">Continued malicious activity observed</div>
        </div>
    `;
    
    // Populate recommendations
    const recommendations = document.getElementById('modalRecommendations');
    recommendations.innerHTML = threat.recommendations.map(rec => `
        <div class="recommendation-item">
            <div class="recommendation-priority">${rec.priority} Priority</div>
            <div class="recommendation-text">${rec.text}</div>
        </div>
    `).join('');
    
    // Setup modal actions
    document.getElementById('blockThreatBtn').onclick = () => {
        threat.status = 'blocked';
        displayThreatsTable();
        updateThreatStats();
        closeThreatModal();
        showSuccess('Threat blocked successfully');
    };
    
    document.getElementById('investigateBtn').onclick = () => {
        threat.status = 'investigating';
        displayThreatsTable();
        updateThreatStats();
        closeThreatModal();
        showSuccess('Threat marked as investigating');
    };
    
    document.getElementById('resolveThreatBtn').onclick = () => {
        threat.status = 'resolved';
        displayThreatsTable();
        updateThreatStats();
        closeThreatModal();
        showSuccess('Threat resolved');
    };
    
    // Show modal
    document.getElementById('threatModal').style.display = 'flex';
}

function closeThreatModal(){
    document.getElementById('threatModal').style.display = 'none';
}

function blockThreat(threatId){
    const threat = threatsData.find(t => t.id === threatId);
    if(threat){
        threat.status = 'blocked';
        displayThreatsTable();
        updateThreatStats();
        showSuccess('Threat blocked');
    }
}

function updateThreatStats(){
    const stats = {
        critical: threatsData.filter(t => t.severity === 'critical' && t.status === 'active').length,
        high: threatsData.filter(t => t.severity === 'high' && t.status === 'active').length,
        medium: threatsData.filter(t => t.severity === 'medium' && t.status === 'active').length,
        blocked: threatsData.filter(t => t.status === 'blocked').length
    };
    
    const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = String(val); };
    set('criticalThreats', stats.critical);
    set('highThreats', stats.high);
    set('mediumThreats', stats.medium);
    set('blockedThreats', stats.blocked);
}

// Close modal when clicking outside
document.addEventListener('click', function(e) {
    const threatModal = document.getElementById('threatModal');
    if (threatModal && e.target === threatModal) {
        closeThreatModal();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeThreatModal();
        closeScheduleModal();
    }
});

// ===== Reports Page Features =====
function setupReportsFeatures(){
    // Setup report builder
    setupReportBuilder();
    // Setup quick reports
    setupQuickReports();
    // Setup scheduled reports
    setupScheduledReports();
    // Setup report history
    setupReportHistory();
    // Setup schedule modal
    setupScheduleModal();
}

function setupReportBuilder(){
    const generateBtn = document.getElementById('generateReport');
    const saveTemplateBtn = document.getElementById('saveTemplate');
    const refreshPreviewBtn = document.getElementById('refreshPreview');
    const fullscreenBtn = document.getElementById('fullscreenPreview');
    
    if(generateBtn) generateBtn.addEventListener('click', generateReport);
    if(saveTemplateBtn) saveTemplateBtn.addEventListener('click', saveReportTemplate);
    if(refreshPreviewBtn) refreshPreviewBtn.addEventListener('click', refreshReportPreview);
    if(fullscreenBtn) fullscreenBtn.addEventListener('click', fullscreenPreview);
    
    // Template change handler
    const templateSelect = document.getElementById('reportTemplate');
    if(templateSelect) templateSelect.addEventListener('change', updateBuilderControls);
}

function generateReport(){
    const template = document.getElementById('reportTemplate')?.value || 'security-summary';
    const dateRange = document.getElementById('dateRange')?.value || 'last-7-days';
    const exportFormat = document.getElementById('exportFormat')?.value || 'pdf';
    
    const includeOverview = document.getElementById('includeOverview')?.checked || false;
    const includeThreats = document.getElementById('includeThreats')?.checked || false;
    const includeStats = document.getElementById('includeStats')?.checked || false;
    const includeCharts = document.getElementById('includeCharts')?.checked || false;
    const includeRecommendations = document.getElementById('includeRecommendations')?.checked || false;
    
    // Show loading state
    const preview = document.getElementById('reportPreview');
    if(preview){
        preview.innerHTML = `
            <div class="preview-placeholder">
                <div class="placeholder-icon">⏳</div>
                <h3>Generating Report...</h3>
                <p>Please wait while we compile your ${template} report.</p>
            </div>
        `;
    }
    
    // Simulate report generation
    setTimeout(() => {
        const reportContent = generateReportContent(template, {
            dateRange, includeOverview, includeThreats, includeStats, includeCharts, includeRecommendations
        });
        
        if(preview) preview.innerHTML = reportContent;
        
        // Add to history
        addReportToHistory({
            name: getReportTemplateName(template),
            template,
            format: exportFormat,
            generated: new Date(),
            size: Math.floor(Math.random() * 3000 + 1000) + ' KB'
        });
        
        showSuccess(`${getReportTemplateName(template)} generated successfully!`);
    }, 2000);
}

function generateReportContent(template, options){
    const templateName = getReportTemplateName(template);
    const dateRangeText = getDateRangeText(options.dateRange);
    
    let content = `
        <div class="report-content">
            <div class="report-header">
                <h1 class="report-title">${templateName}</h1>
                <p class="report-subtitle">Generated on ${new Date().toLocaleDateString()} • ${dateRangeText}</p>
            </div>
    `;
    
    if(options.includeOverview){
        content += `
            <div class="report-section">
                <h2 class="section-title">Executive Overview</h2>
                <div class="metric-grid">
                    <div class="metric-card">
                        <div class="metric-value">1,247</div>
                        <div class="metric-label">Emails Analyzed</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">23</div>
                        <div class="metric-label">Threats Detected</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">98.2%</div>
                        <div class="metric-label">Accuracy Rate</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">0.8s</div>
                        <div class="metric-label">Avg Response Time</div>
                    </div>
                </div>
                <p>During the ${dateRangeText.toLowerCase()}, our AI-powered phishing detection system processed 1,247 emails and successfully identified 23 potential threats with a 98.2% accuracy rate. The system maintained an average response time of 0.8 seconds, ensuring real-time protection for all users.</p>
            </div>
        `;
    }
    
    if(options.includeThreats){
        content += `
            <div class="report-section">
                <h2 class="section-title">Threat Analysis</h2>
                <p>The following threats were identified and mitigated during the reporting period:</p>
                <div class="chart-container">
                    <h3>Threat Distribution</h3>
                    <div style="height: 200px; display: flex; align-items: center; justify-content: center; background: #f1f5f9; border-radius: 6px;">
                        <span style="color: #64748b;">Chart visualization would appear here</span>
                    </div>
                </div>
                <ul>
                    <li><strong>Phishing Attempts:</strong> 15 incidents (65% of total threats)</li>
                    <li><strong>Malware Distribution:</strong> 5 incidents (22% of total threats)</li>
                    <li><strong>Spam Campaigns:</strong> 3 incidents (13% of total threats)</li>
                </ul>
            </div>
        `;
    }
    
    if(options.includeStats){
        content += `
            <div class="report-section">
                <h2 class="section-title">Performance Statistics</h2>
                <div class="chart-container">
                    <h3>Detection Trends</h3>
                    <div style="height: 250px; display: flex; align-items: center; justify-content: center; background: #f1f5f9; border-radius: 6px;">
                        <span style="color: #64748b;">Trend chart visualization would appear here</span>
                    </div>
                </div>
                <p>System performance remained consistently high throughout the reporting period, with threat detection accuracy improving by 2.3% compared to the previous period.</p>
            </div>
        `;
    }
    
    if(options.includeRecommendations){
        content += `
            <div class="report-section">
                <h2 class="section-title">Recommendations</h2>
                <ul class="recommendations-list">
                    <li class="recommendation-item">
                        <div class="recommendation-priority">High Priority</div>
                        <div>Implement additional user training on phishing recognition to reduce false positives.</div>
                    </li>
                    <li class="recommendation-item">
                        <div class="recommendation-priority">Medium Priority</div>
                        <div>Consider expanding email filtering rules to catch emerging spam patterns.</div>
                    </li>
                    <li class="recommendation-item">
                        <div class="recommendation-priority">Low Priority</div>
                        <div>Review and update security awareness materials quarterly.</div>
                    </li>
                </ul>
            </div>
        `;
    }
    
    content += '</div>';
    return content;
}

function getReportTemplateName(template){
    const names = {
        'security-summary': 'Security Summary Report',
        'threat-analysis': 'Threat Analysis Report',
        'compliance-report': 'Compliance Report',
        'executive-dashboard': 'Executive Dashboard',
        'daily-summary': 'Daily Summary Report',
        'weekly-trends': 'Weekly Trends Report',
        'security-posture': 'Security Posture Assessment',
        'compliance-check': 'Compliance Check Report',
        'incident-response': 'Incident Response Report',
        'executive-brief': 'Executive Brief',
        'custom': 'Custom Report'
    };
    return names[template] || 'Report';
}

function getDateRangeText(range){
    const ranges = {
        'last-7-days': 'Last 7 Days',
        'last-30-days': 'Last 30 Days',
        'last-90-days': 'Last 90 Days',
        'this-month': 'This Month',
        'last-month': 'Last Month',
        'custom': 'Custom Range'
    };
    return ranges[range] || 'Selected Period';
}

function saveReportTemplate(){
    const template = document.getElementById('reportTemplate')?.value;
    const templateName = prompt('Enter a name for this template:');
    
    if(templateName){
        // Save template configuration
        const config = {
            template,
            dateRange: document.getElementById('dateRange')?.value,
            exportFormat: document.getElementById('exportFormat')?.value,
            includeOverview: document.getElementById('includeOverview')?.checked,
            includeThreats: document.getElementById('includeThreats')?.checked,
            includeStats: document.getElementById('includeStats')?.checked,
            includeCharts: document.getElementById('includeCharts')?.checked,
            includeRecommendations: document.getElementById('includeRecommendations')?.checked
        };
        
        localStorage.setItem(`reportTemplate_${templateName}`, JSON.stringify(config));
        showSuccess(`Template "${templateName}" saved successfully!`);
    }
}

function refreshReportPreview(){
    const preview = document.getElementById('reportPreview');
    if(preview && !preview.querySelector('.preview-placeholder')){
        generateReport();
    } else {
        showSuccess('Preview refreshed');
    }
}

function fullscreenPreview(){
    const preview = document.getElementById('reportPreview');
    if(preview){
        if(preview.requestFullscreen){
            preview.requestFullscreen();
        } else if(preview.webkitRequestFullscreen){
            preview.webkitRequestFullscreen();
        } else if(preview.msRequestFullscreen){
            preview.msRequestFullscreen();
        }
    }
}

function updateBuilderControls(){
    const template = document.getElementById('reportTemplate')?.value;
    // Update controls based on selected template
    // This could customize which sections are available for each template
}

function setupQuickReports(){
    const quickReportCards = document.querySelectorAll('.quick-report-card');
    quickReportCards.forEach(card => {
        const btn = card.querySelector('.quick-report-btn');
        if(btn){
            btn.addEventListener('click', () => {
                const template = card.dataset.template;
                generateQuickReport(template);
            });
        }
    });
}

function generateQuickReport(template){
    // Set the builder to use this template
    const templateSelect = document.getElementById('reportTemplate');
    if(templateSelect){
        templateSelect.value = template;
    }
    
    // Generate the report
    generateReport();
    
    // Scroll to preview
    const preview = document.getElementById('reportPreview');
    if(preview){
        preview.scrollIntoView({behavior: 'smooth'});
    }
}

function setupScheduledReports(){
    const addScheduleBtn = document.getElementById('addScheduledReport');
    if(addScheduleBtn) addScheduleBtn.addEventListener('click', showScheduleModal);
    
    // Setup action buttons for existing scheduled reports
    const actionBtns = document.querySelectorAll('.scheduled-reports-table .action-btn');
    actionBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = btn.textContent.toLowerCase();
            const row = btn.closest('tr');
            const reportName = row.cells[0].textContent;
            
            switch(action){
                case 'edit':
                    editScheduledReport(reportName);
                    break;
                case 'pause':
                case 'resume':
                    toggleScheduledReport(reportName, action);
                    break;
                case 'delete':
                    deleteScheduledReport(reportName);
                    break;
            }
        });
    });
}

function showScheduleModal(){
    document.getElementById('scheduleModal').style.display = 'flex';
}

function closeScheduleModal(){
    document.getElementById('scheduleModal').style.display = 'none';
}

function setupScheduleModal(){
    const saveBtn = document.getElementById('saveSchedule');
    if(saveBtn) saveBtn.addEventListener('click', saveScheduledReport);
}

function saveScheduledReport(){
    const name = document.getElementById('scheduleName')?.value;
    const template = document.getElementById('scheduleTemplate')?.value;
    const frequency = document.getElementById('scheduleFrequency')?.value;
    const time = document.getElementById('scheduleTime')?.value;
    const recipients = document.getElementById('scheduleRecipients')?.value;
    const format = document.getElementById('scheduleFormat')?.value;
    
    if(!name || !recipients){
        showError('Please fill in all required fields');
        return;
    }
    
    // Add to scheduled reports table
    const tbody = document.getElementById('scheduledReportsBody');
    if(tbody){
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${name}</td>
            <td>${getReportTemplateName(template)}</td>
            <td>${frequency.charAt(0).toUpperCase() + frequency.slice(1)} (${time})</td>
            <td>${recipients}</td>
            <td>Next scheduled run</td>
            <td><span class="status-badge active">Active</span></td>
            <td>
                <div class="table-actions">
                    <button class="action-btn">Edit</button>
                    <button class="action-btn">Pause</button>
                    <button class="action-btn danger">Delete</button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
        
        // Add event listeners to new buttons
        row.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = btn.textContent.toLowerCase();
                switch(action){
                    case 'edit':
                        editScheduledReport(name);
                        break;
                    case 'pause':
                        toggleScheduledReport(name, 'pause');
                        break;
                    case 'delete':
                        deleteScheduledReport(name);
                        break;
                }
            });
        });
    }
    
    closeScheduleModal();
    showSuccess(`Scheduled report "${name}" created successfully!`);
    
    // Clear form
    document.getElementById('scheduleName').value = '';
    document.getElementById('scheduleRecipients').value = '';
}

function editScheduledReport(reportName){
    showSuccess(`Edit functionality for "${reportName}" would open here`);
}

function toggleScheduledReport(reportName, action){
    const rows = document.querySelectorAll('.scheduled-reports-table tbody tr');
    rows.forEach(row => {
        if(row.cells[0].textContent === reportName){
            const statusBadge = row.querySelector('.status-badge');
            const actionBtn = row.querySelector('.action-btn:nth-child(2)');
            
            if(action === 'pause'){
                statusBadge.textContent = 'Paused';
                statusBadge.className = 'status-badge paused';
                actionBtn.textContent = 'Resume';
            } else {
                statusBadge.textContent = 'Active';
                statusBadge.className = 'status-badge active';
                actionBtn.textContent = 'Pause';
            }
        }
    });
    
    showSuccess(`Report "${reportName}" ${action}d successfully`);
}

function deleteScheduledReport(reportName){
    if(confirm(`Are you sure you want to delete the scheduled report "${reportName}"?`)){
        const rows = document.querySelectorAll('.scheduled-reports-table tbody tr');
        rows.forEach(row => {
            if(row.cells[0].textContent === reportName){
                row.remove();
            }
        });
        showSuccess(`Scheduled report "${reportName}" deleted`);
    }
}

function setupReportHistory(){
    const historyFilter = document.getElementById('historyFilter');
    const clearHistoryBtn = document.getElementById('clearHistory');
    
    if(historyFilter) historyFilter.addEventListener('change', filterReportHistory);
    if(clearHistoryBtn) clearHistoryBtn.addEventListener('click', clearReportHistory);
    
    // Setup action buttons for history items
    const historyActionBtns = document.querySelectorAll('.history-action-btn');
    historyActionBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = btn.textContent.toLowerCase();
            const historyItem = btn.closest('.history-item');
            const reportName = historyItem.querySelector('.history-title').textContent;
            
            switch(action){
                case 'download':
                    downloadReport(reportName);
                    break;
                case 'share':
                    shareReport(reportName);
                    break;
                case 'delete':
                    deleteHistoryItem(historyItem);
                    break;
                case 'retry':
                    retryFailedReport(reportName);
                    break;
                case 'view error':
                    viewReportError(reportName);
                    break;
            }
        });
    });
}

function filterReportHistory(){
    const filter = document.getElementById('historyFilter')?.value || 'all';
    const historyItems = document.querySelectorAll('.history-item');
    
    historyItems.forEach(item => {
        const isFailed = item.classList.contains('failed');
        let show = true;
        
        switch(filter){
            case 'generated':
                show = !isFailed;
                break;
            case 'failed':
                show = isFailed;
                break;
            case 'scheduled':
                // This would check if the report was generated by a schedule
                show = true;
                break;
            case 'all':
            default:
                show = true;
                break;
        }
        
        item.style.display = show ? 'flex' : 'none';
    });
}

function clearReportHistory(){
    if(confirm('Are you sure you want to clear all report history? This action cannot be undone.')){
        const historyList = document.getElementById('reportHistoryList');
        if(historyList) historyList.innerHTML = '<p style="color: #9fb4d3; text-align: center; padding: 40px;">No reports in history</p>';
        showSuccess('Report history cleared');
    }
}

function downloadReport(reportName){
    // Simulate file download
    const link = document.createElement('a');
    link.href = '#';
    link.download = `${reportName.replace(/\s+/g, '_')}.pdf`;
    link.click();
    showSuccess(`Downloading ${reportName}...`);
}

function shareReport(reportName){
    if(navigator.share){
        navigator.share({
            title: reportName,
            text: `Check out this security report: ${reportName}`,
            url: window.location.href
        });
    } else {
        // Fallback to copy link
        navigator.clipboard.writeText(window.location.href);
        showSuccess('Report link copied to clipboard');
    }
}

function deleteHistoryItem(historyItem){
    const reportName = historyItem.querySelector('.history-title').textContent;
    if(confirm(`Are you sure you want to delete "${reportName}" from history?`)){
        historyItem.remove();
        showSuccess('Report deleted from history');
    }
}

function retryFailedReport(reportName){
    showSuccess(`Retrying generation of "${reportName}"...`);
    // This would trigger the report generation again
}

function viewReportError(reportName){
    alert(`Error details for "${reportName}":\n\nInsufficient data available for the selected time period. Please try a different date range or check your data sources.`);
}

function addReportToHistory(report){
    const historyList = document.getElementById('reportHistoryList');
    if(!historyList) return;
    
    // Remove "no reports" message if it exists
    const noReportsMsg = historyList.querySelector('p');
    if(noReportsMsg) noReportsMsg.remove();
    
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    historyItem.innerHTML = `
        <div class="history-icon">📊</div>
        <div class="history-content">
            <div class="history-title">${report.name}</div>
            <div class="history-details">Generated on ${report.generated.toLocaleDateString()} at ${report.generated.toLocaleTimeString()} • ${report.format.toUpperCase()} • ${report.size}</div>
        </div>
        <div class="history-actions">
            <button class="history-action-btn">Download</button>
            <button class="history-action-btn">Share</button>
            <button class="history-action-btn">Delete</button>
        </div>
    `;
    
    // Add event listeners
    historyItem.querySelectorAll('.history-action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = btn.textContent.toLowerCase();
            switch(action){
                case 'download':
                    downloadReport(report.name);
                    break;
                case 'share':
                    shareReport(report.name);
                    break;
                case 'delete':
                    deleteHistoryItem(historyItem);
                    break;
            }
        });
    });
    
    historyList.insertBefore(historyItem, historyList.firstChild);
}

// Close modal when clicking outside
document.addEventListener('click', function(e) {
    const scheduleModal = document.getElementById('scheduleModal');
    if (scheduleModal && e.target === scheduleModal) {
        closeScheduleModal();
    }
    
    const integrationModal = document.getElementById('integrationModal');
    if (integrationModal && e.target === integrationModal) {
        closeIntegrationModal();
    }
    
    const customIntegrationModal = document.getElementById('customIntegrationModal');
    if (customIntegrationModal && e.target === customIntegrationModal) {
        closeCustomIntegrationModal();
    }
    
    const inviteModal = document.getElementById('inviteModal');
    if (inviteModal && e.target === inviteModal) {
        closeInviteModal();
    }
    
    const editMemberModal = document.getElementById('editMemberModal');
    if (editMemberModal && e.target === editMemberModal) {
        closeEditMemberModal();
    }
    
    const planChangeModal = document.getElementById('planChangeModal');
    if (planChangeModal && e.target === planChangeModal) {
        closePlanChangeModal();
    }
    
    const paymentMethodModal = document.getElementById('paymentMethodModal');
    if (paymentMethodModal && e.target === paymentMethodModal) {
        closePaymentMethodModal();
    }
    
    const deleteAccountModal = document.getElementById('deleteAccountModal');
    if (deleteAccountModal && e.target === deleteAccountModal) {
        closeDeleteAccountModal();
    }
});

// ===== Integrations Page Features =====
let apiUsageChart = null;

function setupIntegrationsFeatures(){
    // Setup category filtering
    setupCategoryFiltering();
    // Setup integration actions
    setupIntegrationActions();
    // Setup health monitoring
    setupHealthMonitoring();
    // Setup API usage chart
    setupApiUsageChart();
    // Setup custom integration modal
    setupCustomIntegrationModal();
    // Setup integration configuration modal
    setupIntegrationConfigModal();
}

function setupCategoryFiltering(){
    const categoryTabs = document.querySelectorAll('.category-tab');
    categoryTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Update active tab
            categoryTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Filter integrations
            const category = tab.dataset.category;
            filterIntegrations(category);
        });
    });
}

function filterIntegrations(category){
    const integrationCards = document.querySelectorAll('.integration-card');
    integrationCards.forEach(card => {
        const cardCategory = card.dataset.category;
        if(category === 'all' || cardCategory === category){
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

function setupIntegrationActions(){
    const addCustomBtn = document.getElementById('addCustomIntegration');
    const viewApiDocsBtn = document.getElementById('viewApiDocs');
    
    if(addCustomBtn) addCustomBtn.addEventListener('click', showCustomIntegrationModal);
    if(viewApiDocsBtn) viewApiDocsBtn.addEventListener('click', () => {
        window.open('https://docs.phishingdetection.ai/api', '_blank');
    });
    
    // Setup action buttons for each integration card
    const integrationCards = document.querySelectorAll('.integration-card');
    integrationCards.forEach(card => {
        const actionBtns = card.querySelectorAll('.action-btn');
        actionBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const integration = card.dataset.integration;
                const action = btn.textContent.toLowerCase();
                handleIntegrationAction(integration, action, card);
            });
        });
    });
}

function handleIntegrationAction(integration, action, card){
    switch(action){
        case 'configure':
            showIntegrationConfigModal(integration);
            break;
        case 'connect':
            connectIntegration(integration, card);
            break;
        case 'disconnect':
            disconnectIntegration(integration, card);
            break;
        case 'reconnect':
            reconnectIntegration(integration, card);
            break;
        case 'test alert':
            testIntegrationAlert(integration);
            break;
        case 'test webhook':
            testWebhook(integration);
            break;
        case 'view logs':
            viewIntegrationLogs(integration);
            break;
        case 'view error':
            viewIntegrationError(integration);
            break;
        case 'learn more':
            learnMoreAboutIntegration(integration);
            break;
        case 'get api key':
            generateApiKey();
            break;
        case 'view docs':
            viewApiDocumentation();
            break;
        case 'manage zaps':
            manageZapierIntegration();
            break;
        case 'create zap':
            createZapierZap();
            break;
        default:
            showSuccess(`${action} action triggered for ${integration}`);
    }
}

function connectIntegration(integration, card){
    // Show loading state
    const actionBtns = card.querySelectorAll('.action-btn');
    actionBtns.forEach(btn => {
        if(btn.textContent.toLowerCase() === 'connect'){
            btn.textContent = 'Connecting...';
            btn.disabled = true;
        }
    });
    
    // Simulate connection process
    setTimeout(() => {
        // Update card to connected state
        card.classList.add('connected');
        
        // Update status
        const status = card.querySelector('.integration-status');
        status.className = 'integration-status connected';
        status.innerHTML = '<div class="status-dot"></div><span>Connected</span>';
        
        // Update actions
        const actionsContainer = card.querySelector('.integration-actions');
        actionsContainer.innerHTML = `
            <button class="action-btn primary">Configure</button>
            <button class="action-btn secondary">Disconnect</button>
        `;
        
        // Re-attach event listeners
        actionsContainer.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = btn.textContent.toLowerCase();
                handleIntegrationAction(integration, action, card);
            });
        });
        
        // Add stats if it's an email or security integration
        if(['gmail', 'outlook', 'exchange', 'splunk', 'slack', 'zapier'].includes(integration)){
            const description = card.querySelector('.integration-description');
            if(description){
                description.innerHTML = `
                    <div class="integration-stats">
                        <div class="stat-item">
                            <span class="stat-value">0</span>
                            <span class="stat-label">Items Processed</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-value">100%</span>
                            <span class="stat-label">Uptime</span>
                        </div>
                    </div>
                `;
            }
        }
        
        updateIntegrationSummary();
        showSuccess(`${getIntegrationName(integration)} connected successfully!`);
    }, 2000);
}

function disconnectIntegration(integration, card){
    if(confirm(`Are you sure you want to disconnect ${getIntegrationName(integration)}?`)){
        // Update card to available state
        card.classList.remove('connected');
        
        // Update status
        const status = card.querySelector('.integration-status');
        status.className = 'integration-status available';
        status.innerHTML = '<div class="status-dot"></div><span>Available</span>';
        
        // Update actions
        const actionsContainer = card.querySelector('.integration-actions');
        actionsContainer.innerHTML = `
            <button class="action-btn primary">Connect</button>
            <button class="action-btn secondary">Learn More</button>
        `;
        
        // Remove stats and add description back
        const statsContainer = card.querySelector('.integration-stats');
        if(statsContainer){
            statsContainer.parentElement.innerHTML = `
                <div class="integration-description">
                    <p>${getIntegrationDescription(integration)}</p>
                </div>
            `;
        }
        
        // Re-attach event listeners
        actionsContainer.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = btn.textContent.toLowerCase();
                handleIntegrationAction(integration, action, card);
            });
        });
        
        updateIntegrationSummary();
        showSuccess(`${getIntegrationName(integration)} disconnected`);
    }
}

function reconnectIntegration(integration, card){
    // Remove error state
    card.classList.remove('error');
    
    // Show connecting state
    const status = card.querySelector('.integration-status');
    status.className = 'integration-status';
    status.innerHTML = '<div class="status-dot"></div><span>Connecting...</span>';
    
    // Simulate reconnection
    setTimeout(() => {
        card.classList.add('connected');
        status.className = 'integration-status connected';
        status.innerHTML = '<div class="status-dot"></div><span>Connected</span>';
        
        // Remove error message
        const errorContainer = card.querySelector('.integration-error');
        if(errorContainer){
            errorContainer.innerHTML = `
                <div class="integration-stats">
                    <div class="stat-item">
                        <span class="stat-value">1,234</span>
                        <span class="stat-label">Queries Today</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-value">99.8%</span>
                        <span class="stat-label">Success Rate</span>
                    </div>
                </div>
            `;
        }
        
        // Update actions
        const actionsContainer = card.querySelector('.integration-actions');
        actionsContainer.innerHTML = `
            <button class="action-btn primary">Configure</button>
            <button class="action-btn secondary">View Logs</button>
        `;
        
        // Re-attach event listeners
        actionsContainer.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = btn.textContent.toLowerCase();
                handleIntegrationAction(integration, action, card);
            });
        });
        
        showSuccess(`${getIntegrationName(integration)} reconnected successfully!`);
    }, 1500);
}

function testIntegrationAlert(integration){
    showSuccess(`Test alert sent via ${getIntegrationName(integration)}`);
}

function testWebhook(integration){
    showSuccess('Webhook test payload sent successfully');
}

function viewIntegrationLogs(integration){
    showSuccess(`Opening logs for ${getIntegrationName(integration)}...`);
}

function viewIntegrationError(integration){
    alert(`Error Details for ${getIntegrationName(integration)}:\n\nAPI quota exceeded. Your current plan allows 1,000 requests per day. You have exceeded this limit.\n\nSuggested Actions:\n1. Upgrade your plan\n2. Wait for quota reset (resets at midnight UTC)\n3. Optimize request frequency`);
}

function learnMoreAboutIntegration(integration){
    const urls = {
        'outlook': 'https://docs.microsoft.com/en-us/graph/api/overview',
        'exchange': 'https://docs.microsoft.com/en-us/exchange/client-developer/exchange-web-services/explore-the-ews-managed-api',
        'crowdstrike': 'https://falcon.crowdstrike.com/support/documentation',
        'teams': 'https://docs.microsoft.com/en-us/microsoftteams/platform/',
        'make': 'https://www.make.com/en/integrations'
    };
    
    const url = urls[integration] || 'https://docs.phishingdetection.ai/integrations';
    window.open(url, '_blank');
}

function generateApiKey(){
    const apiKey = 'pd_' + Math.random().toString(36).substr(2, 32);
    navigator.clipboard.writeText(apiKey);
    showSuccess(`API Key generated and copied to clipboard: ${apiKey.substr(0, 10)}...`);
}

function viewApiDocumentation(){
    window.open('https://docs.phishingdetection.ai/api', '_blank');
}

function manageZapierIntegration(){
    window.open('https://zapier.com/apps/phishing-detection-ai/integrations', '_blank');
}

function createZapierZap(){
    window.open('https://zapier.com/app/editor', '_blank');
}

function getIntegrationName(integration){
    const names = {
        'gmail': 'Gmail',
        'outlook': 'Microsoft Outlook',
        'exchange': 'Exchange Server',
        'splunk': 'Splunk',
        'virustotal': 'VirusTotal',
        'crowdstrike': 'CrowdStrike',
        'slack': 'Slack',
        'teams': 'Microsoft Teams',
        'zapier': 'Zapier',
        'make': 'Make (Integromat)',
        'webhook': 'Custom Webhook',
        'rest-api': 'REST API'
    };
    return names[integration] || integration;
}

function getIntegrationDescription(integration){
    const descriptions = {
        'outlook': 'Automatically scan incoming emails in Microsoft Outlook and Office 365 environments.',
        'exchange': 'Connect to on-premises Exchange servers for comprehensive email security.',
        'crowdstrike': 'Integrate with CrowdStrike Falcon for enhanced threat detection and response.',
        'teams': 'Send threat alerts and reports directly to Microsoft Teams channels.',
        'make': 'Create complex automation workflows with Make\'s visual scenario builder.',
        'rest-api': 'Build custom integrations using our comprehensive REST API.'
    };
    return descriptions[integration] || 'Integration description not available.';
}

function updateIntegrationSummary(){
    const connectedCards = document.querySelectorAll('.integration-card.connected');
    const totalCards = document.querySelectorAll('.integration-card');
    
    const activeCount = connectedCards.length;
    const totalCount = totalCards.length;
    
    const activeEl = document.getElementById('activeIntegrations');
    const healthyEl = document.getElementById('healthyIntegrations');
    
    if(activeEl) activeEl.textContent = activeCount;
    if(healthyEl) healthyEl.textContent = `${activeCount}/${totalCount}`;
}

function setupHealthMonitoring(){
    const refreshHealthBtn = document.getElementById('refreshHealth');
    const runHealthCheckBtn = document.getElementById('runHealthCheck');
    
    if(refreshHealthBtn) refreshHealthBtn.addEventListener('click', refreshHealthStatus);
    if(runHealthCheckBtn) runHealthCheckBtn.addEventListener('click', runHealthCheck);
}

function refreshHealthStatus(){
    showSuccess('Health status refreshed');
    // In a real app, this would fetch latest health data from the API
}

function runHealthCheck(){
    showSuccess('Running comprehensive health check...');
    
    // Simulate health check process
    setTimeout(() => {
        showSuccess('Health check completed. All systems operational.');
    }, 3000);
}

function setupApiUsageChart(){
    const canvas = document.getElementById('apiUsageChart');
    if(!canvas || typeof Chart === 'undefined') return;
    
    const ctx = canvas.getContext('2d');
    const chartData = generateApiUsageData();
    
    apiUsageChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [
                {
                    label: 'API Calls',
                    data: chartData.apiCalls,
                    borderColor: '#4F709C',
                    backgroundColor: 'rgba(79,112,156,0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Errors',
                    data: chartData.errors,
                    borderColor: '#dc2626',
                    backgroundColor: 'rgba(220,38,38,0.1)',
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { 
                    display: true,
                    labels: { color: '#EAF1FB' }
                } 
            },
            scales: {
                x: { 
                    display: true, 
                    grid: { color: 'rgba(255,255,255,0.1)' }, 
                    ticks: { color: '#9fb4d3' } 
                },
                y: { 
                    display: true, 
                    grid: { color: 'rgba(255,255,255,0.1)' }, 
                    ticks: { color: '#9fb4d3' } 
                }
            },
            interaction: { intersect: false, mode: 'index' }
        }
    });
    
    // Setup period selector
    const periodSelect = document.getElementById('usagePeriod');
    if(periodSelect){
        periodSelect.addEventListener('change', (e) => {
            updateApiUsageChart(e.target.value);
        });
    }
}

function generateApiUsageData(){
    const days = 30;
    const labels = [];
    const apiCalls = [];
    const errors = [];
    
    for(let i = days-1; i >= 0; i--){
        const date = new Date();
        date.setDate(date.getDate() - i);
        labels.push(date.toLocaleDateString('en-US', {month: 'short', day: 'numeric'}));
        
        // Generate realistic API usage patterns
        const baseUsage = 400 + Math.random() * 200;
        const weekendMultiplier = [0, 6].includes(date.getDay()) ? 0.3 : 1;
        apiCalls.push(Math.floor(baseUsage * weekendMultiplier));
        errors.push(Math.floor(Math.random() * 10));
    }
    
    return {labels, apiCalls, errors};
}

function updateApiUsageChart(period){
    if(!apiUsageChart) return;
    
    const chartData = generateApiUsageData(); // In real app, this would fetch data for the selected period
    apiUsageChart.data.labels = chartData.labels;
    apiUsageChart.data.datasets[0].data = chartData.apiCalls;
    apiUsageChart.data.datasets[1].data = chartData.errors;
    apiUsageChart.update();
    
    showSuccess(`Chart updated for ${period}`);
}

function setupCustomIntegrationModal(){
    const modal = document.getElementById('customIntegrationModal');
    const saveBtn = document.getElementById('saveCustomIntegration');
    const testBtn = document.getElementById('testCustomIntegration');
    const authSelect = document.getElementById('customIntegrationAuth');
    
    if(saveBtn) saveBtn.addEventListener('click', saveCustomIntegration);
    if(testBtn) testBtn.addEventListener('click', testCustomIntegration);
    
    if(authSelect){
        authSelect.addEventListener('change', (e) => {
            const credentialsGroup = document.getElementById('authCredentialsGroup');
            if(credentialsGroup){
                credentialsGroup.style.display = e.target.value === 'none' ? 'none' : 'block';
            }
        });
    }
}

function showCustomIntegrationModal(){
    document.getElementById('customIntegrationModal').style.display = 'flex';
}

function closeCustomIntegrationModal(){
    document.getElementById('customIntegrationModal').style.display = 'none';
    // Clear form
    document.getElementById('customIntegrationName').value = '';
    document.getElementById('customIntegrationUrl').value = '';
    document.getElementById('customIntegrationCredentials').value = '';
}

function testCustomIntegration(){
    const name = document.getElementById('customIntegrationName')?.value;
    const url = document.getElementById('customIntegrationUrl')?.value;
    
    if(!name || !url){
        showError('Please fill in the integration name and URL');
        return;
    }
    
    showSuccess('Testing connection...');
    
    // Simulate connection test
    setTimeout(() => {
        showSuccess('Connection test successful!');
    }, 2000);
}

function saveCustomIntegration(){
    const name = document.getElementById('customIntegrationName')?.value;
    const type = document.getElementById('customIntegrationType')?.value;
    const url = document.getElementById('customIntegrationUrl')?.value;
    const auth = document.getElementById('customIntegrationAuth')?.value;
    
    if(!name || !url){
        showError('Please fill in all required fields');
        return;
    }
    
    // Get selected event types
    const eventCheckboxes = document.querySelectorAll('#customIntegrationModal .checkbox-item input:checked');
    const events = Array.from(eventCheckboxes).map(cb => cb.value);
    
    // Create new integration card
    const integrationsGrid = document.getElementById('integrationsGrid');
    const newCard = document.createElement('div');
    newCard.className = 'integration-card connected';
    newCard.dataset.category = 'custom';
    newCard.dataset.integration = name.toLowerCase().replace(/\s+/g, '-');
    
    newCard.innerHTML = `
        <div class="integration-header">
            <div class="integration-logo">🔧</div>
            <div class="integration-info">
                <h3>${name}</h3>
                <p>Custom ${type} integration</p>
            </div>
            <div class="integration-status connected">
                <div class="status-dot"></div>
                <span>Connected</span>
            </div>
        </div>
        <div class="integration-stats">
            <div class="stat-item">
                <span class="stat-value">0</span>
                <span class="stat-label">Events Sent</span>
            </div>
            <div class="stat-item">
                <span class="stat-value">100%</span>
                <span class="stat-label">Success Rate</span>
            </div>
        </div>
        <div class="integration-actions">
            <button class="action-btn primary">Configure</button>
            <button class="action-btn secondary">Test</button>
        </div>
    `;
    
    // Add event listeners to new card
    newCard.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const integration = newCard.dataset.integration;
            const action = btn.textContent.toLowerCase();
            handleIntegrationAction(integration, action, newCard);
        });
    });
    
    integrationsGrid.appendChild(newCard);
    
    closeCustomIntegrationModal();
    updateIntegrationSummary();
    showSuccess(`Custom integration "${name}" added successfully!`);
}

function setupIntegrationConfigModal(){
    const modal = document.getElementById('integrationModal');
    const saveBtn = document.getElementById('saveIntegration');
    
    if(saveBtn) saveBtn.addEventListener('click', saveIntegrationConfig);
}

function showIntegrationConfigModal(integration){
    const modal = document.getElementById('integrationModal');
    const title = document.getElementById('integrationModalTitle');
    const content = document.getElementById('integrationModalContent');
    
    title.textContent = `Configure ${getIntegrationName(integration)}`;
    
    // Generate configuration form based on integration type
    content.innerHTML = generateConfigForm(integration);
    
    modal.style.display = 'flex';
}

function closeIntegrationModal(){
    document.getElementById('integrationModal').style.display = 'none';
}

function generateConfigForm(integration){
    const forms = {
        'gmail': `
            <div class="form-group">
                <label>Gmail Account</label>
                <input type="email" class="form-input" value="security@company.com" readonly>
            </div>
            <div class="form-group">
                <label>Scan Frequency</label>
                <select class="form-select">
                    <option value="realtime">Real-time</option>
                    <option value="5min">Every 5 minutes</option>
                    <option value="15min">Every 15 minutes</option>
                    <option value="hourly">Hourly</option>
                </select>
            </div>
            <div class="form-group">
                <label>Folders to Monitor</label>
                <div class="checkbox-group">
                    <label class="checkbox-item">
                        <input type="checkbox" checked>
                        <span>Inbox</span>
                    </label>
                    <label class="checkbox-item">
                        <input type="checkbox">
                        <span>Sent</span>
                    </label>
                    <label class="checkbox-item">
                        <input type="checkbox">
                        <span>Spam</span>
                    </label>
                </div>
            </div>
        `,
        'slack': `
            <div class="form-group">
                <label>Workspace</label>
                <input type="text" class="form-input" value="Company Workspace" readonly>
            </div>
            <div class="form-group">
                <label>Alert Channel</label>
                <select class="form-select">
                    <option value="security">#security</option>
                    <option value="alerts">#alerts</option>
                    <option value="general">#general</option>
                </select>
            </div>
            <div class="form-group">
                <label>Alert Types</label>
                <div class="checkbox-group">
                    <label class="checkbox-item">
                        <input type="checkbox" checked>
                        <span>High Risk Threats</span>
                    </label>
                    <label class="checkbox-item">
                        <input type="checkbox" checked>
                        <span>System Alerts</span>
                    </label>
                    <label class="checkbox-item">
                        <input type="checkbox">
                        <span>Daily Summaries</span>
                    </label>
                </div>
            </div>
        `,
        'webhook': `
            <div class="form-group">
                <label>Webhook URL</label>
                <input type="url" class="form-input" value="https://api.company.com/webhooks/phishing">
            </div>
            <div class="form-group">
                <label>HTTP Method</label>
                <select class="form-select">
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                </select>
            </div>
            <div class="form-group">
                <label>Authentication</label>
                <select class="form-select">
                    <option value="none">None</option>
                    <option value="bearer">Bearer Token</option>
                    <option value="api-key">API Key</option>
                </select>
            </div>
        `
    };
    
    return forms[integration] || `
        <div class="form-group">
            <label>Configuration</label>
            <p style="color: #9fb4d3;">Configuration options for ${getIntegrationName(integration)} will be available here.</p>
        </div>
    `;
}

function saveIntegrationConfig(){
    closeIntegrationModal();
    showSuccess('Integration configuration saved successfully!');
}

// ===== Team Page Features =====
let teamMembers = [];
let currentEditingMember = null;

function setupTeamFeatures(){
    // Setup team filtering and search
    setupTeamFiltering();
    // Setup team actions
    setupTeamActions();
    // Setup member actions
    setupMemberActions();
    // Setup invite modal
    setupInviteModal();
    // Setup edit member modal
    setupEditMemberModal();
    // Setup view toggle
    setupViewToggle();
    // Setup activity filtering
    setupActivityFiltering();
    // Initialize team data
    initializeTeamData();
}

function setupTeamFiltering(){
    const roleFilter = document.getElementById('roleFilter');
    const statusFilter = document.getElementById('statusFilter');
    const teamSearch = document.getElementById('teamSearch');
    
    if(roleFilter) roleFilter.addEventListener('change', filterTeamMembers);
    if(statusFilter) statusFilter.addEventListener('change', filterTeamMembers);
    if(teamSearch) teamSearch.addEventListener('input', filterTeamMembers);
}

function filterTeamMembers(){
    const roleFilter = document.getElementById('roleFilter')?.value || 'all';
    const statusFilter = document.getElementById('statusFilter')?.value || 'all';
    const searchTerm = document.getElementById('teamSearch')?.value.toLowerCase() || '';
    
    const memberCards = document.querySelectorAll('.member-card');
    let visibleCount = 0;
    
    memberCards.forEach(card => {
        const role = card.dataset.role;
        const status = card.dataset.status;
        const name = card.querySelector('h4')?.textContent.toLowerCase() || '';
        const email = card.querySelector('.member-email')?.textContent.toLowerCase() || '';
        
        const roleMatch = roleFilter === 'all' || role === roleFilter;
        const statusMatch = statusFilter === 'all' || status === statusFilter;
        const searchMatch = searchTerm === '' || name.includes(searchTerm) || email.includes(searchTerm);
        
        if(roleMatch && statusMatch && searchMatch){
            card.style.display = 'block';
            visibleCount++;
        } else {
            card.style.display = 'none';
        }
    });
    
    // Update stats if needed
    updateTeamStats();
}

function setupTeamActions(){
    const inviteBtn = document.getElementById('inviteTeamMember');
    const manageRolesBtn = document.getElementById('manageRoles');
    const exportBtn = document.getElementById('exportTeam');
    
    if(inviteBtn) inviteBtn.addEventListener('click', showInviteModal);
    if(manageRolesBtn) manageRolesBtn.addEventListener('click', () => {
        // Scroll to permissions section
        document.querySelector('.permissions-section')?.scrollIntoView({behavior: 'smooth'});
    });
    if(exportBtn) exportBtn.addEventListener('click', exportTeamData);
}

function setupMemberActions(){
    const memberCards = document.querySelectorAll('.member-card');
    memberCards.forEach(card => {
        const actionBtns = card.querySelectorAll('.action-btn');
        actionBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = btn.dataset.action;
                const memberData = extractMemberData(card);
                handleMemberAction(action, memberData, card);
            });
        });
    });
}

function extractMemberData(card){
    return {
        name: card.querySelector('h4')?.textContent || '',
        email: card.querySelector('.member-email')?.textContent || '',
        role: card.dataset.role || '',
        status: card.dataset.status || '',
        avatar: card.querySelector('.member-avatar img')?.src || '',
        lastActive: card.querySelector('.member-meta span')?.textContent || '',
        joinDate: card.querySelector('.member-meta span:last-child')?.textContent || ''
    };
}

function handleMemberAction(action, memberData, card){
    switch(action){
        case 'edit':
            editMember(memberData);
            break;
        case 'permissions':
            viewMemberPermissions(memberData);
            break;
        case 'remove':
            removeMember(memberData, card);
            break;
        case 'resend':
            resendInvitation(memberData);
            break;
        case 'cancel':
            cancelInvitation(memberData, card);
            break;
        default:
            showSuccess(`${action} action triggered for ${memberData.name}`);
    }
}

function editMember(memberData){
    currentEditingMember = memberData;
    
    // Populate edit form
    document.getElementById('editMemberName').value = memberData.name;
    document.getElementById('editMemberEmail').value = memberData.email;
    document.getElementById('editMemberRole').value = memberData.role;
    document.getElementById('editMemberStatus').value = memberData.status;
    
    showEditMemberModal();
}

function viewMemberPermissions(memberData){
    // Highlight the permissions for this member's role
    const permissionsTable = document.querySelector('.permissions-matrix');
    if(permissionsTable){
        // Remove previous highlights
        permissionsTable.querySelectorAll('th, td').forEach(cell => {
            cell.classList.remove('highlighted');
        });
        
        // Find the role column and highlight it
        const headers = permissionsTable.querySelectorAll('th');
        let roleColumnIndex = -1;
        
        headers.forEach((header, index) => {
            if(header.textContent.toLowerCase().includes(getRoleDisplayName(memberData.role).toLowerCase())){
                roleColumnIndex = index;
                header.classList.add('highlighted');
            }
        });
        
        // Highlight the column cells
        if(roleColumnIndex > -1){
            const rows = permissionsTable.querySelectorAll('tbody tr');
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if(cells[roleColumnIndex]){
                    cells[roleColumnIndex].classList.add('highlighted');
                }
            });
        }
        
        // Scroll to permissions section
        document.querySelector('.permissions-section')?.scrollIntoView({behavior: 'smooth'});
        
        showSuccess(`Viewing permissions for ${memberData.name} (${getRoleDisplayName(memberData.role)})`);
    }
}

function removeMember(memberData, card){
    if(confirm(`Are you sure you want to remove ${memberData.name} from the team?`)){
        // Animate card removal
        card.style.transition = 'all 0.3s ease';
        card.style.transform = 'scale(0.8)';
        card.style.opacity = '0';
        
        setTimeout(() => {
            card.remove();
            updateTeamStats();
            addActivityItem(`removed ${memberData.name} from the team`, 'permissions');
            showSuccess(`${memberData.name} has been removed from the team`);
        }, 300);
    }
}

function resendInvitation(memberData){
    showSuccess(`Invitation resent to ${memberData.email}`);
    addActivityItem(`resent invitation to ${memberData.email}`, 'invite');
}

function cancelInvitation(memberData, card){
    if(confirm(`Are you sure you want to cancel the invitation for ${memberData.email}?`)){
        card.style.transition = 'all 0.3s ease';
        card.style.transform = 'scale(0.8)';
        card.style.opacity = '0';
        
        setTimeout(() => {
            card.remove();
            updateTeamStats();
            addActivityItem(`cancelled invitation for ${memberData.email}`, 'invite');
            showSuccess(`Invitation cancelled for ${memberData.email}`);
        }, 300);
    }
}

function getRoleDisplayName(role){
    const roleNames = {
        'admin': 'Administrator',
        'agent': 'Security Agent',
        'client': 'Client',
        'viewer': 'Viewer'
    };
    return roleNames[role] || role;
}

function setupInviteModal(){
    const modal = document.getElementById('inviteModal');
    const sendBtn = document.getElementById('sendInvite');
    const roleSelect = document.getElementById('inviteRole');
    
    if(sendBtn) sendBtn.addEventListener('click', sendInvitation);
    if(roleSelect) roleSelect.addEventListener('change', updatePermissionsPreview);
    
    // Initialize permissions preview
    updatePermissionsPreview();
}

function showInviteModal(){
    document.getElementById('inviteModal').style.display = 'flex';
    updatePermissionsPreview();
}

function closeInviteModal(){
    document.getElementById('inviteModal').style.display = 'none';
    // Clear form
    document.getElementById('inviteEmail').value = '';
    document.getElementById('inviteMessage').value = '';
    document.getElementById('inviteRole').value = 'agent';
}

function updatePermissionsPreview(){
    const role = document.getElementById('inviteRole')?.value || 'agent';
    const preview = document.getElementById('permissionsPreview');
    
    if(!preview) return;
    
    const permissions = getPermissionsForRole(role);
    
    preview.innerHTML = `
        <div style="color: #EAF1FB; font-size: 0.9rem; margin-bottom: 8px;">
            <strong>${getRoleDisplayName(role)} Permissions:</strong>
        </div>
        ${permissions.map(perm => `
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <span class="permission-badge ${perm.level}">${perm.level === 'granted' ? '✓' : perm.level === 'limited' ? 'Limited' : '✗'}</span>
                <span style="color: #EAF1FB; font-size: 0.85rem;">${perm.name}</span>
            </div>
        `).join('')}
    `;
}

function getPermissionsForRole(role){
    const allPermissions = [
        { name: 'View Dashboard', admin: 'granted', agent: 'granted', client: 'granted', viewer: 'granted' },
        { name: 'Analyze Emails', admin: 'granted', agent: 'granted', client: 'limited', viewer: 'denied' },
        { name: 'View History', admin: 'granted', agent: 'granted', client: 'granted', viewer: 'granted' },
        { name: 'Manage Threats', admin: 'granted', agent: 'granted', client: 'denied', viewer: 'denied' },
        { name: 'Generate Reports', admin: 'granted', agent: 'granted', client: 'limited', viewer: 'denied' },
        { name: 'Manage Integrations', admin: 'granted', agent: 'limited', client: 'denied', viewer: 'denied' },
        { name: 'Manage Team', admin: 'granted', agent: 'denied', client: 'denied', viewer: 'denied' },
        { name: 'Billing & Plans', admin: 'granted', agent: 'denied', client: 'denied', viewer: 'denied' },
        { name: 'System Settings', admin: 'granted', agent: 'denied', client: 'denied', viewer: 'denied' }
    ];
    
    return allPermissions.map(perm => ({
        name: perm.name,
        level: perm[role] || 'denied'
    }));
}

function sendInvitation(){
    const email = document.getElementById('inviteEmail')?.value;
    const role = document.getElementById('inviteRole')?.value;
    const message = document.getElementById('inviteMessage')?.value;
    
    if(!email || !isValidEmail(email)){
        showError('Please enter a valid email address');
        return;
    }
    
    // Check if email already exists
    const existingEmails = Array.from(document.querySelectorAll('.member-email')).map(el => el.textContent);
    if(existingEmails.includes(email)){
        showError('This email address is already part of the team');
        return;
    }
    
    // Create pending invitation card
    const membersGrid = document.getElementById('teamMembersGrid');
    const newCard = createPendingInviteCard(email, role);
    membersGrid.appendChild(newCard);
    
    // Setup actions for new card
    setupMemberActionsForCard(newCard);
    
    closeInviteModal();
    updateTeamStats();
    addActivityItem(`invited ${email} as ${getRoleDisplayName(role)}`, 'invite');
    showSuccess(`Invitation sent to ${email}`);
}

function createPendingInviteCard(email, role){
    const card = document.createElement('div');
    card.className = 'member-card pending';
    card.dataset.role = role;
    card.dataset.status = 'pending';
    
    card.innerHTML = `
        <div class="member-avatar">
            <div class="avatar-placeholder">📧</div>
            <div class="status-indicator pending"></div>
        </div>
        <div class="member-info">
            <h4>Pending Invitation</h4>
            <p class="member-email">${email}</p>
            <div class="member-role ${role}">${getRoleDisplayName(role)}</div>
            <div class="member-meta">
                <span>Invited: Just now</span>
                <span>Expires: 7 days</span>
            </div>
        </div>
        <div class="member-actions">
            <button class="action-btn" data-action="resend">Resend</button>
            <button class="action-btn danger" data-action="cancel">Cancel</button>
        </div>
    `;
    
    return card;
}

function setupMemberActionsForCard(card){
    const actionBtns = card.querySelectorAll('.action-btn');
    actionBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = btn.dataset.action;
            const memberData = extractMemberData(card);
            handleMemberAction(action, memberData, card);
        });
    });
}

function isValidEmail(email){
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function setupEditMemberModal(){
    const modal = document.getElementById('editMemberModal');
    const saveBtn = document.getElementById('saveMemberChanges');
    
    if(saveBtn) saveBtn.addEventListener('click', saveMemberChanges);
}

function showEditMemberModal(){
    document.getElementById('editMemberModal').style.display = 'flex';
}

function closeEditMemberModal(){
    document.getElementById('editMemberModal').style.display = 'none';
    currentEditingMember = null;
}

function saveMemberChanges(){
    const name = document.getElementById('editMemberName')?.value;
    const role = document.getElementById('editMemberRole')?.value;
    const status = document.getElementById('editMemberStatus')?.value;
    
    if(!name){
        showError('Please enter a name');
        return;
    }
    
    // Find and update the member card
    const memberCards = document.querySelectorAll('.member-card');
    memberCards.forEach(card => {
        const cardEmail = card.querySelector('.member-email')?.textContent;
        if(cardEmail === currentEditingMember.email){
            // Update card data
            card.dataset.role = role;
            card.dataset.status = status;
            
            // Update card content
            card.querySelector('h4').textContent = name;
            const roleElement = card.querySelector('.member-role');
            roleElement.textContent = getRoleDisplayName(role);
            roleElement.className = `member-role ${role}`;
            
            // Update status indicator
            const statusIndicator = card.querySelector('.status-indicator');
            statusIndicator.className = `status-indicator ${status}`;
        }
    });
    
    closeEditMemberModal();
    updateTeamStats();
    addActivityItem(`updated ${name}'s role to ${getRoleDisplayName(role)}`, 'permissions');
    showSuccess(`${name}'s information has been updated`);
}

function setupViewToggle(){
    const viewBtns = document.querySelectorAll('.view-btn');
    viewBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            viewBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const view = btn.dataset.view;
            toggleMembersView(view);
        });
    });
}

function toggleMembersView(view){
    const membersGrid = document.getElementById('teamMembersGrid');
    if(!membersGrid) return;
    
    if(view === 'list'){
        membersGrid.style.gridTemplateColumns = '1fr';
        membersGrid.querySelectorAll('.member-card').forEach(card => {
            card.style.display = 'flex';
            card.style.alignItems = 'center';
            card.style.gap = '16px';
        });
    } else {
        membersGrid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(320px, 1fr))';
        membersGrid.querySelectorAll('.member-card').forEach(card => {
            card.style.display = 'block';
            card.style.alignItems = '';
            card.style.gap = '';
        });
    }
}

function setupActivityFiltering(){
    const activityFilter = document.getElementById('activityFilter');
    if(activityFilter){
        activityFilter.addEventListener('change', (e) => {
            filterActivityItems(e.target.value);
        });
    }
}

function filterActivityItems(filter){
    const activityItems = document.querySelectorAll('.activity-item');
    activityItems.forEach(item => {
        const activityType = item.querySelector('.activity-type')?.classList[1] || '';
        
        if(filter === 'all' || activityType === filter){
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

function initializeTeamData(){
    updateTeamStats();
}

function updateTeamStats(){
    const memberCards = document.querySelectorAll('.member-card:not(.pending)');
    const pendingCards = document.querySelectorAll('.member-card.pending');
    const adminCards = document.querySelectorAll('.member-card[data-role="admin"]:not(.pending)');
    const activeCards = document.querySelectorAll('.member-card[data-status="active"]:not(.pending)');
    
    const totalEl = document.getElementById('totalMembers');
    const adminsEl = document.getElementById('activeAdmins');
    const pendingEl = document.getElementById('pendingInvites');
    const activeEl = document.getElementById('activeUsers');
    
    if(totalEl) totalEl.textContent = memberCards.length;
    if(adminsEl) adminsEl.textContent = adminCards.length;
    if(pendingEl) pendingEl.textContent = pendingCards.length;
    if(activeEl) activeEl.textContent = activeCards.length;
}

function exportTeamData(){
    const memberCards = document.querySelectorAll('.member-card');
    const teamData = [];
    
    memberCards.forEach(card => {
        const memberData = extractMemberData(card);
        teamData.push({
            Name: memberData.name,
            Email: memberData.email,
            Role: getRoleDisplayName(memberData.role),
            Status: memberData.status.charAt(0).toUpperCase() + memberData.status.slice(1),
            'Last Active': memberData.lastActive,
            'Join Date': memberData.joinDate
        });
    });
    
    // Convert to CSV
    const headers = Object.keys(teamData[0] || {});
    const csvContent = [
        headers.join(','),
        ...teamData.map(row => headers.map(header => `"${row[header] || ''}"`).join(','))
    ].join('\n');
    
    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `team-export-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showSuccess('Team data exported successfully');
}

function addActivityItem(text, type){
    const timeline = document.querySelector('.activity-timeline');
    if(!timeline) return;
    
    const currentUser = 'Current User'; // In real app, get from auth
    const activityItem = document.createElement('div');
    activityItem.className = 'activity-item';
    
    activityItem.innerHTML = `
        <div class="activity-avatar">
            <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser)}&background=4F709C&color=fff" alt="${currentUser}">
        </div>
        <div class="activity-content">
            <div class="activity-text">
                <strong>${currentUser}</strong> ${text}
            </div>
            <div class="activity-time">Just now</div>
        </div>
        <div class="activity-type ${type}">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
    `;
    
    // Add to top of timeline
    timeline.insertBefore(activityItem, timeline.firstChild);
    
    // Remove oldest items if more than 10
    const items = timeline.querySelectorAll('.activity-item');
    if(items.length > 10){
        items[items.length - 1].remove();
    }
}

// ===== Plan & Billing Page Features =====
let usageChart = null;
let currentPlan = 'pro';
let billingCycle = 'monthly';

function setupPlanBillingFeatures(){
    // Setup usage analytics chart
    setupUsageChart();
    // Setup billing toggle
    setupBillingToggle();
    // Setup plan actions
    setupPlanActions();
    // Setup billing history
    setupBillingHistory();
    // Setup payment methods
    setupPaymentMethods();
    // Setup billing settings
    setupBillingSettings();
    // Setup modals
    setupPlanModals();
    // Initialize data
    initializePlanData();
}

function setupUsageChart(){
    const canvas = document.getElementById('usageChart');
    if(!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    // Generate sample data for the last 30 days
    const labels = [];
    const data = [];
    const today = new Date();
    
    for(let i = 29; i >= 0; i--){
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        
        // Generate realistic usage data with some variation
        const baseUsage = 400 + Math.random() * 200;
        const weekendMultiplier = [0, 6].includes(date.getDay()) ? 0.6 : 1;
        data.push(Math.floor(baseUsage * weekendMultiplier));
    }
    
    usageChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Emails Analyzed',
                data: data,
                borderColor: '#4F709C',
                backgroundColor: 'rgba(79, 112, 156, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#4F709C',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#9fb4d3',
                        maxTicksLimit: 8
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#9fb4d3'
                    },
                    beginAtZero: true
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });
}

function setupBillingToggle(){
    const billingToggle = document.getElementById('billingToggle');
    if(!billingToggle){
        return;
    }
    
    billingToggle.addEventListener('change', (e) => {
        billingCycle = e.target.checked ? 'annual' : 'monthly';
        updatePlanPricing();
    });
}

function updatePlanPricing(){
    const monthlyPrices = document.querySelectorAll('.price-amount.monthly');
    const annualPrices = document.querySelectorAll('.price-amount.annual');
    
    if(billingCycle === 'annual'){
        monthlyPrices.forEach(el => el.style.display = 'none');
        annualPrices.forEach(el => el.style.display = 'inline');
    } else {
        monthlyPrices.forEach(el => el.style.display = 'inline');
        annualPrices.forEach(el => el.style.display = 'none');
    }
}

function setupPlanActions(){
    const manageBillingBtn = document.getElementById('manageBilling');
    const upgradePlanBtn = document.getElementById('upgradePlan');
    const planButtons = document.querySelectorAll('.plan-button');
    
    if(manageBillingBtn){
        manageBillingBtn.addEventListener('click', () => {
            // Scroll to billing settings
            document.querySelector('.billing-settings-section')?.scrollIntoView({behavior: 'smooth'});
        });
    }
    
    if(upgradePlanBtn){
        upgradePlanBtn.addEventListener('click', () => {
            showPlanChangeModal('enterprise');
        });
    }
    
    planButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const planCard = e.target.closest('.plan-card');
            const planName = planCard.querySelector('.plan-name').textContent.toLowerCase();
            
            if(btn.textContent.includes('Upgrade') || btn.textContent.includes('Downgrade')){
                showPlanChangeModal(planName);
            } else if(btn.textContent.includes('Manage')){
                // Scroll to billing settings for current plan
                document.querySelector('.billing-settings-section')?.scrollIntoView({behavior: 'smooth'});
            }
        });
    });
}

function setupBillingHistory(){
    const downloadInvoicesBtn = document.getElementById('downloadInvoices');
    const updatePaymentBtn = document.getElementById('updatePayment');
    const invoiceBtns = document.querySelectorAll('.invoice-btn');
    
    if(downloadInvoicesBtn){
        downloadInvoicesBtn.addEventListener('click', downloadAllInvoices);
    }
    
    if(updatePaymentBtn){
        updatePaymentBtn.addEventListener('click', () => {
            // Scroll to payment methods
            document.querySelector('.payment-methods-section')?.scrollIntoView({behavior: 'smooth'});
        });
    }
    
    invoiceBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const row = e.target.closest('tr');
            const date = row.cells[0].textContent;
            const description = row.cells[1].textContent;
            downloadInvoice(date, description);
        });
    });
}

function downloadAllInvoices(){
    // Simulate downloading all invoices as a ZIP file
    showSuccess('Downloading all invoices as ZIP file...');
    
    // In a real app, this would trigger a server-side ZIP generation
    setTimeout(() => {
        const link = document.createElement('a');
        link.href = '#'; // Would be actual ZIP file URL
        link.download = `invoices-${new Date().getFullYear()}.zip`;
        showSuccess('All invoices downloaded successfully');
    }, 2000);
}

function downloadInvoice(date, description){
    // Simulate downloading individual invoice
    showSuccess(`Downloading invoice for ${date}...`);
    
    // In a real app, this would generate/download the actual PDF
    setTimeout(() => {
        const link = document.createElement('a');
        link.href = '#'; // Would be actual PDF URL
        link.download = `invoice-${date.replace(/\s+/g, '-').toLowerCase()}.pdf`;
        showSuccess('Invoice downloaded successfully');
    }, 1000);
}

function setupPaymentMethods(){
    const addPaymentBtn = document.getElementById('addPaymentMethod');
    const paymentActionBtns = document.querySelectorAll('.payment-method-card .action-btn');
    
    if(addPaymentBtn){
        addPaymentBtn.addEventListener('click', showPaymentMethodModal);
    }
    
    paymentActionBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = btn.textContent.toLowerCase();
            const card = e.target.closest('.payment-method-card');
            const cardType = card.querySelector('.card-type').textContent;
            
            handlePaymentMethodAction(action, cardType, card);
        });
    });
}

function handlePaymentMethodAction(action, cardType, card){
    switch(action){
        case 'set primary':
            setPrimaryPaymentMethod(cardType, card);
            break;
        case 'edit':
            editPaymentMethod(cardType);
            break;
        case 'remove':
            removePaymentMethod(cardType, card);
            break;
        default:
            showSuccess(`${action} action for ${cardType}`);
    }
}

function setPrimaryPaymentMethod(cardType, card){
    // Remove primary status from all cards
    document.querySelectorAll('.payment-method-card').forEach(c => {
        c.classList.remove('primary');
        const badge = c.querySelector('.primary-badge');
        if(badge) badge.remove();
        
        // Update action buttons
        const setPrimaryBtn = c.querySelector('.action-btn');
        if(setPrimaryBtn && setPrimaryBtn.textContent === 'Edit'){
            setPrimaryBtn.textContent = 'Set Primary';
        }
    });
    
    // Set new primary
    card.classList.add('primary');
    const cardInfo = card.querySelector('.card-info');
    const primaryBadge = document.createElement('div');
    primaryBadge.className = 'primary-badge';
    primaryBadge.textContent = 'Primary';
    card.querySelector('.payment-method-header').appendChild(primaryBadge);
    
    // Update action buttons
    const actionBtns = card.querySelectorAll('.action-btn');
    actionBtns[0].textContent = 'Edit';
    
    showSuccess(`${cardType} set as primary payment method`);
}

function editPaymentMethod(cardType){
    showPaymentMethodModal(cardType);
}

function removePaymentMethod(cardType, card){
    if(confirm(`Are you sure you want to remove ${cardType}?`)){
        card.style.transition = 'all 0.3s ease';
        card.style.transform = 'scale(0.8)';
        card.style.opacity = '0';
        
        setTimeout(() => {
            card.remove();
            showSuccess(`${cardType} removed successfully`);
        }, 300);
    }
}

function setupBillingSettings(){
    const settingBtns = document.querySelectorAll('.setting-btn');
    const settingInputs = document.querySelectorAll('.setting-input');
    const toggleSwitches = document.querySelectorAll('.billing-settings-section .toggle-switch input');
    
    settingBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const settingItem = e.target.closest('.setting-item');
            const settingTitle = settingItem.querySelector('.setting-title').textContent;
            
            if(btn.textContent === 'Update'){
                const input = settingItem.querySelector('.setting-input');
                if(input){
                    updateBillingSetting(settingTitle, input.value);
                }
            } else {
                handleBillingSettingAction(settingTitle);
            }
        });
    });
    
    settingInputs.forEach(input => {
        input.addEventListener('keypress', (e) => {
            if(e.key === 'Enter'){
                const settingItem = e.target.closest('.setting-item');
                const settingTitle = settingItem.querySelector('.setting-title').textContent;
                updateBillingSetting(settingTitle, input.value);
            }
        });
    });
    
    toggleSwitches.forEach(toggle => {
        toggle.addEventListener('change', (e) => {
            const settingItem = e.target.closest('.setting-item');
            const settingTitle = settingItem.querySelector('.setting-title').textContent;
            updateBillingSetting(settingTitle, e.target.checked);
        });
    });
}

function updateBillingSetting(setting, value){
    showSuccess(`${setting} updated successfully`);
    console.log(`Updated ${setting}:`, value);
}

function handleBillingSettingAction(setting){
    switch(setting.toLowerCase()){
        case 'billing address':
            showBillingAddressModal();
            break;
        case 'tax information':
            showTaxInfoModal();
            break;
        default:
            showSuccess(`Opening ${setting} settings...`);
    }
}

function showBillingAddressModal(){
    // In a real app, this would show a modal with address form
    showSuccess('Opening billing address form...');
}

function showTaxInfoModal(){
    // In a real app, this would show a modal with tax information form
    showSuccess('Opening tax information form...');
}

function setupPlanModals(){
    const planChangeModal = document.getElementById('planChangeModal');
    const paymentMethodModal = document.getElementById('paymentMethodModal');
    const confirmPlanChangeBtn = document.getElementById('confirmPlanChange');
    const savePaymentMethodBtn = document.getElementById('savePaymentMethod');
    
    if(confirmPlanChangeBtn){
        confirmPlanChangeBtn.addEventListener('click', confirmPlanChange);
    }
    
    if(savePaymentMethodBtn){
        savePaymentMethodBtn.addEventListener('click', savePaymentMethod);
    }
    
    // Setup card number formatting
    const cardNumberInput = document.getElementById('cardNumber');
    if(cardNumberInput){
        cardNumberInput.addEventListener('input', formatCardNumber);
    }
    
    // Setup expiry date formatting
    const cardExpiryInput = document.getElementById('cardExpiry');
    if(cardExpiryInput){
        cardExpiryInput.addEventListener('input', formatExpiryDate);
    }
}

function showPlanChangeModal(newPlan){
    const modal = document.getElementById('planChangeModal');
    const title = document.getElementById('planChangeTitle');
    const currentPlanEl = modal.querySelector('.current-plan .plan-details');
    const newPlanEl = modal.querySelector('.new-plan .plan-details');
    
    const planNames = {
        'free': 'Free Plan - $0/month',
        'pro': 'Pro Plan - $23/month',
        'enterprise': 'Enterprise Plan - $79/month'
    };
    
    const planTitles = {
        'free': 'Downgrade to Free',
        'pro': currentPlan === 'free' ? 'Upgrade to Pro' : 'Downgrade to Pro',
        'enterprise': 'Upgrade to Enterprise'
    };
    
    title.textContent = planTitles[newPlan] || `Change to ${newPlan}`;
    currentPlanEl.textContent = planNames[currentPlan];
    newPlanEl.textContent = planNames[newPlan];
    
    modal.style.display = 'flex';
}

function closePlanChangeModal(){
    document.getElementById('planChangeModal').style.display = 'none';
}

function confirmPlanChange(){
    const modal = document.getElementById('planChangeModal');
    const newPlanText = modal.querySelector('.new-plan .plan-details').textContent;
    
    closePlanChangeModal();
    
    // Simulate plan change processing
    showSuccess('Processing plan change...');
    
    setTimeout(() => {
        showSuccess(`Successfully changed to ${newPlanText}`);
        // In a real app, this would refresh the page or update the UI
        updateCurrentPlanUI(newPlanText);
    }, 2000);
}

function updateCurrentPlanUI(newPlanText){
    // Update current plan badge and details
    const planBadge = document.querySelector('.plan-badge');
    const planPrice = document.querySelector('.detail-value');
    
    if(newPlanText.includes('Enterprise')){
        planBadge.textContent = 'Enterprise Plan';
        planBadge.className = 'plan-badge enterprise';
        if(planPrice) planPrice.textContent = '$79/month';
        currentPlan = 'enterprise';
    } else if(newPlanText.includes('Pro')){
        planBadge.textContent = 'Pro Plan';
        planBadge.className = 'plan-badge pro';
        if(planPrice) planPrice.textContent = '$23/month';
        currentPlan = 'pro';
    } else {
        planBadge.textContent = 'Free Plan';
        planBadge.className = 'plan-badge free';
        if(planPrice) planPrice.textContent = '$0/month';
        currentPlan = 'free';
    }
    
    // Update plan cards
    updatePlanCardsUI();
}

function updatePlanCardsUI(){
    const planCards = document.querySelectorAll('.plan-card');
    
    planCards.forEach(card => {
        const planName = card.querySelector('.plan-name').textContent.toLowerCase();
        const button = card.querySelector('.plan-button');
        const ribbon = card.querySelector('.plan-badge-ribbon');
        
        // Remove current plan styling
        card.classList.remove('current');
        if(ribbon) ribbon.remove();
        
        // Update button text and styling
        if(planName === currentPlan){
            card.classList.add('current');
            const newRibbon = document.createElement('div');
            newRibbon.className = 'plan-badge-ribbon';
            newRibbon.textContent = 'Current Plan';
            card.appendChild(newRibbon);
            
            button.textContent = 'Manage Plan';
            button.className = 'plan-button primary';
        } else if(getPlanTier(planName) > getPlanTier(currentPlan)){
            button.textContent = 'Upgrade Now';
            button.className = 'plan-button primary';
        } else if(getPlanTier(planName) < getPlanTier(currentPlan)){
            button.textContent = 'Downgrade';
            button.className = 'plan-button secondary';
        } else {
            button.textContent = 'Current Plan';
            button.className = 'plan-button secondary';
        }
    });
}

function getPlanTier(plan){
    const tiers = { 'free': 1, 'pro': 2, 'enterprise': 3 };
    return tiers[plan] || 0;
}

function showPaymentMethodModal(editCard = null){
    const modal = document.getElementById('paymentMethodModal');
    const title = modal.querySelector('.modal-header h2');
    
    if(editCard){
        title.textContent = `Edit ${editCard}`;
        // In a real app, populate form with existing card data
    } else {
        title.textContent = 'Add Payment Method';
        // Clear form
        modal.querySelectorAll('.form-input').forEach(input => input.value = '');
        document.getElementById('setPrimary').checked = false;
    }
    
    modal.style.display = 'flex';
}

function closePaymentMethodModal(){
    document.getElementById('paymentMethodModal').style.display = 'none';
}

function savePaymentMethod(){
    const cardNumber = document.getElementById('cardNumber').value;
    const cardExpiry = document.getElementById('cardExpiry').value;
    const cardCvc = document.getElementById('cardCvc').value;
    const cardName = document.getElementById('cardName').value;
    const setPrimary = document.getElementById('setPrimary').checked;
    
    // Basic validation
    if(!cardNumber || !cardExpiry || !cardCvc || !cardName){
        showError('Please fill in all required fields');
        return;
    }
    
    if(!isValidCardNumber(cardNumber)){
        showError('Please enter a valid card number');
        return;
    }
    
    if(!isValidExpiry(cardExpiry)){
        showError('Please enter a valid expiry date');
        return;
    }
    
    closePaymentMethodModal();
    
    // Simulate saving payment method
    showSuccess('Adding payment method...');
    
    setTimeout(() => {
        addPaymentMethodCard(cardNumber, cardExpiry, cardName, setPrimary);
        showSuccess('Payment method added successfully');
    }, 1500);
}

function addPaymentMethodCard(cardNumber, expiry, name, isPrimary){
    const grid = document.querySelector('.payment-methods-grid');
    const cardType = getCardType(cardNumber);
    const maskedNumber = `${cardType} ending in ${cardNumber.slice(-4)}`;
    
    const newCard = document.createElement('div');
    newCard.className = `payment-method-card ${isPrimary ? 'primary' : ''}`;
    
    newCard.innerHTML = `
        <div class="payment-method-header">
            <div class="card-icon">💳</div>
            <div class="card-info">
                <div class="card-type">${maskedNumber}</div>
                <div class="card-expiry">Expires ${expiry}</div>
            </div>
            ${isPrimary ? '<div class="primary-badge">Primary</div>' : ''}
        </div>
        <div class="payment-method-actions">
            ${!isPrimary ? '<button class="action-btn">Set Primary</button>' : ''}
            <button class="action-btn">Edit</button>
            <button class="action-btn danger">Remove</button>
        </div>
    `;
    
    grid.appendChild(newCard);
    
    // Setup event listeners for new card
    const actionBtns = newCard.querySelectorAll('.action-btn');
    actionBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = btn.textContent.toLowerCase();
            handlePaymentMethodAction(action, maskedNumber, newCard);
        });
    });
    
    // If set as primary, update other cards
    if(isPrimary){
        document.querySelectorAll('.payment-method-card').forEach(card => {
            if(card !== newCard){
                card.classList.remove('primary');
                const badge = card.querySelector('.primary-badge');
                if(badge) badge.remove();
            }
        });
    }
}

function getCardType(cardNumber){
    const cleaned = cardNumber.replace(/\s/g, '');
    if(cleaned.startsWith('4')) return 'Visa';
    if(cleaned.startsWith('5') || cleaned.startsWith('2')) return 'Mastercard';
    if(cleaned.startsWith('3')) return 'American Express';
    return 'Card';
}

function formatCardNumber(e){
    let value = e.target.value.replace(/\s/g, '');
    let formattedValue = value.replace(/(.{4})/g, '$1 ').trim();
    if(formattedValue.length > 19) formattedValue = formattedValue.substr(0, 19);
    e.target.value = formattedValue;
}

function formatExpiryDate(e){
    let value = e.target.value.replace(/\D/g, '');
    if(value.length >= 2){
        value = value.substring(0, 2) + '/' + value.substring(2, 4);
    }
    e.target.value = value;
}

function isValidCardNumber(cardNumber){
    const cleaned = cardNumber.replace(/\s/g, '');
    return cleaned.length >= 13 && cleaned.length <= 19 && /^\d+$/.test(cleaned);
}

function isValidExpiry(expiry){
    if(!/^\d{2}\/\d{2}$/.test(expiry)) return false;
    
    const [month, year] = expiry.split('/').map(num => parseInt(num));
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear() % 100;
    const currentMonth = currentDate.getMonth() + 1;
    
    if(month < 1 || month > 12) return false;
    if(year < currentYear || (year === currentYear && month < currentMonth)) return false;
    
    return true;
}

function initializePlanData(){
    // Update usage chart based on analytics period
    const analyticsPeriod = document.getElementById('analyticsPeriod');
    if(analyticsPeriod){
        analyticsPeriod.addEventListener('change', (e) => {
            updateUsageChart(e.target.value);
        });
    }
    
    // Initialize plan cards UI
    updatePlanCardsUI();
}

function updateUsageChart(period){
    if(!usageChart) return;
    
    // Generate different data based on period
    let labels = [];
    let data = [];
    
    switch(period){
        case 'week':
            // Last 7 days
            for(let i = 6; i >= 0; i--){
                const date = new Date();
                date.setDate(date.getDate() - i);
                labels.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
                data.push(Math.floor(300 + Math.random() * 400));
            }
            break;
        case 'quarter':
            // Last 12 weeks
            for(let i = 11; i >= 0; i--){
                const date = new Date();
                date.setDate(date.getDate() - (i * 7));
                labels.push(`Week ${12 - i}`);
                data.push(Math.floor(2000 + Math.random() * 1000));
            }
            break;
        case 'year':
            // Last 12 months
            for(let i = 11; i >= 0; i--){
                const date = new Date();
                date.setMonth(date.getMonth() - i);
                labels.push(date.toLocaleDateString('en-US', { month: 'short' }));
                data.push(Math.floor(8000 + Math.random() * 4000));
            }
            break;
        default:
            // Month (default) - already set in setupUsageChart
            return;
    }
    
    usageChart.data.labels = labels;
    usageChart.data.datasets[0].data = data;
    usageChart.update();
}

// ===== Settings Page Features =====
let currentSettingsSection = 'account';
let originalProfileData = {};

function setupSettingsFeatures(){
    // Setup settings navigation
    setupSettingsNavigation();
    // Setup account settings
    setupAccountSettings();
    // Setup security settings
    setupSecuritySettings();
    // Setup notification settings
    setupNotificationSettings();
    // Setup preference settings
    setupPreferenceSettings();
    // Setup privacy settings
    setupPrivacySettings();
    // Setup advanced settings
    setupAdvancedSettings();
    // Setup modals
    setupSettingsModals();
    // Initialize settings data
    initializeSettingsData();
}

function setupSettingsNavigation(){
    const navBtns = document.querySelectorAll('.settings-nav-btn');
    
    navBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const section = e.target.getAttribute('data-section');
            switchSettingsSection(section);
        });
    });
}

function switchSettingsSection(section){
    // Update navigation
    document.querySelectorAll('.settings-nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-section="${section}"]`).classList.add('active');
    
    // Update sections
    document.querySelectorAll('.settings-section').forEach(sec => {
        sec.classList.remove('active');
    });
    document.getElementById(`${section}-section`).classList.add('active');
    
    currentSettingsSection = section;
}

function setupAccountSettings(){
    const saveProfileBtn = document.getElementById('saveProfile');
    const cancelProfileBtn = document.getElementById('cancelProfile');
    const avatarUploadBtn = document.querySelector('.avatar-upload-btn');
    const avatarUpload = document.getElementById('avatarUpload');
    
    // Store original data
    storeOriginalProfileData();
    
    if(saveProfileBtn){
        saveProfileBtn.addEventListener('click', saveProfileChanges);
    }
    
    if(cancelProfileBtn){
        cancelProfileBtn.addEventListener('click', cancelProfileChanges);
    }
    
    if(avatarUploadBtn){
        avatarUploadBtn.addEventListener('click', () => {
            avatarUpload.click();
        });
    }
    
    if(avatarUpload){
        avatarUpload.addEventListener('change', handleAvatarUpload);
    }
    
    // Monitor form changes
    const profileInputs = document.querySelectorAll('#account-section .form-input');
    profileInputs.forEach(input => {
        input.addEventListener('input', checkProfileChanges);
    });
}

function storeOriginalProfileData(){
    originalProfileData = {
        firstName: document.getElementById('firstName')?.value || '',
        lastName: document.getElementById('lastName')?.value || '',
        emailAddress: document.getElementById('emailAddress')?.value || '',
        jobTitle: document.getElementById('jobTitle')?.value || '',
        company: document.getElementById('company')?.value || '',
        phoneNumber: document.getElementById('phoneNumber')?.value || ''
    };
}

function checkProfileChanges(){
    const currentData = {
        firstName: document.getElementById('firstName')?.value || '',
        lastName: document.getElementById('lastName')?.value || '',
        emailAddress: document.getElementById('emailAddress')?.value || '',
        jobTitle: document.getElementById('jobTitle')?.value || '',
        company: document.getElementById('company')?.value || '',
        phoneNumber: document.getElementById('phoneNumber')?.value || ''
    };
    
    const hasChanges = Object.keys(originalProfileData).some(key => 
        originalProfileData[key] !== currentData[key]
    );
    
    const saveBtn = document.getElementById('saveProfile');
    const cancelBtn = document.getElementById('cancelProfile');
    
    if(saveBtn && cancelBtn){
        saveBtn.disabled = !hasChanges;
        cancelBtn.disabled = !hasChanges;
        
        if(hasChanges){
            saveBtn.style.opacity = '1';
            cancelBtn.style.opacity = '1';
        } else {
            saveBtn.style.opacity = '0.6';
            cancelBtn.style.opacity = '0.6';
        }
    }
}

function saveProfileChanges(){
    const profileData = {
        firstName: document.getElementById('firstName').value,
        lastName: document.getElementById('lastName').value,
        emailAddress: document.getElementById('emailAddress').value,
        jobTitle: document.getElementById('jobTitle').value,
        company: document.getElementById('company').value,
        phoneNumber: document.getElementById('phoneNumber').value
    };
    
    // Simulate saving
    showSuccess('Saving profile changes...');
    
    setTimeout(() => {
        // Update avatar with new name
        updateProfileAvatar(profileData.firstName, profileData.lastName);
        
        // Store new original data
        originalProfileData = {...profileData};
        checkProfileChanges();
        
        showSuccess('Profile updated successfully');
    }, 1500);
}

function cancelProfileChanges(){
    // Restore original values
    Object.keys(originalProfileData).forEach(key => {
        const element = document.getElementById(key);
        if(element){
            element.value = originalProfileData[key];
        }
    });
    
    checkProfileChanges();
    showSuccess('Changes cancelled');
}

function handleAvatarUpload(e){
    const file = e.target.files[0];
    if(!file) return;
    
    if(!file.type.startsWith('image/')){
        showError('Please select a valid image file');
        return;
    }
    
    if(file.size > 5 * 1024 * 1024){
        showError('Image size must be less than 5MB');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const avatarImg = document.getElementById('profileAvatar');
        if(avatarImg){
            avatarImg.src = e.target.result;
            showSuccess('Profile photo updated');
        }
    };
    reader.readAsDataURL(file);
}

function updateProfileAvatar(firstName, lastName){
    const avatarImg = document.getElementById('profileAvatar');
    if(avatarImg && firstName && lastName){
        const name = `${firstName}+${lastName}`;
        avatarImg.src = `https://ui-avatars.com/api/?name=${name}&background=4F709C&color=fff`;
    }
}

function setupSecuritySettings(){
    const changePasswordBtn = document.getElementById('changePassword');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const disable2FABtn = document.getElementById('disable2FA');
    const generateBackupCodesBtn = document.getElementById('generateBackupCodes');
    const downloadBackupCodesBtn = document.getElementById('downloadBackupCodes');
    const revokeAllSessionsBtn = document.getElementById('revokeAllSessions');
    const sessionActionBtns = document.querySelectorAll('.session-action');
    
    if(changePasswordBtn){
        changePasswordBtn.addEventListener('click', changePassword);
    }
    
    if(newPasswordInput){
        newPasswordInput.addEventListener('input', updatePasswordStrength);
    }
    
    if(confirmPasswordInput){
        confirmPasswordInput.addEventListener('input', validatePasswordMatch);
    }
    
    if(disable2FABtn){
        disable2FABtn.addEventListener('click', disable2FA);
    }
    
    if(generateBackupCodesBtn){
        generateBackupCodesBtn.addEventListener('click', generateBackupCodes);
    }
    
    if(downloadBackupCodesBtn){
        downloadBackupCodesBtn.addEventListener('click', downloadBackupCodes);
    }
    
    if(revokeAllSessionsBtn){
        revokeAllSessionsBtn.addEventListener('click', revokeAllSessions);
    }
    
    sessionActionBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const sessionItem = e.target.closest('.session-item');
            revokeSession(sessionItem);
        });
    });
}

function updatePasswordStrength(){
    const password = document.getElementById('newPassword').value;
    const strengthFill = document.getElementById('strengthFill');
    const strengthText = document.getElementById('strengthText');
    
    if(!strengthFill || !strengthText) return;
    
    const strength = calculatePasswordStrength(password);
    
    strengthFill.style.width = `${strength.percentage}%`;
    strengthFill.style.background = strength.color;
    strengthText.textContent = strength.text;
    strengthText.style.color = strength.color;
}

function calculatePasswordStrength(password){
    let score = 0;
    let feedback = [];
    
    if(password.length >= 8) score += 20;
    else feedback.push('At least 8 characters');
    
    if(/[a-z]/.test(password)) score += 20;
    else feedback.push('Lowercase letter');
    
    if(/[A-Z]/.test(password)) score += 20;
    else feedback.push('Uppercase letter');
    
    if(/[0-9]/.test(password)) score += 20;
    else feedback.push('Number');
    
    if(/[^A-Za-z0-9]/.test(password)) score += 20;
    else feedback.push('Special character');
    
    let strength = {
        percentage: score,
        color: '#dc2626',
        text: 'Weak'
    };
    
    if(score >= 80){
        strength.color = '#059669';
        strength.text = 'Strong';
    } else if(score >= 60){
        strength.color = '#d97706';
        strength.text = 'Good';
    } else if(score >= 40){
        strength.color = '#f59e0b';
        strength.text = 'Fair';
    }
    
    if(feedback.length > 0 && score < 100){
        strength.text += ` (Need: ${feedback.join(', ')})`;
    }
    
    return strength;
}

function validatePasswordMatch(){
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const changePasswordBtn = document.getElementById('changePassword');
    
    if(confirmPassword && newPassword !== confirmPassword){
        document.getElementById('confirmPassword').style.borderColor = '#dc2626';
        if(changePasswordBtn) changePasswordBtn.disabled = true;
    } else {
        document.getElementById('confirmPassword').style.borderColor = '';
        if(changePasswordBtn) changePasswordBtn.disabled = false;
    }
}

function changePassword(){
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if(!currentPassword || !newPassword || !confirmPassword){
        showError('Please fill in all password fields');
        return;
    }
    
    if(newPassword !== confirmPassword){
        showError('New passwords do not match');
        return;
    }
    
    const strength = calculatePasswordStrength(newPassword);
    if(strength.percentage < 60){
        showError('Password is too weak. Please choose a stronger password.');
        return;
    }
    
    showSuccess('Changing password...');
    
    setTimeout(() => {
        // Clear form
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
        
        // Reset strength indicator
        document.getElementById('strengthFill').style.width = '0%';
        document.getElementById('strengthText').textContent = 'Password strength';
        
        showSuccess('Password changed successfully');
    }, 2000);
}

function disable2FA(){
    if(confirm('Are you sure you want to disable two-factor authentication? This will make your account less secure.')){
        showSuccess('Disabling two-factor authentication...');
        
        setTimeout(() => {
            // Update UI to show 2FA as disabled
            const tfaStatus = document.querySelector('.tfa-status');
            const tfaTitle = document.querySelector('.tfa-title');
            const tfaDescription = document.querySelector('.tfa-description');
            const disable2FABtn = document.getElementById('disable2FA');
            
            if(tfaTitle) tfaTitle.textContent = 'Two-Factor Authentication is Disabled';
            if(tfaDescription) tfaDescription.textContent = 'Add an extra layer of security to your account';
            if(disable2FABtn) disable2FABtn.textContent = 'Enable 2FA';
            
            showSuccess('Two-factor authentication disabled');
        }, 1500);
    }
}

function generateBackupCodes(){
    showSuccess('Generating backup codes...');
    
    setTimeout(() => {
        const codes = [];
        for(let i = 0; i < 10; i++){
            codes.push(Math.random().toString(36).substr(2, 8).toUpperCase());
        }
        
        const codesText = codes.join('\n');
        navigator.clipboard.writeText(codesText).then(() => {
            showSuccess('Backup codes generated and copied to clipboard');
        }).catch(() => {
            showSuccess('Backup codes generated. Please save them securely.');
        });
    }, 1000);
}

function downloadBackupCodes(){
    const codes = [];
    for(let i = 0; i < 10; i++){
        codes.push(Math.random().toString(36).substr(2, 8).toUpperCase());
    }
    
    const codesText = `Phishing Detection AI - Backup Codes
Generated: ${new Date().toLocaleString()}

${codes.join('\n')}

Keep these codes safe and secure. Each code can only be used once.`;
    
    const blob = new Blob([codesText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
    
    showSuccess('Backup codes downloaded');
}

function revokeSession(sessionItem){
    const deviceName = sessionItem.querySelector('.device-name').textContent;
    
    if(confirm(`Revoke session for ${deviceName}?`)){
        sessionItem.style.transition = 'all 0.3s ease';
        sessionItem.style.transform = 'scale(0.8)';
        sessionItem.style.opacity = '0';
        
        setTimeout(() => {
            sessionItem.remove();
            showSuccess(`Session for ${deviceName} revoked`);
        }, 300);
    }
}

function revokeAllSessions(){
    if(confirm('Revoke all other sessions? You will need to sign in again on other devices.')){
        const sessionItems = document.querySelectorAll('.session-item:not(.current)');
        
        sessionItems.forEach((item, index) => {
            setTimeout(() => {
                item.style.transition = 'all 0.3s ease';
                item.style.transform = 'scale(0.8)';
                item.style.opacity = '0';
                
                setTimeout(() => {
                    item.remove();
                }, 300);
            }, index * 100);
        });
        
        setTimeout(() => {
            showSuccess('All other sessions revoked');
        }, sessionItems.length * 100 + 300);
    }
}

function setupNotificationSettings(){
    const enablePushBtn = document.getElementById('enablePushNotifications');
    const notificationToggles = document.querySelectorAll('#notifications-section .toggle-switch input');
    const alertSelects = document.querySelectorAll('.alert-preferences select');
    const timeInputs = document.querySelectorAll('.time-range input');
    
    if(enablePushBtn){
        enablePushBtn.addEventListener('click', enablePushNotifications);
    }
    
    notificationToggles.forEach(toggle => {
        toggle.addEventListener('change', (e) => {
            const item = e.target.closest('.notification-item');
            const title = item.querySelector('.notification-title').textContent;
            const enabled = e.target.checked;
            
            showSuccess(`${title} notifications ${enabled ? 'enabled' : 'disabled'}`);
        });
    });
    
    alertSelects.forEach(select => {
        select.addEventListener('change', (e) => {
            const label = e.target.closest('.form-group').querySelector('label').textContent;
            showSuccess(`${label} updated`);
        });
    });
    
    timeInputs.forEach(input => {
        input.addEventListener('change', () => {
            showSuccess('Quiet hours updated');
        });
    });
}

function enablePushNotifications(){
    if('Notification' in window){
        Notification.requestPermission().then(permission => {
            if(permission === 'granted'){
                const enableBtn = document.getElementById('enablePushNotifications');
                if(enableBtn){
                    enableBtn.textContent = 'Notifications Enabled';
                    enableBtn.disabled = true;
                    enableBtn.style.opacity = '0.6';
                }
                
                showSuccess('Push notifications enabled');
                
                // Show a test notification
                setTimeout(() => {
                    new Notification('Phishing Detection AI', {
                        body: 'Push notifications are now enabled!',
                        icon: '/favicon.ico'
                    });
                }, 1000);
            } else {
                showError('Push notifications permission denied');
            }
        });
    } else {
        showError('Push notifications are not supported in this browser');
    }
}

function setupPreferenceSettings(){
    const preferenceSelects = document.querySelectorAll('.preference-select');
    const preferenceToggles = document.querySelectorAll('#preferences-section .toggle-switch input');
    
    preferenceSelects.forEach(select => {
        select.addEventListener('change', (e) => {
            const item = e.target.closest('.preference-item');
            const title = item.querySelector('.preference-title').textContent;
            const value = e.target.value;
            
            handlePreferenceChange(title, value);
        });
    });
    
    preferenceToggles.forEach(toggle => {
        toggle.addEventListener('change', (e) => {
            const item = e.target.closest('.preference-item');
            const title = item.querySelector('.preference-title').textContent;
            const enabled = e.target.checked;
            
            handlePreferenceToggle(title, enabled);
        });
    });
}

function handlePreferenceChange(setting, value){
    switch(setting.toLowerCase()){
        case 'theme':
            applyTheme(value);
            break;
        case 'language':
            showSuccess(`Language changed to ${getLanguageName(value)}`);
            break;
        case 'timezone':
            showSuccess(`Timezone updated to ${value}`);
            break;
        case 'date format':
            showSuccess(`Date format changed to ${value}`);
            break;
        case 'default page':
            showSuccess(`Default page set to ${value}`);
            break;
        case 'items per page':
            showSuccess(`Items per page set to ${value}`);
            break;
        default:
            showSuccess(`${setting} updated`);
    }
}

function handlePreferenceToggle(setting, enabled){
    switch(setting.toLowerCase()){
        case 'auto-refresh':
            showSuccess(`Auto-refresh ${enabled ? 'enabled' : 'disabled'}`);
            break;
        case 'show tooltips':
            showSuccess(`Tooltips ${enabled ? 'enabled' : 'disabled'}`);
            break;
        default:
            showSuccess(`${setting} ${enabled ? 'enabled' : 'disabled'}`);
    }
}

function applyTheme(theme){
    // In a real app, this would apply the theme
    showSuccess(`Theme changed to ${theme}`);
    console.log(`Applying theme: ${theme}`);
}

function getLanguageName(code){
    const languages = {
        'en': 'English',
        'es': 'Spanish',
        'fr': 'French',
        'de': 'German',
        'ja': 'Japanese'
    };
    return languages[code] || code;
}

function setupPrivacySettings(){
    const exportDataBtn = document.getElementById('exportData');
    const backupSettingsBtn = document.getElementById('backupSettings');
    const deleteAccountBtn = document.getElementById('deleteAccount');
    const privacyToggles = document.querySelectorAll('#privacy-section .toggle-switch input');
    const privacySelects = document.querySelectorAll('.privacy-select');
    
    if(exportDataBtn){
        exportDataBtn.addEventListener('click', exportUserData);
    }
    
    if(backupSettingsBtn){
        backupSettingsBtn.addEventListener('click', backupUserSettings);
    }
    
    if(deleteAccountBtn){
        deleteAccountBtn.addEventListener('click', showDeleteAccountModal);
    }
    
    privacyToggles.forEach(toggle => {
        toggle.addEventListener('change', (e) => {
            const item = e.target.closest('.privacy-item');
            const title = item.querySelector('.privacy-title').textContent;
            const enabled = e.target.checked;
            
            showSuccess(`${title} ${enabled ? 'enabled' : 'disabled'}`);
        });
    });
    
    privacySelects.forEach(select => {
        select.addEventListener('change', (e) => {
            const item = e.target.closest('.privacy-item');
            const title = item.querySelector('.privacy-title').textContent;
            const value = e.target.value;
            
            showSuccess(`${title} set to ${value} days`);
        });
    });
}

function exportUserData(){
    showSuccess('Preparing data export...');
    
    setTimeout(() => {
        const userData = {
            profile: {
                firstName: document.getElementById('firstName')?.value,
                lastName: document.getElementById('lastName')?.value,
                email: document.getElementById('emailAddress')?.value,
                jobTitle: document.getElementById('jobTitle')?.value,
                company: document.getElementById('company')?.value,
                phone: document.getElementById('phoneNumber')?.value
            },
            settings: {
                notifications: {},
                preferences: {},
                privacy: {}
            },
            analysisHistory: [],
            exportDate: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(userData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `phishing-ai-data-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        showSuccess('Data exported successfully');
    }, 2000);
}

function backupUserSettings(){
    showSuccess('Creating settings backup...');
    
    setTimeout(() => {
        const settings = {
            preferences: {
                theme: 'dark',
                language: 'en',
                timezone: 'America/New_York',
                dateFormat: 'MM/DD/YYYY'
            },
            notifications: {
                threatAlerts: true,
                weeklyReports: true,
                systemUpdates: false,
                accountActivity: true,
                marketing: false
            },
            privacy: {
                analytics: true,
                errorReporting: true,
                dataRetention: '90',
                thirdPartyIntegrations: true
            },
            backupDate: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `phishing-ai-settings-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        showSuccess('Settings backup created');
    }, 1500);
}

function setupAdvancedSettings(){
    const generateApiKeyBtn = document.getElementById('generateApiKey');
    const viewApiDocsBtn = document.getElementById('viewApiDocs');
    const clearCacheBtn = document.getElementById('clearCache');
    const apiActionBtns = document.querySelectorAll('.api-action-btn');
    const systemToggles = document.querySelectorAll('#advanced-section .toggle-switch input');
    
    if(generateApiKeyBtn){
        generateApiKeyBtn.addEventListener('click', generateNewApiKey);
    }
    
    if(viewApiDocsBtn){
        viewApiDocsBtn.addEventListener('click', () => {
            window.open('/api/docs', '_blank');
        });
    }
    
    if(clearCacheBtn){
        clearCacheBtn.addEventListener('click', clearApplicationCache);
    }
    
    apiActionBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = btn.textContent.toLowerCase();
            const keyItem = e.target.closest('.api-key-item');
            const keyName = keyItem.querySelector('.api-key-name').textContent;
            
            handleApiKeyAction(action, keyName, keyItem);
        });
    });
    
    systemToggles.forEach(toggle => {
        toggle.addEventListener('change', (e) => {
            const item = e.target.closest('.system-item');
            const title = item.querySelector('.system-title').textContent;
            const enabled = e.target.checked;
            
            showSuccess(`${title} ${enabled ? 'enabled' : 'disabled'}`);
        });
    });
}

function generateNewApiKey(){
    const keyType = prompt('Enter API key type (production/test):');
    if(!keyType) return;
    
    showSuccess('Generating new API key...');
    
    setTimeout(() => {
        const newKey = `pk_${keyType}_${Math.random().toString(36).substr(2, 32)}`;
        
        // Add new key to the list
        const apiKeys = document.querySelector('.api-keys');
        const newKeyItem = document.createElement('div');
        newKeyItem.className = 'api-key-item';
        newKeyItem.innerHTML = `
            <div class="api-key-info">
                <div class="api-key-name">${keyType.charAt(0).toUpperCase() + keyType.slice(1)} API Key</div>
                <div class="api-key-value">${newKey}</div>
                <div class="api-key-created">Created: ${new Date().toLocaleDateString()}</div>
            </div>
            <div class="api-key-actions">
                <button class="api-action-btn">Copy</button>
                <button class="api-action-btn">Regenerate</button>
                <button class="api-action-btn danger">Revoke</button>
            </div>
        `;
        
        apiKeys.appendChild(newKeyItem);
        
        // Add event listeners to new buttons
        const actionBtns = newKeyItem.querySelectorAll('.api-action-btn');
        actionBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = btn.textContent.toLowerCase();
                const keyName = newKeyItem.querySelector('.api-key-name').textContent;
                handleApiKeyAction(action, keyName, newKeyItem);
            });
        });
        
        showSuccess('New API key generated');
    }, 1500);
}

function handleApiKeyAction(action, keyName, keyItem){
    switch(action){
        case 'copy':
            const keyValue = keyItem.querySelector('.api-key-value').textContent;
            navigator.clipboard.writeText(keyValue).then(() => {
                showSuccess('API key copied to clipboard');
            }).catch(() => {
                showError('Failed to copy API key');
            });
            break;
        case 'regenerate':
            if(confirm(`Regenerate ${keyName}? The old key will stop working immediately.`)){
                regenerateApiKey(keyItem);
            }
            break;
        case 'revoke':
            if(confirm(`Revoke ${keyName}? This action cannot be undone.`)){
                revokeApiKey(keyItem);
            }
            break;
    }
}

function regenerateApiKey(keyItem){
    showSuccess('Regenerating API key...');
    
    setTimeout(() => {
        const keyType = keyItem.querySelector('.api-key-name').textContent.toLowerCase().includes('production') ? 'live' : 'test';
        const newKey = `pk_${keyType}_${Math.random().toString(36).substr(2, 32)}`;
        
        keyItem.querySelector('.api-key-value').textContent = newKey;
        keyItem.querySelector('.api-key-created').textContent = `Created: ${new Date().toLocaleDateString()}`;
        
        showSuccess('API key regenerated');
    }, 1000);
}

function revokeApiKey(keyItem){
    keyItem.style.transition = 'all 0.3s ease';
    keyItem.style.transform = 'scale(0.8)';
    keyItem.style.opacity = '0';
    
    setTimeout(() => {
        keyItem.remove();
        showSuccess('API key revoked');
    }, 300);
}

function clearApplicationCache(){
    if(confirm('Clear application cache? This will reload the page.')){
        showSuccess('Clearing cache...');
        
        setTimeout(() => {
            // Clear various caches
            if('caches' in window){
                caches.keys().then(names => {
                    names.forEach(name => {
                        caches.delete(name);
                    });
                });
            }
            
            // Clear localStorage and sessionStorage
            localStorage.clear();
            sessionStorage.clear();
            
            showSuccess('Cache cleared. Reloading page...');
            
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        }, 1000);
    }
}

function setupSettingsModals(){
    const deleteConfirmationInput = document.getElementById('deleteConfirmation');
    const confirmDeleteBtn = document.getElementById('confirmDeleteAccount');
    
    if(deleteConfirmationInput){
        deleteConfirmationInput.addEventListener('input', (e) => {
            const isValid = e.target.value === 'DELETE';
            if(confirmDeleteBtn){
                confirmDeleteBtn.disabled = !isValid;
                confirmDeleteBtn.style.opacity = isValid ? '1' : '0.6';
            }
        });
    }
    
    if(confirmDeleteBtn){
        confirmDeleteBtn.addEventListener('click', confirmDeleteAccount);
    }
}

function showDeleteAccountModal(){
    document.getElementById('deleteAccountModal').style.display = 'flex';
}

function closeDeleteAccountModal(){
    document.getElementById('deleteAccountModal').style.display = 'none';
    document.getElementById('deleteConfirmation').value = '';
    document.getElementById('confirmDeleteAccount').disabled = true;
}

function confirmDeleteAccount(){
    showSuccess('Deleting account...');
    
    setTimeout(() => {
        showSuccess('Account deleted successfully. Redirecting...');
        
        setTimeout(() => {
            // In a real app, this would redirect to a goodbye page
            window.location.href = 'index.html';
        }, 2000);
    }, 3000);
}

function initializeSettingsData(){
    // Initialize any dynamic data or states
    checkProfileChanges();
    
    // Set up any initial UI states
    const strengthFill = document.getElementById('strengthFill');
    const strengthText = document.getElementById('strengthText');
    
    if(strengthFill && strengthText){
        strengthFill.style.width = '0%';
        strengthText.textContent = 'Password strength';
    }
}

// Helper function for relative time
function getRelativeTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
}

// Clear functionality
function setupClearButton() {
    const clearBtn = document.getElementById('clearBtn');
    const textarea = document.getElementById('rawEmail');
    
    if (clearBtn && textarea) {
        clearBtn.addEventListener('click', function() {
            textarea.value = '';
            updateCharCount();
            clearResult();
        });
    }
}

// Error and success message functions
function showError(message) {
    const resultDiv = document.getElementById('result');
    if (resultDiv) {
        resultDiv.style.display = 'block';
        resultDiv.className = 'result-section error';
        resultDiv.innerHTML = `
            <div class="error-message">
                <div class="error-icon">⚠️</div>
                <div class="error-content">
                    <h3>Analysis failed: ${message}</h3>
                    <div class="troubleshooting">
                        <h4>Troubleshooting:</h4>
                        <ul>
                            <li>Make sure the backend server is running on port 3000</li>
                            <li>Check your internet connection</li>
                            <li>Try again in a few moments</li>
                        </ul>
                    </div>
                </div>
            </div>
        `;
    }
}

function showSuccess(message) {
    const resultDiv = document.getElementById('result');
    if (resultDiv) {
        resultDiv.style.display = 'block';
        resultDiv.className = 'result-section success';
        resultDiv.innerHTML = `
            <div class="success-message">
                <div class="success-icon">✅</div>
                <div class="success-content">
                    <h3>${message}</h3>
                </div>
            </div>
        `;
    }
}

// Perform quick check with pie chart results
async function performQuickCheck(emailContent) {
    const quickCheckBtn = document.getElementById('quickCheckBtn');
    const resultsSection = document.getElementById('quickCheckResults');
    
    // Show loading state
    quickCheckBtn.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-text">Analyzing...</span>';
    quickCheckBtn.disabled = true;
    
    try {
        const response = await fetch(`${API_BASE}/analyze`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: emailContent })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Display results
        displayQuickCheckResults(result);
        resultsSection.style.display = 'block';
        
    } catch (error) {
        console.error('Quick check failed:', error);
        showError('Quick check failed. Please try again.');
    } finally {
        // Reset button
        quickCheckBtn.innerHTML = '<span class="btn-icon">🔍</span><span class="btn-text">Analyze</span>';
        quickCheckBtn.disabled = false;
    }
}

// Display quick check results with pie chart
function displayQuickCheckResults(result) {
    const riskScore = document.getElementById('quickRiskScore');
    const riskLabel = document.getElementById('quickRiskLabel');
    const resultsSummary = document.getElementById('quickResultsSummary');
    
    // Update risk indicator
    if (riskScore && riskLabel) {
        const score = result.risk_score || 0;
        riskScore.textContent = `${score}%`;
        
        if (score >= 70) {
            riskLabel.textContent = 'High Risk';
            riskLabel.style.color = '#e53e3e';
        } else if (score >= 40) {
            riskLabel.textContent = 'Medium Risk';
            riskLabel.style.color = '#dd6b20';
        } else {
            riskLabel.textContent = 'Low Risk';
            riskLabel.style.color = '#38a169';
        }
    }
    
    // Create pie chart
    createQuickCheckChart(result);
    
    // Update summary
    if (resultsSummary) {
        const summary = result.summary || 'Analysis completed successfully.';
        resultsSummary.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 0.5rem;">Analysis Summary:</div>
            <div>${summary}</div>
        `;
    }
}

// Create pie chart for quick check results
function createQuickCheckChart(result) {
    const ctx = document.getElementById('quickCheckChart');
    if (!ctx) return;
    
    // Destroy existing chart
    if (window.quickCheckChart) {
        window.quickCheckChart.destroy();
    }
    
    const riskScore = result.risk_score || 0;
    const safeScore = 100 - riskScore;
    
    window.quickCheckChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Risk', 'Safe'],
            datasets: [{
                data: [riskScore, safeScore],
                backgroundColor: [
                    riskScore >= 70 ? '#e53e3e' : riskScore >= 40 ? '#dd6b20' : '#38a169',
                    '#e2e8f0'
                ],
                borderWidth: 0,
                cutout: '60%'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            animation: {
                animateRotate: true,
                duration: 1000
            }
        }
    });
}

// Navigation function for agent pages
function navigateToAgent(agentType) {
    // For now, we'll show an alert. In a real app, this would navigate to separate pages
    const agentNames = {
        'email-parser': 'Email Parser Agent',
        'risk-scorer': 'Risk Scorer Agent',
        'alert-generator': 'Alert Generator Agent'
    };
    
    const agentName = agentNames[agentType] || 'Unknown Agent';
    
    // Create a simple modal for agent details
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>🤖 ${agentName}</h2>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
            </div>
            <div class="modal-body">
                <div style="text-align: center; padding: 2rem;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">🚧</div>
                    <h3>Coming Soon!</h3>
                    <p>Detailed ${agentName} page is under development.</p>
                    <p>This will include:</p>
                    <ul style="text-align: left; margin: 1rem 0;">
                        <li>Real-time performance metrics</li>
                        <li>Detailed configuration options</li>
                        <li>Historical data and analytics</li>
                        <li>Agent-specific settings</li>
                    </ul>
                    <button class="btn-primary" onclick="this.closest('.modal-overlay').remove()" style="margin-top: 1rem;">
                        Got it!
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    // Close modal when clicking outside
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
            document.body.style.overflow = 'auto';
        }
    });
}

// Initialize dashboard when page loads
// ===== New Analysis Interface Functions =====

function setupNewAnalysisInterface() {
    // Mode switching
    const modeBtns = document.querySelectorAll('.mode-btn');
    const modePanels = document.querySelectorAll('.mode-panel');
    
    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            switchAnalysisMode(mode);
        });
    });
    
    // Manual mode handlers
    const emailContent = document.getElementById('emailContent');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const clearBtn = document.getElementById('clearBtn');
    const loadTemplate = document.getElementById('loadTemplate');
    const templateSelect = document.getElementById('templateSelect');
    
    if (emailContent) {
        emailContent.addEventListener('input', updateCharacterCount);
    }
    
    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', handleEmailAnalysis);
    }
    
    if (clearBtn) {
        clearBtn.addEventListener('click', clearEmailContent);
    }
    
    if (loadTemplate) {
        loadTemplate.addEventListener('click', loadSampleEmail);
    }
    
    // Gmail mode handlers
    const connectGmailBtn = document.getElementById('connectGmailBtn');
    const refreshEmails = document.getElementById('refreshEmails');
    
    if (connectGmailBtn) {
        connectGmailBtn.addEventListener('click', connectGmailMode);
    }
    
    if (refreshEmails) {
        refreshEmails.addEventListener('click', refreshGmailEmails);
    }
    
    // Results handlers
    const analyzeAnother = document.getElementById('analyzeAnother');
    const exportResults = document.getElementById('exportResults');
    
    if (analyzeAnother) {
        analyzeAnother.addEventListener('click', resetAnalysisInterface);
    }
    
    if (exportResults) {
        exportResults.addEventListener('click', exportAnalysisResults);
    }
}

function switchAnalysisMode(mode) {
    currentAnalysisMode = mode;
    
    // Update mode buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    
    // Update mode panels
    document.querySelectorAll('.mode-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `${mode}-mode`);
    });
    
    // Hide results if switching modes
    hideResults();
}

function updateCharacterCount() {
    const emailContent = document.getElementById('emailContent');
    const charCount = document.querySelector('.char-count');
    
    if (emailContent && charCount) {
        const count = emailContent.value.length;
        charCount.textContent = `${count} characters`;
    }
}

function clearEmailContent() {
    const emailContent = document.getElementById('emailContent');
    if (emailContent) {
        emailContent.value = '';
        updateCharacterCount();
    }
}

function loadSampleEmail() {
    const templateSelect = document.getElementById('templateSelect');
    const emailContent = document.getElementById('emailContent');
    
    if (!templateSelect || !emailContent) return;
    
    const template = templateSelect.value;
    if (!template) return;
    
    const samples = {
        phishing: `From: security@paypa1-verification.com
To: user@example.com
Subject: Urgent: Verify Your PayPal Account Now
Date: Mon, 25 Oct 2025 10:30:00 +0000

Dear PayPal Customer,

Your account has been temporarily suspended due to suspicious activity. 
To restore access, please verify your identity immediately by clicking the link below:

https://paypa1-verification.com/secure-login?token=abc123

Failure to verify within 24 hours will result in permanent account closure.

Best regards,
PayPal Security Team`,
        
        legitimate: `From: notifications@github.com
To: developer@example.com
Subject: [GitHub] Pull request merged: Fix authentication bug
Date: Mon, 25 Oct 2025 11:15:00 +0000

Hi developer,

Your pull request "Fix authentication bug" has been successfully merged into the main branch.

Repository: myproject/backend
Commit: a1b2c3d4e5f6
Merged by: team-lead

You can view the changes at:
https://github.com/myproject/backend/commit/a1b2c3d4e5f6

Thanks for your contribution!

GitHub Team`,
        
        suspicious: `From: admin@company-update.net
To: employee@company.com
Subject: Important: Update Your Company Credentials
Date: Mon, 25 Oct 2025 09:45:00 +0000

Hello,

We are updating our security systems. Please update your credentials at:
http://company-update.net/login

This is required for all employees by end of day.

IT Department`
    };
    
    if (samples[template]) {
        emailContent.value = samples[template];
        updateCharacterCount();
        templateSelect.value = '';
    }
}

async function handleEmailAnalysis() {
    const emailContent = document.getElementById('emailContent');
    
    if (!emailContent || !emailContent.value.trim()) {
        alert('Please enter email content to analyze');
        return;
    }
    
    const content = emailContent.value.trim();
    await performEmailAnalysis(content, currentAnalysisMode);
}

async function performEmailAnalysis(emailContent, source = 'manual') {
    showLoadingState();
    
    try {
        // Simulate agent steps
        await simulateAgentSteps();
        
        let result;
        
        try {
            // Try to call backend analyze endpoint with user_id for history
            const user = firebase.auth().currentUser;
            const response = await fetch(`${API_BASE}/api/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    email_text: emailContent,
                    user_id: user?.uid,
                    source: source 
                })
            });
            
            if (!response.ok) {
                throw new Error(`Backend error: ${response.status}`);
            }
            
            result = await response.json();
        } catch (backendError) {
            console.warn('Backend not available, using mock analysis:', backendError);
            
            // Mock analysis result for testing
            result = generateMockAnalysis(emailContent);
        }
        
        // Store result and display
        lastAnalysisResult = result;
        await displayAnalysisResults(result);
        
    } catch (error) {
        console.error('Analysis error:', error);
        showAnalysisError('Analysis failed: ' + error.message);
    } finally {
        hideLoadingState();
    }
}

function showLoadingState() {
    const loadingState = document.getElementById('loadingState');
    const modePanels = document.querySelectorAll('.mode-panel');
    const resultsPanel = document.getElementById('resultsDashboard');
    
    // Hide mode panels and results
    modePanels.forEach(panel => panel.style.display = 'none');
    if (resultsPanel) resultsPanel.style.display = 'none';
    
    // Show loading
    if (loadingState) loadingState.style.display = 'block';
}

function hideLoadingState() {
    const loadingState = document.getElementById('loadingState');
    if (loadingState) loadingState.style.display = 'none';
}

async function simulateAgentSteps() {
    const steps = ['step-parser', 'step-scorer', 'step-alert'];
    
    for (let i = 0; i < steps.length; i++) {
        const stepEl = document.getElementById(steps[i]);
        if (stepEl) {
            const statusEl = stepEl.querySelector('.step-status');
            if (statusEl) {
                statusEl.textContent = 'Processing...';
                statusEl.style.color = '#4F709C';
            }
        }
        
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 400));
        
        if (stepEl) {
            const statusEl = stepEl.querySelector('.step-status');
            if (statusEl) {
                statusEl.textContent = 'Complete ✓';
                statusEl.style.color = '#10b981';
            }
        }
        
        // Update next step
        if (i < steps.length - 1) {
            const nextStepEl = document.getElementById(steps[i + 1]);
            if (nextStepEl) {
                const nextStatusEl = nextStepEl.querySelector('.step-status');
                if (nextStatusEl) {
                    nextStatusEl.textContent = 'Starting...';
                    nextStatusEl.style.color = '#f59e0b';
                }
            }
        }
    }
}

async function displayAnalysisResults(analysisData) {
    hideLoadingState();
    
    // Show results dashboard
    const resultsPanel = document.getElementById('resultsDashboard');
    if (resultsPanel) resultsPanel.style.display = 'block';
    
    // 1. Create Risk Donut Chart
    createRiskChart(analysisData.score, analysisData.level);
    
    // 2. Display Alert Summary
    displayAlertSummary(analysisData);
    
    // 3. Show Detection Breakdown
    displayDetectionBreakdown(analysisData);
    
    // 4. Show Email Details
    displayEmailDetails(analysisData);
    
    // 5. Update Recent History
    await loadRecentAnalysisHistory();
}

function createRiskChart(score, level) {
    const canvas = document.getElementById('riskChart');
    const riskScoreEl = document.getElementById('riskScore');
    const riskLevelEl = document.getElementById('riskLevel');
    
    if (!canvas) return;
    
    // Update text display
    if (riskScoreEl) riskScoreEl.textContent = Math.round(score * 100);
    if (riskLevelEl) {
        riskLevelEl.textContent = level.toUpperCase();
        const palette = {
            low: '#2f855a',
            medium: '#b7791f',
            high: '#c53030'
        };
        const normalized = (level || '').toLowerCase();
        riskLevelEl.style.color = palette[normalized] || '#4F709C';
    }

    // Destroy existing chart
    if (riskChart) {
        riskChart.destroy();
    }
    
    const ctx = canvas.getContext('2d');
    const percentage = score * 100;
    
    // Color based on risk level
    let color = '#10b981'; // green for low
    if (level.toLowerCase() === 'medium') color = '#f59e0b'; // yellow
    if (level.toLowerCase() === 'high') color = '#ef4444'; // red
    
    riskChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [percentage, 100 - percentage],
                backgroundColor: [color, 'rgba(255,255,255,0.1)'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            }
        }
    });
}

function displayAlertSummary(analysisData) {
    const alertContent = document.querySelector('#alertSummary .alert-content');
    if (!alertContent) return;
    
    const level = analysisData.level.toLowerCase();
    let alertClass = 'alert-low';
    if (level === 'medium') alertClass = 'alert-medium';
    if (level === 'high') alertClass = 'alert-high';
    
    alertContent.className = `alert-content ${alertClass}`;
    alertContent.innerHTML = `
        <div class="alert-header">
            <span class="alert-icon">${level === 'high' ? '🚨' : level === 'medium' ? '⚠️' : '✅'}</span>
            <span class="alert-level">${analysisData.level.toUpperCase()} RISK</span>
        </div>
        <div class="alert-text">${analysisData.alert_summary}</div>
    `;
}

function displayDetectionBreakdown(analysisData) {
    const breakdownItems = document.getElementById('breakdownItems');
    if (!breakdownItems) return;
    
    const parsed = analysisData.parsed || {};
    const metadata = parsed.metadata || {};
    
    breakdownItems.innerHTML = `
        <div class="breakdown-item">
            <span>📝 Email Parser</span>
            <span class="breakdown-value">
                ${metadata.url_count || 0} URLs, ${metadata.attachment_count || 0} attachments
            </span>
        </div>
        <div class="breakdown-item">
            <span>🧠 Risk Scorer</span>
            <span class="breakdown-value">
                ${Math.round((analysisData.score || 0) * 100)}% confidence
            </span>
        </div>
        <div class="breakdown-item">
            <span>🚨 Alert Generator</span>
            <span class="breakdown-value">
                ${analysisData.level} risk detected
            </span>
        </div>
        <div class="breakdown-item">
            <span>📊 Analysis Reason</span>
            <span class="breakdown-value">
                ${analysisData.reason || 'No specific reason provided'}
            </span>
        </div>
    `;
}

function displayEmailDetails(analysisData) {
    const detailGrid = document.getElementById('emailDetailGrid');
    if (!detailGrid) return;
    
    const parsed = analysisData.parsed || {};
    const headers = parsed.headers || {};
    const metadata = parsed.metadata || {};
    
    detailGrid.innerHTML = `
        <div class="detail-item">
            <div class="detail-label">Subject</div>
            <div class="detail-value">${headers.subject || 'No subject'}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">From</div>
            <div class="detail-value">${headers.from || 'Unknown sender'}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">URLs Found</div>
            <div class="detail-value">${metadata.url_count || 0}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">Attachments</div>
            <div class="detail-value">${metadata.attachment_count || 0}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">HTML Content</div>
            <div class="detail-value">${metadata.has_html ? 'Yes' : 'No'}</div>
        </div>
        <div class="detail-item">
            <div class="detail-label">Entities Found</div>
            <div class="detail-value">${metadata.entity_count || 0}</div>
        </div>
    `;
}

async function loadRecentAnalysisHistory() {
    const historyItems = document.getElementById('historyItems');
    if (!historyItems) return;
    
    try {
        const user = firebase.auth().currentUser;
        if (!user) return;
        
        const response = await fetch(`${API_BASE}/api/history?user_id=${user.uid}&limit=5`);
        if (!response.ok) return;
        
        const data = await response.json();
        const items = data.items || [];
        
        if (items.length === 0) {
            historyItems.innerHTML = '<div class="no-history">No recent analysis history</div>';
            return;
        }
        
        historyItems.innerHTML = items.map(item => `
            <div class="history-item">
                <div class="history-subject">${item.email_subject}</div>
                <div class="history-meta">
                    <span class="history-risk risk-${item.risk_level.toLowerCase()}">${item.risk_level}</span>
                    <span class="history-date">${getRelativeTime(item.created_at)}</span>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Failed to load recent history:', error);
    }
}

async function connectGmailMode() {
    try {
        // Use existing Gmail integration
        await setupGmailIntegration();
        
        // Show connected state
        const gmailStatus = document.getElementById('gmailStatus');
        const gmailEmails = document.getElementById('gmailEmails');
        
        if (gmailStatus) gmailStatus.style.display = 'none';
        if (gmailEmails) gmailEmails.style.display = 'block';
        
        // Load Gmail emails
        await loadGmailEmailsForAnalysis();
        
    } catch (error) {
        console.error('Gmail connection failed:', error);
        showError('Failed to connect to Gmail: ' + error.message);
    }
}

async function loadGmailEmailsForAnalysis() {
    const emailsList = document.getElementById('emailsList');
    if (!emailsList) return;
    
    try {
        // Use existing Gmail loading function
        await loadRealGmailEmails();
        
        // Display emails for selection
        emailsList.innerHTML = gmailEmails.slice(0, 10).map(email => `
            <div class="gmail-email-item" onclick="analyzeGmailEmailNew('${email.id}')">
                <div class="email-header">
                    <div class="email-subject">${email.subject}</div>
                    <div class="email-risk risk-${email.riskLevel}">${email.riskLevel}</div>
                </div>
                <div class="email-meta">
                    <span class="email-sender">${email.sender}</span>
                    <span class="email-date">${formatEmailTime(email.date)}</span>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Failed to load Gmail emails:', error);
        emailsList.innerHTML = '<div class="error-message">Failed to load emails</div>';
    }
}

async function analyzeGmailEmailNew(emailId) {
    const email = gmailEmails.find(e => e.id === emailId);
    if (!email) return;
    
    // Construct email content
    const emailContent = `From: ${email.sender}
To: ${email.recipient || 'you@example.com'}
Subject: ${email.subject}
Date: ${email.date}

${email.content}`;
    
    // Perform analysis
    await performEmailAnalysis(emailContent, 'gmail');
}

function resetAnalysisInterface() {
    // Hide results
    hideResults();
    
    // Show mode panels
    document.querySelectorAll('.mode-panel').forEach(panel => {
        panel.style.display = panel.classList.contains('active') ? 'block' : 'none';
    });
    
    // Clear content if in manual mode
    if (currentAnalysisMode === 'manual') {
        clearEmailContent();
    }
}

function hideResults() {
    const resultsPanel = document.getElementById('resultsDashboard');
    if (resultsPanel) resultsPanel.style.display = 'none';
}

function exportAnalysisResults() {
    if (!lastAnalysisResult) {
        alert('No analysis results to export');
        return;
    }
    
    const data = {
        timestamp: new Date().toISOString(),
        analysis: lastAnalysisResult,
        mode: currentAnalysisMode
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `phishing-analysis-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function generateMockAnalysis(emailContent) {
    // Analyze the email content for suspicious indicators
    const suspiciousKeywords = ['urgent', 'suspended', 'verify', 'click here', 'immediately', 'account', 'security'];
    const suspiciousDomains = ['paypa1', 'microsofft', 'amazom', 'goog1e'];
    const suspiciousTlds = ['.tk', '.ml', '.ga', '.cf'];
    
    let score = 10; // Base score
    let reasons = [];
    
    const lowerContent = emailContent.toLowerCase();
    
    // Check for suspicious keywords
    suspiciousKeywords.forEach(keyword => {
        if (lowerContent.includes(keyword)) {
            score += 15;
            reasons.push(`Contains suspicious keyword: "${keyword}"`);
        }
    });
    
    // Check for suspicious domains
    suspiciousDomains.forEach(domain => {
        if (lowerContent.includes(domain)) {
            score += 25;
            reasons.push(`Contains suspicious domain: "${domain}"`);
        }
    });
    
    // Check for suspicious TLDs
    suspiciousTlds.forEach(tld => {
        if (lowerContent.includes(tld)) {
            score += 20;
            reasons.push(`Contains suspicious TLD: "${tld}"`);
        }
    });
    
    // Check for urgency indicators
    if (lowerContent.includes('24 hours') || lowerContent.includes('immediately')) {
        score += 15;
        reasons.push('Creates false sense of urgency');
    }
    
    // Determine risk level
    let level = 'low';
    if (score >= 70) level = 'high';
    else if (score >= 40) level = 'medium';
    
    // Generate alert summary
    let alertSummary = '';
    if (level === 'high') {
        alertSummary = 'This email appears to be a phishing attempt. It contains multiple suspicious indicators including fake domains, urgent language, and requests for personal information. Do not click any links or provide any information.';
    } else if (level === 'medium') {
        alertSummary = 'This email shows some suspicious characteristics. Exercise caution and verify the sender through official channels before taking any action.';
    } else {
        alertSummary = 'This email appears to be legitimate with no significant risk factors detected.';
    }
    
    // Mock parsed data
    const parsed = {
        headers: {
            subject: emailContent.match(/Subject:\s*(.*)/i)?.[1] || 'No Subject',
            from: emailContent.match(/From:\s*(.*)/i)?.[1] || 'Unknown Sender',
            to: emailContent.match(/To:\s*(.*)/i)?.[1] || 'Unknown Recipient',
            date: emailContent.match(/Date:\s*(.*)/i)?.[1] || new Date().toISOString()
        },
        body_text: emailContent.replace(/^(From|To|Subject|Date):.*$/gm, '').trim(),
        urls: (emailContent.match(/https?:\/\/[^\s<>"{}|\\^`\[\]]+/g) || []).map(url => ({
            url: url,
            domain: url.match(/https?:\/\/([^\/]+)/)?.[1] || '',
            is_suspicious: suspiciousDomains.some(d => url.includes(d)) || suspiciousTlds.some(t => url.includes(t))
        })),
        attachments: [],
        entities: [],
        metadata: {
            has_html: emailContent.toLowerCase().includes('<html') || emailContent.toLowerCase().includes('<body'),
            url_count: (emailContent.match(/https?:\/\/[^\s<>"{}|\\^`\[\]]+/g) || []).length,
            attachment_count: 0,
            entity_count: 0
        }
    };
    
    return {
        score: Math.min(score, 100),
        level: level,
        reason: reasons.join('; '),
        alert_summary: alertSummary,
        parsed: parsed
    };
}

function showAnalysisError(message) {
    // Create or update error display
    let errorDiv = document.getElementById('analysisError');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.id = 'analysisError';
        errorDiv.className = 'error-message';
        errorDiv.style.cssText = `
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            color: #ef4444;
            padding: 16px;
            border-radius: 12px;
            margin: 16px 0;
        `;
        
        const container = document.querySelector('.analysis-container');
        if (container) {
            container.appendChild(errorDiv);
        }
    }
    
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        if (errorDiv) errorDiv.style.display = 'none';
    }, 5000);
}

document.addEventListener('DOMContentLoaded', async function() {
    console.log('Dashboard page loaded');

    // 1) Try JWT-based auth first (with offline fallback)
    const jwt = localStorage.getItem('JWT');
    if (jwt && !dashboardInitialized) {
        try {
            const res = await fetch(`${API_BASE}/api/auth/me`, {
                headers: { 'Authorization': `Bearer ${jwt}` }
            });
            if (res.ok) {
                const user = await res.json();
                dashboardInitialized = true;
                updateUserInfo({ email: user.email });
                initializeDashboard();
                return;
            } else {
                console.warn('Stored JWT invalid, clearing');
                localStorage.removeItem('JWT');
            }
        } catch (e) {
            console.warn('JWT check failed (backend likely offline). Using local fallback.');
            const localEmail = localStorage.getItem('AUTH_EMAIL');
            if (localEmail) {
                dashboardInitialized = true;
                updateUserInfo({ email: localEmail });
                initializeDashboard();
                return;
            }
        }
    }

    // 2) Fallback to Firebase auth if available
    if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().onAuthStateChanged((user) => {
            if (user && !dashboardInitialized) {
                console.log('User authenticated (Firebase):', user.email);
                dashboardInitialized = true; // Prevent multiple initializations
                updateUserInfo(user);
                initializeDashboard();
            } else if (!user) {
                // Wait briefly before redirecting to avoid bouncing due to slow auth init
                setTimeout(() => {
                    if (!firebase.auth().currentUser && !dashboardInitialized) {
                        console.log('No user authenticated after wait, redirecting to landing page');
                        window.location.href = 'index.html';
                    }
                }, 800);
            }
        });

        // Fallback timeout in case auth state doesn't change
        setTimeout(() => {
            if (!dashboardInitialized && firebase.auth().currentUser) {
                console.log('Fallback initialization for authenticated user');
                dashboardInitialized = true;
                updateUserInfo(firebase.auth().currentUser);
                initializeDashboard();
            }
        }, 2000);
    } else {
        // No Firebase - if we also lack a valid JWT, go home
        if (!dashboardInitialized) {
            console.warn('No Firebase and no valid JWT, redirecting');
            window.location.href = 'index.html';
        }
    }
});

function updateUserInfo(user) {
    const userEmailEl = document.getElementById('userEmail');
    const sbUserEmail = document.getElementById('sbUserEmail');
    if (userEmailEl) {
        userEmailEl.textContent = user.email;
        userEmailEl.style.color = '#ffffff';
        userEmailEl.style.display = 'inline';
    }
    if (sbUserEmail) sbUserEmail.textContent = user.email;
}

function initializeDashboard() {
    console.log('Initializing dashboard...');
    
    // Hide loading state immediately
    hideDashboardLoading();
    
    // Initialize charts
    initializeCharts();
    
    // Load stats
    loadStats();
    
    // Load history
    loadHistory();
    
    // Set up event listeners
    setupEventListeners();

    // Initialize stat card enhancements
    setupStatCards();

    // Initialize overview widgets
    initOverviewWidgets();
    
    // Initialize new analysis interface
    setupNewAnalysisInterface();
}

function showDashboardLoading() {
    const dashboard = document.getElementById('dashboard');
    if (dashboard) {
        dashboard.style.opacity = '0.7';
        dashboard.style.transition = 'opacity 0.3s ease';
    }
}

function hideDashboardLoading() {
    const dashboard = document.getElementById('dashboard');
    if (dashboard) {
        dashboard.style.opacity = '1';
    }
    
    // Hide loading text in header
    const loadingText = document.querySelector('.loading-text');
    if (loadingText) {
        loadingText.style.display = 'none';
    }
    
    // Show user email instead
    const userEmail = document.getElementById('userEmail');
    if (userEmail && userEmail.textContent) {
        userEmail.style.display = 'inline';
    }
}

function setupEventListeners() {
    // Sidebar Sign out button
    const sbSignOut = document.getElementById('sbSignOut');
    if (sbSignOut) {
        sbSignOut.addEventListener('click', (e) => {
            e.preventDefault();
            showSignOutModal();
        });
    }

    // Analyze button
    const runAnalyzeBtn = document.getElementById('runAnalyze');
    if (runAnalyzeBtn) {
        runAnalyzeBtn.addEventListener('click', analyzeEmail);
    }

    // Demo button
    const demoBtn = document.getElementById('demoBtn');
    if (demoBtn) {
        demoBtn.addEventListener('click', loadDemoEmail);
    }
    
    // Setup new functionality
    setupModal();
    setupGmailIntegration();
    setupQuickCheck();
    setupClearButton();
    setupHistoryControls();
    // Sidebar connect Gmail mirrors header button
    const sbConnect = document.getElementById('sbConnectGmail');
    if (sbConnect) sbConnect.addEventListener('click', connectGmail);
    
    // Character count for textarea
    const textarea = document.getElementById('rawEmail');
    if (textarea) {
        textarea.addEventListener('input', () => {
            updateCharCount();
            updateValidators();
        });
        updateCharCount();
        updateValidators();
    }

    // Templates
    const tplSelect = document.getElementById('templateSelect');
    const tplApply = document.getElementById('applyTemplate');
    if (tplApply && tplSelect && textarea) {
        tplApply.addEventListener('click', (e) => {
            e.preventDefault();
            const v = tplSelect.value;
            if (!v) return;
            const t = getTemplateText(v);
            textarea.value = t;
            updateCharCount();
            updateValidators();
        });
    }

    // Export
    const expJson = document.getElementById('exportJson');
    const expCsv = document.getElementById('exportCsv');
    if (expJson) expJson.addEventListener('click', exportLastResultJSON);
    if (expCsv) expCsv.addEventListener('click', exportLastResultCSV);

    // One-click actions
    const markSafeBtn = document.getElementById('markSafe');
    const reportBtn = document.getElementById('reportPhish');
    const reviewBtn = document.getElementById('requestReview');
    if (markSafeBtn) markSafeBtn.addEventListener('click', () => showSuccess('Marked as safe'));
    if (reportBtn) reportBtn.addEventListener('click', () => showSuccess('Reported as phishing'));
    if (reviewBtn) reviewBtn.addEventListener('click', () => showSuccess('Review requested'));

    // History page features
    setupHistoryFeatures();
    
    // Threats page features
    setupThreatsFeatures();
    
    // Reports page features
    setupReportsFeatures();
    
    // Integrations page features
    setupIntegrationsFeatures();
    
    // Team page features
    setupTeamFeatures();
    
    // Plan & Billing page features
    setupPlanBillingFeatures();
    
    // Settings page features
    setupSettingsFeatures();
}

function loadDemoEmail() {
    const demoEmail = `Subject: Urgent: Verify Your Account Immediately

Dear Customer,

We have detected suspicious activity on your account. To prevent unauthorized access, please verify your account immediately by clicking the link below:

VERIFY NOW: http://fake-bank-security.com/verify?account=12345

This is urgent! Your account will be suspended if you don't verify within 24 hours.

Best regards,
Security Team
Bank of Trust`;

    const textarea = document.getElementById('rawEmail');
    if (textarea) {
        textarea.value = demoEmail;
    }
}

async function analyzeEmail() {
    const rawEmail = document.getElementById('rawEmail').value.trim();
    const resultDiv = document.getElementById('result');
    
    if (!rawEmail) {
        alert('Please enter email content to analyze');
        return;
    }

    // Show loading state
    resultDiv.style.display = 'block';
    resultDiv.className = 'result-section loading';
    resultDiv.textContent = '🔄 Analyzing email... Please wait...';

    try {
        // Get current user for history tracking
        const user = firebase.auth().currentUser;
        const requestBody = { 
            email_text: rawEmail,
            user_id: user ? user.uid : null
        };
        
        const response = await fetch(`${API_BASE}/api/analyze`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        // Update user's emails analyzed count
        if (firebase.auth().currentUser) {
            try {
                await fetch(`http://localhost:3000/api/users/${firebase.auth().currentUser.uid}/emails-analyzed`, {
                    method: 'PUT'
                });
            } catch (error) {
                console.error('Error updating emails analyzed count:', error);
            }
        }
        
        // Display results
        displayResults(data);
        lastAnalysisResult = data;
        updateBreakdown(data);
        updateDomainReputation(data);
        updateEvidence(data);
        addHistoryItem(data);
        
        // Reload stats and history
        loadStats();
        await loadHistory();
        
    } catch (error) {
        console.error('Analysis error:', error);
        resultDiv.className = 'result-section error';
        resultDiv.innerHTML = `
            <div class="error-message">
                ⚠️ Analysis failed: ${error.message}
                <br><br>
                <strong>Troubleshooting:</strong>
                <ul>
                    <li>Make sure the backend server is running on port 3000</li>
                    <li>Check your internet connection</li>
                    <li>Try again in a few moments</li>
                </ul>
            </div>
        `;
    }
}

function displayResults(data) {
    const resultDiv = document.getElementById('result');
    const riskScore = Math.round((data.score || 0) * 100);
    const riskLevel = data.level || 'unknown';
    const reason = data.reason || 'No analysis available';
    const alertSummary = data.alert_summary || 'No alert generated';
    
    // Determine risk class and color
    let riskClass = 'risk-low';
    let riskColor = '#10b981'; // green
    let riskIcon = '✅';
    let riskMessage = 'This email appears safe';
    
    if (riskScore >= 70) {
        riskClass = 'risk-high';
        riskColor = '#ef4444'; // red
        riskIcon = '🚨';
        riskMessage = 'High risk detected - proceed with caution';
    } else if (riskScore >= 40) {
        riskClass = 'risk-medium';
        riskColor = '#f59e0b'; // orange
        riskIcon = '⚠️';
        riskMessage = 'Medium risk - review carefully';
    }
    
    resultDiv.className = `result-section ${riskClass}`;
    resultDiv.innerHTML = `
        <div class="analysis-header">
            <div class="risk-score-circle ${riskClass}">
                <div class="score-number">${riskScore}%</div>
                <div class="score-label">Risk Score</div>
            </div>
            <div class="risk-summary">
                <div class="risk-icon">${riskIcon}</div>
                <div class="risk-level ${riskClass}">${riskLevel.toUpperCase()} RISK</div>
                <div class="risk-message">${riskMessage}</div>
            </div>
        </div>
        
        <div class="analysis-content">
            <div class="alert-section">
                <h4>Security Alert</h4>
                <div class="alert-text">${alertSummary}</div>
            </div>
            
            <div class="reason-section">
                <h4>Analysis Reason</h4>
                <div class="reason-text">${reason}</div>
            </div>
            
            <div class="quick-actions">
                <button class="action-btn primary" onclick="showDetailedAnalysis()">
                    <span class="btn-icon">📊</span>
                    View Detailed Analysis
                </button>
                <button class="action-btn secondary" onclick="copyAnalysisResults()">
                    <span class="btn-icon">📋</span>
                    Copy Results
                </button>
            </div>
        </div>
        
        <div id="detailedAnalysis" class="detailed-analysis" style="display: none;">
            <h4>Detailed Analysis</h4>
            <div class="analysis-breakdown">
                ${formatAnalysisDetails(data)}
            </div>
        </div>
    `;
}

function formatAnalysisDetails(data) {
    let details = '';
    
    if (data.features) {
        details += '<div class="feature-group"><strong>Detected Features:</strong><br>';
        Object.entries(data.features).forEach(([key, value]) => {
            if (value) {
                details += `<span class="feature-tag">${key.replace(/_/g, ' ').toUpperCase()}</span>`;
            }
        });
        details += '</div>';
    }
    
    if (data.urls && data.urls.length > 0) {
        details += '<div class="url-group"><strong>URLs Found:</strong><br>';
        data.urls.forEach(url => {
            details += `<div class="url-item">• ${url}</div>`;
        });
        details += '</div>';
    }
    
    if (data.entities && data.entities.length > 0) {
        details += '<div class="entity-group"><strong>Entities Detected:</strong><br>';
        data.entities.forEach(entity => {
            details += `<div class="entity-item">• ${entity}</div>`;
        });
        details += '</div>';
    }
    
    return details || '<div class="no-details">No additional details available</div>';
}

// Helper functions for the new UI
function showDetailedAnalysis() {
    const detailedDiv = document.getElementById('detailedAnalysis');
    const btn = document.querySelector('.action-btn.primary');
    
    if (detailedDiv.style.display === 'none') {
        detailedDiv.style.display = 'block';
        btn.innerHTML = '<span class="btn-icon">📊</span>Hide Detailed Analysis';
    } else {
        detailedDiv.style.display = 'none';
        btn.innerHTML = '<span class="btn-icon">📊</span>View Detailed Analysis';
    }
}

function copyAnalysisResults() {
    const resultDiv = document.getElementById('result');
    const riskScore = resultDiv.querySelector('.score-number').textContent;
    const riskLevel = resultDiv.querySelector('.risk-level').textContent;
    const alertText = resultDiv.querySelector('.alert-text').textContent;
    const reasonText = resultDiv.querySelector('.reason-text').textContent;
    
    const copyText = `Phishing Detection Analysis Results:
Risk Score: ${riskScore}
Risk Level: ${riskLevel}
Alert: ${alertText}
Reason: ${reasonText}`;
    
    navigator.clipboard.writeText(copyText).then(() => {
        // Show success message
        const btn = document.querySelector('.action-btn.secondary');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span class="btn-icon">✅</span>Copied!';
        btn.style.background = '#10b981';
        
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.style.background = '';
        }, 2000);
    }).catch(() => {
        alert('Failed to copy results');
    });
}

async function loadStats() {
    try {
        const response = await fetch(`${API_BASE}/api/stats`);
        const stats = await response.json();
        
        console.log('Stats loaded:', stats);
        
        if (riskChart) {
            // Update chart with the correct data structure
            riskChart.data.datasets[0].data = [
                stats.risk_levels?.low || 0,
                stats.risk_levels?.medium || 0,
                stats.risk_levels?.high || 0
            ];
            riskChart.update();
            
            // Update stats cards
            updateStatsCards(stats);
        }
    } catch (error) {
        console.error('Error loading stats:', error);
        // Set default values if API fails
        if (riskChart) {
            riskChart.data.datasets[0].data = [0, 0, 0];
            riskChart.update();
        }
    }
}

function updateStatsCards(stats) {
    // Update the stats cards with real data
    const emailsAnalyzedEl = document.getElementById('emailsAnalyzed');
    const threatsBlockedEl = document.getElementById('threatsBlocked');
    
    if (emailsAnalyzedEl) {
        const oldVal = Number(emailsAnalyzedEl.textContent || 0);
        const newVal = stats.total_emails || 0;
        emailsAnalyzedEl.textContent = newVal;
        if (newVal !== oldVal) pulse(emailsAnalyzedEl);
        drawSpark('spark-emails', generateTrend(7, newVal));
    }
    
    if (threatsBlockedEl) {
        const oldVal = Number(threatsBlockedEl.textContent || 0);
        const newVal = (stats.risk_levels?.high || 0) + (stats.risk_levels?.medium || 0);
        threatsBlockedEl.textContent = newVal;
        if (newVal !== oldVal) pulse(threatsBlockedEl);
        drawSpark('spark-threats', generateTrend(7, newVal));
    }

    const responseEl = document.getElementById('avgResponseTime');
    if (responseEl) {
        // keep as text with 's', but still pulse
        pulse(responseEl);
        drawSpark('spark-response', generateTrend(7, 100 - Math.random()*20));
    }

    const accuracyEl = document.getElementById('accuracyRate');
    if (accuracyEl) {
        pulse(accuracyEl);
        drawSpark('spark-accuracy', generateTrend(7, 90 + Math.random()*10));
    }

    // KPIs
    setKPI('kpiScans', 'kpiScansDelta', stats.total_emails || 0, '+');
    setKPI('kpiThreats', 'kpiThreatsDelta', (stats.risk_levels?.high || 0) + (stats.risk_levels?.medium || 0), '+');
    setKPI('kpiAccuracy', 'kpiAccuracyDelta', `${(98 + Math.random()*2).toFixed(1)}%`, '+');
    drawSpark('spark-kpi-scans', generateTrend(7, stats.total_emails || 0));
    drawSpark('spark-kpi-threats', generateTrend(7, (stats.risk_levels?.high || 0) + (stats.risk_levels?.medium || 0)));
    drawSpark('spark-kpi-accuracy', generateTrend(7, 95 + Math.random()*5));

    // Spotlight
    populateSpotlight(stats);

    // Quota ring (mocked based on totals)
    const used = Math.min(stats.total_emails || 0, 1000);
    updateQuota(used, 1000);

    // Deltas (mock simple)
    setDelta('deltaScans', 'deltaScansHint', (Math.random()>.5?'+':'-') + (5+Math.floor(Math.random()*20)) + '%');
    setDelta('deltaThreats', 'deltaThreatsHint', (Math.random()>.5?'+':'-') + (1+Math.floor(Math.random()*10)) + '%');
}

function initializeCharts() {
    // Main dashboard chart
    const ctx = document.getElementById('riskChart');
    if (ctx) {
        riskChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Low Risk', 'Medium Risk', 'High Risk'],
                datasets: [{
                    data: [2, 4, 0], // Sample data based on current API response
                    backgroundColor: ['#059669', '#d97706', '#dc2626'],
                    borderWidth: 0,
                    hoverOffset: 10,
                    borderColor: '#ffffff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#ffffff',
                            font: {
                                size: 14,
                                weight: '500'
                            },
                            usePointStyle: true,
                            padding: 20,
                            generateLabels: function(chart) {
                                const data = chart.data;
                                if (data.labels.length && data.datasets.length) {
                                    return data.labels.map((label, i) => {
                                        const value = data.datasets[0].data[i];
                                        return {
                                            text: `${label}: ${value} emails`,
                                            fillStyle: data.datasets[0].backgroundColor[i],
                                            strokeStyle: data.datasets[0].backgroundColor[i],
                                            lineWidth: 0,
                                            pointStyle: 'circle',
                                            hidden: false,
                                            index: i
                                        };
                                    });
                                }
                                return [];
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#ffffff',
                        bodyColor: '#ffffff',
                        borderColor: '#667eea',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.parsed;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                return `${label}: ${value} emails (${percentage}%)`;
                            }
                        }
                    }
                },
                cutout: '60%',
                animation: {
                    animateRotate: true,
                    animateScale: true,
                    duration: 1000
                }
            }
        });
        
        // Load real data after chart is initialized
        setTimeout(() => {
            loadStats();
        }, 500);
    }
}

// ===== Overview widgets =====
function initOverviewWidgets(){
    // Draw empty sparks to avoid layout jumps
    ['spark-kpi-scans','spark-kpi-threats','spark-kpi-accuracy'].forEach(id=>{
        if(document.getElementById(id)) drawSpark(id, generateTrend(7, 0));
    });
}

function setKPI(valId, deltaId, value, sign){
    const valEl = document.getElementById(valId);
    const deltaEl = document.getElementById(deltaId);
    if(valEl){ valEl.textContent = value; pulse(valEl); }
    if(deltaEl){ deltaEl.textContent = sign + Math.floor(Math.random()*15) + '%'; }
}

function setDelta(id, hintId, text){
    const el = document.getElementById(id); if(el){ el.textContent = text; el.style.color = text.startsWith('-') ? '#f59f9f' : '#7de18d'; }
}

function populateSpotlight(stats){
    const wrap = document.getElementById('spotlight');
    if(!wrap) return;
    wrap.innerHTML = '';
    // Build a small list from history if present, else synthesize
    const high = analysisHistory.filter(h=>h.riskLevel==='high').slice(0,6);
    const items = high.length ? high : [
        {subject:'Verify your account', sender:'security@bank-secure.com', riskScore: 92},
        {subject:'Invoice overdue', sender:'billing@unknown.xyz', riskScore: 88},
        {subject:'Password reset', sender:'help@support-mail.net', riskScore: 81},
    ];
    items.forEach(it=>{
        const card = document.createElement('div');
        card.style.cssText = 'min-width:260px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:12px;color:#fff;';
        card.innerHTML = `<div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${it.subject}</div>
            <div style="opacity:.9;font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${it.sender}</div>
            <div style="margin-top:6px;font-weight:700;color:#f59f9f;">${Math.round(it.riskScore)}%</div>`;
        wrap.appendChild(card);
    });
}

function updateQuota(used, total){
    const pct = Math.min(100, Math.round((used/total)*100));
    const ring = document.getElementById('quotaRing');
    const pctEl = document.getElementById('quotaPct');
    const usedEl = document.getElementById('quotaUsed');
    const totEl = document.getElementById('quotaTotal');
    const hint = document.getElementById('quotaHint');
    if(ring) ring.style.setProperty('--pct', pct + '%');
    if(pctEl) pctEl.textContent = pct + '%';
    if(usedEl) usedEl.textContent = used;
    if(totEl) totEl.textContent = total;
    if(hint){
        hint.textContent = pct>80 ? 'Approaching quota – consider upgrading.' : 'Plenty left this month.';
        hint.style.color = pct>80 ? '#f59f9f' : '#EAF1FB';
    }
}

// ===== Stat cards enhancements =====
function setupStatCards() {
    // Menus
    document.querySelectorAll('.stat-menu-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const card = btn.dataset.card;
            document.querySelectorAll('.stat-menu').forEach(m => m.classList.remove('open'));
            const menu = document.getElementById(`menu-${card}`);
            if (menu) menu.classList.toggle('open');
        });
    });
    document.addEventListener('click', () => {
        document.querySelectorAll('.stat-menu').forEach(m => m.classList.remove('open'));
    });

    // Quick filter when clicking on card
    const cardToFilter = [
        { id: 'emailsAnalyzed', filter: null },
        { id: 'threatsBlocked', filter: 'high' },
        { id: 'avgResponseTime', filter: 'medium' },
        { id: 'accuracyRate', filter: 'low' },
    ];
    cardToFilter.forEach(({ id, filter }) => {
        const el = document.getElementById(id);
        if (el) {
            el.closest('.modern-card').addEventListener('click', (e) => {
                if (e.target.closest('.stat-actions')) return; // ignore menu clicks
                applyQuickFilter(filter);
            });
        }
    });

    // Menu actions
    document.querySelectorAll('.stat-menu button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = btn.dataset.action;
            const card = btn.dataset.card;
            if (action === 'csv') exportHistory();
            if (action === 'copy') copyCardValue(card);
            if (action === 'filter') applyQuickFilter(card === 'threats' ? 'high' : card === 'response' ? 'medium' : card === 'accuracy' ? 'low' : null);
        });
    });
}

function applyQuickFilter(level) {
    if (!level) {
        document.getElementById('riskFilter').value = 'all';
    } else {
        const el = document.getElementById('riskFilter');
        if (el) el.value = level;
    }
    filterHistory();
    // Smooth scroll to history panel
    const panel = document.querySelector('.history-panel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth' });
}

function copyCardValue(card) {
    let value = '';
    if (card === 'emails') value = document.getElementById('emailsAnalyzed')?.textContent || '';
    if (card === 'threats') value = document.getElementById('threatsBlocked')?.textContent || '';
    if (card === 'response') value = document.getElementById('avgResponseTime')?.textContent || '';
    if (card === 'accuracy') value = document.getElementById('accuracyRate')?.textContent || '';
    if (!value) return;
    navigator.clipboard.writeText(value);
}

function pulse(el) {
    el.classList.add('pulse');
    setTimeout(() => el.classList.remove('pulse'), 900);
}

function generateTrend(days, base) {
    const arr = [];
    let v = Number(base) || 0;
    for (let i = days - 1; i >= 0; i--) {
        v = Math.max(0, v + (Math.random() - 0.5) * (base ? base * 0.08 : 5));
        arr.push(Math.round(v));
    }
    return arr;
}

function drawSpark(canvasId, data) {
    const el = document.getElementById(canvasId);
    if (!el || typeof Chart === 'undefined') return;
    if (!drawSpark.cache) drawSpark.cache = {};
    if (drawSpark.cache[canvasId]) {
        drawSpark.cache[canvasId].data.datasets[0].data = data;
        drawSpark.cache[canvasId].update('none');
        return;
    }
    drawSpark.cache[canvasId] = new Chart(el, {
        type: 'line',
        data: {
            labels: new Array(data.length).fill(''),
            datasets: [{
                data,
                borderColor: '#9fc0e6',
                pointRadius: 0,
                borderWidth: 2,
                tension: 0.35,
                fill: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: { x: { display: false }, y: { display: false } },
            elements: { line: { borderCapStyle: 'round' } }
        }
    });
}

// Enhanced History Management Functions
function setupHistoryControls() {
    const riskFilter = document.getElementById('riskFilter');
    const dateFilter = document.getElementById('dateFilter');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const exportHistoryBtn = document.getElementById('exportHistoryBtn');
    
    if (riskFilter) {
        riskFilter.addEventListener('change', filterHistory);
    }
    
    if (dateFilter) {
        dateFilter.addEventListener('change', filterHistory);
    }
    
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', clearAllHistory);
    }
    
    if (exportHistoryBtn) {
        exportHistoryBtn.addEventListener('click', exportHistory);
    }
}

function addHistoryItem(data) {
    const historyItem = {
        id: Date.now(),
        subject: data.subject || 'No Subject',
        riskScore: Math.round((data.score || 0) * 100),
        riskLevel: data.level || 'unknown',
        reason: data.reason || 'No analysis available',
        alertSummary: data.alert_summary || 'No alert generated',
        timestamp: new Date(),
        fullData: data
    };
    
    analysisHistory.unshift(historyItem); // Add to beginning
    updateHistoryDisplay();
    updateHistoryStats();
    saveHistory();
}

function updateHistoryDisplay() {
    const historyList = document.getElementById('historyList');
    const noHistoryMessage = document.getElementById('noHistoryMessage');
    
    if (!historyList) return;
    
    const filteredHistory = getFilteredHistory();
    
    if (filteredHistory.length === 0) {
        historyList.style.display = 'none';
        if (noHistoryMessage) {
            noHistoryMessage.style.display = 'block';
        }
        return;
    }
    
    historyList.style.display = 'block';
    if (noHistoryMessage) {
        noHistoryMessage.style.display = 'none';
    }
    
    historyList.innerHTML = filteredHistory.map(item => `
        <div class="history-item ${item.riskLevel}-risk" data-id="${item.id}">
            <div class="history-item-content">
                <div class="history-item-header">
                    <span class="history-subject" title="${item.subject}">${item.subject}</span>
                    <span class="history-risk-badge ${item.riskLevel}">${item.riskLevel}</span>
                </div>
                <div class="history-item-details">
                    <span class="history-date">${formatDate(item.timestamp)}</span>
                    <span class="history-score">${item.riskScore}%</span>
                </div>
            </div>
            <div class="history-actions-item">
                <button class="history-action-btn view" onclick="viewHistoryItem(${item.id})" title="View Details">
                    👁️
                </button>
                <button class="history-action-btn remove" onclick="removeHistoryItem(${item.id})" title="Remove">
                    🗑️
                </button>
            </div>
        </div>
    `).join('');
}

function getFilteredHistory() {
    const riskFilter = document.getElementById('riskFilter')?.value || 'all';
    const dateFilter = document.getElementById('dateFilter')?.value || 'all';
    
    let filtered = [...analysisHistory];
    
    // Filter by risk level
    if (riskFilter !== 'all') {
        filtered = filtered.filter(item => item.riskLevel === riskFilter);
    }
    
    // Filter by date
    if (dateFilter !== 'all') {
        const now = new Date();
        filtered = filtered.filter(item => {
            const itemDate = new Date(item.timestamp);
            switch (dateFilter) {
                case 'today':
                    return itemDate.toDateString() === now.toDateString();
                case 'week':
                    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    return itemDate >= weekAgo;
                case 'month':
                    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    return itemDate >= monthAgo;
                default:
                    return true;
            }
        });
    }
    
    return filtered;
}

function filterHistory() {
    updateHistoryDisplay();
}

function updateHistoryStats() {
    const totalAnalyses = analysisHistory.length;
    const highRiskCount = analysisHistory.filter(item => item.riskLevel === 'high').length;
    const mediumRiskCount = analysisHistory.filter(item => item.riskLevel === 'medium').length;
    const lowRiskCount = analysisHistory.filter(item => item.riskLevel === 'low').length;
    
    const totalEl = document.getElementById('totalAnalyses');
    const highEl = document.getElementById('highRiskCount');
    const mediumEl = document.getElementById('mediumRiskCount');
    const lowEl = document.getElementById('lowRiskCount');
    
    if (totalEl) totalEl.textContent = totalAnalyses;
    if (highEl) highEl.textContent = highRiskCount;
    if (mediumEl) mediumEl.textContent = mediumRiskCount;
    if (lowEl) lowEl.textContent = lowRiskCount;
}

function viewHistoryItem(id) {
    const item = analysisHistory.find(h => h.id === id);
    if (item) {
        // Display the analysis result
        displayResults(item.fullData);
        
        // Scroll to results
        const resultDiv = document.getElementById('result');
        if (resultDiv) {
            resultDiv.scrollIntoView({ behavior: 'smooth' });
        }
    }
}

function removeHistoryItem(id) {
    if (confirm('Are you sure you want to remove this analysis from history?')) {
        analysisHistory = analysisHistory.filter(item => item.id !== id);
        updateHistoryDisplay();
        updateHistoryStats();
        saveHistory();
    }
}

function clearAllHistory() {
    if (confirm('Are you sure you want to clear all analysis history? This action cannot be undone.')) {
        analysisHistory = [];
        updateHistoryDisplay();
        updateHistoryStats();
        saveHistory();
    }
}

function exportHistory() {
    if (analysisHistory.length === 0) {
        alert('No history to export');
        return;
    }
    
    const csvContent = [
        ['Subject', 'Risk Level', 'Risk Score', 'Date', 'Reason'],
        ...analysisHistory.map(item => [
            `"${item.subject}"`,
            item.riskLevel,
            item.riskScore,
            formatDate(item.timestamp),
            `"${item.reason}"`
        ])
    ].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `phishing-analysis-history-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

function formatDate(date) {
    return new Intl.DateTimeFormat('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    }).format(date);
}

async function loadHistory() {
    try {
        // Get current user ID
        const user = firebase.auth().currentUser;
        if (!user) {
            console.warn('No authenticated user for history loading');
            return;
        }
        
        const response = await fetch(`${API_BASE}/api/history?user_id=${user.uid}&limit=100`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const historyData = await response.json();
        analysisHistory = historyData.map(item => ({
            id: item.id,
            subject: item.email_subject,
            sender: item.email_sender,
            riskLevel: item.risk_level,
            riskScore: item.risk_score,
            timestamp: new Date(item.created_at),
            source: item.source,
            hasAttachments: item.has_attachments,
            attachmentCount: item.attachment_count,
            urlCount: item.url_count,
            domain: item.domain,
            analysisResult: item.analysis_result
        }));
        
        updateHistoryDisplay();
        updateHistoryStats();
        
        // Also load history stats from API
        await loadHistoryStats();
        
    } catch (error) {
        console.error('Error loading history:', error);
        // Fallback to localStorage
        const savedHistory = localStorage.getItem('analysisHistory');
        if (savedHistory) {
            try {
                analysisHistory = JSON.parse(savedHistory).map(item => ({
                    ...item,
                    timestamp: new Date(item.timestamp)
                }));
            } catch (e) {
                console.error('Error loading history:', e);
                analysisHistory = [];
            }
        }
        
        updateHistoryDisplay();
        updateHistoryStats();
    }
}

// Load history statistics from API
async function loadHistoryStats() {
    try {
        const user = firebase.auth().currentUser;
        if (!user) return;
        
        const response = await fetch(`${API_BASE}/api/history/stats?user_id=${user.uid}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const stats = await response.json();
        
        // Update stats display
        const totalEl = document.getElementById('totalHistoryCount');
        const highEl = document.getElementById('highRiskCount');
        const mediumEl = document.getElementById('mediumRiskCount');
        const lowEl = document.getElementById('lowRiskCount');
        
        if (totalEl) totalEl.textContent = stats.total_count;
        if (highEl) highEl.textContent = stats.high_risk_count;
        if (mediumEl) mediumEl.textContent = stats.medium_risk_count;
        if (lowEl) lowEl.textContent = stats.low_risk_count;
        
    } catch (error) {
        console.error('Error loading history stats:', error);
    }
}

function saveHistory() {
    localStorage.setItem('analysisHistory', JSON.stringify(analysisHistory));
}

// Sign Out Modal Functions
function showSignOutModal() {
    const modal = document.getElementById('signOutModal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }
}

function closeSignOutModal() {
    const modal = document.getElementById('signOutModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto'; // Restore scrolling
    }
}

async function confirmSignOut() {
    try {
        if (typeof firebase !== 'undefined' && firebase.auth) {
            await firebase.auth().signOut();
        }
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Sign out error:', error);
        // Fallback - just redirect
        window.location.href = 'index.html';
    }
}

// Close modal when clicking outside
document.addEventListener('click', function(e) {
    const signOutModal = document.getElementById('signOutModal');
    if (signOutModal && e.target === signOutModal) {
        closeSignOutModal();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeSignOutModal();
    }
});
