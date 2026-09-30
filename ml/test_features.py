"""
PhishShield ML Pipeline - Feature Extractor Test Suite (Step 3F)

Tests that Python feature extraction completes without exceptions,
validates that all 26 feature keys are present, and outputs extracted vectors.
Note: This script only evaluates feature extraction integrity and does not
classify or claim URL ground truth.
"""

import sys
import json
from feature_extraction import extract_features, FEATURE_NAMES

TEST_URLS = [
    "https://google.com",
    "https://login-secure.xyz/verify-account",
    "http://192.168.1.10/login",
    "https://example.com",
]


def run_tests():
    print("=" * 65)
    print(" PhishShield - Feature Extraction Test Suite")
    print("=" * 65)
    print(f"[*] Expected feature count: {len(FEATURE_NAMES)}")

    all_passed = True

    for idx, test_url in enumerate(TEST_URLS, start=1):
        print(f"\n[{idx}] Testing URL: {test_url}")
        try:
            features = extract_features(test_url)
        except Exception as e:
            print(f"[-] FAILED with exception: {e}")
            all_passed = False
            continue

        # Validation checks
        missing_keys = set(FEATURE_NAMES) - set(features.keys())
        extra_keys = set(features.keys()) - set(FEATURE_NAMES)

        if missing_keys:
            print(f"[-] FAILED: Missing feature keys: {missing_keys}")
            all_passed = False
        elif extra_keys:
            print(f"[-] FAILED: Extra unexpected keys: {extra_keys}")
            all_passed = False
        else:
            print("[+] PASS: All 26 features successfully extracted without exceptions.")

        # Print extracted features
        print("    Extracted Vector:")
        for k, v in features.items():
            print(f"      • {k:<20}: {v}")

    print("\n" + "=" * 65)
    if all_passed:
        print("[+] SUCCESS: Feature extraction test suite passed for all test URLs.")
        print("=" * 65)
        return 0
    else:
        print("[-] FAILURE: Feature extraction test suite encountered errors.")
        print("=" * 65)
        return 1


if __name__ == "__main__":
    sys.exit(run_tests())
