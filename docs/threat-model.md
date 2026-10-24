# Threat Model & Security Architecture: FlatAudit (Listing Trust Analyzer)

**System**: FlatAudit (Listing Trust Analyzer)  
**Methodology**: STRIDE (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege)  
**Standard**: OWASP Threat Modeling & Privacy by Design  

---

## 1. System Architecture & Trust Boundaries

```
[ UNTRUSTED DOMAIN: Rental Portal Web Page ]
  │  (Contains arbitrary user-generated titles, descriptions, malicious markup)
  │
════════════════════════ TRUST BOUNDARY 1 ═══════════════════════════════════
  │
  ▼ (Reads visible text via strict DOM selectors)
[ EXTENSION CONTENT SCRIPT ]
  │  - Isolated World execution
  │  - Zero innerHTML; DOM built with textContent
  │
════════════════════════ TRUST BOUNDARY 2 ═══════════════════════════════════
  │  (Internal Message Passing: chrome.runtime.sendMessage)
  ▼
[ EXTENSION SERVICE WORKER (Background) ]
  │  - OffscreenCanvas dHash generation (64-bit difference hash)
  │  - Ephemeral buffer discarded immediately
  │
════════════════════════ TRUST BOUNDARY 3 ═══════════════════════════════════
  │  (HTTP / REST with strict CORS and Pydantic validation)
  ▼
[ FASTAPI BACKEND & SQLITE REGISTRY ]
  │  - Parameterized SQL queries
  │  - Stores only: locality, bhk, rent, deposit, 16-hex image_hash
  │  - Zero PII (no names, no phone numbers, no images stored)
```

---

## 2. STRIDE Threat Matrix & Mitigations

### 1. Spoofing
| Threat ID | Threat Description | Severity | Mitigation in FlatAudit | Status |
| :--- | :--- | :--- | :--- | :--- |
| **S-01** | Malicious webpage sends forged messages to content script | High | Content scripts use extension-internal messaging (`chrome.runtime.sendMessage`); they do not listen to window `postMessage` from untrusted page scripts. | **Mitigated** |
| **S-02** | Rogue client submits bogus listing observations to API | Medium | Pydantic strict schema validation with numeric range bounds (`rent` 1k–5M, `bhk` 1–10, `image_hash` exact 16-hex chars). Rate limiting per IP. | **Mitigated** |

### 2. Tampering
| Threat ID | Threat Description | Severity | Mitigation in FlatAudit | Status |
| :--- | :--- | :--- | :--- | :--- |
| **T-01** | Malicious listing injects XSS payloads via title/description into badge | Critical | **Zero `innerHTML` policy**: All badge UI nodes are instantiated using `document.createElement()`, and page data is applied exclusively via `.textContent`. Browser auto-escapes all HTML entities. | **Mitigated** |
| **T-02** | SQL Injection via locality or URL parameters | High | SQLite queries in `db.py` use parameterized placeholders (`?`) exclusively; zero string concatenation. | **Mitigated** |
| **T-03** | Canvas pixel tampering via third-party ads | Medium | Image fetching and hashing is delegated to the background service worker using `createImageBitmap` and `OffscreenCanvas`, isolating canvas reads from page JavaScript. | **Mitigated** |

### 3. Repudiation & Defamation Liability
| Threat ID | Threat Description | Severity | Mitigation in FlatAudit | Status |
| :--- | :--- | :--- | :--- | :--- |
| **R-01** | Accusing innocent landlords of fraud/crime leading to legal liability | High | **Observable Facts Principle**: The system never uses defamatory terms ("scammer", "fraudster", "criminal"). Output labels are strictly `Looks normal`, `Some signals`, `Many signals`. Badges only state verifiable facts (e.g. *"Rent is 78% below HSR median"*, *"Photo appeared in 4 other listings"*). | **Mitigated** |
| **R-02** | Auditability of model decisions | Low | Every signal evaluation returns explicit `{fired, reason, details}` metadata retained in memory. | **Mitigated** |

### 4. Information Disclosure (Privacy by Design)
| Threat ID | Threat Description | Severity | Mitigation in FlatAudit | Status |
| :--- | :--- | :--- | :--- | :--- |
| **I-01** | Leaking tenant browsing history or phone numbers | High | **Privacy by Design**: FlatAudit parses only the listing being viewed on demand. Phone numbers, contact tokens, and broker identities are explicitly discarded and never sent to the backend. | **Mitigated** |
| **I-02** | Storing copyrighted listing photography | Medium | Only 64-bit perceptual hashes (16 hex chars) are stored; raw image files are never written to disk or sent to backend storage. | **Mitigated** |

### 5. Denial of Service (DoS)
| Threat ID | Threat Description | Severity | Mitigation in FlatAudit | Status |
| :--- | :--- | :--- | :--- | :--- |
| **D-01** | Regular Expression Denial of Service (ReDoS) via massive page text | Medium | Phrase matching uses linear, non-backtracking regular expressions evaluated on substring slices. | **Mitigated** |
| **D-02** | Image decompression bomb crashing the browser tab | Medium | Service worker limits image processing to the first 3 images, downscaled immediately to 9x8 resolution. | **Mitigated** |

### 6. Elevation of Privilege
| Threat ID | Threat Description | Severity | Mitigation in FlatAudit | Status |
| :--- | :--- | :--- | :--- | :--- |
| **E-01** | Manifest V3 permissions abuse | High | Manifest permissions trimmed strictly to `storage` and localhost/portal host matches. No `webRequestBlocking`, no `cookies`, no `management`. | **Mitigated** |
| **E-02** | Remote code execution via `eval()` | Critical | Strict Content Security Policy (`script-src 'self'; object-src 'self'`). Zero dynamic code execution. | **Mitigated** |

---

## 3. Residual Risks & Accepted Constraints

1. **Legitimate Image Reuse**: Real estate builders and multi-unit brokers frequently reuse model 3D renderings across genuine flats. As documented, this remains an accepted signal caveat: photo reuse is treated as a supporting hint, never standalone proof of fraud.
2. **Localhost API Binding**: In development mode, the FastAPI backend binds to `127.0.0.1:8000`. Production deployment requires TLS termination with token-bucket rate limiting.
