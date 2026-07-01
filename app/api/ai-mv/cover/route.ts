import { NextResponse } from "next/server";

type CoverRequest = {
  prompt?: string;
};

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "GEMINI_API_KEY が設定されていません" },
        { status: 500 }
      );
    }

    const body = (await request.json()) as CoverRequest;
    const prompt = body.prompt?.trim();

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: "画像生成用プロンプトがありません" },
        { status: 400 }
      );
    }

    const imagePrompt = `
Create a square album cover image.

Requirements:
- no text
- no logo
- no watermark
- no existing character
- no real artist
- cinematic
- emotional
- high quality
- album cover composition
- 1:1 square image

Prompt:
${prompt}
`;

    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: imagePrompt }],
            },
          ],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
          },
        }),
      }
    );

    if (!res.ok) {
      const message = await res.text();

      return NextResponse.json(
        {
          success: false,
          error: message || "ジャケット画像生成に失敗しました",
        },
        { status: res.status }
      );
    }

    const data = await res.json();

    const imagePart = data.candidates?.[0]?.content?.parts?.find(
      (part: { inlineData?: { mimeType?: string; data?: string } }) =>
        part.inlineData?.data
    );

    const inlineData = imagePart?.inlineData;

    if (!inlineData?.data) {
      return NextResponse.json(
        { success: false, error: "画像データを取得できませんでした" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      imageUrl: `data:${inlineData.mimeType || "image/png"};base64,${
        inlineData.data
      }`,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false, error: "ジャケット画像生成に失敗しました" },
      { status: 500 }
    );
  }
}