console.log("PhishShield initialized");

// State management
let currentEmailFingerprint = null;
let scanDebounceTimer = null;
let isCurrentlyScanning = false;

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

// Initial scan on load
triggerScan();

// Debounced MutationObserver to detect dynamic rendering in Gmail SPA
const observer = new MutationObserver(() => {
    scheduleDebouncedScan();
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Listen for SPA navigation events
window.addEventListener("hashchange", () => {
    scheduleDebouncedScan(50);
});

window.addEventListener("popstate", () => {
    scheduleDebouncedScan(50);
});

// Periodic lightweight sync check (every 1 second)
setInterval(() => {
    const containers = getOpenedEmailBodyContainers();
    const newFingerprint = computeEmailFingerprint(containers);
    if (newFingerprint !== currentEmailFingerprint) {
        triggerScan();
    }
}, 1000);

function scheduleDebouncedScan(delay = 180) {
    if (scanDebounceTimer) {
        clearTimeout(scanDebounceTimer);
    }
    scanDebounceTimer = setTimeout(() => {
        triggerScan();
    }, delay);
}

/**
 * Locates the actual email body DOM containers for the currently opened email message.
 * Strictly searches for the message content area and ignores sidebars, toolbars, and list views.
 */
function getOpenedEmailBodyContainers() {
    const mainArea = document.querySelector('div[role="main"]') || document.body;

    // First verify if we are in a list view (Inbox/Spam/Sent message table list)
    // In Gmail, list views have a table with role="grid" or class "F cf zt" without an open message view.
    const isListView = mainArea.querySelector('table.F.cf.zt, table[role="grid"]') !== null &&
                       mainArea.querySelector('.nH.hx, div.adn, .h7') === null;

    // Check for message body elements (.a3s is Gmail's primary message body class)
    const selectors = [
        '.a3s.aiL',
        '.a3s',
        'div[aria-label="Message Body"]',
        '.ii.gt .a3s',
        'div.adn.ads .ii.gt'
    ];

    const elements = mainArea.querySelectorAll(selectors.join(', '));
    const validContainers = [];

    elements.forEach(el => {
        // Must be visible and have actual layout dimensions
        const isVisible = el.offsetParent !== null &&
                          window.getComputedStyle(el).display !== 'none' &&
                          window.getComputedStyle(el).visibility !== 'hidden';

        if (isVisible) {
            // Avoid duplicate nested parent/child selections
            const isChild = validContainers.some(parent => parent.contains(el));
            if (!isChild) {
                // If el contains any existing container, replace parent with specific child
                const existingChildIdx = validContainers.findIndex(c => el.contains(c));
                if (existingChildIdx !== -1) {
                    validContainers[existingChildIdx] = el;
                } else {
                    validContainers.push(el);
                }
            }
        }
    });

    if (isListView && validContainers.length === 0) {
        return [];
    }

    return validContainers;
}

/**
 * Generates a unique fingerprint for the currently opened email based on URL hash and DOM metadata.
 */
function computeEmailFingerprint(containers) {
    if (!containers || containers.length === 0) {
        return null;
    }

    const hash = window.location.hash || "";
    const mainArea = document.querySelector('div[role="main"]') || document.body;
    const subjectEl = mainArea.querySelector('h2.hP, .hP, div[role="heading"]');
    const subjectText = subjectEl ? subjectEl.textContent.trim() : "";

    const containerIds = containers.map(c => c.id || c.className).join("-");
    return `${hash}|${subjectText}|${containerIds}|${containers.length}`;
}

/**
 * Main email scanner routine.
 */
function triggerScan() {
    if (isCurrentlyScanning) return;

    const emailContainers = getOpenedEmailBodyContainers();
    const newFingerprint = computeEmailFingerprint(emailContainers);

    // Case 1: No email is currently open
    if (!emailContainers || emailContainers.length === 0 || !newFingerprint) {
        if (currentEmailFingerprint !== null || stats.total !== 0) {
            console.log("PhishShield: No email currently open");
            currentEmailFingerprint = null;
            resetStats();
        }
        return;
    }

    isCurrentlyScanning = true;
    currentEmailFingerprint = newFingerprint;

    console.log("PhishShield: Current email detected");
    console.log("PhishShield: Email body detected (Container count:", emailContainers.length, ")");
    emailContainers.forEach((container, idx) => {
        console.log(`PhishShield: Message container [${idx}]:`, container);
    });

    // Extract links exclusively from inside the opened email body containers
    const rawAnchors = [];
    emailContainers.forEach(container => {
        const anchors = container.querySelectorAll('a');
        anchors.forEach(a => rawAnchors.push(a));
    });

    // Extract surrounding email text for contextual scoring
    const pageText = emailContainers
        .map(container => container.innerText || container.textContent || "")
        .join("\n")
        .toLowerCase();
    const textScore = analyzeEmailText(pageText);

    // Fresh statistics for the current email
    const newStats = {
        total: 0,
        high: 0,
        medium: 0,
        safe: 0
    };

    const newLinkDetails = {
        high: [],
        medium: [],
        safe: []
    };

    const detectedUrls = [];

    rawAnchors.forEach(link => {
        const rawHref = link.getAttribute('href') || link.href;
        if (!rawHref) return;

        const resolvedUrl = unwrapGmailUrl(rawHref);
        const text = (link.textContent || link.innerText || "").trim();

        if (!isValidWebUrl(resolvedUrl)) {
            return;
        }

        console.log("PhishShield: Email link:", resolvedUrl);

        const features = extractFeatures(resolvedUrl);
        const prediction = predictPhishing(features);
        console.log("PhishShield: Prediction:", resolvedUrl, prediction);

        let score = analyzeURL(resolvedUrl);

        if (isBlacklisted(resolvedUrl)) {
            score += 80;
            console.log("BLACKLISTED:", resolvedUrl);
        }

        if (isHiddenLink(text, resolvedUrl)) {
            score += 40;
            console.log("Hidden link detected:", resolvedUrl);
        }

        score += textScore;

        newStats.total++;
        detectedUrls.push(resolvedUrl);

        if (score > 70) {
            newStats.high++;
            newLinkDetails.high.push(resolvedUrl);
        } else if (score > 40) {
            newStats.medium++;
            newLinkDetails.medium.push(resolvedUrl);
        } else {
            newStats.safe++;
            newLinkDetails.safe.push(resolvedUrl);
        }

        applyRisk(link, resolvedUrl, score);
    });

    stats = newStats;
    linkDetails = newLinkDetails;

    console.log(`PhishShield: Found ${stats.total} links in current email`);

    chrome.storage.local.set({ stats, linkDetails }, () => {
        console.log("PhishShield: Current email results updated", stats);
        isCurrentlyScanning = false;
    });
}

function resetStats() {
    stats = { total: 0, high: 0, medium: 0, safe: 0 };
    linkDetails = { high: [], medium: [], safe: [] };
    chrome.storage.local.set({ stats, linkDetails }, () => {
        console.log("PhishShield: Results cleared (no active email)");
    });
}

/**
 * Unwraps Google redirect URLs (https://www.google.com/url?q=...) to extract the genuine destination URL.
 */
function unwrapGmailUrl(rawUrl) {
    if (!rawUrl) return "";

    try {
        const parsed = new URL(rawUrl, window.location.href);
        if (parsed.hostname.includes("google.com") && parsed.pathname.startsWith("/url")) {
            const actual = parsed.searchParams.get("q") || parsed.searchParams.get("url");
            if (actual) {
                return decodeURIComponent(actual);
            }
        }
        return parsed.href;
    } catch {
        return rawUrl;
    }
}

/**
 * Filters out invalid / non-web destinations.
 */
function isValidWebUrl(url) {
    if (!url || typeof url !== "string") return false;
    const trimmed = url.trim();
    if (trimmed === "" || trimmed === "#" || trimmed.startsWith("javascript:") ||
        trimmed.startsWith("mailto:") || trimmed.startsWith("tel:") ||
        trimmed.startsWith("about:") || trimmed.startsWith("blob:") ||
        trimmed.startsWith("data:")) {
        return false;
    }
    return trimmed.startsWith("http://") || trimmed.startsWith("https://");
}

// -------------------------------------------------------------
// Existing Detection & Highlighting Logic (Strictly Preserved)
// -------------------------------------------------------------

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

function highlightLink(link, color) {
    link.style.border = `2px solid ${color}`;
    link.style.backgroundColor =
        color === "red" ? "#ffe6e6" : "#fff4e6";
}

/**
 * Comprehensive Feature Extractor for URL Phishing Analysis & ML Modeling
 * Extracts structural, lexical, and security indicators in numerical format (0/1 or counts).
 * Uses safe URL parsing and handles malformed URLs without throwing runtime errors.
 *
 * @param {string} url - The target URL to extract features from
 * @returns {Object} Numerical feature vector representation
 */
function extractFeatures(url) {
    if (!url || typeof url !== "string") {
        return {
            length: 0,
            urlLength: 0,
            hostnameLength: 0,
            pathLength: 0,
            dotCount: 0,
            digitCount: 0,
            specialCharCount: 0,
            hyphenCount: 0,
            hasExcessiveHyphens: 0,
            subdomainCount: 0,
            hasHttps: 0,
            isIpAddress: 0,
            isPrivateIp: 0,
            hasPort: 0,
            hasSuspiciousPort: 0,
            hasLogin: 0,
            hasVerify: 0,
            hasAccount: 0,
            hasPassword: 0,
            hasReset: 0,
            hasSecure: 0,
            keywordCount: 0,
            hasAtSymbol: 0,
            atCount: 0,
            hasUrlEncoding: 0,
            urlEncodingCount: 0,
            hasSuspiciousTLD: 0
        };
    }

    const lowerUrl = url.toLowerCase();

    // Safe URL parsing using standard URL API with regex fallback
    let hostname = "";
    let pathname = "";
    let port = "";
    let protocol = "";

    try {
        const parsed = new URL(url);
        hostname = parsed.hostname || "";
        pathname = (parsed.pathname || "") + (parsed.search || "") + (parsed.hash || "");
        port = parsed.port || "";
        protocol = parsed.protocol || "";
    } catch {
        // Fallback parser for non-standard / relative / malformed URLs
        const match = url.match(/^(?:([a-z0-9+.-]+):)?(?:\/\/(?:[^\/?#]*@)?([^\/?#:]+)(?::([0-9]+))?)?([^?#]*)?/i);
        if (match) {
            protocol = match[1] ? match[1] + ":" : "";
            hostname = match[2] || "";
            port = match[3] || "";
            pathname = match[4] || "";
        }
    }

    // 1. Length-based features
    const urlLength = url.length;
    const hostnameLength = hostname.length;
    const pathLength = pathname.length;

    // 2. Character counts
    const dotCount = (url.match(/\./g) || []).length;
    const digitCount = (url.match(/\d/g) || []).length;
    const specialCharCount = (url.match(/[^a-zA-Z0-9]/g) || []).length;
    const hyphenCount = (url.match(/-/g) || []).length;
    const hasExcessiveHyphens = hyphenCount >= 3 ? 1 : 0;

    // 3. Subdomain analysis & IP address detection
    const isIpv4 = /^(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(hostname);
    const isIpv6 = hostname.includes(":") && !hostname.includes(".");
    const isIpAddress = (isIpv4 || isIpv6) ? 1 : 0;

    // Detect private / local IP ranges (10.x.x.x, 192.168.x.x, 172.16.x.x-172.31.x.x, 127.x.x.x, 169.254.x.x)
    let isPrivateIp = 0;
    if (isIpv4) {
        const octets = hostname.split(".").map(Number);
        if (
            octets[0] === 10 ||
            octets[0] === 127 ||
            (octets[0] === 192 && octets[1] === 168) ||
            (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
            (octets[0] === 169 && octets[1] === 254)
        ) {
            isPrivateIp = 1;
        }
    } else if (isIpv6) {
        const lowerH = hostname.toLowerCase();
        if (lowerH === "::1" || lowerH.startsWith("fe80:") || lowerH.startsWith("fc") || lowerH.startsWith("fd")) {
            isPrivateIp = 1;
        }
    }

    let subdomainCount = 0;
    if (hostname && !isIpAddress) {
        const parts = hostname.split(".").filter(Boolean);
        // Standard hostname like domain.com has 2 parts (0 subdomains).
        // e.g. sub.domain.com has 3 parts (1 subdomain), a.b.domain.com has 4 parts (2 subdomains).
        subdomainCount = Math.max(0, parts.length - 2);
    }

    // 4. Protocol & Port analysis
    const hasHttps = (protocol === "https:" || lowerUrl.startsWith("https://")) ? 1 : 0;
    const hasPort = port !== "" ? 1 : 0;
    const hasSuspiciousPort = (port !== "" && port !== "80" && port !== "443") ? 1 : 0;

    // 5. Phishing keyword presence (login, verify, account, password, reset, secure)
    const hasLogin = lowerUrl.includes("login") ? 1 : 0;
    const hasVerify = lowerUrl.includes("verify") ? 1 : 0;
    const hasAccount = lowerUrl.includes("account") ? 1 : 0;
    const hasPassword = lowerUrl.includes("password") ? 1 : 0;
    const hasReset = lowerUrl.includes("reset") ? 1 : 0;
    const hasSecure = lowerUrl.includes("secure") ? 1 : 0;
    const keywordCount = hasLogin + hasVerify + hasAccount + hasPassword + hasReset + hasSecure;

    // 6. Suspicious characters & encoding
    const atCount = (url.match(/@/g) || []).length;
    const hasAtSymbol = atCount > 0 ? 1 : 0;
    const urlEncodingCount = (url.match(/%[0-9a-fA-F]{2}/g) || []).length;
    const hasUrlEncoding = urlEncodingCount > 0 ? 1 : 0;

    // 7. Suspicious Top-Level Domains (TLD)
    const hasSuspiciousTLD = (lowerUrl.includes(".xyz") || lowerUrl.includes(".top") || lowerUrl.includes(".tk")) ? 1 : 0;

    return {
        // Base lengths & legacy aliases
        length: urlLength,
        urlLength: urlLength,
        hostnameLength: hostnameLength,
        pathLength: pathLength,

        // Character counts
        dotCount: dotCount,
        digitCount: digitCount,
        specialCharCount: specialCharCount,
        hyphenCount: hyphenCount,
        hasExcessiveHyphens: hasExcessiveHyphens,

        // Structural & Network features
        subdomainCount: subdomainCount,
        hasHttps: hasHttps,
        isIpAddress: isIpAddress,
        isPrivateIp: isPrivateIp,
        hasPort: hasPort,
        hasSuspiciousPort: hasSuspiciousPort,

        // Phishing keyword indicators
        hasLogin: hasLogin,
        hasVerify: hasVerify,
        hasAccount: hasAccount,
        hasPassword: hasPassword,
        hasReset: hasReset,
        hasSecure: hasSecure,
        keywordCount: keywordCount,

        // Obfuscation & Special indicators
        hasAtSymbol: hasAtSymbol,
        atCount: atCount,
        hasUrlEncoding: hasUrlEncoding,
        urlEncodingCount: urlEncodingCount,
        hasSuspiciousTLD: hasSuspiciousTLD
    };
}

/**
 * Predicts phishing risk based on extracted URL features.
 * Computes a deterministic heuristic risk score and maps it to a risk level.
 *
 * @param {Object} features - Feature vector returned by extractFeatures(url)
 * @returns {{ score: number, riskLevel: string, risk: string }} Risk assessment object
 */
function predictPhishing(features) {
    if (!features || typeof features !== "object") {
        return {
            score: 0,
            riskLevel: "SAFE",
            risk: "SAFE",
            "risk level": "SAFE"
        };
    }

    let score = 0;

    // IP address evaluation:
    // Public IP addresses in URLs are strong phishing indicators (+35).
    // Private/local IPs (e.g. 192.168.x.x, 10.x.x.x, 172.16.x.x-172.31.x.x) receive a baseline score (+10)
    // rather than being automatically classified as a high-risk phishing domain.
    if (features.isIpAddress) {
        if (features.isPrivateIp) {
            score += 10;
        } else {
            score += 35;
        }
    }

    // Suspicious Top-Level Domain (.xyz, .top, .tk)
    if (features.hasSuspiciousTLD) {
        score += 30;
    }

    // Presence of '@' symbol (often used to obscure destination)
    if (features.hasAtSymbol) {
        score += 25;
    }

    // Suspicious non-standard port
    if (features.hasSuspiciousPort) {
        score += 20;
    }

    // Phishing keywords (login, verify, account, password, reset, secure)
    if (features.keywordCount > 0) {
        score += Math.min(features.keywordCount * 15, 45);
    }

    // Generic structural indicators (calibrated with lower weights so that
    // benign redirect/tracking links alone do not accumulate >= 30 points)
    // 1. URL length > 60 characters
    if (features.urlLength > 60 || features.length > 60) {
        score += 5;
    }

    // 2. Excessive dots
    if (features.dotCount > 3) {
        score += 5;
    }

    // 3. Multiple subdomains
    if (features.subdomainCount >= 2) {
        score += 5;
    }

    // 4. Excessive hyphens
    if (features.hasExcessiveHyphens || features.hyphenCount >= 3) {
        score += 5;
    }

    // 5. URL percent-encoding (common in legitimate tracking/redirect URLs)
    if (features.hasUrlEncoding) {
        score += 5;
    }

    // 6. Insecure protocol (lack of HTTPS)
    if (!features.hasHttps) {
        score += 5;
    }

    // Cap the score between 0 and 100
    const finalScore = Math.min(Math.max(score, 0), 100);

    // Determine risk level: HIGH, MEDIUM, or SAFE
    let riskLevel = "SAFE";
    if (finalScore >= 60) {
        riskLevel = "HIGH";
    } else if (finalScore >= 30) {
        riskLevel = "MEDIUM";
    } else {
        riskLevel = "SAFE";
    }

    return {
        score: finalScore,
        riskLevel: riskLevel,
        risk: riskLevel,
        "risk level": riskLevel
    };
}