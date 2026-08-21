import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { InMemoryAcquisitionIdempotencyStore } from "../../lib/server/acquisitionWorker/idempotency";
import type { AcquisitionRuntime, PoTokenProvider } from "../../lib/server/acquisitionWorker/sourceAdapter";
import type { AcquisitionMediaMetadata } from "../../lib/server/acquisitionWorker/types";
import { createAcquisitionWorkerComposition } from "../../worker/acquisition/composition";

const ID = "123e4567-e89b-42d3-a456-426614174000";
const URL = "https://www.youtube.com/watch?v=DaxWpqigjrs";
const request = Object.freeze({ requestVersion: "1.0", acquisitionId: ID, source: "youtube", sourceUrl: URL,
  requestedOutputProfile: "canonical-mp4", maxBytes: 1024, timeoutMs: 1_000 });
const runtime: AcquisitionRuntime = Object.freeze({ ytDlpExecutable: "/app/node_modules/.nexcut-runtime/yt-dlp/yt-dlp",
  ffmpegExecutable: "/app/node_modules/.nexcut-runtime/ffmpeg/ffmpeg", nodeExecutable: "/usr/local/bin/node", nodeMajorVersion: 24 });
const media: AcquisitionMediaMetadata = Object.freeze({ contentType: "video/mp4", byteSize: 4,
  durationSeconds: 10, hasVideo: true, hasAudio: true });
const provider: PoTokenProvider = Object.freeze({ authority: "bgutil-ytdlp-pot-provider@1.3.1",
  status: async () => "available" as const, ytDlpArguments: () => ["--extractor-args", "youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416"] });

test("composition reaches Core, fixed YouTube adapter, runtime, provider, validation, and cleanup", async () => {
  const authorityRoot = await mkdtemp(path.join(os.tmpdir(), "nexcut-acquisition-composition-"));
  let inspected = false;
  const composition = await createAcquisitionWorkerComposition({ authorityRoot, resolveRuntime: async () => runtime,
    idempotency: new InMemoryAcquisitionIdempotencyStore(), provider,
    run: async (args, options) => {
      assert.equal(options.timeoutMs, 1_000);
      assert.equal(args.includes("node:/usr/local/bin/node"), true);
      assert.equal(args.includes("youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416"), true);
      assert.equal(args.at(-1), URL);
      await writeFile(args[args.indexOf("--output") + 1]!, "mp4");
    },
    inspectMedia: async (input, injectedRuntime, maxBytes) => {
      inspected = true;
      assert.equal(injectedRuntime, runtime);
      assert.equal(maxBytes, 1024);
      assert.equal(await readFile(input, "utf8"), "mp4");
      return media;
    } });
  assert.deepEqual(await composition.execute(request), { acquisitionId: ID, status: "succeeded",
    artifactReference: `acquisition:${ID}`, media });
  assert.equal(composition.telemetry(ID)?.configuredPlayerClient, "MWEB");
  assert.equal(composition.telemetry(ID), undefined);
  assert.equal(inspected, true);
  await assert.rejects(stat(path.join(authorityRoot, ID)), { code: "ENOENT" });
});

test("Production composition uses persistent GCS store and contains no stub, cookies, paths, or generic adapter", async () => {
  const composition = await readFile("worker/acquisition/composition.ts", "utf8");
  const main = await readFile("worker/acquisition/main.ts", "utf8");
  assert.match(composition, /new PersistentAcquisitionIdempotencyStore/);
  assert.match(composition, /new GcsAcquisitionControlObjectStore/);
  assert.match(composition, /new SourceAdapterRegistry\(\[new YouTubeSourceAdapter/);
  assert.match(main, /execute:\s*execution\.execute/);
  assert.doesNotMatch(main, /errorCode:\s*"unknown-acquisition-failure"/);
  assert.doesNotMatch(composition, /process\.env\.(?:PATH|PROVIDER_URL)|cookies?|credentials?|Generic/i);
});
