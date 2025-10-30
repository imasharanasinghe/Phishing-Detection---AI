(function () {
    const API_BASE = (window.API_BASE || localStorage.getItem('API_BASE') || 'http://127.0.0.1:3000').replace(/\/$/, '');

    async function postJSON(path, body) {
        try {
            const res = await fetch(`${API_BASE}${path}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const err = data?.detail || data;
                throw err || { message: 'Request failed' };
            }
            return data;
        } catch (error) {
            // Handle network connection errors
            if (error.name === 'TypeError' || error.message.includes('Failed to fetch') || error.message.includes('ERR_CONNECTION_REFUSED')) {
                console.warn('Backend not available, using mock authentication:', error);
                
                // Show notification about mock mode
                showMockModeNotification();
                
                // Mock authentication for testing
                if (path === '/api/auth/signup') {
                    return mockSignup(body);
                } else if (path === '/api/auth/login') {
                    return mockLogin(body);
                }
            }
            throw error;
        }
    }

    function mockSignup(body) {
        // Simulate successful signup
        const mockUser = {
            id: 'mock_' + Date.now(),
            email: body.email,
            created_at: new Date().toISOString(),
            plan: 'free',
            status: 'active'
        };
        
        // Store in localStorage for mock login
        const users = JSON.parse(localStorage.getItem('mockUsers') || '[]');
        users.push({ ...mockUser, password: body.password });
        localStorage.setItem('mockUsers', JSON.stringify(users));
        
        return mockUser;
    }

    function mockLogin(body) {
        // Check mock users
        const users = JSON.parse(localStorage.getItem('mockUsers') || '[]');
        const user = users.find(u => u.email === body.email && u.password === body.password);
        
        if (!user) {
            throw { message: 'Invalid email or password' };
        }
        
        // Return user without password
        const { password, ...userWithoutPassword } = user;
        return {
            user: userWithoutPassword,
            token: 'mock_jwt_token_' + Date.now()
        };
    }

    function validateEmail(email) {
        const re = /^(?:[A-Za-z0-9_'^&+%!-]+\.)*[A-Za-z0-9_'^&+%!-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}$/;
        return re.test(String(email || '').trim());
    }

    function validatePassword(pw) {
        return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(pw || '');
    }

    function togglePasswordVisibility(btn, input) {
        if (!btn || !input) return;
        btn.addEventListener('click', () => {
            const isPassword = input.getAttribute('type') === 'password';
            input.setAttribute('type', isPassword ? 'text' : 'password');
            btn.setAttribute('aria-pressed', String(isPassword));
            btn.classList.toggle('eye-off', isPassword);
        });
    }

    function passwordStrength(pw) {
        let score = 0;
        if (!pw) return 0;
        if (pw.length >= 8) score += 1;
        if (/[a-z]/.test(pw)) score += 1;
        if (/[A-Z]/.test(pw)) score += 1;
        if (/\d/.test(pw)) score += 1;
        if (/[^A-Za-z0-9]/.test(pw)) score += 1;
        return Math.min(score, 5);
    }

    function showInlineError(el, message) {
        if (!el) return;
        el.textContent = message || '';
        el.style.display = message ? 'block' : 'none';
    }

    function showMockModeNotification() {
        // Only show once per session
        if (sessionStorage.getItem('mockModeNotified')) return;
        sessionStorage.setItem('mockModeNotified', 'true');
        
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4F709C;
            color: white;
            padding: 16px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            max-width: 300px;
            font-size: 14px;
            line-height: 1.4;
        `;
        notification.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 4px;">🔧 Demo Mode</div>
            <div>Backend server not available. Using mock authentication for testing.</div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }

    window.Auth = {
        API_BASE,
        postJSON,
        validateEmail,
        validatePassword,
        togglePasswordVisibility,
        passwordStrength,
        showInlineError
    };
})();
