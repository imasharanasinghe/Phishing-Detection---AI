// Enhanced Updates page JavaScript - handles Global Threat Updates functionality
let NEWS = [];
let threatChart = null;

// Category mappings for news feeds
const CATEGORIES = {
  government: ['NCSC', 'CISA', 'Government', 'Official'],
  research: ['Krebs', 'The Hacker News', 'Security Research', 'Analysis'],
  enterprise: ['Barracuda', 'Enterprise', 'Corporate', 'Business'],
  antiPhishing: ['APWG', 'Anti-Phishing', 'Spamhaus', 'Phishing']
};

// Global Threat Updates functionality
async function fetchNews() {
  console.log('fetchNews called');
  
  // Add timeout to prevent hanging
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Request timeout')), 5000)
  );
  
  const base = localStorage.getItem('API_BASE') || 'http://localhost:3001';
  
  try {
    console.log('Trying API:', base + '/api/news');
    const fetchPromise = fetch(base + '/api/news');
    const r = await Promise.race([fetchPromise, timeoutPromise]);
    
    if (!r.ok) throw new Error('API error: ' + r.status);
    const data = await r.json();
    console.log('API data received:', data.length, 'items');
    return data;
  } catch (e) {
    console.warn('API fetch failed, trying demo data:', e);
    
    // fallback to bundled demo JSON
    try {
      console.log('Trying demo data...');
      const fetchPromise2 = fetch('./demo-news.json');
      const r2 = await Promise.race([fetchPromise2, timeoutPromise]);
      const data = await r2.json();
      console.log('Demo data received:', data.length, 'items');
      return data;
    } catch (e2) {
      console.error('Demo data also failed:', e2);
      
      // Return hardcoded fallback data immediately
      console.log('Using hardcoded fallback data');
      return [
        {
          id: "fallback-1",
          title: "Phishing Campaign Targets Financial Institutions",
          summary: "CISA warns of ongoing phishing campaigns targeting financial institutions using sophisticated fake invoice emails.",
          link: "#",
          published: new Date().toISOString(),
          source: "CISA Cybersecurity Advisories",
          tags: ["phishing", "financial", "invoice"]
        },
        {
          id: "fallback-2",
          title: "New Ransomware Variant Detected",
          summary: "Security researchers have identified a new ransomware variant targeting healthcare organizations with double extortion tactics.",
          link: "#",
          published: new Date(Date.now() - 3600000).toISOString(),
          source: "Krebs on Security",
          tags: ["ransomware", "healthcare", "double-extortion"]
        },
        {
          id: "fallback-3",
          title: "Zero-Day Vulnerability in Popular Software",
          summary: "A critical zero-day vulnerability has been discovered in widely-used enterprise software, with active exploitation reported.",
          link: "#",
          published: new Date(Date.now() - 7200000).toISOString(),
          source: "The Hacker News",
          tags: ["zero-day", "vulnerability", "enterprise"]
        }
      ];
    }
  }
}

function timeAgo(iso) {
  const t = new Date(iso).getTime();
  const d = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (d < 60) return d + 's ago';
  if (d < 3600) return Math.floor(d / 60) + 'm ago';
  if (d < 86400) return Math.floor(d / 3600) + 'h ago';
  return Math.floor(d / 86400) + 'd ago';
}

// Categorize news items
function categorizeNews(news) {
  const categorized = {
    government: [],
    research: [],
    enterprise: [],
    antiPhishing: []
  };
  
  news.forEach(item => {
    const source = item.source.toLowerCase();
    let categorized_flag = false;
    
    for (const [category, keywords] of Object.entries(CATEGORIES)) {
      if (keywords.some(keyword => source.includes(keyword.toLowerCase()))) {
        categorized[category].push(item);
        categorized_flag = true;
        break;
      }
    }
    
    // If not categorized, put in research as default
    if (!categorized_flag) {
      categorized.research.push(item);
    }
  });
  
  return categorized;
}

