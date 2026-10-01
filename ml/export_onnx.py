"""
PhishShield ML Pipeline - ONNX Exporter (Step 4A)

Converts the trained scikit-learn RandomForestClassifier into a
browser-compatible ONNX model (phishshield_model.onnx).
"""

import json
import shutil
import sys
from pathlib import Path
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

# Paths
BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "phishshield_model.pkl"
FEATURES_PATH = BASE_DIR / "model_features.json"
ONNX_OUTPUT_PATH = BASE_DIR / "phishshield_model.onnx"
EXTENSION_MODEL_PATH = BASE_DIR.parent / "models" / "phishshield_model.onnx"

EXPECTED_FEATURE_COUNT = 26
INPUT_TENSOR_NAME = "float_input"


def export_onnx():
    print("=" * 65)
    print(" PhishShield ML - Model ONNX Exporter")
    print("=" * 65)

    # 1. Load model
    if not MODEL_PATH.exists():
        print(f"[-] ERROR: Model file not found: {MODEL_PATH}", file=sys.stderr)
        print("    Please run 'python ml/train_model.py' first.", file=sys.stderr)
        return 1

    print(f"[*] Loading deployment model from: {MODEL_PATH.resolve()}")
    try:
        model = joblib.load(MODEL_PATH)
    except Exception as e:
        print(f"[-] ERROR loading model: {e}", file=sys.stderr)
        return 1

    # Validate model type (Pipeline, LogisticRegression, or RandomForestClassifier)
    if not isinstance(model, (Pipeline, LogisticRegression, RandomForestClassifier)):
        print(
            f"[-] ERROR: Expected Pipeline, LogisticRegression or RandomForestClassifier, got: {type(model).__name__}",
            file=sys.stderr,
        )
        return 1

    model_type = type(model).__name__
    if isinstance(model, Pipeline):
        clf_step = model.named_steps.get("classifier") or model.named_steps.get("clf")
        clf_type = type(clf_step).__name__ if clf_step else "UnknownClassifier"
        model_display_name = f"Pipeline({clf_type})"
    else:
        model_display_name = model_type

    # 2. Load model features
    if not FEATURES_PATH.exists():
        print(f"[-] ERROR: Features file not found: {FEATURES_PATH}", file=sys.stderr)
        return 1

    with open(FEATURES_PATH, "r", encoding="utf-8") as f:
        feature_names = json.load(f)

    # 3. Verify feature count is exactly 26
    feature_count = len(feature_names)
    if feature_count != EXPECTED_FEATURE_COUNT:
        print(
            f"[-] ERROR: Expected {EXPECTED_FEATURE_COUNT} features, but found {feature_count}.",
            file=sys.stderr,
        )
        return 1

    n_features = getattr(model, "n_features_in_", feature_count)
    if n_features != EXPECTED_FEATURE_COUNT:
        print(
            f"[-] ERROR: Model was fitted with {n_features} features, expected {EXPECTED_FEATURE_COUNT}.",
            file=sys.stderr,
        )
        return 1

    print(f"[*] Validated Model Type:   {model_display_name}")
    print(f"[*] Validated Feature Count: {feature_count}")
    print(f"[*] Feature Names List:")
    for idx, fname in enumerate(feature_names, start=1):
        print(f"    {idx:2d}. {fname}")

    # 4. Define ONNX input tensor: float32 of shape [None, 26]
    initial_type = [(INPUT_TENSOR_NAME, FloatTensorType([None, feature_count]))]

    # 5. Convert deployment model to ONNX using skl2onnx
    # Setting zipmap=False outputs a standard 2D float tensor [None, 2] for probabilities,
    # which is required for efficient local browser inference in onnxruntime-web.
    print(f"\n[*] Converting {model_display_name} to ONNX format...")
    try:
        onnx_model = convert_sklearn(
            model,
            name=f"PhishShield_{model_type}",
            initial_types=initial_type,
            options={
                LogisticRegression: {"zipmap": False},
                RandomForestClassifier: {"zipmap": False},
            },
            target_opset=17,
        )
    except Exception as e:
        print(f"[-] ERROR during ONNX conversion: {e}", file=sys.stderr)
        return 1

    # 6. Save ONNX model
    try:
        with open(ONNX_OUTPUT_PATH, "wb") as f:
            f.write(onnx_model.SerializeToString())
    except Exception as e:
        print(f"[-] ERROR saving ONNX model: {e}", file=sys.stderr)
        return 1

    # Also copy to models/phishshield_model.onnx for Chrome extension deployment
    if EXTENSION_MODEL_PATH.parent.exists():
        try:
            shutil.copy2(ONNX_OUTPUT_PATH, EXTENSION_MODEL_PATH)
            print(f"[*] Synced updated model to extension models directory: {EXTENSION_MODEL_PATH.resolve()}")
        except Exception as e:
            print(f"[!] Warning copying to extension models directory: {e}", file=sys.stderr)

    # 7. Print summary statistics
    file_size_bytes = ONNX_OUTPUT_PATH.stat().st_size
    file_size_mb = file_size_bytes / (1024 * 1024)

    print("=" * 65)
    print("[+] ONNX Export Successful!")
    print(f"    • Model Type:       {model_display_name}")
    print(f"    • Number of Inputs: {feature_count} features (shape: [None, {feature_count}])")
    print(f"    • Output Path:      {ONNX_OUTPUT_PATH.resolve()}")
    print(f"    • File Size:        {file_size_mb:.2f} MB ({file_size_bytes:,} bytes)")
    print("=" * 65)

    return 0


if __name__ == "__main__":
    sys.exit(export_onnx())
