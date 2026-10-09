import "server-only";
import {MockReviewController,type ReviewOperation} from "./controller";
let controller:MockReviewController|undefined;
/** No public registration. Only an isolated test host may install a mock controller. */
export function installMockReviewController(value:MockReviewController){if(process.env.NODE_ENV!=="test"||process.env.LOCAL_TEST_POSTGRES!=="YES"||controller||!(value instanceof MockReviewController))throw new Error("MOCK_REVIEW_DISABLED");controller=value;}
export function resolveMockReviewController(){return process.env.NODE_ENV==="test"&&process.env.LOCAL_TEST_POSTGRES==="YES"&&process.env.TIKTOK_WORKER_ENABLED==="true"&&process.env.TIKTOK_WORKER_MODE==="local-test"?controller:undefined;}
export async function dispatchMockReview(operation:ReviewOperation,request:Request){const current=resolveMockReviewController();if(operation==="publish"&&process.env.TIKTOK_CONTENT_POSTING_ENABLED!=="true")return Response.json({status:"UNAVAILABLE"},{status:503,headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});if(!current)return Response.json({status:"UNAVAILABLE"},{status:503,headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});return current.handle(operation,request);}
