import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { NextResponse } from "next/server";
import { decideCanonicalClipBoundary } from "@/lib/clipBoundary";
import { CLIP_FINAL_SELECTION_POLICY_V1 } from "@/lib/clipCandidates";
import {
  AudioInspectionFailure,
  inspectAudioMedia,
} from "@/lib/server/audioHighlightInspection";
import {
  cleanupJobTempRoot,
  createDurableMediaOwnershipRepository,
  createJobTempDirectories,
  isUuid,
} from "@/lib/server/durableMediaOwnership";
import { requireAuthenticatedRequest } from "@/lib/server/productionIdentity/routeGuard";
import { withProductionMediaRuntime } from "@/lib/server/productionMediaRuntime/composition";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
const ffmpegExecutable = (): string => {
  if (!ffmpegPath) throw new Error("ffmpeg-unavailable");
  return ffmpegPath;
};

type EnergyItem = {
  second: number;
  meanVolume: number;
};

type DurableAnalyzeRequest = Readonly<{ jobId: string; mediaId: string }>;

const analyzeVideo = async (inputPath: string) => {
  const inspection = await inspectAudioMedia(ffmpegExecutable(), inputPath);
  const duration = inspection.durationSeconds;
  console.info("audio-analysis-inspection", {
    durationSeconds: duration,
    codec: inspection.codec,
    sampleRateHz: inspection.sampleRateHz,
    channels: inspection.channels,
  });

  const windowSeconds = 10;
  const energies: EnergyItem[] = [];
  for (let second = 0; second < duration; second += windowSeconds) {
    const result = await execFileAsync(ffmpegExecutable(), [
      "-hide_banner", "-ss", String(second), "-t", String(windowSeconds),
      "-i", inputPath, "-af", "volumedetect", "-f", "null", "-",
    ]).catch((error: { stderr?: string }) => error);
    const stderr = result.stderr || "";
    const match = stderr.match(/mean_volume:\s*(-?\d+(\.\d+)?) dB/);
    if (match) energies.push({ second, meanVolume: Number(match[1]) });
  }

  const selected: EnergyItem[] = [];
  for (const item of energies.toSorted((a, b) => b.meanVolume - a.meanVolume)) {
    if (!selected.some((selectedItem) => Math.abs(selectedItem.second - item.second) < 25)) selected.push(item);
    if (selected.length >= CLIP_FINAL_SELECTION_POLICY_V1.candidatePoolLimit) break;
  }

  const clips = selected
    .toSorted((a, b) => a.second - b.second)
    .map((item, index) => {
      const boundary = decideCanonicalClipBoundary({
        candidateKind: "audio-energy",
        anchorSecond: item.second,
        sourceDurationSeconds: duration,
        evidence: energies.map((energy) => ({
          kind: "audio-window" as const,
          second: Math.min(duration, energy.second + windowSeconds),
        })),
      });
      return {
        start: String(boundary.start),
        end: String(boundary.end),
        title: `音声ハイライト ${index + 1}`,
        reason: `音量が高い区間です。平均音量: ${item.meanVolume}dB`,
        score: Math.max(1, Math.min(10, Math.round(10 + item.meanVolume / 4))),
      };
    });

  if (clips.length === 0) {
    return NextResponse.json(
      { success: false, error: "音声ハイライト候補が見つかりませんでした" },
      { status: 400 },
    );
  }
  return NextResponse.json({ success: true, clips });
};

const readDurableRequest = async (request: Request): Promise<DurableAnalyzeRequest | undefined> => {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return undefined;
  const body: unknown = await request.json();
  if (!body || typeof body !== "object") return undefined;
  const jobId = "jobId" in body ? String(body.jobId) : "";
  const mediaId = "mediaId" in body ? String(body.mediaId) : "";
  return { jobId, mediaId };
};

export async function POST(request: Request) {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.ok) return authentication.response;

  try {
    const durableRequest = await readDurableRequest(request);
    if (!durableRequest) {
      return NextResponse.json({ success: false, error: "durable-media-required" }, { status: 400 });
    }
    const { jobId, mediaId } = durableRequest;
    if (!isUuid(jobId) || !isUuid(mediaId)) {
      return NextResponse.json({ success: false, error: "invalid-resource" }, { status: 400 });
    }
    const ownerUid = authentication.context.identity.userId;
    return await withProductionMediaRuntime(async ({ pool, bucket }) => {
      const repository = createDurableMediaOwnershipRepository(pool);
      if (!await repository.resolveOwnedJob(jobId, ownerUid)) {
        return NextResponse.json({ success: false, error: "resource-not-found" }, { status: 404 });
      }
      const media = await repository.resolveOwnedMedia(mediaId, ownerUid);
      if (!media || media.jobId !== jobId) {
        return NextResponse.json({ success: false, error: "resource-not-found" }, { status: 404 });
      }

      const paths = await createJobTempDirectories(jobId);
      const inputPath = path.join(paths.input, "source.mp4");
      try {
        await bucket.file(media.storageKey).download({ destination: inputPath });
        return await analyzeVideo(inputPath);
      } finally {
        await cleanupJobTempRoot(jobId);
      }
    });
  } catch (error) {
    if (error instanceof AudioInspectionFailure) {
      console.error("audio-analysis-inspection-failed", {
        reason: error.reason,
        diagnostic: error.diagnostic,
      });
      const status = error.reason === "audio-stream-not-found" ? 422 : 500;
      return NextResponse.json({ success: false, error: error.reason }, { status });
    }
    console.error(error);
    return NextResponse.json(
      { success: false, error: "音声ハイライト生成に失敗しました" },
      { status: 500 },
    );
  }
}
