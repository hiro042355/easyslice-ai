import { NextResponse } from "next/server";
import { stat } from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import os from "os";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
const type = searchParams.get("type");

const fileName =
  type === "burned" ? "burned-subtitle.mp4" : "downloaded.mp4";

const filePath = path.join(os.tmpdir(), fileName);
    const fileStat = await stat(filePath);
    const fileSize = fileStat.size;

    const range = req.headers.get("range");

    if (!range) {
      return new Response(createReadStream(filePath) as any, {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(fileSize),
          "Accept-Ranges": "bytes",
          "Content-Disposition": "inline",
        },
      });
    }

    const parts = range.replace(/bytes=/, "").split("-");
    const start = Number(parts[0]);
    const end = parts[1] ? Number(parts[1]) : fileSize - 1;
    const chunkSize = end - start + 1;

    const stream = createReadStream(filePath, {
      start,
      end,
    });

    return new Response(stream as any, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Type": "video/mp4",
        "Content-Disposition": "inline",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Video not found" },
      { status: 404 }
    );
  }
}