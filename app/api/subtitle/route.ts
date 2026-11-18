import { NextResponse } from "next/server";
import {runMediaProcess,withRequestMediaWorkspace} from "@/lib/server/requestMediaWorkspace";
import { parseJson3Subtitles, subtitleSourceUrl } from "@/lib/server/subtitleSafety";
import path from "path";
import fs from "fs";
import { readdir, readFile } from "fs/promises";
import { CLIP_FINAL_SELECTION_POLICY_V1 } from "@/lib/clipCandidates";
import { requireAuthenticatedRequest } from "@/lib/server/productionIdentity/routeGuard";
import {readBoundedJsonBody} from '@/lib/server/boundedJsonBody';

export async function POST(req: Request) {
  const authentication = await requireAuthenticatedRequest(req);
  if (!authentication.ok) return authentication.response;
  if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({success:false,error:'invalid-origin'},{status:403});
  const body = await readBoundedJsonBody(req,8192).catch(() => null);
  const url = subtitleSourceUrl(body && typeof body === "object" && "url" in body ? body.url : undefined);

  if (!url) {
    return NextResponse.json(
      { success: false, error: "URLがありません" },
      { status: 400 }
    );
  }

  try {
    return await withRequestMediaWorkspace(async workspace => {
    const ytDlpPath = process.platform === "win32" ? path.resolve("./yt-dlp.exe") : "yt-dlp";
    const subtitleDir=workspace.root;
    const outputBase=path.join(subtitleDir,"subtitle");
    const cookiesPath=workspace.file("cookies.txt");
    if(process.env.YOUTUBE_COOKIES) fs.writeFileSync(cookiesPath,process.env.YOUTUBE_COOKIES,{flag:"wx",mode:0o600});
    const args=[...(fs.existsSync(cookiesPath)?["--cookies",cookiesPath]:[]),"--write-auto-subs","--write-subs","--sub-langs","ja,en","--skip-download","--sub-format","json3","-o",outputBase,"--",url];
    await runMediaProcess(ytDlpPath,args,req.signal);
        const files = (await readdir(subtitleDir)).filter((file) =>
          file.endsWith(".json3")
        );

        if(files.length===0)return NextResponse.json({success:false,error:"字幕ファイルが見つかりません"});
        const preferredFile =
          files.find((file) => file.includes(".ja.")) ??
          files.find((file) => file.includes(".en.")) ??
          files[0];

        const subtitlePath = path.join(subtitleDir, preferredFile);
        const stat = await import("node:fs/promises").then(fs => fs.lstat(subtitlePath));
        if(!stat.isFile() || stat.isSymbolicLink() || stat.size>4*1024*1024)throw Error("invalid-subtitle-file");
        const subtitleData: unknown = JSON.parse(await readFile(subtitlePath, "utf-8"));

        const subtitles = parseJson3Subtitles(subtitleData);

        const keywords: Record<string, number> = {
          衝撃: 5,
          やばい: 4,
          驚き: 4,
          重要: 3,
          結論: 3,
          知らない: 2,
          稼げる: 2,
          危険: 2,
          never: 5,
          amazing: 4,
          incredible: 4,
          important: 3,
          secret: 3,
        };

        const highlights = subtitles
          .map((subtitle) => {
            let score = 0;

            Object.entries(keywords).forEach(([word, value]) => {
              if (subtitle.text.toLowerCase().includes(word.toLowerCase())) {
                score += value;
              }
            });

            return { ...subtitle, score };
          })
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, CLIP_FINAL_SELECTION_POLICY_V1.candidatePoolLimit);

        const fullText = subtitles.map((s) => s.text).join(" ");
        const summary = fullText.slice(0, 500);

        return NextResponse.json({success:true,subtitles,highlights,fullText,summary,subtitleFile:preferredFile});
    },req.signal);
  }catch{
    return NextResponse.json({success:false,error:"字幕取得に失敗しました"},{status:502});
  }
}
