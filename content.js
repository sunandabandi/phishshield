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

let mlDetails = {};

// --- Extension Enabled & In-Page Panel State Management ---
let isExtensionEnabled = true;
let isPanelClosedForCurrentEmail = false;
let isPanelMinimized = false;
let lastPanelFingerprint = null;
let currentScanData = null;

// Initialize enabled state from chrome.storage.local
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["enabled", "isEnabled"], (res) => {
        if (!chrome.runtime.lastError && res) {
            if (typeof res.enabled === "boolean") {
                isExtensionEnabled = res.enabled;
            } else if (typeof res.isEnabled === "boolean") {
                isExtensionEnabled = res.isEnabled;
            }
        }
    });

    if (chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === "local") {
                let changed = false;
                if (changes.enabled !== undefined) {
                    isExtensionEnabled = changes.enabled.newValue !== false;
                    changed = true;
                } else if (changes.isEnabled !== undefined) {
                    isExtensionEnabled = changes.isEnabled.newValue !== false;
                    changed = true;
                }
                if (changed) {
                    if (!isExtensionEnabled) {
                        hideInPagePanel();
                    } else {
                        scheduleDebouncedScan(50);
                    }
                }
            }
        });
    }
}

/**
 * Injects scoped CSS styles for the in-page PhishShield panel.
 */
