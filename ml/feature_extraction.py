"""
PhishShield ML Pipeline - URL Feature Extractor (Step 3B)

Extracts URL-only numerical features faithfully mirroring PhishShield's
client-side JavaScript extractFeatures(url) in content.js.
Safe against malformed URLs, purely deterministic, and zero network calls.
"""

import re
from urllib.parse import urlparse
import pandas as pd

FEATURE_NAMES = [
    "urlLength",
    "hostnameLength",
    "pathLength",
    "dotCount",
    "digitCount",
    "specialCharCount",
    "hyphenCount",
    "hasExcessiveHyphens",
    "subdomainCount",
    "hasHttps",
    "isIpAddress",
    "isPrivateIp",
    "hasPort",
    "hasSuspiciousPort",
    "hasLogin",
    "hasVerify",
    "hasAccount",
    "hasPassword",
    "hasReset",
    "hasSecure",
    "keywordCount",
    "hasAtSymbol",
    "atCount",
    "hasUrlEncoding",
    "urlEncodingCount",
    "hasSuspiciousTLD",
]

# Precompiled regexes
IPV4_REGEX = re.compile(
    r"^(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\."
    r"(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$"
)
URL_ENCODING_REGEX = re.compile(r"%[0-9a-fA-F]{2}")
NON_ALPHANUM_REGEX = re.compile(r"[^a-zA-Z0-9]")
DIGIT_REGEX = re.compile(r"\d")
FALLBACK_PARSE_REGEX = re.compile(
    r"^(?:([a-z0-9+.-]+):)?(?://(?:[^/?#]*@)?([^/?#:]+)(?::([0-9]+))?)?([^?#]*)?",
    re.IGNORECASE,
)


