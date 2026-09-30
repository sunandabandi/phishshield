# PhishShield Dataset Directory

This directory contains datasets used for training and evaluating the PhishShield machine learning classification models.

## Dataset Reference

- **Dataset Name**: PhiUSIIL Phishing URL Dataset
- **Official Source**: [UCI Machine Learning Repository (Dataset ID: 967)](https://archive.ics.uci.edu/dataset/967/phiusiil+phishing+url+dataset)
- **Authors**: Arvind Prasad, Shalini Chandra (2024)
- **License**: Creative Commons Attribution 4.0 International (CC BY 4.0)
- **Expected Raw Filename**: `PhiUSIIL_Phishing_URL_Dataset.csv` (or extracted from `PhiUSIIL_Phishing_URL_Dataset.zip`)

---

## Label Conventions & Mapping

> [!IMPORTANT]
> The UCI PhiUSIIL dataset and PhishShield use opposite binary label conventions. The preprocessing pipeline explicitly maps the labels to avoid inversion:

| Class | UCI PhiUSIIL Original | PhishShield Internal Target |
| :--- | :---: | :---: |
| **Legitimate / Benign** | `1` | `0` |
| **Phishing / Malicious** | `0` | `1` |

---

## Cleaned Training Dataset (`urls.csv`)

The preprocessed output file used for model training is `urls.csv`. It contains exactly two columns:

```csv
url,label
```

- **`url`** *(String)*: Full URL string.
- **`label`** *(Integer)*: `0` for Legitimate, `1` for Phishing.

---

## Preprocessing Workflow

1. Download `PhiUSIIL_Phishing_URL_Dataset.csv` from the official UCI repository.
2. Place the raw CSV into `ml/dataset/`.
3. Run `python ml/prepare_dataset.py`:
   - Automatically discovers the raw dataset file.
   - Detects the URL column (`URL` / `url`) and Label column (`label` / `Label`).
   - Removes missing or null URLs.
   - Removes duplicate URLs.
   - Normalizes whitespace safely without mutating URL parameters or query strings.
   - Converts labels (`UCI 1 -> 0`, `UCI 0 -> 1`).
   - Verifies representation of both classes.
   - Saves clean pairs to `ml/dataset/urls.csv`.

---

## Version Control & Repository Hygiene

The raw UCI PhiUSIIL dataset contains 235,795 records across 54 attributes (approx. 150–300 MB uncompressed). 
**Raw dataset files (`PhiUSIIL*.csv`, `*.zip`) are ignored via `ml/.gitignore` and must NOT be committed to Git** to prevent repository bloat and respect Git file size best practices.
