import assert from "node:assert/strict";
import test from "node:test";

import { createDirectorDecision } from "@/lib/directorDecisionEngine";
import { createEmotionGraph } from "@/lib/emotionEngine";
import {
  buildReferenceMusicRequest,
  normalizeReferenceMusicError,
  normalizeReferenceMusicResponse,
  REFERENCE_MUSIC_ADAPTER_ID,
  REFERENCE_MUSIC_ADAPTER_VERSION,
  REFERENCE_MUSIC_CAPABILITY,
  REFERENCE_MUSIC_PROVIDER_API_VERSION,
  REFERENCE_MUSIC_PROVIDER_ID,
  referenceMusicAdapter,
  validateReferenceMusicInput,
  type ReferenceMusicAdapterInput,
} from "@/lib/providers/referenceMusicAdapter";
import {
  buildReferenceVocalRequest,
  normalizeReferenceVocalError,
  normalizeReferenceVocalResponse,
  REFERENCE_VOCAL_ADAPTER_ID,
  REFERENCE_VOCAL_ADAPTER_VERSION,
  REFERENCE_VOCAL_CAPABILITY,
  REFERENCE_VOCAL_PROVIDER_API_VERSION,
  REFERENCE_VOCAL_PROVIDER_ID,
  referenceVocalAdapter,
  validateReferenceVocalInput,
  type ReferenceVocalAdapterInput,
} from "@/lib/providers/referenceVocalAdapter";
import {
  createMusicDecisionProjection,
  createVocalDecisionProjection,
} from "@/lib/providers/types";

function createInputs() {
  const graph = createEmotionGraph({
    story: "A traveler walks from a quiet room toward the morning.",
    theme: "hope",
    mood: "cinematic",
    lyrics: "I choose the morning light.",
    directorPreset: "cinematic",
  });
  const decision = createDirectorDecision({
    emotionGraph: graph,
    directorPreset: "cinematic",
  });
  const vocal: ReferenceVocalAdapterInput = {
    contractVersion: "1.0",
    projection: createVocalDecisionProjection(decision),
    assets: { lyrics: "I choose the morning light.", language: "en" },
    constraints: {
      durationSeconds: 180,
      outputFormat: "wav",
      language: "en",
      voiceMode: "standard",
    },
    capability: REFERENCE_VOCAL_CAPABILITY,
  };
  const music: ReferenceMusicAdapterInput = {
    contractVersion: "1.0",
    projection: createMusicDecisionProjection(decision),
    assets: { lyrics: "I choose the morning light.", theme: "hope" },
    constraints: {
      durationSeconds: 180,
      outputFormat: "wav",
      lyricsMode: "use-lyrics",
      outputMode: "mix",
    },
    capability: REFERENCE_MUSIC_CAPABILITY,
  };
  return { music, vocal };
}

test("reference Vocal and Music adapters validate and build deterministically", () => {
  const { music, vocal } = createInputs();
  const vocalFirst = buildReferenceVocalRequest(vocal);
  const vocalSecond = buildReferenceVocalRequest(structuredClone(vocal));
  const musicFirst = buildReferenceMusicRequest(music);
  const musicSecond = buildReferenceMusicRequest(structuredClone(music));

  assert.equal(vocalFirst.status, "ready");
  assert.deepEqual(vocalSecond, vocalFirst);
  assert.equal(musicFirst.status, "degraded");
  assert.deepEqual(musicSecond, musicFirst);
  assert.equal(referenceVocalAdapter.buildRequest, buildReferenceVocalRequest);
  assert.equal(referenceMusicAdapter.buildRequest, buildReferenceMusicRequest);
  assert.equal(Object.isFrozen(REFERENCE_VOCAL_CAPABILITY), true);
  assert.equal(Object.isFrozen(REFERENCE_MUSIC_CAPABILITY), true);
  assert.equal(Object.isFrozen(referenceVocalAdapter), true);
  assert.equal(Object.isFrozen(referenceMusicAdapter), true);
  assert.equal(vocalFirst.request?.requestSchemaVersion, "1.0");
  assert.equal(musicFirst.request?.requestSchemaVersion, "1.0");
  assert.ok(vocalFirst.mappings.length > 0);
  assert.ok(musicFirst.mappings.length > 0);
  assert.equal(vocalFirst.reviewRequired, false);
  assert.equal(musicFirst.reviewRequired, true);
});

