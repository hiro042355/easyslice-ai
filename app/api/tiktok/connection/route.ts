import {dispatchInstalledTikTokApplication} from "../../../../lib/server/tiktokApplication/request";
export const runtime="nodejs";
export function GET(request:Request){return dispatchInstalledTikTokApplication("connection",request);}
