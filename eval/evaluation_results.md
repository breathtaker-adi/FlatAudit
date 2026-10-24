# FlatAudit Evaluation & Error Analysis Report

**Evaluated Dataset**: `labels.csv` (Synthetic Unit-Test Dataset (Rules Baseline))  
**Evaluator**: Direct execution of production `extension/lib/signals.js` via `run_signals.js` bridge (Zero Code Drift).  
**Sample Size**: 250 listings  

---

## 1. Overall Performance Metrics

| Metric | Value (Held-Out / Evaluation Split) | Target Goal |
| :--- | :--- | :--- |
| **Accuracy** | **97.3%** | > 85% |
| **Precision** | **95.1%** | > 85% |
| **Recall** | **100.0%** | > 80% |
| **F1 Score** | **0.975** | > 0.85 |
| **Specificity** | **94.4%** | > 90% |

### Confusion Matrix

```
                     Actual Suspicious    Actual Normal
Predicted Suspicious        39 (TP)              2 (FP)
Predicted Normal             0 (FN)             34 (TN)
```

### Per-City Breakdown

| City | Sample Size (N) | Accuracy | Precision | Recall |
| :--- | :--- | :--- | :--- | :--- |
| **Bengaluru** | 25 | 96.0% | 93.3% | 100.0% |
| **Gurgaon** | 14 | 92.9% | 83.3% | 100.0% |
| **Mumbai** | 25 | 100.0% | 100.0% | 100.0% |
| **Pune** | 11 | 100.0% | 100.0% | 100.0% |


---

## 2. Error Analysis

### False Positives (FP = 2)

**FP #1 - Listing #65**: 1 BHK Apartment for Rent in Whitefield, Bengaluru  
- **City**: Bengaluru | **Locality**: Whitefield | **Rent**: ₹20,000 | **Deposit**: ₹89,000
- **Fired Facts**: Photo fingerprint has appeared across 4 distinct listings in the registry

**FP #2 - Listing #41**: 1 BHK Apartment for Rent in DLF Phase 2, Gurgaon  
- **City**: Gurgaon | **Locality**: DLF Phase 2 | **Rent**: ₹19,500 | **Deposit**: ₹58,000
- **Fired Facts**: Photo fingerprint has appeared across 4 distinct listings in the registry

### False Negatives (FN = 0)

*Zero False Negatives observed on this dataset.*
