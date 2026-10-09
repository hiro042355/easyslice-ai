import {dispatchReviewRequest} from "../../../../../lib/server/tiktokReview/request";
export const runtime="nodejs";
export function POST(request:Request){return dispatchReviewRequest("publish",request);}
