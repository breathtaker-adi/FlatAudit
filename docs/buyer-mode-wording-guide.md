# FlatAudit Buyer Mode: Editorial Wording Guide & Anti-Defamation Policy

**Status**: Active Standard  
**Version**: 1.0.0  
**Pilot Jurisdiction**: Karnataka (Bengaluru) — Karnataka Real Estate Regulatory Authority (K-RERA)  
**Objective**: Present verified public records and observable listing facts with source links and timestamps. Never provide evaluative labels, legal endorsements, or builder reputations.

---

## 1. Core Principles

1. **Facts with Sources, Never a Verdict**: FlatAudit never produces an overall "builder score", "project safety rating", or "good/bad" label. Every fact displayed must link to its official source (e.g. K-RERA portal, portal listing URL, Kaveri 2.0 guidance rate).
2. **Always Show Denominators**: Never say "delayed 3 times" without the context. State: *"Dates revised in 3 of 8 projects with both dates available"*.
3. **Key by RERA Number, Not Builder Name**: Real estate developers frequently register individual projects under distinct Special Purpose Vehicles (LLPs, private limited entities). Always use the official state RERA registration ID as the primary key. If matching by trade name, explicitly append a disclaimer: *"LLP/company entity registration — not legally confirmed to be the parent brand"*.
4. **Never Treat Absence as Clearance**: If a field is missing or not declared, output: *"Information not found in public records"* or *"Complaint data: not disclosed on this portal"*. Never display *"No issues found"* or *"Zero complaints"*.
5. **Mandatory Caveats on Every Report**: Every summary must state:
   > *"This report summarizes visible portal information and official government records as of [date]. It does not constitute legal, architectural, or financial advice and does not verify property title or encumbrances. Consult an independent advocate before paying any token or signing an agreement."*

---

## 2. Allowed vs. Banned Vocabulary

### 10 Strictly Allowed Phrasings
| Allowed Phrasing | Context / Rationale |
| :--- | :--- |
| `✓ Declared completion date met without revision as per official records` | Project delivered within Form B timeline |
| `⚠ Completion date was revised [N] times (original: [D1], revised: [D2]); see official page` | Factual timeline extension |
| `? RERA ID [ID] extracted. Check official K-RERA search for filings` | ID identified; awaiting official document review |
| `Dates revised in X of Y projects with both dates available` | Promoter track record with explicit denominator |
| `Average revision length: X months where both dates exist` | Mathematical average over disclosed records |
| `Litigation field: 'None declared' as of [date]` | Direct transcription of promoter's Form B declaration |
| `Litigation disclosed: [N] matter(s) pending before authority` | Factual disclosure from official filings |
| `Data completeness: X of Y standard fields found` | Transparent transparency metric |
| `Price per sq ft is near typical range for X similar listings (carpet area basis)` | Comparative statistical observation |
| `Not confirmed to be the same builder entity` | Clarification when joining projects across entities |

### 10 Strictly Banned Phrasings
| Banned Phrasing | Reason for Ban |
| :--- | :--- |
| ❌ `Reliable builder` / `Top builder` | Evaluative subjective label; defamation risk |
| ❌ `Bad builder` / `Risky promoter` | Defamatory subjective label |
| ❌ `Safe project` / `100% Legal` | False sense of security; does not verify title |
| ❌ `Approved investment` / `Good deal` | Unregulated financial advice |
| ❌ `No legal issues` | Absence of evidence is not evidence of absence |
| ❌ `Clean title verified` | Browser extensions cannot verify physical land records |
| ❌ `Fraudulent / Scam developer` | Criminal accusation requiring judicial finding |
| ❌ `Grade A+ Builder` | Fabricated composite rating system |
| ❌ `RERA Certified / RERA Guaranteed` | RERA registers projects; it does not "certify" quality |
| ❌ `Zero complaints` | Portal may simply not publish complaint ledgers |

---

## 3. Four-Line Summary Architecture

Buyer Mode presents all property findings in an objective 4-line format using standard indicators (`✓` Verified Fact, `⚠` Noteworthy Discrepancy, `?` Unverified / Manual Verification Required):

1. **Flat Line**:
   - Compares price per sq ft strictly on the **same area type** (Carpet vs Carpet).
   - Notes floor, age, and duplicate photo or token-to-hold flags if observed.
2. **Project Line**:
   - Identifies K-RERA registration status.
   - Compares original Form B completion date against latest revised date.
3. **Builder Line**:
   - Discloses promoter's past project count, completion revision frequency, and litigation declaration.
4. **Paperwork Line**:
   - Explicitly confirms what FlatAudit **cannot** check (title deed, encumbrance, sanctions) and links to the scenario-specific checklist.
