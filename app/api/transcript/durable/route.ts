import path from "node:path";
import { NextResponse } from "next/server";
import { AudioInspectionFailure, inspectAudioMedia } from "@/lib/server/audioHighlightInspection";
import { extractTranscriptAudio, transcribeExtractedAudio } from "@/lib/server/durableTranscript";
import {
  cleanupJobTempRoot,
  createDurableMediaOwnershipRepository,
  createJobTempDirectories,
  isUuid,
} from "@/lib/server/durableMediaOwnership";
import { resolvePackagedFfmpeg } from "@/lib/server/packagedFfmpeg";
import { requireAuthenticatedRequest } from "@/lib/server/productionIdentity/routeGuard";
import { withProductionMediaRuntime } from "@/lib/server/productionMediaRuntime/composition";
import { GeminiTranscriptProvider, TranscriptFailure } from "@/lib/server/transcriptProvider";

export const runtime = "nodejs";

type DurableTranscriptRequest = Readonly<{ jobId: string; mediaId: string }>;

const readRequest = async (request: Request): Promise<DurableTranscriptRequest | undefined> => {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return undefined;
  const body: unknown = await request.json().catch(() => undefined);
  if (!body || typeof body !== "object") return undefined;
  const value = body as Record<string, unknown>;
  return {
    jobId: typeof value.jobId === "string" ? value.jobId : "",
    mediaId: typeof value.mediaId === "string" ? value.mediaId : "",
  };
};

const failureResponse = (reason: string, status: number) =>
  NextResponse.json({ success: false, error: reason }, { status });

export async function POST(request: Request) {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.ok) return authentication.response;

  const body = await readRequest(request);
  if (!body) return failureResponse("durable-media-required", 400);
  if (!isUuid(body.jobId) || !isUuid(body.mediaId)) return failureResponse("invalid-resource", 400);

  const ownerUid = authentication.context.identity.userId;

  try {
    return await withProductionMediaRuntime(async ({ pool, bucket }) => {
      const repository = createDurableMediaOwnershipRepository(pool);
      if (!await repository.resolveOwnedJob(body.jobId, ownerUid)) {
        return failureResponse("resource-not-found", 404);
      }
      const media = await repository.resolveOwnedMedia(body.mediaId, ownerUid);
      if (!media || media.jobId !== body.jobId) return failureResponse("resource-not-found", 404);

      const paths = await createJobTempDirectories(body.jobId);
      const inputPath = path.join(paths.input, "source.mp4");
      const audioPath = path.join(paths.work, "transcript.flac");
      try {
        await bucket.file(media.storageKey).download({ destination: inputPath });
        const executable = resolvePackagedFfmpeg();
        const inspection = await inspectAudioMedia(executable, inputPath);
        await extractTranscriptAudio(executable, inputPath, audioPath);
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return failureResponse("provider-failed", 503);
        const provider = new GeminiTranscriptProvider(apiKey);
        const subtitles = await transcribeExtractedAudio(provider, audioPath, inspection.durationSeconds);
        return NextResponse.json({ success: true, subtitles });
      } finally {
        await cleanupJobTempRoot(body.jobId);
      }
    });
  } catch (error) {
    if (error instanceof AudioInspectionFailure) {
      const reason = error.reason === "audio-stream-not-found" ? "no-audio-stream" : "malformed-media";
      return failureResponse(reason, 422);
    }
    if (error instanceof TranscriptFailure) {
      const status = error.reason === "provider-rate-limited" ? 429
        : error.reason === "provider-timeout" ? 504
          : error.reason === "invalid-provider-response" || error.reason === "empty-transcript" ? 422 : 502;
      return failureResponse(error.reason, status);
    }
    console.error("durable-transcript-failed", { reason: "unexpected-failure" });
    return failureResponse("provider-failed", 502);
  }
}
