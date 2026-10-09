import {dispatchInstalledTikTokApplication} from "../../../../../lib/server/tiktokApplication/request";
export const runtime="nodejs";
export async function GET(request:Request){const result=await dispatchInstalledTikTokApplication("callback",request);if(result.status===400&&request.headers.get("accept")?.includes("text/html"))return new Response(null,{status:303,headers:{Location:"https://www.nexcutai.com/settings/connections?tiktok=error","Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});return result;}
