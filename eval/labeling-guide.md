# Listing Trust Analyzer: Rental Listing Annotation & Labeling Guide

This document standardizes the labeling process for evaluating the FlatAudit Scam Signal Detector. Every listing is categorized as either `normal` (0) or `suspicious` (1), accompanied by an objective rationale.

---

## 1. Ground Rules for Annotators

1. **Evidence-Based Annotation**: Only label based on explicit, verifiable signals in the listing title, overview metrics (rent, deposit, BHK, locality), and description text.
2. **Never Speculate on Intent**: Do not guess whether a poster is benevolent or malicious. Focus solely on whether the listing exhibits established scam kill chain patterns.
3. **Dual Review**: 20 randomly selected listings must be blind-reannotated after 48 hours to assess intra-annotator agreement (Cohen's Kappa).

---

## 2. Classification Schema

### Class 0: `normal`
A standard legitimate rental posting that aligns with customary Indian market practices:
- **Rent**: Within ±35% of local locality/BHK median.
- **Deposit**: Conforms to city norms:
  - *Bengaluru*: 3 to 6 months of rent (traditional offline was 10 months, but portal average is 3–5 months).
  - *Mumbai*: 2 to 4 months of rent.
  - *Delhi-NCR*: 1 to 2 months of rent.
  - *Pune / Hyderabad*: 1 to 3 months of rent.
- **Inspection Protocol**: Physical inspection allowed on-site with owner, current tenant, broker, or society security guard without mandatory upfront financial payment.
- **Tone**: Matter-of-fact descriptions detailing amenities, direction, parking, furnish status, and society restrictions.

### Class 1: `suspicious`
A listing exhibiting one or more known rental advance-fee fraud patterns:

#### A. Advance-Fee / Gate Pass Demands (Highest Weight)
- Demand for a "visiting token", "gate entry pass fee", "visiting card registration fee", or "entry slip" (typically ₹1,000–₹4,000) prior to viewing the flat in person.
- Promise that the fee is "100% refundable upon gate entry" or "deductible from rent".
- Request to send money via UPI QR code or WhatsApp scanner before visiting.

#### B. Identity Impersonation / Defense Pretext
- Poster claims to be an Army, Air Force, Navy, CISF, or CRPF defense officer.
- Pretext: "Urgent transfer to border/Srinagar", "duty posting", or "transferred out of station".
- Flat described as fully furnished with lavish amenities at an absurdly suppressed rent ("money is not my motive, only need decent family to maintain").

#### C. Absentee Owner & Courier Key Pretext
- Owner claims to be permanently relocated abroad (UK, USA, Gulf) with keys deposited with a courier or defense parcel service.
- Refuses in-person handover without advance token.

#### D. Severe Price Baiting
- Rent priced >45% below locality/BHK market benchmarks to maximize lead capture volume.
- Zero security deposit advertised on high-end luxury apartments combined with high-urgency language.

---

## 3. Ambiguous Edge Cases & Protocol

| Scenario | Label | Rationale |
| :--- | :--- | :--- |
| **Legitimate Broker Reusing Photos** | `normal` (unless combined with advance fee) | Real estate brokers in India frequently reuse standard model flat or builder photos for multiple units in the same apartment complex. Photo reuse alone is a hint, not proof. |
| **Bachelors vs Family Restrictions** | `normal` | Common portal criteria; not an indicator of scam. |
| **High Maintenance Charges** | `normal` | High society maintenance (₹8,000/mo) is standard in luxury societies. |
| **Unresponsive / Stale Listing** | `normal` | Stale or rented-out flats are portal hygiene issues, not advance-fee fraud. |
| **Zero Deposit with High Rent** | `normal` | FinTech deposit-financing schemes (e.g. NoBroker Pay, CirclePe) exist legally. Only flag if paired with advance token demand. |

---

## 4. Dataset Schema (`labels.csv`)

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | Integer | Unique identifier (1..250) |
| `city` | String | City (Bengaluru, Mumbai, Gurgaon, Pune, Hyderabad, Delhi) |
| `locality` | String | Sub-locality (e.g., Indiranagar, HSR Layout, Powai) |
| `bhk` | Integer | Number of bedrooms (1, 2, 3) |
| `rent` | Integer | Monthly rent in INR |
| `deposit` | Integer | Security deposit in INR |
| `title` | String | Listing headline |
| `description` | String | Listing description text |
| `image_hash` | String | 16-hex char dHash of primary photo |
| `is_duplicate_photo`| Boolean | True if image hash appears in multiple records |
| `label` | String | `normal` or `suspicious` |
| `reason` | String | Plain-language observable reason for label |
| `split` | String | `train` (70%) or `test` (30%) |
