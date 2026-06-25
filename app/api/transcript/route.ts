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

    const stats = fs.statSync(audioPath);

    return NextResponse.json({
      success: true,
      transcript:
        "音声抽出に成功しました。次のステップでこの音声を文字起こしします。",
      audioBytes: stats.size,
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