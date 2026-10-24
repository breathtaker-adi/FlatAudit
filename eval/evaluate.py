"""
FlatAudit Evaluation Harness
Evaluates the single source of truth (extension/lib/signals.js) on benchmark datasets.
Outputs Precision, Recall, F1, Confusion Matrix, Per-City Metrics, and Error Analysis.

Usage:
  python eval/evaluate.py                               # Defaults to synthetic unit-test data
  python eval/evaluate.py --dataset eval/real_listings.csv # Real multi-city dataset
"""

import csv
import json
import subprocess
import sys
import argparse
from pathlib import Path
from typing import Dict, Any, List

def run_js_signals(listings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Executes the shipped production signals.js via eval/run_signals.js bridge
    to guarantee zero code drift between evaluation and production extension.
    """
    bridge_script = Path(__file__).parent / "run_signals.js"
    payload = json.dumps(listings)

    proc = subprocess.run(
        ["node", str(bridge_script)],
        input=payload,
        text=True,
        capture_output=True,
        encoding="utf-8"
    )

    if proc.returncode != 0:
        print(f"Error executing run_signals.js: {proc.stderr}", file=sys.stderr)
        sys.exit(1)

    return json.loads(proc.stdout)

def compute_metrics(y_true: List[int], y_pred: List[int]) -> Dict[str, float]:
    tp = sum(1 for yt, yp in zip(y_true, y_pred) if yt == 1 and yp == 1)
    fp = sum(1 for yt, yp in zip(y_true, y_pred) if yt == 0 and yp == 1)
    tn = sum(1 for yt, yp in zip(y_true, y_pred) if yt == 0 and yp == 0)
    fn = sum(1 for yt, yp in zip(y_true, y_pred) if yt == 1 and yp == 0)

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (2 * precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
    accuracy = (tp + tn) / len(y_true) if len(y_true) > 0 else 0.0
    specificity = tn / (tn + fp) if (tn + fp) > 0 else 0.0

    return {
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "accuracy": accuracy,
        "specificity": specificity
    }

def run_evaluation(csv_path: str = "eval/labels.csv"):
    path = Path(csv_path)
    if not path.exists():
        print(f"Dataset {csv_path} not found.")
        return

    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    is_synthetic = "labels.csv" in path.name
    dataset_type = "Synthetic Unit-Test Dataset (Rules Baseline)" if is_synthetic else "Real-World Multi-City Dataset"

    train_rows = [r for r in rows if r.get("split") == "train"]
    test_rows = [r for r in rows if r.get("split") == "test"]

    if not test_rows:
        test_rows = rows
        train_rows = rows

    print(f"\nLoaded {len(rows)} listings from {csv_path} [{dataset_type}]")
    print(f"Evaluating directly using production engine: extension/lib/signals.js (Zero Drift)")

    # 1. Evaluate Train Set (if applicable)
    train_metrics = None
    if train_rows and train_rows != test_rows:
        train_results = run_js_signals(train_rows)
        y_train_true = [1 if r["label"] == "suspicious" else 0 for r in train_rows]
        y_train_pred = [1 if res["isSuspicious"] else 0 for res in train_results]
        train_metrics = compute_metrics(y_train_true, y_train_pred)

    # 2. Evaluate Test Set
    test_results = run_js_signals(test_rows)
    y_test_true = [1 if r["label"] == "suspicious" else 0 for r in test_rows]
    y_test_pred = [1 if res["isSuspicious"] else 0 for res in test_results]
    test_metrics = compute_metrics(y_test_true, y_test_pred)

    # 3. Per-City Analysis (if city column present)
    city_metrics = {}
    cities = sorted(list(set(r.get("city", "Unknown") for r in test_rows if r.get("city"))))
    for city in cities:
        city_indices = [idx for idx, r in enumerate(test_rows) if r.get("city") == city]
        if city_indices:
            cy_true = [y_test_true[i] for i in city_indices]
            cy_pred = [y_test_pred[i] for i in city_indices]
            city_metrics[city] = {
                "n": len(city_indices),
                "metrics": compute_metrics(cy_true, cy_pred)
            }

    # 4. Error Analysis
    false_positives = []
    false_negatives = []

    for r, res in zip(test_rows, test_results):
        true_label = 1 if r["label"] == "suspicious" else 0
        pred_label = 1 if res["isSuspicious"] else 0
        if true_label == 0 and pred_label == 1:
            false_positives.append((r, res["observableFacts"]))
        elif true_label == 1 and pred_label == 0:
            false_negatives.append((r, res["observableFacts"]))

    # Console Summary
    print("\n" + "="*55)
    print(f"FLATAUDIT EVALUATION RESULTS ({path.name})")
    print(f"Classification: {dataset_type}")
    print("="*55)
    print(f"Accuracy:    {test_metrics['accuracy']*100:.1f}%")
    print(f"Precision:   {test_metrics['precision']*100:.1f}%")
    print(f"Recall:      {test_metrics['recall']*100:.1f}%")
    print(f"F1-Score:    {test_metrics['f1']:.3f}")
    print(f"Specificity: {test_metrics['specificity']*100:.1f}%")
    print("\nConfusion Matrix:")
    print(f"  True Positives (TP):  {test_metrics['tp']}")
    print(f"  False Positives (FP): {test_metrics['fp']}")
    print(f"  True Negatives (TN):  {test_metrics['tn']}")
    print(f"  False Negatives (FN): {test_metrics['fn']}")

    if city_metrics:
        print("\nPer-City Performance Breakdown:")
        print(f"  {'City':<15} {'N':<5} {'Accuracy':<10} {'Precision':<10} {'Recall':<10}")
        print("  " + "-"*48)
        for c, data in city_metrics.items():
            m = data["metrics"]
            print(f"  {c:<15} {data['n']:<5} {m['accuracy']*100:6.1f}%    {m['precision']*100:6.1f}%    {m['recall']*100:6.1f}%")
    print("="*55)

    # Generate Markdown Report
    output_filename = "evaluation_real_results.md" if not is_synthetic else "evaluation_results.md"
    report_path = Path("eval") / output_filename

    per_city_table = ""
    if city_metrics:
        per_city_table = "### Per-City Breakdown\n\n| City | Sample Size (N) | Accuracy | Precision | Recall |\n| :--- | :--- | :--- | :--- | :--- |\n"
        for c, data in city_metrics.items():
            m = data["metrics"]
            per_city_table += f"| **{c}** | {data['n']} | {m['accuracy']*100:.1f}% | {m['precision']*100:.1f}% | {m['recall']*100:.1f}% |\n"

    report_content = f"""# FlatAudit Evaluation & Error Analysis Report

**Evaluated Dataset**: `{path.name}` ({dataset_type})  
**Evaluator**: Direct execution of production `extension/lib/signals.js` via `run_signals.js` bridge (Zero Code Drift).  
**Sample Size**: {len(rows)} listings  

---

## 1. Overall Performance Metrics

| Metric | Value (Held-Out / Evaluation Split) | Target Goal |
| :--- | :--- | :--- |
| **Accuracy** | **{test_metrics['accuracy']*100:.1f}%** | > 85% |
| **Precision** | **{test_metrics['precision']*100:.1f}%** | > 85% |
| **Recall** | **{test_metrics['recall']*100:.1f}%** | > 80% |
| **F1 Score** | **{test_metrics['f1']:.3f}** | > 0.85 |
| **Specificity** | **{test_metrics['specificity']*100:.1f}%** | > 90% |

### Confusion Matrix

```
                     Actual Suspicious    Actual Normal
Predicted Suspicious        {test_metrics['tp']:2d} (TP)             {test_metrics['fp']:2d} (FP)
Predicted Normal            {test_metrics['fn']:2d} (FN)             {test_metrics['tn']:2d} (TN)
```

{per_city_table}

---

## 2. Error Analysis

### False Positives (FP = {len(false_positives)})
"""
    if false_positives:
        for idx, (fp_row, facts) in enumerate(false_positives, 1):
            report_content += f"""
**FP #{idx} - Listing #{fp_row.get('id', 'N/A')}**: {fp_row.get('title', '')}  
- **City**: {fp_row.get('city', 'N/A')} | **Locality**: {fp_row.get('locality', '')} | **Rent**: ₹{int(float(fp_row.get('rent', 0))):,} | **Deposit**: ₹{int(float(fp_row.get('deposit', 0))):,}
- **Fired Facts**: {'; '.join(facts)}
"""
    else:
        report_content += "\n*Zero False Positives observed on this dataset.*\n"

    report_content += f"""
### False Negatives (FN = {len(false_negatives)})
"""
    if false_negatives:
        for idx, (fn_row, facts) in enumerate(false_negatives, 1):
            report_content += f"""
**FN #{idx} - Listing #{fn_row.get('id', 'N/A')}**: {fn_row.get('title', '')}  
- **City**: {fn_row.get('city', 'N/A')} | **Locality**: {fn_row.get('locality', '')} | **Rent**: ₹{int(float(fn_row.get('rent', 0))):,} | **Deposit**: ₹{int(float(fn_row.get('deposit', 0))):,}
- **Fired Facts**: {'; '.join(facts) if facts else 'None'}
"""
    else:
        report_content += "\n*Zero False Negatives observed on this dataset.*\n"

    report_path.write_text(report_content, encoding="utf-8")
    print(f"Written detailed evaluation report to {report_path.resolve()}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate FlatAudit trust signals on labeled datasets")
    parser.add_argument("--dataset", default="eval/labels.csv", help="Path to CSV dataset file")
    args = parser.parse_args()
    run_evaluation(args.dataset)
