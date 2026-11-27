# Test and CI Verification Evidence

## 1. Test Harness & Commands
The repository uses the Node.js native test runner via `tsx`:
- Safe unit test execution: `npx tsx --test <test-file>`
- Full test suite: `npm test`
- Build verification: `npm run build`
- Runtime binary materialization: `npm run prebuild` (materializes packaged ffmpeg and yt-dlp binaries into `node_modules/.nexcut-runtime/`)

## 2. Real Execution Evidence (Phase 2.13 Audit)
- **Command**: `npx tsx --test tests/outputIngestion/referenceOutputIngestion.test.ts`
- **Output**:
  ```
  TAP version 13
  ok 1 - completes required and optional outputs in deterministic order
  ok 2 - optional failure is partial and required failure is failed
  ok 3 - store and registry unknown committed outcomes recover authoritatively
  ok 4 - unresolved unknown stops with recovery-required and no retry loop
  ok 5 - provenance unknown uses one authoritative lookup and continues
  ok 6 - cleanup unknown with unavailable lookup projects recovery-required
  ok 7 - journal replay returns terminal result without repeating capabilities
  ok 8 - journal CAS conflict classes stop safely
  ok 9 - semantic conflict, corruption and unavailable are safe failures
  ok 10 - cancellation stages stop subsequent persistence effects
  1..10
  # tests 10
  # pass 10
  # fail 0
  ```

## 3. Real Cryptographic Vector Hash Execution (Phase 2.22 / 2.23 Verification)
- **Script Executed**:
  ```javascript
  const crypto = require("node:crypto");
  const v1 = `{"a":"first","m":true,"z":100}`;
  const v2 = `{"exp":1000,"float":3.1415,"zero":0}`;
  const v3 = `{"text":"Hello\\nWorld! \\u0000 世界"}`;
  const v4 = `{"desc":null,"tags":["b","a"]}`;

  console.log("v1 len:", Buffer.byteLength(v1, "utf8"), "hash:", crypto.createHash("sha256").update(Buffer.from(v1, "utf8")).digest("hex"));
  console.log("v2 len:", Buffer.byteLength(v2, "utf8"), "hash:", crypto.createHash("sha256").update(Buffer.from(v2, "utf8")).digest("hex"));
  console.log("v3 len:", Buffer.byteLength(v3, "utf8"), "hash:", crypto.createHash("sha256").update(Buffer.from(v3, "utf8")).digest("hex"));
  console.log("v4 len:", Buffer.byteLength(v4, "utf8"), "hash:", crypto.createHash("sha256").update(Buffer.from(v4, "utf8")).digest("hex"));
  ```
- **Verified Output**:
  - `v1 len: 30 hash: 4870f53cf6c01d1c3a13e7855bade39df15e92d443c625a335c5ecccb52c1660`
  - `v2 len: 36 hash: c93b649801e1dc493d719e58dd913c83b48732b955f1e1aaad4ef0ca990f10af`
  - `v3 len: 38 hash: 1163eabe89a18adc5942517987f72367dbfea29e0676ebbb082f70d6535ebf28`
  - `v4 len: 30 hash: 4c78c765e5aa65eb32542a65f1d67fe4decfdd399bd655da5846fe16dee6a1d5`