function ensureInPagePanelStyles() {
    if (document.getElementById("phishshield-panel-styles")) return;
    const styleEl = document.createElement("style");
    styleEl.id = "phishshield-panel-styles";
    styleEl.textContent = `
        #phishshield-panel {
            position: fixed;
            top: 72px;
            right: 24px;
            z-index: 999999;
            width: 270px;
            background: #111827;
            color: #f8fafc;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            font-size: 13px;
            line-height: 1.4;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.12);
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
            box-sizing: border-box;
            overflow: hidden;
            transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            pointer-events: auto;
        }
        #phishshield-panel * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        #phishshield-panel.ps-border-high {
            border-color: rgba(239, 68, 68, 0.5);
            box-shadow: 0 10px 25px -5px rgba(239, 68, 68, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
        }
        #phishshield-panel.ps-border-medium {
            border-color: rgba(245, 158, 11, 0.5);
            box-shadow: 0 10px 25px -5px rgba(245, 158, 11, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
        }
        #phishshield-panel.ps-border-safe {
            border-color: rgba(16, 185, 129, 0.5);
            box-shadow: 0 10px 25px -5px rgba(16, 185, 129, 0.18), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
        }
        #phishshield-panel.ps-border-scanning {
            border-color: rgba(56, 189, 248, 0.45);
        }
        #phishshield-panel .ps-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 12px;
            background: #162032;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        #phishshield-panel .ps-brand {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        #phishshield-panel .ps-logo {
            width: 22px;
            height: 22px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 6px;
            background: rgba(56, 189, 248, 0.15);
            border: 1px solid rgba(56, 189, 248, 0.3);
            color: #38bdf8;
            flex-shrink: 0;
        }
        #phishshield-panel .ps-title-group {
            display: flex;
            flex-direction: column;
        }
        #phishshield-panel .ps-title {
            font-size: 13px;
            font-weight: 700;
            color: #f8fafc;
            letter-spacing: -0.2px;
            line-height: 1.2;
        }
        #phishshield-panel .ps-subtitle {
            font-size: 10px;
            color: #94a3b8;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            line-height: 1.2;
        }
        #phishshield-panel .ps-actions {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        #phishshield-panel .ps-btn {
            background: transparent;
            border: none;
            color: #94a3b8;
            cursor: pointer;
            border-radius: 4px;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            line-height: 1;
            transition: background 0.15s, color 0.15s;
        }
        #phishshield-panel .ps-btn:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #f8fafc;
        }
        #phishshield-panel .ps-btn:focus-visible {
            outline: 2px solid #38bdf8;
            outline-offset: 1px;
        }
        #phishshield-panel .ps-body {
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        #phishshield-panel .ps-status-card {
            padding: 8px 10px;
            border-radius: 8px;
            display: flex;
            flex-direction: column;
            gap: 3px;
        }
        #phishshield-panel .ps-status-card.ps-status-high {
            background: rgba(239, 68, 68, 0.15);
            border: 1px solid rgba(239, 68, 68, 0.3);
        }
        #phishshield-panel .ps-status-card.ps-status-medium {
            background: rgba(245, 158, 11, 0.15);
            border: 1px solid rgba(245, 158, 11, 0.3);
        }
        #phishshield-panel .ps-status-card.ps-status-safe {
            background: rgba(16, 185, 129, 0.15);
            border: 1px solid rgba(16, 185, 129, 0.3);
        }
        #phishshield-panel .ps-status-card.ps-status-scanning {
            background: rgba(56, 189, 248, 0.12);
            border: 1px solid rgba(56, 189, 248, 0.25);
        }
        #phishshield-panel .ps-badge-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        #phishshield-panel .ps-badge {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 2px 6px;
            border-radius: 4px;
        }
        #phishshield-panel .ps-badge-high {
            color: #ef4444;
            background: rgba(239, 68, 68, 0.25);
        }
        #phishshield-panel .ps-badge-medium {
            color: #f59e0b;
            background: rgba(245, 158, 11, 0.25);
        }
        #phishshield-panel .ps-badge-safe {
            color: #10b981;
            background: rgba(16, 185, 129, 0.25);
        }
        #phishshield-panel .ps-badge-scanning {
            color: #38bdf8;
            background: rgba(56, 189, 248, 0.25);
        }
        #phishshield-panel .ps-status-desc {
            font-size: 12px;
            font-weight: 600;
            color: #f8fafc;
        }
        #phishshield-panel .ps-summary-grid {
            background: #162032;
            border-radius: 8px;
            padding: 8px 10px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
            font-size: 11px;
        }
        #phishshield-panel .ps-summary-item {
            display: flex;
            align-items: center;
            gap: 6px;
            color: #94a3b8;
        }
        #phishshield-panel .ps-summary-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            flex-shrink: 0;
        }
        #phishshield-panel .ps-dot-total { background: #38bdf8; }
        #phishshield-panel .ps-dot-high { background: #ef4444; }
        #phishshield-panel .ps-dot-medium { background: #f59e0b; }
        #phishshield-panel .ps-dot-safe { background: #10b981; }
        #phishshield-panel .ps-summary-val {
            font-weight: 700;
            color: #f8fafc;
        }
        #phishshield-panel .ps-ml-indicator {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 11px;
            padding: 5px 8px;
            background: rgba(56, 189, 248, 0.08);
            border: 1px solid rgba(56, 189, 248, 0.18);
            border-radius: 6px;
            color: #94a3b8;
        }
        #phishshield-panel .ps-ml-active-text {
            display: flex;
            align-items: center;
            gap: 6px;
            color: #38bdf8;
            font-weight: 600;
        }
        #phishshield-panel .ps-pulse {
            width: 6px;
            height: 6px;
            background: #38bdf8;
            border-radius: 50%;
            box-shadow: 0 0 6px #38bdf8;
        }
        /* Minimized State */
        #phishshield-panel.ps-minimized {
            width: auto;
            padding: 6px 10px;
            cursor: pointer;
            background: #162032;
            border-radius: 20px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        #phishshield-panel.ps-minimized:hover {
            background: #1c2940;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        #phishshield-panel.ps-minimized .ps-header,
        #phishshield-panel.ps-minimized .ps-body {
            display: none !important;
        }
        #phishshield-panel .ps-mini-bar {
            display: none;
            align-items: center;
            gap: 8px;
        }
        #phishshield-panel.ps-minimized .ps-mini-bar {
            display: flex;
        }
        #phishshield-panel .ps-mini-title {
            font-size: 11px;
            font-weight: 700;
            color: #f8fafc;
        }
    `;
    document.head.appendChild(styleEl);
}

