import { NextResponse } from "next/server";

type AiMvRequest = {
  story?: string;
  theme?: string;
  genre?: string;
  mood?: string;
  length?: string;
  revisionMode?: string;
};

type AiMvScene = {
  time?: string;
  title: string;
  description: string;
};

type LyricVisualMatch = {
  lyric: string;
  visual: string;
  intent: string;
};

type PlatformPosts = {
  tiktok: string;
  shorts: string;
  reels: string;
};

type AiMvScore = {
  emotion: number;
  visualMatch: number;
  snsHook: number;
  originality: number;
  improvement: string;
};

type AiMvResult = {
  title: string;
  hook: string;
  lyrics: string;
  mvConcept: string;
  visualHook: string;
  scenes: AiMvScene[];
  lyricVisualMatches: LyricVisualMatch[];
  shortMvPlan: string;
  thirtySecondMvPlan: string;
  jacketDesign: string;
  jacketPrompt: string;
  thumbnailText: string;
postTitle: string;
postDescription: string;
platformPosts: PlatformPosts;
hashtags: string[];
score: AiMvScore;
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
const revisionMode = body.revisionMode?.trim() || "";

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
  revisionMode,
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
  revisionMode,
}: {
  story: string;
  theme: string;
  genre?: string;
  mood?: string;
  length: string;
  revisionMode: string;
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
- hookはTikTok、YouTube Shorts、Instagram Reelsの冒頭3秒で使える強い一言にする
- hookは煽りすぎず、ユーザーの出来事や感情に合う自然な言葉にする
- jacketPromptは英語で書く
- jacketPromptには文字、ロゴ、既存キャラクター、実在アーティスト名を含めない
- jacketPromptは画像生成AIが理解しやすいように、被写体、背景、色、光、構図、質感を具体的に書く
- shortMvPlanはSNSショート動画向けに、冒頭3秒の引きを重視する
- thirtySecondMvPlanは物語の起承転結が伝わるように構成する
- どちらも実際に映像化しやすい具体的なカット案にする
- platformPosts.tiktokは短く強い感情フックを重視する
- platformPosts.shortsは何をAIで作ったのか分かりやすくする
- platformPosts.reelsは雰囲気と余韻を重視する
- visualHookはSNSでスクロールを止めるための強い映像アイデアにする
- visualHookは歌詞の感情と矛盾しないようにする
- lyricVisualMatchesは歌詞の重要な言葉と映像カットを対応させる
- lyricVisualMatchesのintentでは、なぜその映像が歌詞に合うのかを説明する
- scoreの各数値は0〜100で評価する
- emotionは歌詞や物語の感情が伝わる強さ
- visualMatchは歌詞と映像案が合っている度合い
- snsHookはSNSで続きを見たくなる度合い
- originalityは作品としての独自性
- improvementは改善点を1文で具体的に書く
- revisionModeが標準以外の場合、その改善方向を最優先で反映する
- もっと泣ける作品にする場合は、感情の余韻、喪失感、救いを強める
- SNSでバズりやすい作品にする場合は、冒頭3秒フック、サムネ文言、映像フックを強める
- 映像表現をもっと派手で印象的にする場合は、色、光、カメラワーク、象徴的なカットを強める
- 歌詞と構成を短く鋭くする場合は、歌詞を短めにし、印象的な言葉を増やす

入力:
story: ${story}
theme: ${theme}
genre: ${genre}
mood: ${mood}
length: ${length}
revisionMode: ${revisionMode || "標準"}

JSON形式:
{
  "title": "曲タイトル",
  "hook": "ショート動画の冒頭3秒に表示する一言。15〜35文字程度で、思わず続きを見たくなる言葉",
  "lyrics": "歌詞。VerseやChorusを含めて改行つきで書く",
"mvConcept": "MV全体のコンセプト",
"visualHook": "冒頭で視聴者の目を止める映像アイデア。1カットで強く伝わる、意外性や象徴性のある映像にする",
"shortMvPlan": "15秒版MV構成。0-3秒、3-8秒、8-12秒、12-15秒のように時間別で、画面に何を映すかを書く",
"thirtySecondMvPlan": "30秒版MV構成。0-3秒、3-10秒、10-20秒、20-30秒のように時間別で、展開を具体的に書く",
"scenes": [
    {
      "time": "0:00-0:15",
      "title": "シーン名",
      "description": "映像内容"
    }
  ],
  "lyricVisualMatches": [
  {
    "lyric": "歌詞の重要な一節",
    "visual": "その歌詞に対応する映像カット",
    "intent": "その映像で伝えたい感情や意味"
  }
],
"jacketDesign": "ジャケットデザイン案。日本語で説明する",
"jacketPrompt": "画像生成AIに渡すための英語プロンプト。album cover, cinematic, emotional, no text, no logo を含め、人物、背景、色、光、構図を具体的に書く",
"thumbnailText": "サムネ文言",
"postTitle": "SNS投稿タイトル",
"postDescription": "SNS投稿説明文",
"platformPosts": {
  "tiktok": "TikTok向けの投稿文。短く、感情が一瞬で伝わる文にする",
  "shorts": "YouTube Shorts向けの投稿文。少し説明的で、企画内容が分かる文にする",
  "reels": "Instagram Reels向けの投稿文。余韻と雰囲気を重視した文にする"
},
"hashtags": ["#NEXCUTAI", "#AIMV"]
"score": {
  "emotion": 85,
  "visualMatch": 80,
  "snsHook": 75,
  "originality": 78,
  "improvement": "もっと印象に残る象徴的な映像を冒頭に置くと、SNSで止まりやすくなります"
}
}
`;
}

function validateAiMvResult(result: Partial<AiMvResult>): AiMvResult {
return {
  title: typeof result.title === "string" ? result.title : "Untitled",
  hook: typeof result.hook === "string" ? result.hook : "",
  lyrics: typeof result.lyrics === "string" ? result.lyrics : "",
mvConcept: typeof result.mvConcept === "string" ? result.mvConcept : "",
visualHook:
  typeof result.visualHook === "string" ? result.visualHook : "",
shortMvPlan:
  typeof result.shortMvPlan === "string" ? result.shortMvPlan : "",
thirtySecondMvPlan:
  typeof result.thirtySecondMvPlan === "string"
    ? result.thirtySecondMvPlan
    : "",
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
lyricVisualMatches: Array.isArray(result.lyricVisualMatches)
  ? result.lyricVisualMatches
      .filter((item) => item && typeof item.lyric === "string")
      .map((item) => ({
        lyric: item.lyric,
        visual: typeof item.visual === "string" ? item.visual : "",
        intent: typeof item.intent === "string" ? item.intent : "",
      }))
  : [],
jacketDesign:
  typeof result.jacketDesign === "string" ? result.jacketDesign : "",
jacketPrompt:
  typeof result.jacketPrompt === "string" ? result.jacketPrompt : "",
thumbnailText:
  typeof result.thumbnailText === "string" ? result.thumbnailText : "",
    postTitle: typeof result.postTitle === "string" ? result.postTitle : "",
    postDescription:
      typeof result.postDescription === "string" ? result.postDescription : "",
      platformPosts: {
  tiktok:
    typeof result.platformPosts?.tiktok === "string"
      ? result.platformPosts.tiktok
      : "",
  shorts:
    typeof result.platformPosts?.shorts === "string"
      ? result.platformPosts.shorts
      : "",
  reels:
    typeof result.platformPosts?.reels === "string"
      ? result.platformPosts.reels
      : "",
},
    hashtags: Array.isArray(result.hashtags)
      ? result.hashtags.filter((tag) => typeof tag === "string")
      : [],
      score: {
  emotion:
    typeof result.score?.emotion === "number" ? result.score.emotion : 0,
  visualMatch:
    typeof result.score?.visualMatch === "number"
      ? result.score.visualMatch
      : 0,
  snsHook:
    typeof result.score?.snsHook === "number" ? result.score.snsHook : 0,
  originality:
    typeof result.score?.originality === "number"
      ? result.score.originality
      : 0,
  improvement:
    typeof result.score?.improvement === "string"
      ? result.score.improvement
      : "",
},
  };
}