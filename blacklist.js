const suspiciousDomains = [
    "phishing-site.com",
    "login-secure.xyz",
    "verify-account.top",
    "secure-update.tk",
    "fake-bank.ml",
    "paypal-verify.ga",
    "amazon-alert.cf",
    "microsoft-support.gq",
    "apple-id-verify.icu",
    "google-account.work",
    "netflix-update.click",
    "bankofamerica-login.link",
    "chase-secure.online",
    "wellsfargo-verify.site",
    "irs-refund.space"
];

function isBlacklisted(url) {
    if (!url) return false;

    return suspiciousDomains.some(domain => url.includes(domain));
}