/**
 * Retrieves the existing in-page PhishShield panel or creates it if not present.
 */
function getOrCreateInPagePanel() {
    ensureInPagePanelStyles();
    let panel = document.getElementById("phishshield-panel");
    if (!panel) {
        panel = document.createElement("div");
        panel.id = "phishshield-panel";
        panel.setAttribute("role", "region");
        panel.setAttribute("aria-label", "PhishShield Security Scan");
        document.body.appendChild(panel);
    }
    return panel;
}

/**
 * Hides the in-page PhishShield panel.
 */
function hideInPagePanel() {
    const panel = document.getElementById("phishshield-panel");
    if (panel) {
        panel.style.display = "none";
    }
}

/**
 * Displays the in-page panel in the SCANNING state immediately upon email detection.
 */
function showInPagePanelScanning() {
    if (!isExtensionEnabled) {
        hideInPagePanel();
        return;
    }
    if (isPanelClosedForCurrentEmail) {
        return;
    }

    const panel = getOrCreateInPagePanel();
    panel.style.display = "block";

    if (isPanelMinimized) {
        renderInPagePanelMinimized(panel, "SCANNING", "Scanning email...", currentScanData);
        return;
    }

    panel.className = "ps-border-scanning";
    panel.innerHTML = `
        <div class="ps-header">
            <div class="ps-brand">
                <div class="ps-logo" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        <path d="m9 12 2 2 4-4"/>
                    </svg>
                </div>
                <div class="ps-title-group">
                    <span class="ps-title">PhishShield</span>
                    <span class="ps-subtitle">Security Scan</span>
                </div>
            </div>
            <div class="ps-actions">
                <button type="button" class="ps-btn" id="ps-btn-min" aria-label="Minimize PhishShield panel" title="Minimize">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                </button>
                <button type="button" class="ps-btn" id="ps-btn-close" aria-label="Close PhishShield panel for current email" title="Close">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        </div>
        <div class="ps-body">
            <div class="ps-status-card ps-status-scanning">
                <div class="ps-badge-row">
                    <span class="ps-badge ps-badge-scanning">SCANNING</span>
                </div>
                <span class="ps-status-desc">Scanning email...</span>
            </div>
            <div class="ps-summary-grid">
                <div class="ps-summary-item"><span class="ps-summary-dot ps-dot-total"></span><span>Analyzing links...</span></div>
            </div>
            <div class="ps-ml-indicator">
                <div class="ps-ml-active-text"><span class="ps-pulse"></span><span>ML Detection: Active</span></div>
            </div>
        </div>
        <div class="ps-mini-bar" id="ps-mini-bar"></div>
    `;

    attachPanelButtonHandlers(panel, "SCANNING", "Scanning email...", currentScanData);
}

/**
 * Updates the in-page panel with final hybrid scan results.
 */
