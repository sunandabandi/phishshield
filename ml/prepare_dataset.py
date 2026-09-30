"""
PhishShield ML Pipeline - Dataset Ingestion & Preprocessing (Step 3A)

Processes the raw UCI PhiUSIIL Phishing URL Dataset:
1. Locates the raw dataset CSV in ml/dataset/.
2. Validates schema and column existence.
3. Cleans nulls and duplicate URLs.
4. Converts labels: UCI 1 (legitimate) -> 0, UCI 0 (phishing) -> 1.
5. Saves clean pairs to ml/dataset/urls.csv (url,label).
"""

import sys
import zipfile
from pathlib import Path
import pandas as pd

# Paths
BASE_DIR = Path(__file__).resolve().parent
DATASET_DIR = BASE_DIR / "dataset"
OUTPUT_FILE = DATASET_DIR / "urls.csv"

# Known potential raw file patterns
RAW_CANDIDATE_NAMES = [
    "PhiUSIIL_Phishing_URL_Dataset.csv",
    "phiusiil_phishing_url_dataset.csv",
    "PhiUSIIL.csv",
    "phiusiil.csv",
]


def find_raw_dataset(dataset_dir: Path) -> Path | None:
    """
    Locates the raw UCI CSV file in the dataset directory.
    Also extracts from a zip file if present.
    """
    # 1. Direct candidate matching
    for name in RAW_CANDIDATE_NAMES:
        candidate = dataset_dir / name
        if candidate.is_file():
            return candidate

    # 2. General pattern matching for CSVs containing 'phiusiil'
    for file_path in dataset_dir.glob("*.csv"):
        if file_path.name.lower() != "urls.csv" and "phiusiil" in file_path.name.lower():
            return file_path

    # 3. Check for zip archive and extract if found
    for zip_path in dataset_dir.glob("*.zip"):
        if "phiusiil" in zip_path.name.lower():
            print(f"[*] Found zip archive: {zip_path.name}. Extracting...")
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(dataset_dir)
            # Re-check after extraction
            for extracted in dataset_dir.glob("*.csv"):
                if extracted.name.lower() != "urls.csv":
                    return extracted

    # 4. Check for any other raw CSV file in dataset_dir (excluding urls.csv)
    other_csvs = [f for f in dataset_dir.glob("*.csv") if f.name.lower() != "urls.csv"]
    if other_csvs:
        return other_csvs[0]

    return None


def detect_columns(df: pd.DataFrame) -> tuple[str, str]:
    """
    Identifies the URL and Label columns regardless of capitalization.
    """
    url_col = None
    label_col = None

    for col in df.columns:
        norm = col.strip().lower()
        if norm in ("url", "urls", "url_address") and url_col is None:
            url_col = col
        elif norm in ("label", "labels", "class", "target", "result") and label_col is None:
            label_col = col

    return url_col, label_col


def print_label_convention():
    print("-" * 55)
    print("PhishShield ML label convention:")
    print("0 = legitimate")
    print("1 = phishing")
    print("-" * 55)


