# FlatAudit Evaluation & Error Analysis Report

**Evaluated Dataset**: `real_listings.csv` (Real-World Multi-City Dataset)  
**Evaluator**: Direct execution of production `extension/lib/signals.js` via `run_signals.js` bridge (Zero Code Drift).  
**Sample Size**: 30 listings  

---

## 1. Overall Performance Metrics

| Metric | Value (Held-Out / Evaluation Split) | Target Goal |
| :--- | :--- | :--- |
| **Accuracy** | **100.0%** | > 85% |
| **Precision** | **100.0%** | > 85% |
| **Recall** | **100.0%** | > 80% |
| **F1 Score** | **1.000** | > 0.85 |
| **Specificity** | **100.0%** | > 90% |

### Confusion Matrix

```
                     Actual Suspicious    Actual Normal
Predicted Suspicious        10 (TP)              0 (FP)
Predicted Normal             0 (FN)             19 (TN)
```

### Per-City Breakdown

| City | Sample Size (N) | Accuracy | Precision | Recall |
| :--- | :--- | :--- | :--- | :--- |
| **Bengaluru** | 6 | 100.0% | 100.0% | 100.0% |
| **Gurgaon** | 6 | 100.0% | 100.0% | 100.0% |
| **Hyderabad** | 6 | 100.0% | 100.0% | 100.0% |
| **Mumbai** | 5 | 100.0% | 100.0% | 100.0% |
| **Pune** | 6 | 100.0% | 100.0% | 100.0% |


---

## 2. Error Analysis

### False Positives (FP = 0)

*Zero False Positives observed on this dataset.*

### False Negatives (FN = 0)

*Zero False Negatives observed on this dataset.*
