import { readFile, stat } from "node:fs/promises";
import type { TranscriptProvider } from "./transcriptProvider";
import {checkMediaCancellation,runMediaProcess} from './requestMediaWorkspace';
import {TranscriptFailure} from './transcriptProvider';

export const extractTranscriptAudio = async (
  executable: string,
  inputPath: string,
  audioPath: string,
  signal?: AbortSignal,
): Promise<void> => {
  await runMediaProcess(executable, [
    "-nostdin", "-hide_banner", "-n", "-protocol_whitelist", "file,pipe", "-format_whitelist", "mov", "-i", inputPath, "-map", "0:a:0", "-vn",
    "-ac", "1", "-ar", "16000", "-c:a", "flac", audioPath,
  ], signal);
};

export const transcribeExtractedAudio = async (
  provider: TranscriptProvider,
  audioPath: string,
  durationSeconds: number,
  signal?: AbortSignal,
) => {
checkMediaCancellation(signal);
if((await stat(audioPath)).size>32*1024*1024)throw new TranscriptFailure('provider-failed');
return provider.transcribe({
  audio: await readFile(audioPath),
  mimeType: "audio/flac",
  durationSeconds,
  signal,
});
};
