import { NextResponse } from "next/server";

export const runtime = "nodejs";

type SubtitleItem = {
  second: number;
  text: string;
};

type AiClip = {
  start: number;
  end: number;
  reason: string;
  title: string;
  score: number;
};

function buildSubtitleText(subtitles: SubtitleItem[]) {
  return subtitles
    .map((item) => `${item.second}秒: ${item.text}`)
    .join("\n")
    .slice(0, 12000);
}

function validateClips(clips: AiClip[], videoDuration: number | null) {
  return clips
    .filter((clip) => {
      return (
        Number.isFinite(Number(clip.start)) &&
        Number.isFinite(Number(clip.end)) &&
        Number(clip.start) >= 0 &&
        Number(clip.end) > Number(clip.start) &&
        Boolean(clip.reason) &&
        Boolean(clip.title)
      );
    })
    .map((clip) => {
      const start = Number(clip.start);
      let end = Number(clip.end);

      if (end - start > 60) {
        end = start + 60;
      }

      if (videoDuration !== null) {
        end = Math.min(end, videoDuration);
      }

      return {
        start: String(start),
        end: String(end),
        reason: clip.reason,
        title: clip.title,
        score: Math.max(1, Math.min(10, Number(clip.score) || 1)),
      };
    })
    .filter((clip) => Number(clip.end) > Number(clip.start))
    .slice(0, 5);
}

function createFallbackClip(
  subtitles: SubtitleItem[],
  videoDuration: number | null
) {
  const validSubtitle = subtitles.find((item) => {
    const second = Number(item.second);

    if (!Number.isFinite(second) || second < 0) {
      return false;
    }

    if (videoDuration === null || videoDuration <= 0) {
      return true;
    }

    return second < videoDuration;
  });

  if (!validSubtitle) {
    return {
      start: "0",
      end:
        videoDuration !== null && videoDuration > 0
          ? String(Math.min(videoDuration, 5))
          : "5",
      reason: "有効な字幕位置がなかったため、動画冒頭から自動生成しました",
      title: "冒頭ハイライト候補",
      score: 4,
    };
  }

  const fallbackStart = Math.max(0, Number(validSubtitle.second));
  const fallbackEnd =
    videoDuration !== null && videoDuration > 0
      ? Math.min(videoDuration, Math.max(fallbackStart + 1, fallbackStart + 5))
      : fallbackStart + 5;

  return {
    start: String(fallbackStart),
    end: String(fallbackEnd),
    reason: "短い動画のため、字幕位置から自動生成した候補です",
    title: "字幕ベース候補",
    score: 5,
  };
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
    const subtitles = body.subtitles as SubtitleItem[];
    const videoDuration = Number.isFinite(Number(body.videoDuration))
      ? Number(body.videoDuration)
      : null;

    if (!Array.isArray(subtitles) || subtitles.length === 0) {
      return NextResponse.json(
        { success: false, error: "字幕データがありません" },
        { status: 400 }
      );
    }

    const subtitleText = buildSubtitleText(subtitles);

    const durationRule =
      videoDuration !== null
        ? `動画の長さは ${videoDuration} 秒です。startとendは必ず0秒以上、${videoDuration}秒以内にしてください。動画が短い場合は、動画全体または5秒以上の良い区間を選んでください。`
        : "startとendは必ず0秒以上にしてください。";

    const prompt = `
あなたはYouTube ShortsとTikTok向けの動画編集AIです。

以下は動画の字幕です。
各行には秒数と字幕テキストがあります。

目的:
この動画から、Shorts向きの面白い切り抜き候補を最大5個選んでください。

選ぶ基準:
- 視聴者の興味を引く
- 感情の動きがある
- 意外性がある
- 学びや発見がある
- 結論や重要ポイントが含まれる
- 通常は30秒から60秒程度の短尺に向いている
- 動画が短い場合は、動画の長さ以内で最も良い区間を選ぶ
- 短い動画では5秒以上の区間でも構わない

時間の制約:
${durationRule}

必ずJSONだけで返してください。
Markdownや説明文は不要です。

字幕の言語は日本語、英語、またはその他の言語の場合があります。
どの言語でも内容を理解し、返却するtitleとreasonは必ず日本語にしてください。

返却形式:
{
  "clips": [
    {
      "start": 120,
      "end": 155,
      "reason": "なぜ切り抜き向きか",
      "title": "短いタイトル案",
      "score": 1
    }
  ]
}

字幕:
${subtitleText}
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

      if (res.status === 503) {
        return NextResponse.json(
          {
            success: false,
            error: "AIが混雑しています。少し時間をおいて再度試してください。",
          },
          { status: 503 }
        );
      }
if (res.status === 429) {
  return NextResponse.json(
    {
      success: false,
      error: "AIの無料利用上限に達しました。少し時間をおいて再度試してください。",
    },
    { status: 429 }
  );
}
      return NextResponse.json(
        { success: false, error: message || "Gemini API エラー" },
        { status: 500 }
      );
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return NextResponse.json({
        success: true,
        clips: [createFallbackClip(subtitles, videoDuration)],
      });
    }

    const cleanedText = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let parsed: { clips?: AiClip[] };

    try {
      parsed = JSON.parse(cleanedText);
    } catch {
      return NextResponse.json({
        success: true,
        clips: [createFallbackClip(subtitles, videoDuration)],
      });
    }

    const clips = validateClips(parsed.clips || [], videoDuration);

    if (clips.length === 0) {
      return NextResponse.json({
        success: true,
        clips: [createFallbackClip(subtitles, videoDuration)],
      });
    }

    return NextResponse.json({
      success: true,
      clips,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false, error: "AIハイライト生成に失敗しました" },
      { status: 500 }
    );
  }
}