import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { NextResponse } from "next/server";


const execFileAsync = promisify(execFile);



export async function POST() {
  try {
   const videoPath = path.join(os.tmpdir(), "downloaded.mp4");
    const audioPath = path.join(os.tmpdir(), "transcript-audio.wav");

    if (!fs.existsSync(videoPath)) {
      return NextResponse.json(
        {
          success: false,
          error: "先に動画をアップロードしてください",
        },
        { status: 400 }
      );
    }

    await execFileAsync("ffmpeg", [
      "-y",
      "-i",
      videoPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      audioPath,
    ]);

const audioBuffer = fs.readFileSync(audioPath);
const audioBase64 = audioBuffer.toString("base64");

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  return NextResponse.json(
    { success: false, error: "GEMINI_API_KEY が設定されていません" },
    { status: 500 }
  );
}

const res = await fetch(
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text:
                "この音声の発話だけを日本語で文字起こししてください。説明、要約、補足、推測は一切しないでください。字幕として使いやすいように、1行は20文字以内を目安に短く区切ってください。句読点は少なめにしてください。聞き取れない部分は無理に補完せず、省略してください。",
            },
            {
              inline_data: {
                mime_type: "audio/wav",
                data: audioBase64,
              },
            },
          ],
        },
      ],
    }),
  }
);

const data = await res.json();

if (!res.ok) {
  return NextResponse.json(
    {
      success: false,
      error:
        data?.error?.message ||
        "Geminiによる文字起こしに失敗しました",
    },
    { status: res.status }
  );
}

const transcript =
  data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

return NextResponse.json({
  success: true,
  transcript:
    transcript ||
    "文字起こし結果が空でした。音声が小さい、または無音の可能性があります。",
});
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        success: false,
        error: "音声抽出に失敗しました",
      },
      { status: 500 }
    );
  }
}