// Render categorized news feeds
function renderCategorizedNews() {
  const categorized = categorizeNews(NEWS);
  
  // Update counts
  document.getElementById('govCount').textContent = categorized.government.length;
  document.getElementById('researchCount').textContent = categorized.research.length;
  document.getElementById('enterpriseCount').textContent = categorized.enterprise.length;
  document.getElementById('antiPhishCount').textContent = categorized.antiPhishing.length;
  
  // Render each category
  renderFeedCategory('govFeed', categorized.government);
  renderFeedCategory('researchFeed', categorized.research);
  renderFeedCategory('enterpriseFeed', categorized.enterprise);
  renderFeedCategory('antiPhishFeed', categorized.antiPhishing);
}

// Render individual feed category
function renderFeedCategory(containerId, items) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  if (items.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 2rem; color: #a0aec0;"><div style="font-size: 2rem; margin-bottom: 1rem;">📭</div><p>No threats in this category</p></div>';
    return;
  }
  
  container.innerHTML = items.slice(0, 6).map(item => `
    <div class="threat-card">
      <div class="meta">
        <span>${item.source}</span>
        <span>•</span>
        <span>${timeAgo(item.published)}</span>
      </div>
      <h3>${item.title}</h3>
      <p>${item.summary || ''}</p>
      <div class="badges-container">
        ${(item.tags || []).slice(0, 3).map(tag => `<span class="badge">${tag}</span>`).join('')}
      </div>
      <button onclick="showThreatDetails('${item.id}', '${item.title.replace(/'/g, "\\'")}', '${item.source}', '${timeAgo(item.published)}', '${(item.summary || '').replace(/'/g, "\\'")}', '${JSON.stringify(item.tags || []).replace(/"/g, '&quot;')}', '${item.link}')" class="read-btn">Read →</button>
    </div>
  `).join('');
}

// Update statistics
function updateStatistics() {
  const totalThreats = NEWS.length;
  const criticalThreats = NEWS.filter(item => 
    item.tags && item.tags.some(tag => 
      ['critical', 'zero-day', 'ransomware', 'apt'].includes(tag.toLowerCase())
    )
  ).length;
  const activeThreats = NEWS.filter(item => 
    new Date(item.published) > new Date(Date.now() - 24 * 60 * 60 * 1000)
  ).length;
  const blockedThreats = Math.floor(totalThreats * 0.85); // Simulated blocked threats
  
  // Animate counters
  animateCounter('totalThreats', totalThreats);
  animateCounter('criticalThreats', criticalThreats);
  animateCounter('activeThreats', activeThreats);
  animateCounter('blockedThreats', blockedThreats);
}

// Animate counter values
function animateCounter(elementId, targetValue) {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  let currentValue = 0;
  const increment = targetValue / 50;
  const timer = setInterval(() => {
    currentValue += increment;
    if (currentValue >= targetValue) {
      currentValue = targetValue;
      clearInterval(timer);
    }
    element.textContent = Math.floor(currentValue);
  }, 30);
}

// Initialize Chart.js bar chart
function initChart() {
  const ctx = document.getElementById('threatChart');
  if (!ctx) return;
  
  // Calculate threat categories for chart
  const categories = {
    'Phishing': NEWS.filter(item => item.tags && item.tags.includes('phishing')).length,
    'Ransomware': NEWS.filter(item => item.tags && item.tags.includes('ransomware')).length,
    'Malware': NEWS.filter(item => item.tags && item.tags.includes('malware')).length,
    'Zero-day': NEWS.filter(item => item.tags && item.tags.includes('zero-day')).length,
    'APT': NEWS.filter(item => item.tags && item.tags.includes('apt')).length,
    'Other': NEWS.filter(item => !item.tags || !item.tags.some(tag => ['phishing', 'ransomware', 'malware', 'zero-day', 'apt'].includes(tag))).length
  };
  
  threatChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(categories),
      datasets: [{
        label: 'Threat Count',
        data: Object.values(categories),
        backgroundColor: [
          'rgba(102, 126, 234, 0.8)',
          'rgba(118, 75, 162, 0.8)',
          'rgba(255, 99, 132, 0.8)',
          'rgba(54, 162, 235, 0.8)',
          'rgba(255, 206, 86, 0.8)',
          'rgba(75, 192, 192, 0.8)'
        ],
        borderColor: [
          'rgba(102, 126, 234, 1)',
          'rgba(118, 75, 162, 1)',
          'rgba(255, 99, 132, 1)',
          'rgba(54, 162, 235, 1)',
          'rgba(255, 206, 86, 1)',
          'rgba(75, 192, 192, 1)'
        ],
        borderWidth: 2,
        borderRadius: 8,
        borderSkipped: false,
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
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
          }
        },
        x: {
          grid: {
            display: false
          }
        }
      },
      animation: {
        duration: 2000,
        easing: 'easeInOutQuart'
      }
    }
  });
}

