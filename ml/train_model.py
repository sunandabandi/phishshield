"""
PhishShield ML Pipeline - Dataset Loader & Validator (Stage 2)

This script validates the training dataset located at ml/dataset/urls.csv.
It confirms file existence, schema validity (url, label columns), and data presence.
Model training and artifact generation are intentionally deferred to the training stage.
"""

import csv
import sys
from pathlib import Path

# Resolve path relative to this script: ml/dataset/urls.csv
BASE_DIR = Path(__file__).resolve().parent
DATASET_PATH = BASE_DIR / "dataset" / "urls.csv"
REQUIRED_COLUMNS = {"url", "label"}


def validate_dataset(filepath: Path) -> dict:
    """
    Validates dataset existence, header schema, and presence of data rows.

    Args:
        filepath: Path to urls.csv

    Returns:
        dict: Summary statistics including total rows, class counts.
    """
    if not filepath.exists():
        print(f"[-] ERROR: Dataset file not found at: {filepath}", file=sys.stderr)
        print("    Please ensure 'urls.csv' exists in the 'ml/dataset/' directory.", file=sys.stderr)
        sys.exit(1)

    try:
        with open(filepath, mode="r", encoding="utf-8") as f:
            reader = csv.reader(f)
            header = next(reader, None)

            if header is None:
                print(f"[-] ERROR: Dataset file is completely empty: {filepath}", file=sys.stderr)
                sys.exit(1)

            # Normalize column names (strip whitespace and lower)
            cleaned_header = [col.strip().lower() for col in header]

            missing_columns = REQUIRED_COLUMNS - set(cleaned_header)
            if missing_columns:
                print(
                    f"[-] ERROR: Dataset header is missing required column(s): {', '.join(sorted(missing_columns))}",
                    file=sys.stderr,
                )
                print(f"    Expected header columns: {', '.join(sorted(REQUIRED_COLUMNS))}", file=sys.stderr)
                print(f"    Found columns: {', '.join(cleaned_header)}", file=sys.stderr)
                sys.exit(1)

            url_idx = cleaned_header.index("url")
            label_idx = cleaned_header.index("label")

            row_count = 0
            label_counts = {0: 0, 1: 0}
            invalid_rows = 0

            for line_no, row in enumerate(reader, start=2):
                if not row or all(field.strip() == "" for field in row):
                    continue  # skip blank lines

                if len(row) <= max(url_idx, label_idx):
                    invalid_rows += 1
                    continue

                url_val = row[url_idx].strip()
                label_val = row[label_idx].strip()

                if not url_val:
                    invalid_rows += 1
                    continue

                try:
                    label_int = int(label_val)
                    if label_int in (0, 1):
                        label_counts[label_int] += 1
                    else:
                        invalid_rows += 1
                except ValueError:
                    invalid_rows += 1

                row_count += 1

            if row_count == 0:
                print(f"[-] ERROR: Dataset has header columns, but contains NO data rows: {filepath}", file=sys.stderr)
                print("    Populate 'urls.csv' with labeled URL samples (label 0 or 1) before training.", file=sys.stderr)
                sys.exit(1)

            return {
                "total_rows": row_count,
                "phishing_samples": label_counts[1],
                "legitimate_samples": label_counts[0],
                "invalid_rows": invalid_rows,
            }

    except Exception as e:
        print(f"[-] ERROR reading dataset: {e}", file=sys.stderr)
        sys.exit(1)


def main():
    print("=" * 60)
    print(" PhishShield ML - Dataset Validation Check")
    print("=" * 60)
    print(f"[*] Target dataset path: {DATASET_PATH}")

    stats = validate_dataset(DATASET_PATH)

    print("[+] Dataset validation successful!")
    print(f"    • Total valid URL rows: {stats['total_rows']}")
    print(f"    • Phishing samples (1): {stats['phishing_samples']}")
    print(f"    • Legitimate samples (0): {stats['legitimate_samples']}")
    if stats["invalid_rows"] > 0:
        print(f"    • Skipped / invalid rows: {stats['invalid_rows']}")
    print("\n[*] Ready for model training step (training not executed in this step).")


if __name__ == "__main__":
    main()