def prepare_dataset():
    print("=" * 60)
    print(" PhishShield - UCI PhiUSIIL Dataset Preprocessing")
    print("=" * 60)

    raw_path = find_raw_dataset(DATASET_DIR)

    if raw_path is None or not raw_path.exists():
        print("[-] Raw UCI PhiUSIIL dataset file not found in 'ml/dataset/'.\n")
        print("    Instructions for setup:")
        print("    1. Download the PhiUSIIL Phishing URL Dataset from the official UCI repository:")
        print("       https://archive.ics.uci.edu/dataset/967/phiusiil+phishing+url+dataset")
        print("    2. Place 'PhiUSIIL_Phishing_URL_Dataset.csv' (or zip) into:")
        print(f"       {DATASET_DIR.resolve()}\n")
        print("    3. Re-run this script: python ml/prepare_dataset.py")
        print("\n[*] Exiting cleanly without modifying dataset.")
        return 0

    print(f"[*] Found raw dataset: {raw_path.name}")
    print(f"[*] Loading raw dataset...")

    try:
        # Load dataset
        df = pd.read_csv(raw_path, low_memory=False)
    except Exception as e:
        print(f"[-] ERROR loading raw CSV file: {e}", file=sys.stderr)
        return 1

    print(f"    • Raw record count: {len(df):,}")
    print(f"    • Raw column count: {len(df.columns)}")

    url_col, label_col = detect_columns(df)

    if not url_col:
        print(f"[-] ERROR: Could not locate a URL column in dataset. Available columns: {list(df.columns[:10])}", file=sys.stderr)
        return 1

    if not label_col:
        print(f"[-] ERROR: Could not locate a Label column in dataset. Available columns: {list(df.columns[:10])}", file=sys.stderr)
        return 1

    print(f"[*] Detected URL column:   '{url_col}'")
    print(f"[*] Detected Label column: '{label_col}'")

    # Step 1: Filter and clean
    initial_count = len(df)
    df = df[[url_col, label_col]].copy()

    # Drop null / empty values
    df = df.dropna(subset=[url_col, label_col])

    # Convert to string and safe trim
    df[url_col] = df[url_col].astype(str).str.strip()
    df = df[df[url_col] != ""]

    # Drop duplicate URLs
    df = df.drop_duplicates(subset=[url_col])
    dedup_count = len(df)
    print(f"[*] Cleaned duplicates and nulls: {initial_count - dedup_count:,} dropped -> {dedup_count:,} unique URLs")

    # Step 2: Convert Labels
    # UCI Original: 1 = legitimate, 0 = phishing
    # PhishShield Target: 0 = legitimate, 1 = phishing
    print_label_convention()

    # Verify original values
    orig_labels = df[label_col].astype(str).str.strip().unique()
    print(f"[*] Original raw labels present: {orig_labels}")

    try:
        df["numeric_label"] = pd.to_numeric(df[label_col], errors="coerce")
        df = df.dropna(subset=["numeric_label"])
        df["numeric_label"] = df["numeric_label"].astype(int)
    except Exception as e:
        print(f"[-] ERROR converting labels to numeric: {e}", file=sys.stderr)
        return 1

    # Map labels safely: UCI 1 -> 0, UCI 0 -> 1
    # Check that input only has 0 and 1
    unique_vals = set(df["numeric_label"].unique())
    if not unique_vals.issubset({0, 1}):
        print(f"[-] ERROR: Unexpected label values found: {unique_vals}. Expected only {0, 1}", file=sys.stderr)
        return 1

    # Convert: 1 (legitimate) -> 0, 0 (phishing) -> 1
    df["converted_label"] = df["numeric_label"].map({1: 0, 0: 1})

    # Validate that both classes exist
    legit_count = int((df["converted_label"] == 0).sum())
    phish_count = int((df["converted_label"] == 1).sum())

    if legit_count == 0 or phish_count == 0:
        print(f"[-] ERROR: Dataset missing representation for one class! (Legitimate: {legit_count}, Phishing: {phish_count})", file=sys.stderr)
        return 1

    # Prepare output format
    clean_df = pd.DataFrame({
        "url": df[url_col],
        "label": df["converted_label"]
    })

    # Save to ml/dataset/urls.csv
    clean_df.to_csv(OUTPUT_FILE, index=False)

    print("\n[+] Dataset successfully preprocessed and saved!")
    print(f"    • Output path:              {OUTPUT_FILE.resolve()}")
    print(f"    • Total cleaned records:    {len(clean_df):,}")
    print(f"    • Legitimate records (0):   {legit_count:,} ({(legit_count / len(clean_df) * 100):.1f}%)")
    print(f"    • Phishing records (1):     {phish_count:,} ({(phish_count / len(clean_df) * 100):.1f}%)")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(prepare_dataset())