def extract_features(url: str) -> dict[str, int]:
    """
    Extracts numerical feature vector from a single URL.
    Mirrors JavaScript extractFeatures(url) in content.js.

    Args:
        url: The URL string to analyze.

    Returns:
        Dict mapping feature names to numerical values (0/1 or counts).
    """
    if not url or not isinstance(url, str):
        return {name: 0 for name in FEATURE_NAMES}

    lower_url = url.lower()

    # URL parsing with standard urlparse + regex fallback for malformed URLs
    hostname = ""
    pathname = ""
    port = ""
    protocol = ""

    try:
        # If url has no scheme (e.g. "example.com/login"), urlparse places everything in path.
        # Mirror browser behavior where scheme is parsed if present:
        parsed = urlparse(url)
        if parsed.scheme:
            protocol = parsed.scheme.lower() + ":"
            hostname = parsed.hostname or ""
            port = str(parsed.port) if parsed.port is not None else ""
            pathname = (parsed.path or "") + (f"?{parsed.query}" if parsed.query else "") + (f"#{parsed.fragment}" if parsed.fragment else "")
        else:
            # Fallback regex parser for schemeless / relative / malformed strings
            match = FALLBACK_PARSE_REGEX.match(url)
            if match:
                protocol = f"{match.group(1).lower()}:" if match.group(1) else ""
                hostname = match.group(2) or ""
                port = match.group(3) or ""
                pathname = match.group(4) or ""
    except Exception:
        match = FALLBACK_PARSE_REGEX.match(url)
        if match:
            protocol = f"{match.group(1).lower()}:" if match.group(1) else ""
            hostname = match.group(2) or ""
            port = match.group(3) or ""
            pathname = match.group(4) or ""

    # 1. Length-based features
    url_length = len(url)
    hostname_length = len(hostname)
    path_length = len(pathname)

    # 2. Character counts
    dot_count = url.count(".")
    digit_count = len(DIGIT_REGEX.findall(url))
    special_char_count = len(NON_ALPHANUM_REGEX.findall(url))
    hyphen_count = url.count("-")
    has_excessive_hyphens = 1 if hyphen_count >= 3 else 0

    # 3. Subdomain analysis & IP address detection
    is_ipv4 = bool(IPV4_REGEX.match(hostname))
    is_ipv6 = ":" in hostname and "." not in hostname
    is_ip_address = 1 if (is_ipv4 or is_ipv6) else 0

    is_private_ip = 0
    if is_ipv4:
        try:
            octets = [int(p) for p in hostname.split(".")]
            if (
                octets[0] == 10
                or octets[0] == 127
                or (octets[0] == 192 and octets[1] == 168)
                or (octets[0] == 172 and 16 <= octets[1] <= 31)
                or (octets[0] == 169 and octets[1] == 254)
            ):
                is_private_ip = 1
        except Exception:
            is_private_ip = 0
    elif is_ipv6:
        lower_h = hostname.lower()
        if lower_h == "::1" or lower_h.startswith("fe80:") or lower_h.startswith("fc") or lower_h.startswith("fd"):
            is_private_ip = 1

    subdomain_count = 0
    if hostname and not is_ip_address:
        parts = [p for p in hostname.split(".") if p]
        subdomain_count = max(0, len(parts) - 2)

    # 4. Protocol & Port analysis
    has_https = 1 if (protocol == "https:" or lower_url.startswith("https://")) else 0
    has_port = 1 if port != "" else 0
    has_suspicious_port = 1 if (port != "" and port not in ("80", "443")) else 0

    # 5. Phishing keyword presence (login, verify, account, password, reset, secure)
    has_login = 1 if "login" in lower_url else 0
    has_verify = 1 if "verify" in lower_url else 0
    has_account = 1 if "account" in lower_url else 0
    has_password = 1 if "password" in lower_url else 0
    has_reset = 1 if "reset" in lower_url else 0
    has_secure = 1 if "secure" in lower_url else 0
    keyword_count = has_login + has_verify + has_account + has_password + has_reset + has_secure

    # 6. Suspicious characters & encoding
    at_count = url.count("@")
    has_at_symbol = 1 if at_count > 0 else 0
    url_encoding_matches = URL_ENCODING_REGEX.findall(url)
    url_encoding_count = len(url_encoding_matches)
    has_url_encoding = 1 if url_encoding_count > 0 else 0

    # 7. Suspicious Top-Level Domains (TLD)
    has_suspicious_tld = 1 if any(tld in lower_url for tld in (".xyz", ".top", ".tk")) else 0

    return {
        "urlLength": url_length,
        "hostnameLength": hostname_length,
        "pathLength": path_length,
        "dotCount": dot_count,
        "digitCount": digit_count,
        "specialCharCount": special_char_count,
        "hyphenCount": hyphen_count,
        "hasExcessiveHyphens": has_excessive_hyphens,
        "subdomainCount": subdomain_count,
        "hasHttps": has_https,
        "isIpAddress": is_ip_address,
        "isPrivateIp": is_private_ip,
        "hasPort": has_port,
        "hasSuspiciousPort": has_suspicious_port,
        "hasLogin": has_login,
        "hasVerify": has_verify,
        "hasAccount": has_account,
        "hasPassword": has_password,
        "hasReset": has_reset,
        "hasSecure": has_secure,
        "keywordCount": keyword_count,
        "hasAtSymbol": has_at_symbol,
        "atCount": at_count,
        "hasUrlEncoding": has_url_encoding,
        "urlEncodingCount": url_encoding_count,
        "hasSuspiciousTLD": has_suspicious_tld,
    }


def extract_features_dataframe(urls: pd.Series) -> pd.DataFrame:
    """
    Extracts features for an entire pandas Series of URLs into a DataFrame.

    Args:
        urls: pandas Series of URL strings.

    Returns:
        pandas DataFrame containing all extracted features with columns matching FEATURE_NAMES.
    """
    feature_dicts = [extract_features(u) for u in urls]
    df_features = pd.DataFrame(feature_dicts, columns=FEATURE_NAMES)
    return df_features
