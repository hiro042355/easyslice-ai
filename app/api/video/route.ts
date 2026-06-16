import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import os from "os";

export async function GET() {
  try {
    const filePath = path.join(os.tmpdir(), 'downloaded.mp4');
    const file = await readFile(filePath);
    
    return new Response(file, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': 'inline',
      },
    });
  } catch (e) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }
}