test("capability identity and supported versions remain stable", () => {
  assert.equal(REFERENCE_VOCAL_ADAPTER_ID, "reference-vocal-v1");
  assert.equal(REFERENCE_VOCAL_ADAPTER_VERSION, "1.0.0");
  assert.equal(REFERENCE_VOCAL_PROVIDER_ID, "reference-vocal");
  assert.equal(REFERENCE_VOCAL_PROVIDER_API_VERSION, "reference-api-v1");
  assert.equal(REFERENCE_VOCAL_CAPABILITY.capabilityVersion, "reference-vocal-capability-v1");
  assert.deepEqual(REFERENCE_VOCAL_CAPABILITY.supportedOutputFormats, ["wav", "mp3"]);
  assert.deepEqual(REFERENCE_VOCAL_CAPABILITY.supportedAudioFormats, ["wav", "mp3"]);

  assert.equal(REFERENCE_MUSIC_ADAPTER_ID, "reference-music-v1");
  assert.equal(REFERENCE_MUSIC_ADAPTER_VERSION, "1.0.0");
  assert.equal(REFERENCE_MUSIC_PROVIDER_ID, "reference-music");
  assert.equal(REFERENCE_MUSIC_PROVIDER_API_VERSION, "reference-api-v1");
  assert.equal(REFERENCE_MUSIC_CAPABILITY.capabilityVersion, "reference-music-capability-v1");
  assert.deepEqual(REFERENCE_MUSIC_CAPABILITY.supportedOutputFormats, ["wav", "mp3"]);
  assert.deepEqual(REFERENCE_MUSIC_CAPABILITY.supportedAudioFormats, ["wav", "mp3"]);
});

test("validation distinguishes invalid, unsupported, and degraded inputs", () => {
  const { music, vocal } = createInputs();
  const invalidVocal = buildReferenceVocalRequest({
    ...vocal,
    contractVersion: "invalid" as "1.0",
  });
  const invalidMusic = buildReferenceMusicRequest({
    ...music,
    contractVersion: "invalid" as "1.0",
  });

  assert.equal(invalidVocal.status, "invalid");
  assert.equal("request" in invalidVocal, false);
  assert.equal(invalidMusic.status, "invalid");
  assert.equal("request" in invalidMusic, false);

  assert.equal(validateReferenceVocalInput({
    ...vocal,
    projection: { ...vocal.projection, decisionSchemaVersion: "9.0" as "1.0" },
  }).status, "invalid");
  assert.equal(validateReferenceMusicInput({
    ...music,
    projection: { ...music.projection, decisionSchemaVersion: "9.0" as "1.0" },
  }).status, "invalid");
  assert.equal(validateReferenceVocalInput({
    ...vocal,
    capability: { ...vocal.capability, capabilityVersion: "9.0" as "1.0" },
  }).status, "invalid");
  assert.equal(validateReferenceMusicInput({
    ...music,
    capability: { ...music.capability, capabilityVersion: "9.0" as "1.0" },
  }).status, "invalid");
  assert.equal(validateReferenceVocalInput({
    ...vocal,
    assets: { ...vocal.assets, lyrics: "" },
  }).status, "invalid");
  assert.equal(validateReferenceMusicInput({
    ...music,
    assets: { ...music.assets, lyrics: "" },
  }).status, "invalid");

  for (const durationSeconds of [1, 601]) {
    assert.equal(validateReferenceVocalInput({
      ...vocal,
      constraints: { ...vocal.constraints, durationSeconds },
    }).status, "degraded");
    assert.equal(validateReferenceMusicInput({
      ...music,
      constraints: { ...music.constraints, durationSeconds },
    }).status, "degraded");
  }
  assert.equal(validateReferenceVocalInput({
    ...vocal,
    constraints: { ...vocal.constraints, outputFormat: "flac" as "wav" },
  }).status, "degraded");
  assert.equal(validateReferenceMusicInput({
    ...music,
    constraints: { ...music.constraints, outputFormat: "flac" as "wav" },
  }).status, "degraded");
  assert.equal(validateReferenceMusicInput({
    ...music,
    capability: { ...music.capability, supportsLyrics: false },
  }).status, "unsupported");
});

