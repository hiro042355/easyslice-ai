import Link from "next/link";

export default function GuidePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-black via-zinc-900 to-blue-950 text-white">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/"
          className="mb-8 inline-block text-cyan-300 hover:text-cyan-200"
        >
          ← アプリへ戻る
        </Link>

        <h1 className="mb-4 text-4xl font-bold text-cyan-300">
          NEXCUT AI 使い方ガイド
        </h1>

        <p className="mb-10 text-gray-300">
          NEXCUT AIは、動画からショート動画向けの切り抜き候補を作成し、
          複数のMP4クリップをZIPでまとめてダウンロードできるツールです。字幕編集やCreator Styleにも対応しています。
        </p>
<section id="video" className="mb-10 rounded-xl border border-cyan-500/20 bg-zinc-900/70 p-5">
  <h2 className="mb-3 text-2xl font-bold text-cyan-300">
    2分で使い方を見る
  </h2>
<div className="mt-6 overflow-hidden rounded-xl border border-cyan-500/20 bg-zinc-950">
  <div className="aspect-video w-full bg-black">
   <iframe
  src="https://www.youtube.com/embed/DaxWpqigjrs"
  title="2分でわかる NEXCUT AI"
  className="h-full w-full"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
  allowFullScreen
/>
  </div>
</div>

  <p className="mb-4 text-gray-300">
    動画アップロードから、AI解析、Clip確認、投稿素材生成、自動字幕、翻訳字幕、動画書き出しまでの流れを短い動画で確認できます。
  </p>


</section>
        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-bold text-white">
            基本の使い方
          </h2>

          <ol className="space-y-3 text-gray-300">
            <li>1. 動画ファイルをアップロードします</li>
            <li>2. 字幕がある場合は、字幕ファイルをアップロードします</li>
            <li>3. 字幕がある動画は「字幕AIハイライト」を使います</li>
            <li>4. 字幕がない動画や音楽動画は「音声ハイライト」を使います</li>
            <li>5. 候補をプレビューします</li>
            <li>6. 必要に応じて開始秒・終了秒を調整します</li>
            <li>7. 「ZIP一括生成」でMP4クリップをダウンロードします</li>
          </ol>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-bold text-white">
            字幕ファイル
          </h2>

          <p className="mb-4 text-gray-300">
            対応形式は .txt / .srt / .vtt です。
          </p>

          <div className="rounded-xl border border-white/10 bg-zinc-900 p-4 text-sm text-gray-300">
            <p>10 This is the opening moment</p>
            <p>25 Something surprising happens here</p>
            <p>40 This is the most important part</p>
            <p>55 The conclusion starts here</p>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-bold text-white">
            字幕AIハイライト
          </h2>
          <section className="mt-8 rounded-xl border border-emerald-500/20 bg-zinc-900/70 p-5">
  <h2 className="text-xl font-bold text-emerald-300">
    多言語字幕 β
  </h2>

  <p className="mt-3 text-sm leading-6 text-gray-300">
    NEXCUT AIでは、海外動画や日本語動画を多言語向けに変換する
    「多言語字幕」機能を検討しています。
  </p>

  <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-gray-300">
    <li>英語から日本語への翻訳字幕</li>
    <li>日本語から英語への翻訳字幕</li>
    <li>日本語＋英語の二段字幕</li>
    <li>ショート動画向けに自然な話し言葉へ変換</li>
  </ul>

  <p className="mt-4 text-xs leading-5 text-gray-400">
    動画ファイルをアップロードし、文字起こしした内容をもとに翻訳字幕を生成する形を想定しています。
  </p>
  <div className="mt-5 rounded-xl border border-white/10 bg-zinc-950/70 p-4">
  <h3 className="font-semibold text-emerald-300">
    使い方
  </h3>

  <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-gray-300">
    <li>動画をアップロードします</li>
    <li>STEP3で短めのClipを作成します</li>
    <li>STEP4で「自動字幕生成」を押します</li>
    <li>字幕が表示されたら、翻訳方向を選びます</li>
    <li>「字幕を翻訳する」を押します</li>
    <li>必要に応じて「翻訳字幕付き動画を作る」を押します</li>
  </ol>

  <p className="mt-4 text-xs leading-5 text-gray-400">
    日本語動画を英語字幕にしたい場合は「日本語 → 英語」、
    英語動画を日本語字幕にしたい場合は「英語 → 日本語」を選んでください。
  </p>
</div>
</section>

          <p className="text-gray-300">
            字幕の内容をもとに、AIが切り抜き候補を作成します。
            解説動画、インタビュー、講義、トーク動画に向いています。
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-bold text-white">
            音声ハイライト
          </h2>

          <p className="text-gray-300">
            字幕がない動画や音楽動画では、音の盛り上がりをもとに候補を作成します。
            音楽、スポーツ、字幕なし動画に向いています。
          </p>
        </section>
<section className="mb-10">
  <h2 className="mb-4 text-2xl font-bold text-white">
    AI台本生成
  </h2>
<section className="mb-10">
  <h2 className="mb-4 text-2xl font-bold text-white">
    サムネ画像の使い方
  </h2>

  <p className="mb-4 text-gray-300">
    投稿素材生成で作られたサムネ案は、画像として保存できます。
    保存した画像は、YouTube Shorts、TikTok、Instagram Reelsなどの投稿準備に使えます。
  </p>

  <div className="rounded-xl border border-white/10 bg-zinc-900 p-4 text-sm text-gray-300">
    <p className="font-semibold text-cyan-300">
      使い方
    </p>

    <ol className="mt-3 list-decimal space-y-2 pl-5">
      <li>投稿素材生成を押します</li>
      <li>サムネ案が表示されたら「サムネ画像を保存」を押します</li>
      <li>保存された画像を確認します</li>
      <li>必要に応じてCanvaなどで文字や画像を調整します</li>
      <li>完成した画像を投稿時のサムネイルとして使います</li>
    </ol>
  </div>
