import { NextResponse } from "next/server";
import { exec } from "child_process";

export async function POST() {
  return new Promise((resolve) => {
    exec(
  `ffmpeg -i downloaded.mp4 -af astats=metadata=1:reset=5 -f null NUL`,
      (error, stdout, stderr) => {
        console.log(stderr);

        resolve(
          NextResponse.json({
            success: true,
            log: stderr,
          })
        );
      }
    );
  });
}