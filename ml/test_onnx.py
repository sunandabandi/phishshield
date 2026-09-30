"""
PhishShield ML Pipeline - ONNX Consistency Verification Suite (Step 4A)

Compares inference results between the source scikit-learn model
(phishshield_model.pkl) and the converted ONNX model (phishshield_model.onnx).
Verifies that predictions match and probability differences are within
floating-point tolerance.
"""

import datetime
import json
import sys
from pathlib import Path
import joblib
import numpy as np
import onnxruntime as rt
import pandas as pd

# Add ml folder to sys.path so feature_extraction can be imported
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from feature_extraction import extract_features

# Paths
SKLEARN_MODEL_PATH = BASE_DIR / "phishshield_model.pkl"
ONNX_MODEL_PATH = BASE_DIR / "phishshield_model.onnx"
FEATURES_PATH = BASE_DIR / "model_features.json"
ONNX_METADATA_PATH = BASE_DIR / "onnx_metadata.json"

TOLERANCE = 1e-4

TEST_URLS = [
    # Legitimate
    "https://google.com",
    "https://www.google.com",
    "https://example.com",
    "https://www.example.com",
    "https://google.co.uk",
    "https://bbc.co.uk",
    # Phishing / Suspicious
    "https://login-secure.xyz/verify-account",
    "http://192.168.1.10/login",
]


def test_onnx():
    print("=" * 80)
    print(" PhishShield ML - scikit-learn vs ONNX Consistency Test Suite")
    print("=" * 80)

    # 1. Load scikit-learn model
    if not SKLEARN_MODEL_PATH.exists():
        print(f"[-] ERROR: scikit-learn model not found: {SKLEARN_MODEL_PATH}", file=sys.stderr)
        return 1

    try:
        sk_model = joblib.load(SKLEARN_MODEL_PATH)
    except Exception as e:
        print(f"[-] ERROR loading scikit-learn model: {e}", file=sys.stderr)
        return 1

    # Load ONNX model
    if not ONNX_MODEL_PATH.exists():
        print(f"[-] ERROR: ONNX model not found: {ONNX_MODEL_PATH}", file=sys.stderr)
        print("    Please run 'python ml/export_onnx.py' first.", file=sys.stderr)
        return 1

    try:
        onnx_session = rt.InferenceSession(str(ONNX_MODEL_PATH))
    except Exception as e:
        print(f"[-] ERROR initializing ONNX session: {e}", file=sys.stderr)
        return 1

    # Load features list
    if not FEATURES_PATH.exists():
        print(f"[-] ERROR: Feature names file not found: {FEATURES_PATH}", file=sys.stderr)
        return 1

    with open(FEATURES_PATH, "r", encoding="utf-8") as f:
        feature_names = json.load(f)

    input_name = onnx_session.get_inputs()[0].name
    print(f"[*] Loaded scikit-learn model: {type(sk_model).__name__}")
    print(f"[*] Loaded ONNX model from:     {ONNX_MODEL_PATH.name}")
    print(f"[*] ONNX input name:           '{input_name}'")
    print(f"[*] Number of features:        {len(feature_names)}")
    print(f"[*] Comparison tolerance:      {TOLERANCE}")

    # Prepare table headers
    print("\n" + "=" * 115)
    print(
        f"{'URL':<42} | {'SK_Pred':<7} | {'ONNX_Pred':<9} | {'SK_Prob(1)':<11} | {'ONNX_Prob(1)':<12} | {'Diff':<12} | {'Match'}"
    )
    print("=" * 115)

    all_matched = True
    max_diff = 0.0
    comparison_records = []

    for url in TEST_URLS:
        # Extract features using the exact feature_extraction function
        features_dict = extract_features(url)

        # Build feature vector in exact order of model_features.json
        vector_values = [features_dict[fname] for fname in feature_names]

        # Use DataFrame for sklearn to maintain feature name alignment
        X_df = pd.DataFrame([vector_values], columns=feature_names)
        X_float32 = np.array([vector_values], dtype=np.float32)

        # 1. Scikit-learn inference
        sk_pred = int(sk_model.predict(X_df)[0])
        sk_prob = float(sk_model.predict_proba(X_df)[0][1])

        # 2. ONNX Runtime inference
        onnx_outputs = onnx_session.run(None, {input_name: X_float32})
        onnx_pred = int(onnx_outputs[0][0])
        onnx_prob = float(onnx_outputs[1][0][1])

        # 3. Calculate difference
        diff = abs(sk_prob - onnx_prob)
        max_diff = max(max_diff, diff)

        class_match = (sk_pred == onnx_pred)
        prob_within_tol = (diff <= TOLERANCE)
        passed = class_match and prob_within_tol

        if not passed:
            all_matched = False

        status_str = "PASS" if passed else "FAIL"

        print(
            f"{url:<42} | {sk_pred:<7} | {onnx_pred:<9} | {sk_prob:<11.6f} | {onnx_prob:<12.6f} | {diff:<12.2e} | {status_str}"
        )

        comparison_records.append({
            "url": url,
            "sklearn_prediction": sk_pred,
            "onnx_prediction": onnx_pred,
            "sklearn_phishing_probability": sk_prob,
            "onnx_phishing_probability": onnx_prob,
            "difference": diff,
            "passed": passed,
        })

    print("=" * 115)
    print("\n[*] Note: This test verifies model conversion and inference consistency.")
    print("    It does not claim real-world generalization based solely on these four URLs.")

    # 5. Create / Update ml/onnx_metadata.json
    onnx_metadata = {
        "model_type": type(sk_model).__name__,
        "source_model": "ml/phishshield_model.pkl",
        "output_model": "ml/phishshield_model.onnx",
        "feature_count": len(feature_names),
        "ordered_feature_names": feature_names,
        "label_mapping": {
            "0": "legitimate",
            "1": "phishing"
        },
        "conversion_library": f"skl2onnx (onnx={rt.__version__})",
        "conversion_date": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "verification_status": "VERIFIED_CONSISTENT" if all_matched else "VERIFICATION_FAILED",
        "max_probability_difference": max_diff,
        "test_results": comparison_records,
    }

    with open(ONNX_METADATA_PATH, "w", encoding="utf-8") as f:
        json.dump(onnx_metadata, f, indent=2)

    print(f"[+] Saved ONNX metadata to: {ONNX_METADATA_PATH.resolve()}")

    if all_matched:
        print("\n[+] SUCCESS: All sklearn and ONNX predictions matched within tolerance!")
        print(f"    • Maximum probability difference: {max_diff:.2e} (tolerance: {TOLERANCE})")
        print("=" * 80)
        return 0
    else:
        print("\n[-] FAILURE: Discrepancies detected between scikit-learn and ONNX models.")
        print("=" * 80)
        return 1


if __name__ == "__main__":
    sys.exit(test_onnx())
