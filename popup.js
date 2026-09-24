// Known blacklist domains mirroring blacklist.js for instant popup explanation tags
const KNOWN_BLACKLIST = [
    "phishing-site.com",
    "login-secure.xyz",
    "verify-account.top",
    "secure-update.tk"
];

document.addEventListener("DOMContentLoaded", () => {
    loadAndRenderData();

    // Live update popup if Gmail email scan finishes or changes while popup is open
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && (changes.stats || changes.linkDetails)) {
            loadAndRenderData();
        }
    });
});

function loadAndRenderData() {
    chrome.storage.local.get(["stats", "linkDetails"], (result) => {
        if (chrome.runtime.lastError) {
            console.error("PhishShield: Error retrieving data:", chrome.runtime.lastError);
            return;
        }

        const links = result.linkDetails || {
            high: [],
            medium: [],
            safe: []
        };

        const highCount = Array.isArray(links.high) ? links.high.length : 0;
        const mediumCount = Array.isArray(links.medium) ? links.medium.length : 0;
        const safeCount = Array.isArray(links.safe) ? links.safe.length : 0;
        const totalCount = result.stats?.total !== undefined ? result.stats.total : (highCount + mediumCount + safeCount);

        // Update metric counters
        updateCount("totalCount", totalCount);
        updateCount("highCount", highCount);
        updateCount("mediumCount", mediumCount);
        updateCount("safeCount", safeCount);

        // Update category badges
        updateCount("highBadge", highCount);
        updateCount("mediumBadge", mediumCount);
        updateCount("safeBadge", safeCount);

        // Render Threat Spectrum distribution bar
        updateDistributionBar(totalCount, highCount, mediumCount, safeCount);

        // Global empty state toggle
        const globalEmpty = document.getElementById("globalEmpty");
        if (globalEmpty) {
            globalEmpty.style.display = totalCount === 0 ? "flex" : "none";
        }

        // Fill category lists
        renderCategoryList("highList", links.high, "high", "No high-risk threats detected");
        renderCategoryList("mediumList", links.medium, "medium", "No medium-risk links detected");
        renderCategoryList("safeList", links.safe, "safe", "No safe links recorded");

        // Attach accessible accordion interactions
        setupAccordion("highHeader", "highList", highCount > 0);
        setupAccordion("mediumHeader", "mediumList", highCount === 0 && mediumCount > 0);
        setupAccordion("safeHeader", "safeList", highCount === 0 && mediumCount === 0 && safeCount > 0);
    });
}

function updateCount(elementId, count) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = count;
    }
}

function updateDistributionBar(total, high, medium, safe) {
    const barHigh = document.getElementById("barHigh");
    const barMed = document.getElementById("barMedium");
    const barSafe = document.getElementById("barSafe");
    const barEmpty = document.getElementById("barEmpty");
    const ratioLabel = document.getElementById("distributionRatio");

    if (!barHigh || !barMed || !barSafe || !barEmpty) return;

    if (total === 0) {
        barHigh.style.width = "0%";
        barMed.style.width = "0%";
        barSafe.style.width = "0%";
        barEmpty.style.width = "100%";
        if (ratioLabel) ratioLabel.textContent = "0 links scanned";
        return;
    }

    const highPct = ((high / total) * 100).toFixed(1);
    const medPct = ((medium / total) * 100).toFixed(1);
    const safePct = (100 - parseFloat(highPct) - parseFloat(medPct)).toFixed(1);

    barHigh.style.width = `${highPct}%`;
    barMed.style.width = `${medPct}%`;
    barSafe.style.width = `${safePct}%`;
    barEmpty.style.width = "0%";

    if (ratioLabel) {
        const parts = [];
        if (high > 0) parts.push(`${high} High`);
        if (medium > 0) parts.push(`${medium} Med`);
        if (safe > 0) parts.push(`${safe} Safe`);
        ratioLabel.textContent = parts.length > 0 ? parts.join(" · ") : `${total} Total`;
    }
}

function renderCategoryList(containerId, items, riskLevel, emptyMessage) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = "";

    if (!items || items.length === 0) {
        const emptyDiv = document.createElement("div");
        emptyDiv.className = "category-empty";
        emptyDiv.textContent = emptyMessage;
        container.appendChild(emptyDiv);
        return;
    }

    items.forEach((url) => {
        const card = createLinkCard(url, riskLevel);
        container.appendChild(card);
    });
}

