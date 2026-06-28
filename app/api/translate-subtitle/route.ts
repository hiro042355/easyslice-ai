import { NextResponse } from "next/server";

const cleanJsonText = (text: string) =>
  text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "GEMINI_API_KEY が設定されていません" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const transcript = String(body.transcript ?? "");
    const direction = String(body.direction ?? "en-to-ja");

    if (!transcript.trim()) {
      return NextResponse.json(
        { success: false, error: "翻訳する字幕テキストがありません" },
        { status: 400 }
      );
    }

    const targetInstruction =
      direction === "ja-to-en"
        ? "日本語の字幕を、英語のショート動画向けに自然な英語へ翻訳してください。"
        : "英語の字幕を、日本語のショート動画向けに自然な日本語へ翻訳してください。";

    const prompt = `
あなたはショート動画向けの字幕翻訳アシスタントです。

次の字幕テキストを翻訳してください。

条件:
- 直訳ではなく、ショート動画で読みやすい自然な話し言葉にする
- 意味を変えない
- 1行を短めにする
- 余計な説明は出さない
- JSONだけで返す

${targetInstruction}

返却形式:
{
  "translatedText": "翻訳後の字幕テキスト"
}

字幕:
${transcript}
`;

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
              parts: [{ text: prompt }],
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
            "翻訳AIが混雑しています。少し時間をおいて再度試してください。",
        },
        { status: res.status }
      );
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const parsed = JSON.parse(cleanJsonText(text));

    return NextResponse.json({
      success: true,
      translatedText: String(parsed.translatedText ?? ""),
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      { success: false, error: "字幕翻訳に失敗しました" },
      { status: 500 }
    );
  }
}