async function initNews() {
  try {
    console.log('initNews called');
    NEWS = await fetchNews();
    console.log('Loaded news:', NEWS.length, 'items');
    
    // Update statistics
    updateStatistics();
    
    // Render categorized news
    renderCategorizedNews();
    
    // Initialize chart
    initChart();
    
    console.log('Enhanced news initialization completed');
    
  } catch (e) {
    console.error('Failed to initialize news:', e);
  }
}

function bindEvents() {
  // Refresh button
  const refreshBtn = document.getElementById('thRefresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      console.log('Refresh button clicked');
      initNews();
    });
  }
  
  // Search functionality
  const searchEl = document.getElementById('thSearch');
  if (searchEl) {
    searchEl.addEventListener('input', () => {
      const query = searchEl.value.toLowerCase();
      const filteredNews = NEWS.filter(item => 
        item.title.toLowerCase().includes(query) || 
        (item.summary && item.summary.toLowerCase().includes(query))
      );
      
      // Update all feeds with filtered results
      const categorized = categorizeNews(filteredNews);
      renderFeedCategory('govFeed', categorized.government);
      renderFeedCategory('researchFeed', categorized.research);
      renderFeedCategory('enterpriseFeed', categorized.enterprise);
      renderFeedCategory('antiPhishFeed', categorized.antiPhishing);
    });
  }
  
  // Source filter
  const srcEl = document.getElementById('thSource');
  if (srcEl) {
    srcEl.addEventListener('change', () => {
      const selectedSource = srcEl.value;
      const filteredNews = selectedSource ? 
        NEWS.filter(item => item.source === selectedSource) : NEWS;
      
      const categorized = categorizeNews(filteredNews);
      renderFeedCategory('govFeed', categorized.government);
      renderFeedCategory('researchFeed', categorized.research);
      renderFeedCategory('enterpriseFeed', categorized.enterprise);
      renderFeedCategory('antiPhishFeed', categorized.antiPhishing);
    });
  }
}

// Modal Functions
function showThreatDetails(id, title, source, time, summary, tags, link) {
  const modal = document.getElementById('threatModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalSource = document.getElementById('modalSource');
  const modalTime = document.getElementById('modalTime');
  const modalSummary = document.getElementById('modalSummary');
  const modalTags = document.getElementById('modalTags');
  const modalLink = document.getElementById('modalLink');
  
  if (modal && modalTitle && modalSource && modalTime && modalSummary && modalTags && modalLink) {
    modalTitle.textContent = title;
    modalSource.textContent = source;
    modalTime.textContent = time;
    modalSummary.textContent = summary;
    modalLink.href = link;
    
    // Parse and display tags
    try {
      const tagsArray = JSON.parse(tags.replace(/&quot;/g, '"'));
      modalTags.innerHTML = tagsArray.map(tag => `<span class="badge">${tag}</span>`).join('');
    } catch (e) {
      modalTags.innerHTML = '';
    }
    
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
}

function closeThreatModal() {
  const modal = document.getElementById('threatModal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
  }
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
  }
});

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('Enhanced updates page loaded');
  initNews();
  bindEvents();
});