document.addEventListener("DOMContentLoaded", () => {
    chrome.storage.local.get(["linkDetails"], (result) => {
        if (chrome.runtime.lastError) {
            console.error("Error retrieving data:", chrome.runtime.lastError);
            return;
        }

        const links = result.linkDetails || {
            high: [],
            medium: [],
            safe: []
        };

        // Fill lists
        fillList("highList", links.high);
        fillList("mediumList", links.medium);
        fillList("safeList", links.safe);

        // Set counts
        document.getElementById("highCount").innerText = links.high.length;
        document.getElementById("mediumCount").innerText = links.medium.length;
        document.getElementById("safeCount").innerText = links.safe.length;

        // Attach click handlers
        attachToggle("highHeader", "highList");
        attachToggle("mediumHeader", "mediumList");
        attachToggle("safeHeader", "safeList");
    });
});

function fillList(id, items) {
    const container = document.getElementById(id);
    container.innerHTML = "";

    if (!items || items.length === 0) {
        container.innerHTML = "<div>No links found</div>";
        return;
    }

    items.forEach(link => {
        const a = document.createElement("a");
        a.href = link;
        a.textContent = link;
        a.target = "_blank";
        a.rel = "noopener noreferrer"; // Security best practice

        container.appendChild(a);
    });
}

function attachToggle(headerId, listId) {
    const header = document.getElementById(headerId);
    const list = document.getElementById(listId);
    const arrow = header.querySelector(".arrow");

    header.addEventListener("click", () => {
        const isVisible = list.style.display === "block";
        list.style.display = isVisible ? "none" : "block";
        if (arrow) {
            arrow.textContent = isVisible ? "▼" : "▲";
        }
    });
}