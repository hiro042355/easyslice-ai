import {dispatchInstalledTikTokApplication} from "../../../../lib/server/tiktokApplication/request";
export const runtime="nodejs";
export function POST(request:Request){return dispatchInstalledTikTokApplication("disconnect",request);}