function updateInPagePanelResults(scanData) {
    currentScanData = scanData;

    if (!isExtensionEnabled) {
        hideInPagePanel();
        return;
    }
    if (isPanelClosedForCurrentEmail) {
        return;
    }

    const panel = getOrCreateInPagePanel();
    panel.style.display = "block";

    const s = scanData.stats || { total: 0, high: 0, medium: 0, safe: 0 };
    const mlDet = scanData.mlDetails || {};
    const mlActive = typeof predictWithML === "function";

    let overallRisk = "SAFE";
    let statusDesc = "Email appears safe";

    if (s.high > 0) {
        overallRisk = "HIGH";
        statusDesc = "Potential phishing detected";
    } else if (s.medium > 0) {
        overallRisk = "MEDIUM";
        statusDesc = "Some links require caution";
    } else if (s.total > 0) {
        overallRisk = "SAFE";
        statusDesc = "Email appears safe";
    } else {
        overallRisk = "SAFE";
        statusDesc = "Email appears safe";
    }

    // Calculate user-friendly confidence metric
    let confidenceText = "";
    if (mlActive && s.total > 0 && Object.keys(mlDet).length > 0) {
        let confSum = 0;
        let confCount = 0;
        for (const url in mlDet) {
            const item = mlDet[url];
            if (item && typeof item.mlPhishingProbability === "number") {
                const prob = item.mlPhishingProbability;
                const conf = item.riskLevel === "SAFE" ? (1 - prob) : prob;
                confSum += conf;
                confCount++;
            }
        }
        if (confCount > 0) {
            const avg = Math.min(Math.max(Math.round((confSum / confCount) * 100), 1), 99);
            confidenceText = ` · Confidence: ${avg}%`;
        }
    }

    if (isPanelMinimized) {
        renderInPagePanelMinimized(panel, overallRisk, statusDesc, scanData);
        return;
    }

    panel.className = `ps-border-${overallRisk.toLowerCase()}`;
    panel.innerHTML = `
        <div class="ps-header">
            <div class="ps-brand">
                <div class="ps-logo" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        <path d="m9 12 2 2 4-4"/>
                    </svg>
                </div>
                <div class="ps-title-group">
                    <span class="ps-title">PhishShield</span>
                    <span class="ps-subtitle">Security Scan</span>
                </div>
            </div>
            <div class="ps-actions">
                <button type="button" class="ps-btn" id="ps-btn-min" aria-label="Minimize PhishShield panel" title="Minimize">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                </button>
                <button type="button" class="ps-btn" id="ps-btn-close" aria-label="Close PhishShield panel for current email" title="Close">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        </div>
        <div class="ps-body">
            <div class="ps-status-card ps-status-${overallRisk.toLowerCase()}">
                <div class="ps-badge-row">
                    <span class="ps-badge ps-badge-${overallRisk.toLowerCase()}">${overallRisk}</span>
                </div>
                <span class="ps-status-desc">${statusDesc}</span>
            </div>
            <div class="ps-summary-grid">
                <div class="ps-summary-item">
                    <span class="ps-summary-dot ps-dot-total"></span>
                    <span><strong class="ps-summary-val">${s.total}</strong> links scanned</span>
                </div>
                <div class="ps-summary-item">
                    <span class="ps-summary-dot ps-dot-high"></span>
                    <span><strong class="ps-summary-val">${s.high}</strong> high risk</span>
                </div>
                <div class="ps-summary-item">
                    <span class="ps-summary-dot ps-dot-medium"></span>
                    <span><strong class="ps-summary-val">${s.medium}</strong> medium risk</span>
                </div>
                <div class="ps-summary-item">
                    <span class="ps-summary-dot ps-dot-safe"></span>
                    <span><strong class="ps-summary-val">${s.safe}</strong> safe</span>
                </div>
            </div>
            <div class="ps-ml-indicator">
                <div class="ps-ml-active-text">
                    <span class="ps-pulse"></span>
                    <span>${mlActive ? `ML Detection: Active${confidenceText}` : "Rule-Based Engine Active"}</span>
                </div>
            </div>
        </div>
        <div class="ps-mini-bar" id="ps-mini-bar"></div>
    `;

    attachPanelButtonHandlers(panel, overallRisk, statusDesc, scanData);
}

/**
 * Renders the compact minimized badge representation.
 */
