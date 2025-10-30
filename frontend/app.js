// Landing page JavaScript - handles only landing page functionality
// Dashboard functionality is now in dashboard.js
// Updates functionality is now in updates.js

document.addEventListener('DOMContentLoaded', () => {
  console.log('Landing page loaded');
  
  // Typing Animation for Hero Text
  const typingText = document.getElementById('typing-text');
  if (typingText) {
    const textToType = 'AI Powered Phishing Detection';
    let index = 0;
    let isTyping = false;
    
    function typeText() {
      if (isTyping) return; // Prevent multiple instances
      isTyping = true;
      
      function typeCharacter() {
        if (index < textToType.length) {
          typingText.textContent = textToType.substring(0, index + 1);
          index++;
          setTimeout(typeCharacter, 100);
        } else {
          // Wait 2 seconds, then restart
          setTimeout(() => {
            typingText.textContent = '';
            index = 0;
            isTyping = false;
            setTimeout(typeText, 500);
          }, 2000);
        }
      }
      
      typeCharacter();
    }
    
    // Start typing animation after a short delay
    setTimeout(typeText, 1000);
  }
  
  // Pricing Toggle Functionality
  const pricingToggle = document.getElementById('pricingToggle');
  if (pricingToggle) {
    pricingToggle.addEventListener('change', function() {
      const isAnnual = this.checked;
      const amounts = document.querySelectorAll('.pricing-card-modern .amount');
      const savingsElements = document.querySelectorAll('.annual-savings');
      
      amounts.forEach(amount => {
        const monthly = amount.getAttribute('data-monthly');
        const annual = amount.getAttribute('data-annual');
        
        // Animate the price change
        amount.style.transform = 'scale(0.8)';
        amount.style.opacity = '0';
        
        setTimeout(() => {
          amount.textContent = isAnnual ? annual : monthly;
          amount.style.transform = 'scale(1)';
          amount.style.opacity = '1';
        }, 200);
      });
      
      // Show/hide savings indicators
      savingsElements.forEach(el => {
        el.style.display = isAnnual ? 'block' : 'none';
      });
    });
  }
});