export const config = {
  runtime: "nodejs",
};
console.log("API runtime check:", process.env.NEXT_RUNTIME);

import type { NextApiRequest, NextApiResponse } from "next";
import ytdl from "ytdl-core";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url } = req.body;

  if (!url || !ytdl.validateURL(url)) {
    return res.status(400).json({ error: "URLが正しくないよ" });
  }

  try {
    const info = await ytdl.getInfo(url);
    const format = ytdl.chooseFormat(info.formats, { quality: "highest" });

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", "attachment; filename=video.mp4");

    ytdl(url, { format }).pipe(res);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "取得に失敗したよ" });
  }
}
