"""
PhishShield ML Pipeline - Model Training & Evaluation (Step 3C)

Trains, evaluates, and exports the PhishShield URL classification model:
1. Loads preprocessed dataset from ml/dataset/urls.csv.
2. Validates schema and label conventions.
3. Extracts URL features using feature_extraction.py.
4. Splits dataset (80% train, 20% test, stratified, random_state=42).
5. Trains Logistic Regression and Random Forest models.
6. Evaluates accuracy, precision, recall, F1-score, and confusion matrix.
7. Selects best model based on F1-score.
8. Exports model (phishshield_model.pkl), features list (model_features.json),
   and metadata (model_metadata.json).
"""

import json
import sys
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split

from feature_extraction import FEATURE_NAMES, extract_features_dataframe

# Paths
BASE_DIR = Path(__file__).resolve().parent
DATASET_PATH = BASE_DIR / "dataset" / "urls.csv"
MODEL_OUTPUT_PATH = BASE_DIR / "phishshield_model.pkl"
FEATURES_OUTPUT_PATH = BASE_DIR / "model_features.json"
METADATA_OUTPUT_PATH = BASE_DIR / "model_metadata.json"

RANDOM_STATE = 42
TEST_SIZE = 0.20


def print_label_convention():
    print("-" * 55)
    print("PhishShield ML label convention:")
    print("0 = legitimate")
    print("1 = phishing")
    print("-" * 55)


def validate_dataset_ready(filepath: Path) -> pd.DataFrame | None:
    """
    Validates that urls.csv exists, contains required columns, and is not empty.
    Returns loaded DataFrame or None if dataset is not ready.
    """
    if not filepath.exists():
        print(f"[-] ERROR: Dataset file not found at: {filepath}", file=sys.stderr)
        print("    Please run 'python ml/prepare_dataset.py' to generate 'urls.csv'.", file=sys.stderr)
        return None

    try:
        df = pd.read_csv(filepath)
    except Exception as e:
        print(f"[-] ERROR reading dataset CSV: {e}", file=sys.stderr)
        return None

    if len(df) == 0:
        print(f"[-] Dataset at {filepath} contains 0 data rows (header only).\n")
        print("    Instructions to prepare training data:")
        print("    1. Download the raw UCI PhiUSIIL dataset from:")
        print("       https://archive.ics.uci.edu/dataset/967/phiusiil+phishing+url+dataset")
        print("    2. Place 'PhiUSIIL_Phishing_URL_Dataset.csv' into 'ml/dataset/'.")
        print("    3. Run: python ml/prepare_dataset.py")
        print("    4. Then re-run: python ml/train_model.py\n")
        return None

    # Validate required columns
    required_cols = {"url", "label"}
    existing_cols = {c.strip().lower() for c in df.columns}
    if not required_cols.issubset(existing_cols):
        print(f"[-] ERROR: Missing required columns in {filepath}. Expected: {required_cols}, Found: {existing_cols}", file=sys.stderr)
        return None

    # Normalize column names
    col_map = {c: c.strip().lower() for c in df.columns}
    df = df.rename(columns=col_map)

    # Clean missing / invalid labels
    df = df.dropna(subset=["url", "label"])
    df["url"] = df["url"].astype(str).str.strip()
    df = df[df["url"] != ""]

    try:
        df["label"] = df["label"].astype(int)
    except Exception as e:
        print(f"[-] ERROR: Label column must contain integer values: {e}", file=sys.stderr)
        return None

    unique_labels = set(df["label"].unique())
    if not unique_labels.issubset({0, 1}):
        print(f"[-] ERROR: Labels must strictly be binary 0 or 1. Found: {unique_labels}", file=sys.stderr)
        return None

    legit_count = int((df["label"] == 0).sum())
    phish_count = int((df["label"] == 1).sum())

    if legit_count == 0 or phish_count == 0:
        print(f"[-] ERROR: Both classes (0 and 1) must be represented. (0: {legit_count}, 1: {phish_count})", file=sys.stderr)
        return None

    return df


