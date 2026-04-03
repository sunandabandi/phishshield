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
    // Gmail email body container is usually class .a3s.
    // Only scan anchors inside currently open message bodies.
    const emailBodies = document.querySelectorAll('.a3s');

    // if no open email body, nothing to scan.
    if (!emailBodies || emailBodies.length === 0) {
        console.log('PhishShield: no open email message found, scan skipped.');

        // Reset stats + link storage so popup reflects zero state
        stats = { total: 0, high: 0, medium: 0, safe: 0 };
        linkDetails = { high: [], medium: [], safe: [] };

        chrome.storage.local.set({ stats, linkDetails }, () => {
            console.log('PhishShield: reset stats because no message open.');
        });

        return;
    }

    const links = [];
    emailBodies.forEach(body => {
        body.querySelectorAll('a').forEach(a => links.push(a));
    });

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

    // Use email text, not full page text, for scoring.
    const pageText = Array.from(emailBodies)
        .map(body => body.innerText)
        .join('\n')
        .toLowerCase();
    const textScore = analyzeEmailText(pageText);

    links.forEach(link => {
        const url = link.href;
        const text = link.textContent.trim();

        if (!url) return;

        let score = analyzeURL(url);

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

// =======================
// URL ANALYSIS
// =======================
function analyzeURL(url) {
    let score = 0;

    if (url.length > 60) score += 20;

    if (
        url.includes("login") ||
        url.includes("verify") ||
        url.includes("account")
    ) {
        score += 30;
    }

    if (
        url.includes(".xyz") ||
        url.includes(".top") ||
        url.includes(".tk")
    ) {
        score += 40;
    }

    return score;
}

// =======================
// EMAIL CONTENT ANALYSIS
// =======================
function analyzeEmailText(text) {
    let score = 0;

    const keywords = [
        "urgent",
        "verify",
        "suspended",
        "click now",
        "password",
        "bank",
        "login"
    ];

    keywords.forEach(word => {
        if (text.includes(word)) {
            score += 10;
        }
    });

    return score;
}

// =======================
// HIDDEN LINK DETECTION
// =======================
function isHiddenLink(text, url) {
    if (!text || !url) return false;

    const cleanedText = text.toLowerCase().trim();

    if (cleanedText.length > 25) return false;

    const safeWords = ["click", "here", "open", "view"];
    if (safeWords.includes(cleanedText)) return false;

    if (cleanedText.includes(".com") || cleanedText.includes(".in")) {
        return !url.includes(cleanedText);
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