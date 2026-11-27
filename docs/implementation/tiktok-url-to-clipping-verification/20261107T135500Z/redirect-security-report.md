# TikTok Redirect Security & SSRF Protection Verification Report

**Verification Timestamp:** `2026-11-07T13:55:00Z`
**Evaluator:** Jules (Software Engineer)

---

## 1. Security Architecture & Controls

The TikTok short URL redirect resolver (`lib/urlAcquisition/tiktokRedirect.ts`) implements defence-in-depth against Server-Side Request Forgery (SSRF), DNS rebinding, redirect loops, and uncontrolled binary stream downloads:

1. **Strict Hostname Allowlist:**
   - Only explicitly trusted hosts are allowed on the initial request AND every subsequent redirect hop:
     `["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"]`
   - Rejects loopback addresses (`127.0.0.1`, `localhost`), private RFC 1918 networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local/cloud metadata (`169.254.169.254`), and third-party lookalike domains.

2. **Strict Protocol and Port Constraints:**
   - Scheme must be `https:`.
   - Credentials (`user:password`) and non-standard ports are prohibited.

3. **Bounded Redirect Depth:**
   - Maximum redirect depth is capped at 3 hops (`MAX_REDIRECT_DEPTH = 3`).
   - Infinite redirect loops immediately terminate with `{ status: "unsupported", reason: "too_many_redirects" }`.

4. **Timeout Bounding:**
   - Enforces an `AbortController` signal with default 5000ms timeout (`DEFAULT_TIMEOUT_MS = 5000`).

5. **Manual Redirect & HEAD-Only Invocations:**
   - Uses `method: "HEAD"` and `redirect: "manual"`.
   - The runtime inspects the `Location` header before deciding whether the next hop is permitted, preventing client libraries from automatically fetching malicious payloads.

## 2. Test Execution & Results

| Test Scenario | Test Implementation | Expected Behavior | Actual Result |
|---|---|---|---|
| Valid 2-hop short URL | Simulated `vm.tiktok.com` -> `m.tiktok.com` -> `www.tiktok.com/@creator/video/:id` | Resolves to canonical desktop URL | PASS |
| SSRF to external host | Redirect `Location` points to `https://evil-hacker.com/steal` | Terminates with `status: "not_tiktok"` | PASS |
| Loop / Hop Limit Exceeded | Circular redirect or > 3 hops | Terminates with `status: "unsupported", reason: "too_many_redirects"` | PASS |
| Immediate Valid Target | Target is already canonical video URL | Returns without network request | PASS |

- **Suite:** `tests/urlAcquisition/classifyTikTokUrl.test.ts`
- **Result:** PASS (All 8 subtests passed)
- **Raw Log Reference:** `raw-test-logs/classify-tiktok-url.log`
