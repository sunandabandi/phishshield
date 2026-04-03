const suspiciousDomains = [
    "phishing-site.com",
    "login-secure.xyz",
    "verify-account.top",
    "secure-update.tk"
];

function isBlacklisted(url) {
    if (!url) return false;

    return suspiciousDomains.some(domain => url.includes(domain));
}