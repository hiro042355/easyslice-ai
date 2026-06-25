import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    success: true,
    transcript:
      "これは自動字幕のテストです。\nここに動画の文字起こし結果が表示されます。\n次のステップで本物の音声解析につなげます。",
  });
}