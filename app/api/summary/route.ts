import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();
  const text = body.text || "";
  const subtitles = body.subtitles || [];

  const cleanText = text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
  const words = cleanText.split(/\s+/);
  const sentences: string[] = [];
  for (let i = 0; i < words.length; i += 100) {
    sentences.push(words.slice(i, i + 100).join(" "));
  }

  console.log("sentences count:", sentences.length);

  const keywords = [
    "重要", "結論", "衝撃", "驚き", "やばい", "知らない", "危険", "稼げる", "失敗", "成功",
    "never", "amazing", "incredible", "important", "secret",
    "problem", "solution", "best", "worst", "always",
    "actually", "realize", "discovered", "found", "think",
    "procrastin", "deadline", "monkey", "decision",
  ];

  const ranked = sentences.map((sentence: string) => {
    let score = 0;
    keywords.forEach((word) => {
      if (sentence.toLowerCase().includes(word.toLowerCase())) score++;
    });
    const match = subtitles.find((s: { second: number; text: string }) => {
      const words = sentence.toLowerCase().split(" ").filter(Boolean).slice(0, 3);
      return words.some(word => word.length > 3 && s.text.toLowerCase().includes(word));
    });
    return { sentence, score, second: match?.second ?? 0 };
  });

  const highlights = ranked
    .filter((item: any) => item.score > 0)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 5);

  return NextResponse.json({ success: true, highlights });
}