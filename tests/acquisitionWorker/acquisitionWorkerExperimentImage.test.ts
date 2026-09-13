import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const dockerfile = readFileSync("worker/acquisition/Dockerfile", "utf8");
const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

const acceptedInstrumentedYtDlpIdentity = Object.freeze({
  baseImage: "python:3.13.11-bookworm",
  baseImageDigest: "b3ad23176613a34fcd715a28da314a0cbbd230dcc68798efb80ec30292b2a683",
  baseYtDlpRevision: "2026.03.13",
  upstreamCommit: "990fdf36dd985403cb171e4b92d1d7f01a4e273d",
  sourceDateEpoch: "1773391500",
  pythonHashSeed: "0",
  patchSha256: "e3cfcb6950675dfce8c924a5f745e3269fece122bb2b8eb859fe36f01080486f",
  lockSha256: "c906b8cc980d738464a2dd51247854e5bacf577a35071ce103fc90d47ba9977b",
  artifactSha256: "53527d96649f8603af012fc310b213f350df82f7dca3af941d0891442c05cded",
});

test("the worker image projects one pinned yt-dlp build argument into binary and runtime authority", () => {
  assert.match(dockerfile, /ARG YT_DLP_VERSION=2026\.03\.13/g);
  assert.equal(dockerfile.match(/ARG YT_DLP_VERSION=2026\.03\.13/g)?.length, 2);
  assert.match(dockerfile, /ARG YT_DLP_BASE_VERSION=2026\.03\.13/);
  assert.match(dockerfile, /ARG YT_DLP_COMMIT=990fdf36dd985403cb171e4b92d1d7f01a4e273d/);
  assert.match(dockerfile, /COPY worker\/acquisition\/yt-dlp-token-observation\.patch \/src\/yt-dlp-token-observation\.patch/);
  assert.match(dockerfile, /git -C \/src\/yt-dlp apply --check \/src\/yt-dlp-token-observation\.patch/);
  assert.match(dockerfile, /git -C \/src\/yt-dlp apply \/src\/yt-dlp-token-observation\.patch/);
  assert.doesNotMatch(dockerfile, /releases\/download\/\$\{YT_DLP_VERSION\}\/yt-dlp_linux/);
  const patch = readFileSync("worker/acquisition/yt-dlp-token-observation.patch");
  assert.equal(sha256(patch), acceptedInstrumentedYtDlpIdentity.patchSha256);
  assert.match(dockerfile, /sed -i "s\/2026\\\\\.03\\\\\.13\/\$\{YT_DLP_VERSION\}\/g" worker\/acquisition\/dist\/lib\/server\/packagedYtDlp\.js/);
  assert.doesNotMatch(dockerfile, /(?:which|where)\s+yt-dlp|spawn\(["']yt-dlp|shell:\s*true|yt-dlp\s+-U/);
});

test("the instrumented yt-dlp packaging identity is completely and exactly pinned", () => {
  const lock = readFileSync("worker/acquisition/yt-dlp-build-requirements.lock");
  assert.equal(sha256(lock), acceptedInstrumentedYtDlpIdentity.lockSha256);
  assert.deepEqual(acceptedInstrumentedYtDlpIdentity, {
    baseImage: "python:3.13.11-bookworm",
    baseImageDigest: "b3ad23176613a34fcd715a28da314a0cbbd230dcc68798efb80ec30292b2a683",
    baseYtDlpRevision: "2026.03.13",
    upstreamCommit: "990fdf36dd985403cb171e4b92d1d7f01a4e273d",
    sourceDateEpoch: "1773391500",
    pythonHashSeed: "0",
    patchSha256: "e3cfcb6950675dfce8c924a5f745e3269fece122bb2b8eb859fe36f01080486f",
    lockSha256: "c906b8cc980d738464a2dd51247854e5bacf577a35071ce103fc90d47ba9977b",
    artifactSha256: "53527d96649f8603af012fc310b213f350df82f7dca3af941d0891442c05cded",
  });
  assert.ok(dockerfile.startsWith(
    `FROM ${acceptedInstrumentedYtDlpIdentity.baseImage}@sha256:${acceptedInstrumentedYtDlpIdentity.baseImageDigest} AS yt-dlp-build\n`,
  ));
  assert.match(dockerfile, /^ARG YT_DLP_BASE_VERSION=2026\.03\.13$/m);
  assert.match(dockerfile, /^ARG YT_DLP_COMMIT=990fdf36dd985403cb171e4b92d1d7f01a4e273d$/m);
  assert.match(dockerfile, /^ENV SOURCE_DATE_EPOCH=1773391500 \\$/m);
  assert.match(dockerfile, /^    PYTHONHASHSEED=0$/m);
  assert.match(dockerfile, /^COPY worker\/acquisition\/yt-dlp-token-observation\.patch \/src\/yt-dlp-token-observation\.patch$/m);
  assert.match(dockerfile, /^COPY worker\/acquisition\/yt-dlp-build-requirements\.lock \/src\/yt-dlp-build-requirements\.lock$/m);
  assert.match(dockerfile, /python -m pip install --no-cache-dir --require-hashes --no-deps --requirement \/src\/yt-dlp-build-requirements\.lock/);
  assert.doesNotMatch(dockerfile, /python -m pip install(?:(?!--require-hashes|\n).)*(?:\n|$)/);
});

test("the worker image can isolate one explicit player client without changing the default", () => {
  assert.match(dockerfile, /ARG YOUTUBE_PLAYER_CLIENT=mweb/);
  assert.match(dockerfile, /ARG YOUTUBE_PLAYER_CLIENT_TELEMETRY=MWEB/);
  assert.match(dockerfile, /youtube:player_client=\$\{YOUTUBE_PLAYER_CLIENT\}/);
  assert.match(dockerfile, /YOUTUBE_PLAYER_CLIENT_TELEMETRY/);
  assert.doesNotMatch(dockerfile, /player_client=default|player_client=mweb,/);
});

test("the worker image can isolate an exact HLS-only selector and native downloader without changing defaults", () => {
  assert.match(dockerfile, /ARG YOUTUBE_FORMAT_SELECTOR=bv\*\+ba\/b/);
  assert.match(dockerfile, /ARG YOUTUBE_DOWNLOADER=/);
  assert.match(dockerfile, /\$\{YOUTUBE_FORMAT_SELECTOR\}/);
  assert.match(dockerfile, /\$\{YOUTUBE_DOWNLOADER\}/);
  assert.match(dockerfile, /! grep -F "\\\"--downloader\\\""/);
  assert.doesNotMatch(dockerfile, /best\[protocol\^=m3u8\]|m3u8:native|web_safari/);
});
