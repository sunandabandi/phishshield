# PhishShield Dataset Directory

This directory contains the dataset used for training and evaluating the PhishShield phishing URL classification model.

## Dataset File

- **File**: `urls.csv`
- **Format**: Standard CSV (Comma-Separated Values), UTF-8 encoded.

## Expected Schema

| Column | Type | Description |
| :--- | :--- | :--- |
| `url` | String | The full URL string to be analyzed. |
| `label` | Integer | Binary classification ground truth: <br>• `1` = Phishing / Malicious <br>• `0` = Legitimate / Benign |

### CSV Header Specification

```csv
url,label
```

### Example Row Formats

```csv
url,label
https://login-secure.xyz/verify,1
https://google.com,0
```

## Guidelines

- Ensure URLs are trimmed of leading and trailing whitespace.
- Avoid quotes unless necessary for URLs containing commas.
- Balance legitimate and phishing samples to maintain fair training representation.
