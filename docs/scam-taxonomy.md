# Rental Scam Taxonomy & Threat Kill Chain Analysis

This document outlines the operational kill chain observed across Indian rental portals and details the detection counter-signals implemented in FlatAudit.

---

## 1. The Indian Rental Scam Kill Chain

```
Stage 1: Fake Listing
  ├── Stolen High-End Photography (from Airbnb, luxury villas, Pinterest)
  ├── Bait Rent (40% to 70% below locality market median)
  └── Detection Signal: 64-bit dHash duplicate matching + Price z-score deviation
         │
         ▼
Stage 2: Lead Capture
  ├── High-volume listing flooding across portals
  ├── Rushed contact urgency ("Leaving country tonight", "14 people queued")
  └── Detection Signal: Locality posting velocity + Urgency phrase triggers
         │
         ▼
Stage 3: The Pretext & Excuse
  ├── Military / Defense officer transfer pretext (Army, CISF, Border posting)
  ├── Absentee NRI owner permanently relocated to London/US
  ├── Courier key delivery claim
  └── Detection Signal: Pattern matching on identity-pretexts
         │
         ▼
Stage 4: Advance-Fee Extortion
  ├── Demand for upfront "gate pass fee", "visiting token", "entry registration slip"
  ├── Assurance of "100% refund upon gate entry"
  ├── QR code / UPI payment before physical flat entry
  └── Detection Signal: Advance-fee phrase patterns & deposit ratio anomalies
```

---

## 2. Signal Matrix & Observable Facts Translation

To uphold the highest cybersecurity standards and avoid defamation, signals are converted into observable facts:

| Raw Trigger | Bad / Defamatory Output (Prohibited) | FlatAudit Observable Fact (Mandatory) |
| :--- | :--- | :--- |
| Phrase match: "army officer transferred" | "This poster is a fake military scammer." | `Claims military/defense transfer pretext` |
| Phrase match: "gate pass token before visit" | "Fraudulent fee detected! Do not pay." | `Demands advance visiting token/gate pass fee before physical inspection` |
| Rent ₹12,000 vs Median ₹52,000 | "Scam pricing bait." | `Rent of ₹12,000 is 77% below HSR Layout 3BHK median (₹52,000)` |
| 0 Security Deposit on furnished flat | "Fake zero deposit scam." | `Advertises zero security deposit, atypical for this market` |
| Photo dHash seen in 4 listings | "Stolen image from another website." | `This photo fingerprint has appeared across 4 distinct listings in the registry` |

---

## 3. False Positive Governance

### Legitimate Broker Photo Reuse
- In Indian metro real estate, licensed brokers often handle multiple units in the same newly constructed high-rise or builder-floor society. They frequently reuse official developer brochures or photos of a model apartment.
- **Rule**: Duplicate image matches alone trigger at most an informational notice (`Some signals`) unless accompanied by an advance-fee demand or severe price baiting.
