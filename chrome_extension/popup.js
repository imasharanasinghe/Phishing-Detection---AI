
const api = document.getElementById('api');
const raw = document.getElementById('raw');
const out = document.getElementById('out');
const btn = document.getElementById('send');

// Load saved API base URL
chrome.storage.sync.get(['API_BASE'], (res) => {
    api.value = res.API_BASE || 'http://localhost:3000';
});

// Save API base URL when changed
api.addEventListener('input', () => {
    chrome.storage.sync.set({API_BASE: api.value});
});

btn.addEventListener('click', async () => {
    const base = api.value || 'http://localhost:3000';
    const emailText = raw.value.trim();
    
    if (!emailText) {
        out.textContent = 'Please enter email content first';
        out.style.color = '#ff4444';
        return;
    }
    
    chrome.storage.sync.set({API_BASE: base});
    
    // Show loading state
    btn.disabled = true;
    btn.textContent = 'Analyzing...';
    out.textContent = 'Sending to backend...';
    out.style.color = '#ff7c01';
    
    try {
        const response = await fetch(base + '/api/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email_text: emailText })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Display results
        const riskColor = data.level === 'High' ? '#ff4444' : 
                         data.level === 'Medium' ? '#ffaa00' : '#44ff44';
        
        out.innerHTML = `
            <div style="margin-bottom: 8px;">
                <span style="background: ${riskColor}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600;">
                    ${data.level} Risk
                </span>
                <span style="font-weight: 600; margin-left: 8px;">${(data.score * 100).toFixed(0)}%</span>
            </div>
            <div style="font-size: 12px; margin-bottom: 4px;"><strong>Reason:</strong> ${data.reason}</div>
            <div style="font-size: 12px;"><strong>Alert:</strong> ${data.alert_summary}</div>
        `;
        out.style.color = '#fff';
        
    } catch (error) {
        console.error('Analysis failed:', error);
        out.textContent = `Error: ${error.message}`;
        out.style.color = '#ff4444';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Analyze';
    }
});

// Auto-resize textarea
raw.addEventListener('input', () => {
    raw.style.height = 'auto';
    raw.style.height = raw.scrollHeight + 'px';
});

// Handle Enter key in textarea (Ctrl+Enter to send)
raw.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
        btn.click();
    }
});
