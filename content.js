console.log("PhishShield initialized");

// =======================
// GLOBAL STATE
// =======================
let stats = {
    total: 0,
    high: 0,
    medium: 0,
    safe: 0
};

let linkDetails = {
    high: [],
    medium: [],
    safe: []
};

// =======================
// INITIAL RUN
// =======================
scanLinks();

// =======================
// REAL-TIME OBSERVER
// =======================
const observer = new MutationObserver(() => {
    scanLinks();
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

// =======================
// MAIN SCAN FUNCTION
// =======================
function scanLinks() {
    // Only scan links within email content (Gmail's .a3s class for email bodies)
    // If no .a3s found, fall back to all links but filter Gmail's own
    let links;
    const emailBodies = document.querySelectorAll(".a3s");
    if (emailBodies.length > 0) {
        links = document.querySelectorAll(".a3s a");
    } else {
        links = document.querySelectorAll("a[href^='http']");
    }

    // Reset stats + link storage
    stats = {
        total: 0,
        high: 0,
        medium: 0,
        safe: 0
    };

    linkDetails = {
        high: [],
        medium: [],
        safe: []
    };

    const pageText = document.body.innerText.toLowerCase();
    const textScore = analyzeEmailText(pageText);

    links.forEach(link => {
        const url = link.href;
        const text = link.textContent.trim();

        if (!url || !url.startsWith('http')) return;

        let score = analyzeURL(url);

        // Skip Gmail's own links
        if (url.includes('mail.google.com') || url.includes('googleusercontent.com')) {
            score = 0;
        }

        // Blacklist detection
        if (isBlacklisted(url)) {
            score += 80;
            console.log("BLACKLISTED:", url);
        }

        // Hidden link detection
        if (isHiddenLink(text, url)) {
            score += 40;
            console.log("Hidden link detected:", url);
        }

        // Email content scoring
        score += textScore;

        // Update stats + store links
        stats.total++;

        if (score > 70) {
            stats.high++;
            linkDetails.high.push(url);
        }
        else if (score > 40) {
            stats.medium++;
            linkDetails.medium.push(url);
        }
        else {
            stats.safe++;
            linkDetails.safe.push(url);
        }

        applyRisk(link, url, score);
    });

    // Save BOTH stats + links
    chrome.storage.local.set({ stats, linkDetails }, () => {
        console.log("Stats + links updated:", stats);
    });
}

    // Save BOTH stats + links
    chrome.storage.local.set({ stats, linkDetails }, () => {
        console.log("Stats + links updated:", stats);
    });
}

// =======================
// URL ANALYSIS
// =======================
function analyzeURL(url) {
    let score = 0;

    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        const pathname = urlObj.pathname.toLowerCase();
        const search = urlObj.search.toLowerCase();

        // Length checks
        if (url.length > 100) score += 15;
        if (hostname.length > 50) score += 10;

        // Suspicious keywords in URL
        const suspiciousKeywords = [
            'login', 'verify', 'account', 'secure', 'update', 'confirm',
            'password', 'bank', 'paypal', 'amazon', 'signin', 'auth',
            'reset', 'billing', 'support', 'help', 'contact'
        ];
        suspiciousKeywords.forEach(keyword => {
            if (hostname.includes(keyword) || pathname.includes(keyword) || search.includes(keyword)) {
                score += 20;
            }
        });

        // Suspicious TLDs
        const suspiciousTlds = [
            '.xyz', '.top', '.tk', '.ml', '.ga', '.cf', '.gq', '.icu',
            '.work', '.click', '.link', '.online', '.site', '.space'
        ];
        if (suspiciousTlds.some(tld => hostname.endsWith(tld))) {
            score += 30;
        }

        // IP addresses instead of domains
        if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
            score += 50;
        }

        // URL shortening services
        const shorteners = ['bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'ow.ly'];
        if (shorteners.some(short => hostname.includes(short))) {
            score += 25;
        }

        // HTTPS check (prefer HTTPS, but not mandatory)
        if (urlObj.protocol !== 'https:') {
            score += 10;
        }

        // Subdomain abuse
        const parts = hostname.split('.');
        if (parts.length > 3) {
            score += 15;
        }

        // Special characters in domain
        if (/[^a-z0-9.-]/.test(hostname.replace(/\./g, ''))) {
            score += 20;
        }

    } catch (e) {
        // Invalid URL
        score += 60;
    }

    return Math.min(score, 100); // Cap at 100
}

// =======================
// EMAIL CONTENT ANALYSIS
// =======================
function analyzeEmailText(text) {
    let score = 0;

    const keywords = [
        "urgent", "verify", "suspended", "click now", "password",
        "bank", "login", "account", "security", "alert", "warning",
        "confirm", "update", "billing", "payment", "invoice",
        "suspicious activity", "unauthorized", "reset", "support",
        "help desk", "customer service", "immediate action",
        "limited time", "expire", "deadline", "act now"
    ];

    keywords.forEach(word => {
        if (text.includes(word)) {
            score += 5; // Reduced from 10 to make it additive
        }
    });

    // Check for multiple urgent words
    const urgentCount = keywords.filter(word => text.includes(word)).length;
    if (urgentCount > 3) {
        score += 20;
    }

    return Math.min(score, 30); // Cap email text score
}

// =======================
// HIDDEN LINK DETECTION
// =======================
function isHiddenLink(text, url) {
    if (!text || !url) return false;

    const cleanedText = text.toLowerCase().trim();

    // Skip if text is too long (likely descriptive)
    if (cleanedText.length > 30) return false;

    // Safe words that indicate legitimate short text
    const safeWords = [
        "click", "here", "open", "view", "read", "more", "link",
        "website", "site", "page", "visit", "go to", "check"
    ];
    if (safeWords.some(word => cleanedText.includes(word))) return false;

    // Check if text looks like a URL but doesn't match the href
    if (cleanedText.includes('.com') || cleanedText.includes('.org') ||
        cleanedText.includes('.net') || cleanedText.includes('http')) {
        try {
            const textDomain = cleanedText.match(/([a-z0-9-]+\.)+[a-z]{2,}/i);
            const urlDomain = new URL(url).hostname;
            if (textDomain && !urlDomain.includes(textDomain[0])) {
                return true;
            }
        } catch (e) {
            return true; // If URL parsing fails, consider suspicious
        }
    }

    // Generic short text without safe words
    if (cleanedText.length < 10 && !safeWords.some(word => cleanedText.includes(word))) {
        return true;
    }

    return false;
}

// =======================
// APPLY RISK VISUALS
// =======================
function applyRisk(link, url, score) {
    if (score > 70) {
        console.log("HIGH RISK:", url);
        highlightLink(link, "red");
    } 
    else if (score > 40) {
        console.log("MEDIUM RISK:", url);
        highlightLink(link, "orange");
    } 
    else {
        console.log("SAFE:", url);
    }
}

// =======================
// UI HIGHLIGHT FUNCTION
// =======================
function highlightLink(link, color) {
    link.style.border = `2px solid ${color}`;
    link.style.backgroundColor =
        color === "red" ? "#ffe6e6" : "#fff4e6";
}