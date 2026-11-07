import assert from "node:assert/strict";
import test from "node:test";
import { classifyUrl } from "../../lib/urlAcquisition/classifyUrl";
import { resolveSafeTikTokRedirect } from "../../lib/urlAcquisition/tiktokRedirect";
import { evaluateTikTokAcquisitionGuidance } from "../../lib/urlAcquisition/tiktokAcquisitionState";
import { detectUrlSource } from "../../lib/urlImport";

const VALID_VIDEO_ID = "7123456789012345678";
const VALID_USERNAME = "creator_user";
const CANONICAL_URL = `https://www.tiktok.com/@${VALID_USERNAME}/video/${VALID_VIDEO_ID}`;

test("classifyUrl recognizes and normalizes canonical desktop TikTok URLs", () => {
  const variations = [
    CANONICAL_URL,
    `https://tiktok.com/@${VALID_USERNAME}/video/${VALID_VIDEO_ID}`,
    `https://www.tiktok.com/@${VALID_USERNAME}/video/${VALID_VIDEO_ID}?is_from_webapp=1&sender_device=pc`,
    `https://www.tiktok.com/@${VALID_USERNAME}/video/${VALID_VIDEO_ID}?_r=1&utm_source=share`,
    `https://m.tiktok.com/@${VALID_USERNAME}/video/${VALID_VIDEO_ID}`,
  ];

  for (const url of variations) {
    const result = classifyUrl(url);
    assert.equal(result.kind, "SUPPORTED_TIKTOK");
    if (result.kind === "SUPPORTED_TIKTOK") {
      assert.equal(result.platform, "tiktok");
      assert.equal(result.videoId, VALID_VIDEO_ID);
      assert.equal(result.authorUsername, VALID_USERNAME);
      assert.equal(result.normalizedUrl, CANONICAL_URL);
    }
    assert.equal(detectUrlSource(url), "tiktok");
  }
});

test("classifyUrl recognizes mobile path /v/:id.html", () => {
  const mobileUrl = `https://m.tiktok.com/v/${VALID_VIDEO_ID}.html`;
  const result = classifyUrl(mobileUrl);
  assert.equal(result.kind, "SUPPORTED_TIKTOK");
  if (result.kind === "SUPPORTED_TIKTOK") {
    assert.equal(result.platform, "tiktok");
    assert.equal(result.videoId, VALID_VIDEO_ID);
    assert.equal(result.normalizedUrl, `https://www.tiktok.com/v/${VALID_VIDEO_ID}.html`);
  }
});

test("classifyUrl rejects non-video TikTok URLs safely as UNSUPPORTED_TIKTOK", () => {
  const nonVideoUrls = [
    `https://www.tiktok.com/@${VALID_USERNAME}`, // Profile
    `https://www.tiktok.com/@${VALID_USERNAME}/live`, // Live
    `https://www.tiktok.com/tag/dancechallenge`, // Tag
    `https://www.tiktok.com/music/original-sound-12345678`, // Audio/Sound
    `https://www.tiktok.com/@${VALID_USERNAME}/photo/${VALID_VIDEO_ID}`, // Photo/slideshow
    `http://www.tiktok.com/@${VALID_USERNAME}/video/${VALID_VIDEO_ID}`, // Insecure HTTP
    `https://user:pass@www.tiktok.com/@${VALID_USERNAME}/video/${VALID_VIDEO_ID}`, // Credential in URL
    `https://www.tiktok.com:8080/@${VALID_USERNAME}/video/${VALID_VIDEO_ID}`, // Explicit port
    `https://www.tiktok.com/@${VALID_USERNAME}/video/123`, // Too short snowflake ID
    `https://www.tiktok.com/@${VALID_USERNAME}/video/abcdef`, // Non-numeric snowflake ID
    "https://vm.tiktok.com/ZM1234567/", // Short URL before redirect resolution
    "https://vt.tiktok.com/ZS1234567/", // Short URL before redirect resolution
  ];

  for (const url of nonVideoUrls) {
    const result = classifyUrl(url);
    assert.equal(result.kind, "UNSUPPORTED_TIKTOK", `Expected UNSUPPORTED_TIKTOK for ${url}`);
  }
});

