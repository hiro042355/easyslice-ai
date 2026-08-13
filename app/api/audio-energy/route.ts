import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { decideCanonicalClipBoundary } from "@/lib/clipBoundary";
import { CLIP_FINAL_SELECTION_POLICY_V1 } from "@/lib/clipCandidates";
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

type EnergyItem = {
  second: number;
  meanVolume: number;
};

type DurableAnalyzeRequest = Readonly<{ jobId: string; mediaId: string }>;

const analyzeVideo = async (inputPath: string) => {
  const durationResult = await execFileAsync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=nokey=1:noprint_wrappers=1", inputPath,
  ]);
  const duration = Math.floor(Number(durationResult.stdout.trim()));

  if (!Number.isFinite(duration) || duration <= 0) {
    return NextResponse.json(
      { success: false, error: "動画の長さを取得できませんでした" },
      { status: 500 },
    );
  }

  const windowSeconds = 10;
  const energies: EnergyItem[] = [];
  for (let second = 0; second < duration; second += windowSeconds) {
    const result = await execFileAsync("ffmpeg", [
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
    if (durableRequest) {
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
    }

    const legacyInputPath = path.join(os.tmpdir(), "downloaded.mp4");
    try {
      await access(legacyInputPath);
    } catch {
      return NextResponse.json(
        { success: false, error: "ダウンロード済み動画が見つかりません" },
        { status: 404 },
      );
    }
    return await analyzeVideo(legacyInputPath);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: "音声ハイライト生成に失敗しました" },
      { status: 500 },
    );
  }
}
