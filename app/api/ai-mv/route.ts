import { NextResponse } from "next/server";

type AiMvRequest = {
  story?: string;
  theme?: string;
  genre?: string;
  mood?: string;
  length?: string;
};

type AiMvScene = {
  time?: string;
  title: string;
  description: string;
};

type AiMvResult = {
  title: string;
  lyrics: string;
  mvConcept: string;
  scenes: AiMvScene[];
  jacketDesign: string;
  thumbnailText: string;
  postTitle: string;
  postDescription: string;
  hashtags: string[];
};

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY が設定されていません。" },
        { status: 500 }
      );
    }

    const body = (await request.json()) as AiMvRequest;

const story = body.story?.trim();
const theme = body.theme?.trim() || "日記";
const genre = body.genre?.trim();
const mood = body.mood?.trim();
const length = body.length?.trim() || "medium";

    if (!story || story.length < 10) {
      return NextResponse.json(
        { error: "出来事や思い出を10文字以上で入力してください。" },
        { status: 400 }
      );
    }

    if (!genre) {
      return NextResponse.json(
        { error: "ジャンルを選択してください。" },
        { status: 400 }
      );
    }

    if (!mood) {
      return NextResponse.json(
        { error: "雰囲気を選択してください。" },
        { status: 400 }
      );
    }

const prompt = buildAiMvPrompt({
  story,
  theme,
  genre,
  mood,
  length,
});

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
          { error: "AIが混雑しています。少し時間をおいて再度試してください。" },
          { status: 503 }
        );
      }

      if (res.status === 429) {
        return NextResponse.json(
          { error: "AIの無料利用上限に達しました。少し時間をおいて再度試してください。" },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: message || "Gemini API エラー" },
        { status: 500 }
      );
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return NextResponse.json(
        { error: "AIの生成結果が空でした。再度お試しください。" },
        { status: 500 }
      );
    }

    const cleanedText = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let parsed: AiMvResult;

    try {
      parsed = JSON.parse(cleanedText);
    } catch {
      return NextResponse.json(
        { error: "AIの生成結果を解析できませんでした。再度お試しください。" },
        { status: 500 }
      );
    }

    const result = validateAiMvResult(parsed);

    return NextResponse.json(result);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "AI MV生成に失敗しました。" },
      { status: 500 }
    );
  }
}

function buildAiMvPrompt({
  story,
  theme,
  genre,
  mood,
  length,
}: {
  story: string;
  theme: string;
  genre: string;
  mood: string;
  length: string;
}) {
  return `
あなたはNEXCUT AIのAI MVプランナーです。
ユーザーの日記、出来事、思い出、感情をもとに、SNS投稿に向いた音楽作品の企画を作成してください。

目的:
ユーザーの人生の一場面を、曲タイトル・歌詞・MV構成・ジャケット案・投稿素材に変換すること。

重要ルール:
- 既存曲、実在アーティスト、特定作品の模倣は避ける
- 歌詞は完全オリジナルにする
- 実在人物の声や作風コピーを前提にしない
- ユーザーの感情を尊重し、過度に茶化さない
- SNSに投稿しやすい言葉にする
- 必ずJSONだけを返す
- Markdownやコードブロックは返さない

入力:
story: ${story}
theme: ${theme}
genre: ${genre}
mood: ${mood}
length: ${length}

JSON形式:
{
  "title": "曲タイトル",
  "lyrics": "歌詞。VerseやChorusを含めて改行つきで書く",
  "mvConcept": "MV全体のコンセプト",
  "scenes": [
    {
      "time": "0:00-0:15",
      "title": "シーン名",
      "description": "映像内容"
    }
  ],
  "jacketDesign": "ジャケットデザイン案",
  "thumbnailText": "サムネ文言",
  "postTitle": "SNS投稿タイトル",
  "postDescription": "SNS投稿説明文",
  "hashtags": ["#NEXCUTAI", "#AIMV"]
}
`;
}

function validateAiMvResult(result: Partial<AiMvResult>): AiMvResult {
  return {
    title: typeof result.title === "string" ? result.title : "Untitled",
    lyrics: typeof result.lyrics === "string" ? result.lyrics : "",
    mvConcept: typeof result.mvConcept === "string" ? result.mvConcept : "",
    scenes: Array.isArray(result.scenes)
      ? result.scenes
          .filter((scene) => scene && typeof scene.title === "string")
          .map((scene) => ({
            time: typeof scene.time === "string" ? scene.time : undefined,
            title: scene.title,
            description:
              typeof scene.description === "string" ? scene.description : "",
          }))
      : [],
    jacketDesign:
      typeof result.jacketDesign === "string" ? result.jacketDesign : "",
    thumbnailText:
      typeof result.thumbnailText === "string" ? result.thumbnailText : "",
    postTitle: typeof result.postTitle === "string" ? result.postTitle : "",
    postDescription:
      typeof result.postDescription === "string" ? result.postDescription : "",
    hashtags: Array.isArray(result.hashtags)
      ? result.hashtags.filter((tag) => typeof tag === "string")
      : [],
  };
}