test("classifyUrl rejects phishing and lookalike hosts as UNSUPPORTED_URL", () => {
  const lookalikes = [
    `https://tiktok.com.evil.com/@${VALID_USERNAME}/video/${VALID_VIDEO_ID}`,
    `https://not-tiktok.com/@${VALID_USERNAME}/video/${VALID_VIDEO_ID}`,
    `https://tiktok.com@evil.com/@${VALID_USERNAME}/video/${VALID_VIDEO_ID}`,
  ];

  for (const url of lookalikes) {
    const result = classifyUrl(url);
    assert.equal(result.kind, "UNSUPPORTED_URL", `Expected UNSUPPORTED_URL for ${url}`);
  }
});

test("resolveSafeTikTokRedirect safely resolves short links without SSRF", async () => {
  const shortUrl = "https://vm.tiktok.com/ZM8rD3abc/";

  // Mock fetch function simulating a safe HEAD redirect response
  const mockFetch: typeof fetch = async (input, init) => {
    assert.equal(init?.method, "HEAD");
    assert.equal(init?.redirect, "manual");
    return new Response(null, {
      status: 301,
      headers: {
        Location: CANONICAL_URL,
      },
    });
  };

  const outcome = await resolveSafeTikTokRedirect(shortUrl, { fetchFn: mockFetch });
  assert.equal(outcome.status, "resolved");
  if (outcome.status === "resolved") {
    assert.equal(outcome.canonicalUrl, CANONICAL_URL);
    assert.equal(outcome.classification.videoId, VALID_VIDEO_ID);
    assert.equal(outcome.classification.authorUsername, VALID_USERNAME);
  }
});

test("resolveSafeTikTokRedirect blocks SSRF redirects to non-TikTok domains", async () => {
  const shortUrl = "https://vm.tiktok.com/ZM8rD3abc/";

  // Mock fetch simulating open redirect to an external/internal host
  const maliciousMockFetch: typeof fetch = async () => {
    return new Response(null, {
      status: 302,
      headers: {
        Location: "https://evil.attacker.com/steal-creds",
      },
    });
  };

  const outcome = await resolveSafeTikTokRedirect(shortUrl, { fetchFn: maliciousMockFetch });
  assert.equal(outcome.status, "not_tiktok");
});

test("resolveSafeTikTokRedirect limits redirect count and detects loops", async () => {
  const shortUrl = "https://vm.tiktok.com/ZMloop/";

  // Mock fetch simulating redirect loop within allowed domain
  const loopFetch: typeof fetch = async () => {
    return new Response(null, {
      status: 302,
      headers: {
        Location: "https://vt.tiktok.com/ZSloop/",
      },
    });
  };

  const outcome = await resolveSafeTikTokRedirect(shortUrl, {
    fetchFn: loopFetch,
    maxRedirects: 2,
    timeoutMs: 1000,
  });
  assert.equal(outcome.status, "unsupported");
  if (outcome.status === "unsupported") {
    assert.equal(outcome.reason, "too_many_redirects");
  }
});

test("evaluateTikTokAcquisitionGuidance provides clear user guidance and constraints", () => {
  const supported = classifyUrl(CANONICAL_URL);
  assert.equal(supported.kind, "SUPPORTED_TIKTOK");
  if (supported.kind === "SUPPORTED_TIKTOK") {
    const guidance = evaluateTikTokAcquisitionGuidance(supported);
    assert.equal(guidance.capability, "url_recognized_binary_restricted");
    assert.equal(guidance.isAutomatedDownloadAvailable, false);
    assert.equal(guidance.fileAccept, "video/mp4");
    assert.match(guidance.explanation, /TikTok公式API.*動画MP4バイナリ/);
    assert.match(guidance.actionRequired, /動画ファイル（MP4形式）を直接アップロード/);
  }

  const unsupportedGuidance = evaluateTikTokAcquisitionGuidance({ kind: "UNSUPPORTED_TIKTOK" });
  assert.equal(unsupportedGuidance.capability, "unsupported_link_type");
  assert.equal(unsupportedGuidance.isAutomatedDownloadAvailable, false);
});
