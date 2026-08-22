import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dockerfile = readFileSync("worker/acquisition/Dockerfile", "utf8");

test("the worker image projects one pinned yt-dlp build argument into binary and runtime authority", () => {
  assert.match(dockerfile, /ARG YT_DLP_VERSION=2026\.03\.13/g);
  assert.equal(dockerfile.match(/ARG YT_DLP_VERSION=2026\.03\.13/g)?.length, 2);
  assert.match(dockerfile, /releases\/download\/\$\{YT_DLP_VERSION\}\/yt-dlp_linux/);
  assert.match(dockerfile, /sed -i "s\/2026\\\\\.03\\\\\.13\/\$\{YT_DLP_VERSION\}\/g" worker\/acquisition\/dist\/lib\/server\/packagedYtDlp\.js/);
  assert.doesNotMatch(dockerfile, /(?:which|where)\s+yt-dlp|spawn\(["']yt-dlp|shell:\s*true|yt-dlp\s+-U/);
});