test("Music lyrics and instrumental modes map without mutating inputs", () => {
  const { music } = createInputs();
  const lyricsSnapshot = structuredClone(music);
  const lyrics = buildReferenceMusicRequest(music);
  const instrumentalInput: ReferenceMusicAdapterInput = {
    ...structuredClone(music),
    assets: {},
    constraints: {
      ...music.constraints,
      lyricsMode: "none",
    },
  };
  const instrumentalSnapshot = structuredClone(instrumentalInput);
  const instrumental = buildReferenceMusicRequest(instrumentalInput);

  assert.equal(lyrics.request?.lyrics, "I choose the morning light.");
  assert.equal(instrumental.request?.lyrics, undefined);
  assert.equal(instrumental.request?.lyricsMode, "none");
  assert.notEqual(instrumental.status, "invalid");
  assert.deepEqual(music, lyricsSnapshot);
  assert.deepEqual(instrumentalInput, instrumentalSnapshot);
});

test("response and error normalization expose only safe deterministic projections", () => {
  const vocal = normalizeReferenceVocalResponse({
    status: "completed",
    outputAssetIds: ["voice-primary", "voice-primary", "https://unsafe.example"],
    jobReference: "vocal-job",
    metadata: { durationSeconds: 180, secret: "excluded" },
  });
  const music = normalizeReferenceMusicResponse({
    status: "failed",
    outputAssetIds: ["mix-primary"],
    stemAssetIds: ["stem-one", "mix-primary"],
    errorCode: "provider-failed",
    metadata: { format: "wav", credential: "excluded" },
  });
  const vocalError = normalizeReferenceVocalError({ code: "timeout", message: "private" });
  const musicError = normalizeReferenceMusicError({ code: "timeout", message: "private" });

  assert.equal(vocal.status, "completed");
  assert.deepEqual(vocal.outputs.map((output) => output.assetId), ["voice-primary"]);
  assert.deepEqual(vocal.safeProviderMetadata, { durationSeconds: 180 });
  assert.equal(music.status, "partial");
  assert.deepEqual(music.outputs.map((output) => output.assetId), ["mix-primary", "stem-one"]);
  assert.deepEqual(music.safeProviderMetadata, { format: "wav" });
  assert.equal(typeof vocalError.category, "string");
  assert.equal(typeof musicError.category, "string");
  assert.equal(JSON.stringify(vocalError).includes("private"), false);
  assert.equal(JSON.stringify(musicError).includes("private"), false);

  const vocalPartial = normalizeReferenceVocalResponse({
    status: "partial",
    outputAssetIds: ["voice-partial"],
  });
  const vocalFailed = normalizeReferenceVocalResponse({
    status: "failed",
    outputAssetIds: [],
    errorCode: "generation-failed",
    jobReference: "https://unsafe.example/job",
  });
  const musicCompleted = normalizeReferenceMusicResponse({
    status: "completed",
    outputAssetIds: ["mix-complete"],
    stemAssetIds: [],
  });
  const musicFailed = normalizeReferenceMusicResponse({
    status: "failed",
    outputAssetIds: [],
    stemAssetIds: [],
    errorCode: "generation-failed",
    jobReference: "https://unsafe.example/job",
  });
  assert.equal(vocalPartial.status, "partial");
  assert.equal(vocalFailed.status, "failed");
  assert.equal(vocalFailed.providerJobReference, undefined);
  assert.equal(musicCompleted.status, "completed");
  assert.equal(musicFailed.status, "failed");
  assert.equal(musicFailed.providerJobReference, undefined);
});
