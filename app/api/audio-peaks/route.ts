import { NextResponse } from "next/server";
import { exec } from "child_process";

export async function POST() {
  return new Promise((resolve) => {
    exec(
      `ffmpeg -i downloaded.mp4 -vn -af silencedetect=noise=-20dB:d=0.2 -f null NUL`,
      (error, stdout, stderr) => {
        const silenceEnds: number[] = [];
        const regex = /silence_end:\s([\d.]+)/g;
        let match;

        while ((match = regex.exec(stderr)) !== null) {
          silenceEnds.push(Math.floor(Number(match[1])));
        }

        // 重複除去
        const uniqueSilenceEnds = [...new Set(silenceEnds)];

        const topPeaks = uniqueSilenceEnds
          .slice(0, 5)
          .map((second) => ({
            second,
            volume: 100,
          }));

        console.log("silenceEnds:", uniqueSilenceEnds);

        resolve(
          NextResponse.json({
            success: true,
            silenceEnds: uniqueSilenceEnds,
            topPeaks,
          })
        );
      }
    );
  });
}