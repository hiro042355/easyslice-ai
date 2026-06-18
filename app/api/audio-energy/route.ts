import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { access, unlink } from "fs/promises";
import path from "path";
import os from "os";

export const runtime = "nodejs";

const execAsync = promisify(exec);

type EnergyItem = {
  second: number;
  meanVolume: number;
};

export async function POST() {
  const inputPath = path.join(
    os.tmpdir(),
    `audio-energy-input-${Date.now()}.mp4`
  );

  try {
    const inputPath = path.join(os.tmpdir(), "downloaded.mp4");

  try {
  await access(inputPath);
} catch {
  return NextResponse.json(
    { success: false, error: "ダウンロード済み動画が見つかりません" },
    { status: 404 }
  );
}

    const durationResult = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=nokey=1:noprint_wrappers=1 "${inputPath}"`
    );

    const duration = Math.floor(Number(durationResult.stdout.trim()));

    if (!Number.isFinite(duration) || duration <= 0) {
      return NextResponse.json(
        { success: false, error: "動画の長さを取得できませんでした" },
        { status: 500 }
      );
    }

    const windowSeconds = 10;
    const energies: EnergyItem[] = [];

    for (let second = 0; second < duration; second += windowSeconds) {
      const cmd = `ffmpeg -hide_banner -ss ${second} -t ${windowSeconds} -i "${inputPath}" -af volumedetect -f null NUL`;

      const result = await execAsync(cmd).catch((error) => error);

      const stderr = result.stderr || "";
      const match = stderr.match(/mean_volume:\s*(-?\d+(\.\d+)?) dB/);

      if (!match) continue;

      energies.push({
        second,
        meanVolume: Number(match[1]),
      });
    }

    const selected: EnergyItem[] = [];

    const sorted = energies.sort(
      (a, b) => b.meanVolume - a.meanVolume
    );

    for (const item of sorted) {
      const tooClose = selected.some(
        (selectedItem) =>
          Math.abs(selectedItem.second - item.second) < 25
      );

      if (!tooClose) {
        selected.push(item);
      }

      if (selected.length >= 5) break;
    }

    const clips = selected
      .sort((a, b) => a.second - b.second)
      .map((item, index) => {
        const start = Math.max(0, item.second - 3);
        const end = Math.min(duration, start + 30);
        const score = Math.max(
          1,
          Math.min(10, Math.round(10 + item.meanVolume / 4))
        );

        return {
          start: String(start),
          end: String(end),
          title: `音声ハイライト ${index + 1}`,
          reason: `音量が高い区間です。平均音量: ${item.meanVolume}dB`,
          score,
        };
      });

    if (clips.length === 0) {
      return NextResponse.json(
        { success: false, error: "音声ハイライト候補が見つかりませんでした" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      clips,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false, error: "音声ハイライト生成に失敗しました" },
      { status: 500 }
    );
  } finally {
  
  }
}