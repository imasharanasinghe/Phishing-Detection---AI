from fastapi import APIRouter
from os import getenv
from typing import List, Dict, Any
import asyncio
import time
import feedparser
import httpx
from cachetools import TTLCache

router = APIRouter()
_CACHE = TTLCache(maxsize=4, ttl=int(getenv("NEWS_CACHE_TTL_SECONDS", "900")))
_DEFAULTS = [
    # Government & Official Sources
    "https://www.cisa.gov/news-events/cybersecurity-advisories/rss.xml",
    "https://www.ncsc.gov.uk/api/1/services/v1/news-rss-feed.xml",
    
    # Security Research & Analysis
    "https://krebsonsecurity.com/feed/",
    "https://feeds.feedburner.com/TheHackersNews",
    "https://feeds.trendmicro.com/TrendMicroResearch",
    "https://nakedsecurity.sophos.com/feed/",
    "https://blog.talosintelligence.com/feeds/posts/default",
    
    # Enterprise Security
    "https://www.proofpoint.com/us/rss-feeds/blog",
    "https://www.fortinet.com/rss/feeds",
    "https://blog.barracuda.com/feed/",
    "https://abnormalsecurity.com/feed.xml",
    
    # Anti-Phishing Organizations
    "https://apwg.org/feed/",
    "https://www.spamhaus.org/news/rss",
    
    # Additional Security Sources
    "https://feeds.feedburner.com/bleepingcomputer",
    "https://www.darkreading.com/rss.xml",
    "https://www.securityweek.com/rss",
    "https://feeds.feedburner.com/eset/blog",
    "https://www.theregister.com/security/headlines.atom",
    "https://feeds.feedburner.com/SecurityIntelligence",
]

KEYWORDS = [
    "phishing", "scam", "spoof", "credential", "malware", "ransomware", 
    "invoice", "paypal", "bank", "business email compromise", "bec",
    "social engineering", "vishing", "smishing", "spear phishing",
    "zero-day", "exploit", "vulnerability", "breach", "data leak",
    "cryptocurrency", "defi", "nft", "crypto", "bitcoin",
    "supply chain", "apt", "nation-state", "cyber attack",
    "ddos", "botnet", "trojan", "virus", "worm", "rootkit",
    "identity theft", "fraud", "financial crime", "money laundering",
    "dark web", "underground", "hacker", "cybercriminal"
]

def _tags(text: str) -> List[str]:
    """Extract relevant tags from text based on keywords."""
    t = text.lower()
    hits = [k for k in KEYWORDS if k in t]
    return hits or ["phishing"]

async def _fetch(client: httpx.AsyncClient, url: str) -> List[Dict[str, Any]]:
    """Fetch and parse a single RSS/Atom feed."""
    try:
        r = await client.get(url, timeout=15, headers={"User-Agent": "PhishingDetectionAI/1.0"})
        r.raise_for_status()
        parsed = feedparser.parse(r.text)
        out = []
        
        for e in parsed.entries[:15]:  # Limit to 15 items per feed
            title = getattr(e, "title", "Untitled")
            link = getattr(e, "link", "#")
            published = getattr(e, "published", "") or getattr(e, "updated", "")
            summary = getattr(e, "summary", "")[:300]  # Truncate summary
            source = parsed.feed.get("title", url.split('/')[2])
            
            # Create unique ID
            import hashlib
            item_id = hashlib.md5(f"{title}{link}".encode()).hexdigest()[:12]
            
            out.append({
                "id": item_id,
                "title": title,
                "summary": summary,
                "link": link,
                "published": published,
                "source": source,
                "tags": _tags(title + " " + summary),
            })
        return out
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return []

@router.get("/news")
async def news():
    """Fetch and return news items from RSS feeds with caching."""
    if "news" in _CACHE:
        return _CACHE["news"]

    urls = [u.strip() for u in (getenv("NEWS_RSS_FEEDS", "").split(",") if getenv("NEWS_RSS_FEEDS") else _DEFAULTS) if u.strip()]
    items: List[Dict[str, Any]] = []
    
    async with httpx.AsyncClient() as client:
        res = await asyncio.gather(*[_fetch(client, u) for u in urls], return_exceptions=True)
        for chunk in res:
            if isinstance(chunk, list):
                items.extend(chunk)

    # Sort by published date (best-effort)
    def ts(x):
        try:
            return time.mktime(feedparser.parse(x.get("published", "")).updated_parsed or time.gmtime(0))
        except:
            return 0
    
    items.sort(key=ts, reverse=True)
    _CACHE["news"] = items
    return items
