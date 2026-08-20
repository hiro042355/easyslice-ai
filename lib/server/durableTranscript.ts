import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import type { TranscriptProvider } from "./transcriptProvider";

const execFileAsync = promisify(execFile);

export const extractTranscriptAudio = async (
  executable: string,
  inputPath: string,
  audioPath: string,
): Promise<void> => {
  await execFileAsync(executable, [
    "-hide_banner", "-y", "-i", inputPath, "-map", "0:a:0", "-vn",
    "-ac", "1", "-ar", "16000", "-c:a", "flac", audioPath,
  ]);
};

export const transcribeExtractedAudio = async (
  provider: TranscriptProvider,
  audioPath: string,
  durationSeconds: number,
) => provider.transcribe({
  audio: await readFile(audioPath),
  mimeType: "audio/flac",
  durationSeconds,
});
