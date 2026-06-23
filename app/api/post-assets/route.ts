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
const clips = body.clips as ClipItem[];
const videoTitle = body.videoTitle as string | undefined;

if (!Array.isArray(clips) || clips.length === 0) {
  return NextResponse.json(
    { success: false, error: "クリップ候補がありません" },
    { status: 400 }
  );
}

const safeClips = clips.slice(0, 3);

const clipText = safeClips
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
あなたはYouTube Shorts、TikTok、Instagram Reels向けの投稿企画AIです。

以下の切り抜き候補から、投稿に使える素材を作ってください。

条件:
- 必ず日本語で返す
- 視聴者がクリックしたくなる表現にする
- 誇張しすぎない
- ハッシュタグは日本語と英語を混ぜてよい
- 必ずJSONだけで返す
- Markdownや説明文は不要
- thumbnailTextは短く強い言葉にする
- thumbnailSubTextは補足として使える短い文章にする
- thumbnailLayoutは文字配置や見せ方を具体的に書く
- thumbnailMoodはサムネ全体の印象を短く書く

返却形式:
{
  "items": [
    {
      "clipIndex": 1,
      "postTitle": "投稿タイトル案",
      "description": "投稿説明文",
      "hashtags": ["#shorts", "#動画編集"],
      "thumbnailText": "サムネのメイン文言",
      "thumbnailSubText": "サムネの補足文言",
      "thumbnailLayout": "サムネの構成案",
      "thumbnailMood": "サムネの雰囲気"
    }
  ]
}

元動画タイトル:
${videoTitle || "不明"}

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
        return NextResponse.json(
          {
            success: false,
            error: "AIが混雑しています。少し時間をおいて再度試してください。",
          },
          { status: 503 }
        );
      }

      return NextResponse.json(
        { success: false, error: message || "投稿素材生成に失敗しました" },
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
    const items = Array.isArray(parsed.items) ? parsed.items : [];

    return NextResponse.json({
      success: true,
      items,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false, error: "投稿素材生成に失敗しました" },
      { status: 500 }
    );
  }
}