function createLinkCard(url, riskLevel) {
    const card = document.createElement("div");
    card.className = "link-card";

    const parsed = parseUrlDetails(url);
    const reasons = getExplainabilityTags(url, riskLevel);

    // Card Header: Domain & Protocol + Actions
    const headerRow = document.createElement("div");
    headerRow.className = "link-card-header";

    const domainGroup = document.createElement("div");
    domainGroup.className = "link-domain-group";

    const protocolBadge = document.createElement("span");
    protocolBadge.className = "link-protocol-badge";
    protocolBadge.textContent = parsed.protocol ? parsed.protocol.replace(":", "") : "link";

    const domainEl = document.createElement("span");
    domainEl.className = "link-domain";
    domainEl.textContent = parsed.domain;
    domainEl.title = url;

    domainGroup.appendChild(protocolBadge);
    domainGroup.appendChild(domainEl);

    // Action Buttons: Copy URL & Safe Open External
    const actionsGroup = document.createElement("div");
    actionsGroup.className = "link-actions";

    // Copy Button
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "action-btn";
    copyBtn.title = "Copy full URL to clipboard";
    copyBtn.setAttribute("aria-label", "Copy URL");
    copyBtn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
        </svg>
    `;
    copyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        copyToClipboard(url, copyBtn);
    });

    // Open External Button (Clear intent & safe target attributes)
    const openBtn = document.createElement("a");
    openBtn.className = "action-btn";
    openBtn.href = url;
    openBtn.target = "_blank";
    openBtn.rel = "noopener noreferrer";
    openBtn.title = "Open link in new tab (Use Caution)";
    openBtn.setAttribute("aria-label", `Open ${parsed.domain} externally`);
    openBtn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
    `;
    openBtn.addEventListener("click", (e) => {
        e.stopPropagation();
    });

    actionsGroup.appendChild(copyBtn);
    actionsGroup.appendChild(openBtn);

    headerRow.appendChild(domainGroup);
    headerRow.appendChild(actionsGroup);

    // Path / Sub-URL row
    const pathEl = document.createElement("div");
    pathEl.className = "link-path";
    pathEl.textContent = parsed.path;
    pathEl.title = url;

    // Reason Tags Container
    const tagsContainer = document.createElement("div");
    tagsContainer.className = "link-reasons";

    reasons.forEach(r => {
        const tag = document.createElement("span");
        tag.className = `reason-tag ${r.className}`;
        tag.textContent = r.text;
        tagsContainer.appendChild(tag);
    });

    card.appendChild(headerRow);
    card.appendChild(pathEl);
    if (reasons.length > 0) {
        card.appendChild(tagsContainer);
    }

    return card;
}

function parseUrlDetails(url) {
    try {
        const u = new URL(url);
        const domain = u.hostname || "unknown-domain";
        const path = (u.pathname + u.search + u.hash) || "/";
        return {
            domain: domain,
            path: path,
            protocol: u.protocol
        };
    } catch {
        // Fallback for relative or malformed URLs
        const domainMatch = url.match(/^(?:https?:\/\/)?(?:www\.)?([^\/\?#]+)/i);
        const domain = domainMatch ? domainMatch[1] : url.slice(0, 30);
        const rest = url.replace(/^(?:https?:\/\/)?(?:www\.)?[^\/\?#]+/i, '') || "/";
        return {
            domain: domain,
            path: rest,
            protocol: url.startsWith("http:") ? "http:" : (url.startsWith("https:") ? "https:" : "")
        };
    }
}

function getExplainabilityTags(url, riskLevel) {
    const tags = [];
    const lower = url.toLowerCase();

    // Blacklist check
    if (KNOWN_BLACKLIST.some(d => lower.includes(d))) {
        tags.push({ text: "Blacklisted Domain", className: "tag-high" });
    }

    // Suspicious TLD check
    if (lower.includes(".xyz") || lower.includes(".top") || lower.includes(".tk")) {
        tags.push({ text: "Suspicious TLD", className: "tag-high" });
    }

    // Keyword detection
    const keywords = [];
    if (lower.includes("login")) keywords.push("login");
    if (lower.includes("verify")) keywords.push("verify");
    if (lower.includes("account")) keywords.push("account");

    if (keywords.length > 0) {
        tags.push({
            text: `Keyword: ${keywords.join(", ")}`,
            className: riskLevel === "high" ? "tag-high" : "tag-medium"
        });
    }

    // Insecure Protocol check
    if (url.startsWith("http://")) {
        tags.push({ text: "Insecure (HTTP)", className: "tag-medium" });
    }

    // High length check (>60)
    if (url.length > 60 && riskLevel !== "safe") {
        tags.push({ text: "Long URL (>60 chars)", className: "tag-neutral" });
    }

    // Safe Tag
    if (riskLevel === "safe" && tags.length === 0) {
        tags.push({ text: "Verified Clean", className: "tag-safe" });
    }

    return tags;
}

function copyToClipboard(text, buttonEl) {
    navigator.clipboard.writeText(text).then(() => {
        showToast("URL Copied!");
        if (buttonEl) {
            buttonEl.classList.add("copied");
            setTimeout(() => {
                buttonEl.classList.remove("copied");
            }, 1200);
        }
    }).catch(err => {
        console.error("PhishShield: Failed to copy URL:", err);
    });
}

function showToast(message) {
    const toast = document.getElementById("toastMessage");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => {
        toast.classList.remove("show");
    }, 1500);
}

function setupAccordion(headerId, listId, isInitiallyExpanded) {
    const header = document.getElementById(headerId);
    const list = document.getElementById(listId);
    if (!header || !list) return;

    function setExpanded(expanded) {
        header.setAttribute("aria-expanded", expanded ? "true" : "false");
        if (expanded) {
            list.classList.remove("collapsed");
            list.classList.add("expanded");
        } else {
            list.classList.remove("expanded");
            list.classList.add("collapsed");
        }
    }

    // Set initial state
    setExpanded(isInitiallyExpanded);

    // Remove old event listeners by replacing with clone or setting onclick
    header.onclick = () => {
        const currentlyExpanded = header.getAttribute("aria-expanded") === "true";
        setExpanded(!currentlyExpanded);
    };
}