</section>
  <p className="mb-4 text-gray-300">
    Clip候補をもとに、ショート動画向けのナレーション台本を生成できます。
    15秒、30秒、60秒、90秒の長さを選べます。
  </p>

  <div className="rounded-xl border border-white/10 bg-zinc-900 p-4 text-sm text-gray-300">
    <p className="font-semibold text-amber-300">例</p>
    <p className="mt-3">Hook: この一言、あなたはどう感じますか？</p>
    <p className="mt-2">Script: 今回の動画では、心に残る瞬間を短く紹介します...</p>
    <p className="mt-2">Ending: あなたならどうしますか？コメントで教えてください。</p>
  </div>
</section>        <section className="mb-10 rounded-xl border border-sky-500/20 bg-zinc-900/70 p-5">
          <h2 className="mb-4 text-2xl font-bold text-sky-300">
            Subtitle Editor
          </h2>

          <p className="text-sm leading-6 text-gray-300">
            自動字幕を生成したあと、Preview Studioの近くで字幕を修正できます。
            AIが作った字幕をそのまま使うだけでなく、投稿前にクリエイター自身が整えられます。
          </p>

          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-gray-300">
            <li>字幕テキストの編集</li>
            <li>改行の調整</li>
            <li>開始時間・終了時間の微調整</li>
            <li>字幕の追加・削除</li>
            <li>編集内容をPreview Studioへ反映</li>
          </ul>

          <p className="mt-4 text-xs leading-5 text-gray-400">
            翻訳字幕がある場合は、字幕編集後に「翻訳字幕も更新」の導線が表示されます。翻訳の再生成接続は今後の改善対象です。
          </p>
        </section>

        <section className="mb-10 rounded-xl border border-cyan-500/20 bg-zinc-900/70 p-5">
          <h2 className="mb-4 text-2xl font-bold text-cyan-300">
            Creator Style
          </h2>

          <p className="text-sm leading-6 text-gray-300">
            Creator Styleは、字幕付き動画を少し目立たせるための演出設定です。
            Open Beta 0.2.0では、字幕サイズと簡易アニメーションをCreator Styleに応じて反映します。
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-zinc-950/70 p-4">
              <h3 className="font-semibold text-white">Standard</h3>
              <p className="mt-2 text-sm leading-6 text-gray-300">
                いつものNEXCUT。読みやすく安全。演出を追加せず、現在の出力を維持します。
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-zinc-950/70 p-4">
              <h3 className="font-semibold text-white">Creator</h3>
              <p className="mt-2 text-sm leading-6 text-gray-300">
                字幕に動きと強調を追加します。作品を少し目立たせたいときに使います。
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-zinc-950/70 p-4">
            <h3 className="font-semibold text-cyan-300">Animation Intensity</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-gray-300">
              <li>1: 控えめ</li>
              <li>3: バランス</li>
              <li>5: 遊び強め</li>
            </ul>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-bold text-white">
            画質について
          </h2>

          <p className="mb-4 text-gray-300">
            NEXCUT AIでは、生成するクリップの画質をできるだけ保つため、
            元動画の映像を再圧縮せずに切り抜く方式を使っています。
          </p>

          <ul className="space-y-2 text-gray-300">
            <li>・元動画に近い画質を保ちやすい</li>
            <li>・処理が速い</li>
            <li>・開始位置がほんの少しズレることがあります</li>
            <li>・一部の動画では、最初の一瞬が黒くなることがあります</li>
            <li>・元動画の画質が低い場合、生成されるクリップも低画質になります</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-2xl font-bold text-white">
            YouTube URL機能について
          </h2>

          <p className="text-gray-300">
            YouTube URLからの動画取得は、ローカル環境向けの実験機能です。
            公開版では、動画アップロードを推奨します。
          </p>
        </section>

        <section>
          <h2 className="mb-4 text-2xl font-bold text-white">
            Gemini APIについて
          </h2>

          <p className="text-gray-300">
            字幕AIハイライトではGemini APIを使用します。
            無料枠には上限があります。上限に達した場合は、時間をおいて再度試してください。
          </p>
        </section>
        <section className="mb-10 rounded-xl border border-fuchsia-500/20 bg-zinc-900/70 p-5">
  <h2 className="mb-4 text-2xl font-bold text-fuchsia-300">
    フィードバック・不具合報告
  </h2>

  <p className="mb-4 text-gray-300">
    使い方で分かりにくいところ、不具合、追加してほしい機能があればお知らせください。
    今後の改善に反映します。
  </p>

<div className="mt-6 rounded-xl bg-black/40 p-4">
  <p className="font-semibold text-white">
    連絡先
  </p>

  <p className="mt-2 text-sm leading-6 text-gray-300">
    不具合報告、改善要望、使い方の質問はこちらからお送りください。
  </p>

  <a
    href="mailto:nexcut.ai@gmail.com"
    className="mt-4 inline-block rounded-lg bg-cyan-500 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-400"
  >
    メールで問い合わせる
  </a>
</div>
</section>
      </div>
    </main>
  );
}