function renderInPagePanelMinimized(panel, status, desc, scanData) {
    panel.className = `ps-minimized ps-border-${status.toLowerCase()}`;
    panel.innerHTML = `
        <div class="ps-mini-bar" style="display:flex;">
            <div class="ps-logo" style="width:18px;height:18px;" aria-hidden="true">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    <path d="m9 12 2 2 4-4"/>
                </svg>
            </div>
            <span class="ps-mini-title">PhishShield</span>
            <span class="ps-badge ps-badge-${status.toLowerCase()}">${status}</span>
            <button type="button" class="ps-btn" id="ps-btn-expand" aria-label="Expand PhishShield panel" title="Expand panel">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="15 3 21 3 21 9"/>
                    <polyline points="9 21 3 21 3 15"/>
                    <line x1="21" y1="3" x2="14" y2="10"/>
                    <line x1="3" y1="21" x2="10" y2="14"/>
                </svg>
            </button>
            <button type="button" class="ps-btn" id="ps-btn-close-mini" aria-label="Close PhishShield panel" title="Close">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        </div>
    `;

    panel.onclick = (e) => {
        if (e.target.closest("#ps-btn-close-mini")) {
            e.stopPropagation();
            panel.style.display = "none";
            isPanelClosedForCurrentEmail = true;
            return;
        }
        isPanelMinimized = false;
        if (scanData) {
            updateInPagePanelResults(scanData);
        } else {
            showInPagePanelScanning();
        }
    };
}

/**
 * Attaches event listeners to the panel buttons.
 */
function attachPanelButtonHandlers(panel, status, desc, scanData) {
    const minBtn = panel.querySelector("#ps-btn-min");
    if (minBtn) {
        minBtn.onclick = (e) => {
            e.stopPropagation();
            isPanelMinimized = true;
            renderInPagePanelMinimized(panel, status, desc, scanData);
        };
    }

    const closeBtn = panel.querySelector("#ps-btn-close");
    if (closeBtn) {
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            panel.style.display = "none";
            isPanelClosedForCurrentEmail = true;
        };
    }
}