def train_and_evaluate(df: pd.DataFrame):
    print("=" * 65)
    print(" PhishShield ML - Model Training & Evaluation Pipeline")
    print("=" * 65)

    print_label_convention()

    total_records = len(df)
    legit_count = int((df["label"] == 0).sum())
    phish_count = int((df["label"] == 1).sum())

    print(f"[*] Dataset Statistics:")
    print(f"    • Total URLs:            {total_records:,}")
    print(f"    • Legitimate URLs (0):   {legit_count:,} ({(legit_count / total_records * 100):.1f}%)")
    print(f"    • Phishing URLs (1):     {phish_count:,} ({(phish_count / total_records * 100):.1f}%)")

    # Step 1: Feature Extraction
    print(f"\n[*] Extracting URL features using feature_extraction.py...")
    print(f"    • Number of features:    {len(FEATURE_NAMES)}")

    X = extract_features_dataframe(df["url"])
    y = df["label"].values

    # Step 2: Stratified Train / Test Split
    print(f"\n[*] Splitting dataset into train ({int((1 - TEST_SIZE) * 100)}%) and test ({int(TEST_SIZE * 100)}%)...")
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE, stratify=y
    )
    print(f"    • Train samples: {len(X_train):,}")
    print(f"    • Test samples:  {len(X_test):,}")

    models = {
        "Logistic Regression": LogisticRegression(
            max_iter=1000, random_state=RANDOM_STATE, solver="lbfgs"
        ),
        "Random Forest": RandomForestClassifier(
            n_estimators=100, random_state=RANDOM_STATE, n_jobs=-1
        ),
    }

    results = {}

    for name, model in models.items():
        print(f"\n" + "-" * 55)
        print(f"[*] Training: {name}...")
        model.fit(X_train, y_train)

        y_pred = model.predict(X_test)

        acc = accuracy_score(y_test, y_pred)
        prec = precision_score(y_test, y_pred, zero_division=0)
        rec = recall_score(y_test, y_pred, zero_division=0)
        f1 = f1_score(y_test, y_pred, zero_division=0)
        cm = confusion_matrix(y_test, y_pred)
        report = classification_report(
            y_test, y_pred, target_names=["Legitimate (0)", "Phishing (1)"], digits=4
        )

        results[name] = {
            "model": model,
            "accuracy": float(acc),
            "precision": float(prec),
            "recall": float(rec),
            "f1_score": float(f1),
            "confusion_matrix": cm.tolist(),
            "classification_report": report,
        }

        print(f"[+] Evaluation for {name}:")
        print(f"    • Accuracy:  {acc:.4f}")
        print(f"    • Precision: {prec:.4f}")
        print(f"    • Recall:    {rec:.4f}")
        print(f"    • F1-Score:  {f1:.4f}")
        print(f"\nConfusion Matrix:\n{cm}")
        print(f"\nClassification Report:\n{report}")

    # Step 3: Model Selection (based on F1-score)
    best_name = max(results.keys(), key=lambda k: results[k]["f1_score"])
    best_result = results[best_name]
    best_model = best_result["model"]

    print("=" * 65)
    print(f"[+] Selected Model: '{best_name}' (Highest F1-score: {best_result['f1_score']:.4f})")
    print("=" * 65)

    # Step 4: Model Export
    print(f"\n[*] Exporting trained model and pipeline artifacts...")

    # 1. Model pkl
    joblib.dump(best_model, MODEL_OUTPUT_PATH)
    print(f"    • Saved model to:        {MODEL_OUTPUT_PATH.resolve()}")

    # 2. Model features JSON
    with open(FEATURES_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(FEATURE_NAMES, f, indent=2)
    print(f"    • Saved feature list to: {FEATURES_OUTPUT_PATH.resolve()}")

    # 3. Model metadata JSON
    metadata = {
        "dataset_source": "UCI PhiUSIIL Phishing URL Dataset (Dataset ID: 967)",
        "dataset_size": total_records,
        "class_distribution": {
            "legitimate_0": legit_count,
            "phishing_1": phish_count,
        },
        "feature_count": len(FEATURE_NAMES),
        "feature_names": FEATURE_NAMES,
        "train_test_split": {
            "train_ratio": 1 - TEST_SIZE,
            "test_ratio": TEST_SIZE,
            "train_samples": len(X_train),
            "test_samples": len(X_test),
        },
        "random_seed": RANDOM_STATE,
        "selected_model": best_name,
        "all_model_metrics": {
            k: {
                "accuracy": v["accuracy"],
                "precision": v["precision"],
                "recall": v["recall"],
                "f1_score": v["f1_score"],
                "confusion_matrix": v["confusion_matrix"],
            }
            for k, v in results.items()
        },
        "label_mapping": {
            "0": "legitimate",
            "1": "phishing",
            "uci_original_mapping": {
                "1": "legitimate -> 0",
                "0": "phishing -> 1",
            },
        },
    }

    with open(METADATA_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    print(f"    • Saved metadata to:     {METADATA_OUTPUT_PATH.resolve()}")

    print("\n[+] ML Training Pipeline completed successfully!")
    return 0


def main():
    df = validate_dataset_ready(DATASET_PATH)
    if df is None:
        print("[*] Dataset not ready for training. Exiting cleanly without error.")
        return 0

    return train_and_evaluate(df)


if __name__ == "__main__":
    sys.exit(main())
