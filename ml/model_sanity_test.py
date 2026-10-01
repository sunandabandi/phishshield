"""
PhishShield ML Pipeline - Model Sanity Test Suite

Validates model generalization on known legitimate and phishing URLs.
Ensures that the deployment model does not suffer from false positives on
basic legitimate domains (including apex domains and multi-part TLDs)
while properly flagging phishing / suspicious patterns.
"""

import sys
from pathlib import Path
import joblib
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from feature_extraction import extract_features, FEATURE_NAMES

MODEL_PATH = BASE_DIR / "phishshield_model.pkl"

SANITY_CASES = [
    # Legitimate URLs (expected class 0)
    {"url": "https://google.com", "expected_category": "Legitimate (Apex)", "expected_class": 0},
    {"url": "https://www.google.com", "expected_category": "Legitimate (WWW)", "expected_class": 0},
    {"url": "https://example.com", "expected_category": "Legitimate (Apex)", "expected_class": 0},
    {"url": "https://www.example.com", "expected_category": "Legitimate (WWW)", "expected_class": 0},
    {"url": "https://google.co.uk", "expected_category": "Legitimate (Multi-TLD)", "expected_class": 0},
    {"url": "https://bbc.co.uk", "expected_category": "Legitimate (Multi-TLD)", "expected_class": 0},
    {"url": "https://github.com/sunandabandi/phishshield", "expected_category": "Legitimate (GitHub)", "expected_class": 0},
    {"url": "https://en.wikipedia.org/wiki/Phishing", "expected_category": "Legitimate (Wikipedia)", "expected_class": 0},
    {"url": "https://internshala.com/student/dashboard?utm_source=eoi_student_dashboard&utm_medium=email&utm_campaign=student_dashboard", "expected_category": "Legitimate (Portal Tracking)", "expected_class": 0},
    {"url": "https://www.linkedin.com/comm/jobs/view/1234567890?trackingId=abcdef&refId=12345&midToken=AQE&trk=eml-job-alert", "expected_category": "Legitimate (Job Alert)", "expected_class": 0},
    {"url": "https://click.mail.coursera.org/?qs=9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b", "expected_category": "Legitimate (Email Tracking)", "expected_class": 0},
    {"url": "https://substack.com/redirect/123456?r=abcdef&utm_medium=email", "expected_category": "Legitimate (Redirect)", "expected_class": 0},
    # Phishing / Suspicious URLs (expected class 1)
    {"url": "https://login-secure.xyz/verify-account", "expected_category": "Phishing / Suspicious", "expected_class": 1},
    {"url": "http://192.168.1.10/login", "expected_category": "Phishing / Suspicious", "expected_class": 1},
    {"url": "https://verify-account.top", "expected_category": "Phishing / Suspicious", "expected_class": 1},
    {"url": "https://secure-update.tk:8080/login", "expected_category": "Phishing / Suspicious", "expected_class": 1},
]


def evaluate_model_sanity(model):
    """
    Evaluates a model against the sanity test set.

    Args:
        model: Trained scikit-learn estimator.

    Returns:
        tuple: (all_passed: bool, results: list[dict])
    """
    results = []
    all_passed = True

    header = f"{'URL':<42} | {'Expected':<21} | {'Pred':<4} | {'Prob(Legit)':<11} | {'Prob(Phish)':<11} | {'Status'}"
    print("\n" + "=" * 110)
    print(" PhishShield Model Sanity / Generalization Evaluation")
    print("=" * 110)
    print(header)
    print("-" * len(header))

    for item in SANITY_CASES:
        url = item["url"]
        exp_cat = item["expected_category"]
        exp_cls = item["expected_class"]

        features = extract_features(url)
        X = pd.DataFrame([[features[f] for f in FEATURE_NAMES]], columns=FEATURE_NAMES)

        pred = int(model.predict(X)[0])
        probs = model.predict_proba(X)[0]
        prob_legit = float(probs[0])
        prob_phish = float(probs[1])

        passed = (pred == exp_cls)
        if not passed:
            all_passed = False

        status = "PASS" if passed else "FAIL"
        print(f"{url:<42} | {exp_cat:<21} | {pred:<4} | {prob_legit:<11.4f} | {prob_phish:<11.4f} | {status}")

        results.append({
            "url": url,
            "expected_category": exp_cat,
            "expected_class": exp_cls,
            "predicted_class": pred,
            "legitimate_probability": prob_legit,
            "phishing_probability": prob_phish,
            "passed": passed,
        })

    print("=" * 110)
    return all_passed, results


def run_sanity_test():
    if not MODEL_PATH.exists():
        print(f"[-] ERROR: Model file not found at: {MODEL_PATH}", file=sys.stderr)
        print("    Please run 'python ml/train_model.py' first.", file=sys.stderr)
        return 1

    try:
        model = joblib.load(MODEL_PATH)
    except Exception as e:
        print(f"[-] ERROR loading model: {e}", file=sys.stderr)
        return 1

    model_name = type(model).__name__
    print(f"[*] Loaded deployment model from: {MODEL_PATH.name} ({model_name})")

    all_passed, results = evaluate_model_sanity(model)

    if all_passed:
        print(f"\n[+] SUCCESS: All {len(SANITY_CASES)} sanity test URLs passed as expected!")
        return 0
    else:
        failed_count = sum(1 for r in results if not r["passed"])
        print(f"\n[-] FAILURE: {failed_count} of {len(SANITY_CASES)} sanity test URLs failed expectations.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(run_sanity_test())
