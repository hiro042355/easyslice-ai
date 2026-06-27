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
          複数のMP4クリップをZIPでまとめてダウンロードできるツールです。
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
    動画アップロードから、AI解析、Clip確認、投稿素材生成、動画書き出しまでの流れを短い動画で確認できます。
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