// Pre-warm local ONNX ML session in the background
if (typeof initMLSession === "function") {
    initMLSession().catch(e => console.warn("PhishShield: Background ML pre-warm deferred:", e));
}

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
async function triggerScan() {
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
        hideInPagePanel();
        return;
    }

    // Check extension enabled state
    if (!isExtensionEnabled) {
        hideInPagePanel();
        return;
    }

    // If user opened a different email, reset close & minimize state for the new email
    if (newFingerprint !== lastPanelFingerprint) {
        isPanelClosedForCurrentEmail = false;
        isPanelMinimized = false;
        lastPanelFingerprint = newFingerprint;
    }

    // Immediately show in-page scanning state (Requirement 7)
    showInPagePanelScanning();

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

    const newMlDetails = {};
    const detectedUrls = [];

    for (const link of rawAnchors) {
        const rawHref = link.getAttribute('href') || link.href;
        if (!rawHref) continue;

        const resolvedUrl = unwrapGmailUrl(rawHref);
        const text = (link.textContent || link.innerText || "").trim();

        if (!isValidWebUrl(resolvedUrl)) {
            continue;
        }

        console.log("PhishShield: Email link:", resolvedUrl);

        // 1. Existing Feature Extraction & Heuristic
        const features = extractFeatures(resolvedUrl);
        const heuristicPrediction = predictPhishing(features);
        console.log("PhishShield: Prediction:", resolvedUrl, heuristicPrediction);

        // 2. Existing Rule-based Score Calculation
        let ruleScore = analyzeURL(resolvedUrl);
        const blacklisted = isBlacklisted(resolvedUrl);
        if (blacklisted) {
            ruleScore += 80;
            console.log("BLACKLISTED:", resolvedUrl);
        }

        if (isHiddenLink(text, resolvedUrl)) {
            ruleScore += 40;
            console.log("Hidden link detected:", resolvedUrl);
        }

        ruleScore += textScore;

        // 3. Local Browser ONNX ML Inference
        let mlResult = null;
        try {
            if (typeof predictWithML === "function") {
                mlResult = await predictWithML(resolvedUrl);
            }
        } catch (mlErr) {
            console.error("PhishShield ML: Inference error for URL:", resolvedUrl, mlErr);
            mlResult = null;
        }

        // 4. Combined Hybrid Score (60% Rule + 40% ML)
        let mlScore = null;
        let hybridScore = ruleScore; // Graceful fallback to ruleScore if ML unavailable

        if (mlResult && typeof mlResult.mlScore === "number") {
            mlScore = mlResult.mlScore;
            hybridScore = Math.round((ruleScore * 0.6) + (mlScore * 0.4));
        }

        // Requirement 11: Preserve blacklist and high-confidence rule protection
        // If the URL is blacklisted or the rule score alone indicates HIGH risk (>= 60),
        // ensure hybridScore is never reduced by a lower ML score.
        if (blacklisted || ruleScore >= 60) {
            hybridScore = Math.max(hybridScore, ruleScore);
        }

        // Clamp: 0 <= hybridScore <= 100
        hybridScore = Math.min(Math.max(hybridScore, 0), 100);

        // Requirement 12: Clear numerical logging for ML results
        console.log("PhishShield: ML Prediction:\n" +
            `  URL: ${resolvedUrl}\n` +
            `  Prediction: ${mlResult ? mlResult.prediction : "N/A (rule-only fallback)"}\n` +
            `  Legitimate Probability: ${mlResult ? mlResult.legitimateProbability.toFixed(6) : "N/A"}\n` +
            `  Phishing Probability: ${mlResult ? mlResult.phishingProbability.toFixed(6) : "N/A"}\n` +
            `  ML Score: ${mlScore !== null ? mlScore.toFixed(2) : "N/A"}\n` +
            `  Rule Score: ${ruleScore}\n` +
            `  Hybrid Score: ${hybridScore}`
        );

        newStats.total++;
        detectedUrls.push(resolvedUrl);

        // Requirement 10: Risk level thresholds on hybridScore
        // HIGH: >= 60, MEDIUM: >= 30, SAFE: < 30
        let riskLevel = "SAFE";
        if (hybridScore >= 60) {
            riskLevel = "HIGH";
            newStats.high++;
            newLinkDetails.high.push(resolvedUrl);
        } else if (hybridScore >= 30) {
            riskLevel = "MEDIUM";
            newStats.medium++;
            newLinkDetails.medium.push(resolvedUrl);
        } else {
            riskLevel = "SAFE";
            newStats.safe++;
            newLinkDetails.safe.push(resolvedUrl);
        }

        newMlDetails[resolvedUrl] = {
            mlPrediction: mlResult ? mlResult.prediction : null,
            mlPhishingProbability: mlResult ? mlResult.phishingProbability : null,
            mlScore: mlScore,
            ruleScore: ruleScore,
            hybridScore: hybridScore,
            riskLevel: riskLevel
        };

        applyRisk(link, resolvedUrl, hybridScore);
    }

    stats = newStats;
    linkDetails = newLinkDetails;
    mlDetails = newMlDetails;

    console.log(`PhishShield: Found ${stats.total} links in current email`);

    // Update in-page panel with final results (Requirement 5 & 6)
    updateInPagePanelResults({
        stats: newStats,
        linkDetails: newLinkDetails,
        mlDetails: newMlDetails
    });

    chrome.storage.local.set({ stats, linkDetails, mlDetails }, () => {
        console.log("PhishShield: Current email results updated", stats);
        isCurrentlyScanning = false;
    });
}

function resetStats() {
    stats = { total: 0, high: 0, medium: 0, safe: 0 };
    linkDetails = { high: [], medium: [], safe: [] };
    mlDetails = {};
    currentScanData = null;
    hideInPagePanel();
    chrome.storage.local.set({ stats, linkDetails, mlDetails }, () => {
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
    if (score >= 60) {
        console.log("HIGH RISK:", url);
        highlightLink(link, "red");
    }
    else if (score >= 30) {
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
        let path = parsed.pathname || "";
        // In WHATWG URL API (browsers), parsed.pathname defaults to "/" even if the input URL has no path.
        // Normalize so that bare URLs without a path string match the training extractor (where pathLength = 0).
        const urlWithoutQuery = url.split("?")[0].split("#")[0];
        if (path === "/" && !urlWithoutQuery.endsWith("/")) {
            path = "";
        }
        pathname = path + (parsed.search || "") + (parsed.hash || "");
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