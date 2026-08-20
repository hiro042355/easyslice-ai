import type { ClipTimedTextV1 } from "@/lib/clipEditing";

export type TranscriptProviderInput = Readonly<{
  audio: Buffer;
  mimeType: "audio/flac";
  durationSeconds: number;
}>;

export interface TranscriptProvider {
  transcribe(input: TranscriptProviderInput): Promise<readonly ClipTimedTextV1[]>;
}

export type TranscriptFailureReason =
  | "provider-timeout"
  | "provider-rate-limited"
  | "provider-failed"
  | "invalid-provider-response"
  | "empty-transcript";

export class TranscriptFailure extends Error {
  constructor(readonly reason: TranscriptFailureReason) {
    super(reason);
    this.name = "TranscriptFailure";
  }
}

export const validateTimedTranscript = (
  value: unknown,
  durationSeconds: number,
): readonly ClipTimedTextV1[] => {
  if (!Array.isArray(value)) throw new TranscriptFailure("invalid-provider-response");
  if (value.length === 0) throw new TranscriptFailure("empty-transcript");
  let previousStart = -1;
  const result = value.map((segment) => {
    if (!segment || typeof segment !== "object") throw new TranscriptFailure("invalid-provider-response");
    const candidate = segment as Record<string, unknown>;
    const start = candidate.start;
    const end = candidate.end;
    const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
    if (typeof start !== "number" || typeof end !== "number" ||
      !Number.isFinite(start) || !Number.isFinite(end) ||
      start < 0 || start >= end || end > durationSeconds || start < previousStart || !text) {
      throw new TranscriptFailure("invalid-provider-response");
    }
    previousStart = start;
    return Object.freeze({ start, end, text });
  });
  return Object.freeze(result);
};

type Fetch = typeof fetch;

export class GeminiTranscriptProvider implements TranscriptProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: Fetch = fetch,
    private readonly timeoutMs = 60_000,
  ) {}

  async transcribe(input: TranscriptProviderInput): Promise<readonly ClipTimedTextV1[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
          body: JSON.stringify({
            contents: [{ parts: [
              { text: "発話を元の言語のまま正確に文字起こしし、字幕向けの短い区間に分けてください。翻訳、説明、要約、推測はしないでください。startとendは音声先頭からの秒数です。" },
              { inline_data: { mime_type: input.mimeType, data: input.audio.toString("base64") } },
            ] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  required: ["start", "end", "text"],
                  properties: {
                    start: { type: "NUMBER" }, end: { type: "NUMBER" }, text: { type: "STRING" },
                  },
                },
              },
            },
          }),
        },
      );
      if (response.status === 429) throw new TranscriptFailure("provider-rate-limited");
      if (!response.ok) throw new TranscriptFailure("provider-failed");
      const payload = await response.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text?.trim()) throw new TranscriptFailure("empty-transcript");
      let structured: unknown;
      try { structured = JSON.parse(text); } catch { throw new TranscriptFailure("invalid-provider-response"); }
      return validateTimedTranscript(structured, input.durationSeconds);
    } catch (error) {
      if (error instanceof TranscriptFailure) throw error;
      if (controller.signal.aborted) throw new TranscriptFailure("provider-timeout");
      throw new TranscriptFailure("provider-failed");
    } finally {
      clearTimeout(timeout);
    }
  }
}
