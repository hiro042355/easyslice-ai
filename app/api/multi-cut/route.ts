import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import { NextResponse } from "next/server";
import {
  cleanupJobTempRoot,
  createDurableMediaOwnershipRepository,
  createJobTempDirectories,
  isUuid,
} from "@/lib/server/durableMediaOwnership";
import {
  createMultiCutZipEntryName,
  normalizeMultiCutInstructions,
  type MultiCutInstructionInput,
} from "@/lib/server/durableMultiCut";
import { resolvePackagedFfmpeg } from "@/lib/server/packagedFfmpeg";
import { requireAuthenticatedRequest } from "@/lib/server/productionIdentity/routeGuard";
import { withProductionMediaRuntime } from "@/lib/server/productionMediaRuntime/composition";

export const runtime = "nodejs";

type DurableMultiCutRequest = Readonly<{
  requestVersion: "1.0";
  jobId: string;
  mediaId: string;
  clips: readonly MultiCutInstructionInput[];
  outputFormat?: "original" | "shorts" | "normal";
}>;

const readRequest = async (request: Request): Promise<DurableMultiCutRequest | undefined> => {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return undefined;
  const body: unknown = await request.json();
  if (!body || typeof body !== "object") return undefined;
  const value = body as Record<string, unknown>;
  if (value.requestVersion !== "1.0" || !Array.isArray(value.clips)) return undefined;
  return {
    requestVersion: "1.0",
    jobId: String(value.jobId ?? ""),
    mediaId: String(value.mediaId ?? ""),
    clips: value.clips as readonly MultiCutInstructionInput[],
    outputFormat: value.outputFormat === "shorts" ? "shorts" : value.outputFormat === "original" ? "original" : "normal",
  };
};

const inspectDuration = async (executable: string, inputPath: string): Promise<number> =>
  new Promise((resolve, reject) => {
    const child = spawn(executable, ["-hide_banner", "-i", inputPath], {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      if (stderr.length < 65_536) stderr += chunk.slice(0, 65_536 - stderr.length);
    });
    child.once("error", reject);
    child.once("exit", () => {
      const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!match) return reject(new Error("media-duration-unavailable"));
      const duration = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
      return Number.isFinite(duration) && duration > 0
        ? resolve(duration)
        : reject(new Error("media-duration-unavailable"));
    });
  });

const runFfmpeg = async (executable: string, args: readonly string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], { shell: false, stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error("ffmpeg-failed")));
  });

export async function POST(request: Request) {
  const authentication = await requireAuthenticatedRequest(request);
  if (!authentication.ok) return authentication.response;

  try {
    const body = await readRequest(request);
    if (!body) return NextResponse.json({ success: false, error: "durable-media-required" }, { status: 400 });
    if (!isUuid(body.jobId) || !isUuid(body.mediaId)) {
      return NextResponse.json({ success: false, error: "invalid-resource" }, { status: 400 });
    }
    if (body.clips.length === 0) {
      return NextResponse.json({ success: false, error: "clips-required" }, { status: 400 });
    }

    const ownerUid = authentication.context.identity.userId;
    return await withProductionMediaRuntime(async ({ pool, bucket }) => {
      const repository = createDurableMediaOwnershipRepository(pool);
      if (!await repository.resolveOwnedJob(body.jobId, ownerUid)) {
        return NextResponse.json({ success: false, error: "resource-not-found" }, { status: 404 });
      }
      const media = await repository.resolveOwnedMedia(body.mediaId, ownerUid);
      if (!media || media.jobId !== body.jobId) {
        return NextResponse.json({ success: false, error: "resource-not-found" }, { status: 404 });
      }

      const paths = await createJobTempDirectories(body.jobId);
      const inputPath = path.join(paths.input, "source.mp4");
      try {
        await bucket.file(media.storageKey).download({ destination: inputPath });
        const executable = resolvePackagedFfmpeg();
        const duration = await inspectDuration(executable, inputPath);
        const clips = normalizeMultiCutInstructions(body.clips, duration);
        if (!clips) {
          return NextResponse.json({ success: false, error: "clip-range-invalid" }, { status: 400 });
        }

        const zip = new AdmZip();
        const shorts = body.outputFormat === "shorts";
        for (const [offset, clip] of clips.entries()) {
          const index = offset + 1;
          const outputPath = path.join(paths.output, `clip-${String(index).padStart(4, "0")}.mp4`);
          const args = shorts
            ? ["-y", "-ss", String(clip.start), "-i", inputPath, "-t", String(clip.end - clip.start), "-vf", "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280", "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "21", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", outputPath]
            : ["-y", "-ss", String(clip.start), "-i", inputPath, "-t", String(clip.end - clip.start), "-map", "0:v:0", "-map", "0:a?", "-c", "copy", "-avoid_negative_ts", "make_zero", "-movflags", "+faststart", outputPath];
          await runFfmpeg(executable, args);
          zip.addFile(
            createMultiCutZipEntryName(index, shorts ? "shorts-9x16" : "original", clip),
            await readFile(outputPath),
          );
        }

        return new Response(zip.toBuffer(), {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": "attachment; filename=clips.zip",
          },
        });
      } finally {
        await cleanupJobTempRoot(body.jobId);
      }
    });
  } catch {
    console.error("durable-multi-cut-failed");
    return NextResponse.json({ success: false, error: "multi-cut-failed" }, { status: 500 });
  }
}
