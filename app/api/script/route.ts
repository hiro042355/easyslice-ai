import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ClipItem = {
  start: string;
  end: string;
  title?: string;
  reason?: string;
  score?: number;
};

function cleanJsonText(text: string) {
  return text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
}

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

const clips = Array.isArray(body.clips)
  ? (body.clips as ClipItem[]).slice(0, 3)
  : [];

const videoTitle = body.videoTitle as string | undefined;
const summary = body.summary as string | undefined;

const allowedLengths = ["15", "30", "60", "90"] as const;
const length = allowedLengths.includes(String(body.length) as "15" | "30" | "60" | "90")
  ? (String(body.length) as "15" | "30" | "60" | "90")
  : "30";

    if (!Array.isArray(clips) || clips.length === 0) {
      return NextResponse.json(
        { success: false, error: "クリップ候補がありません" },
        { status: 400 }
      );
    }

    const targetLength = length || "30";

    const clipText = clips
      .slice(0, 5)
      .map((clip, index) => {
        return [
          `Clip ${index + 1}`,
          `start: ${clip.start}`,
          `end: ${clip.end}`,
          `title: ${clip.title || ""}`,
          `reason: ${clip.reason || ""}`,
          `score: ${clip.score || 0}`,
        ].join("\n");
      })
      .join("\n\n");

    const prompt = `
あなたはYouTube Shorts、TikTok、Instagram Reels向けのショート動画台本作成AIです。

以下の動画情報と切り抜き候補から、投稿用の台本を作ってください。

条件:
- 必ず日本語で返す
- ${targetLength}秒程度で読める長さにする
- 冒頭1〜2秒で興味を引く
- 中盤で内容を分かりやすく伝える
- 最後にコメントや保存を促す
- 誇張しすぎない
- ナレーションとして読みやすくする
- 必ずJSONだけで返す
- Markdownや説明文は不要

返却形式:
{
  "hook": "冒頭の一言",
  "script": "本編台本",
  "ending": "締めの一言",
  "fullScript": "hook、script、endingをつなげた全文",
  "length": "${targetLength}"
}

元動画タイトル:
${videoTitle || "不明"}

要約:
${summary || "なし"}

切り抜き候補:
${clipText}
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

    if (!res.ok) {
      const message = await res.text();

      if (res.status === 429) {
        return NextResponse.json(
          {
            success: false,
            error: "AIの無料利用上限に達しました。少し時間をおいて再度試してください。",
          },
          { status: 429 }
        );
      }

if (res.status === 503) {
  const fallbackScript = {
    hook: "この場面、見逃せません。",
    script: "今回の注目ポイントは、このクリップの展開です。",
    ending: "続きが気になる人は、ぜひチェックしてください。",
    fullScript:
      "この場面、見逃せません。\n今回の注目ポイントは、このクリップの展開です。\n続きが気になる人は、ぜひチェックしてください。",
    length,
  };

  return NextResponse.json({
    success: true,
    fallback: true,
    script: fallbackScript,
  });
}

      return NextResponse.json(
        { success: false, error: message || "台本生成に失敗しました" },
        { status: 500 }
      );
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return NextResponse.json(
        { success: false, error: "AIの返答が空です" },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(cleanJsonText(text));

    return NextResponse.json({
      success: true,
      script: {
        hook: parsed.hook || "",
        script: parsed.script || "",
        ending: parsed.ending || "",
        fullScript:
          parsed.fullScript ||
          [parsed.hook, parsed.script, parsed.ending].filter(Boolean).join("\n"),
        length: parsed.length || targetLength,
      },
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false, error: "台本生成に失敗しました" },
      { status: 500 }
    );
  }
}