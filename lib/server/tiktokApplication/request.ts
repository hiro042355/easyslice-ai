import type {ApplicationRoutes} from "./composition";
export type ApplicationOperation=keyof ApplicationRoutes;
const paths:Record<ApplicationOperation,string>={start:"/api/tiktok/oauth/start",callback:"/api/tiktok/oauth/callback",connection:"/api/tiktok/connection",disconnect:"/api/tiktok/disconnect",bootstrap:"/api/tiktok/bootstrap",navigate:"/api/tiktok/oauth/navigate"};
const methods:Record<ApplicationOperation,string>={start:"POST",callback:"GET",connection:"GET",disconnect:"POST",bootstrap:"GET",navigate:"GET"};
function unavailable(){return Response.json({version:"1",status:"UNAVAILABLE",error:"APPLICATION_NOT_READY"},{status:503,headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});}
/** Identical HTTP dispatcher is used by Next handlers and disposable-PG tests. */
export async function dispatchTikTokApplication(operation:ApplicationOperation,request:Request,resolve:()=>Promise<ApplicationRoutes|undefined>):Promise<Response>{
 const url=new URL(request.url);
 if(url.origin!=="https://www.nexcutai.com"||url.pathname!==paths[operation]||request.method!==methods[operation])return Response.json({error:"REQUEST_REJECTED"},{status:400,headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
 try{const routes=await resolve();return routes?await routes[operation](request):unavailable();}catch{return unavailable();}
}
export function dispatchInstalledTikTokApplication(operation:ApplicationOperation,request:Request){
 return dispatchTikTokApplication(operation,request,async()=>{
  // Production is permanently disabled here. Configuration alone cannot install ports.
  if(process.env.NEXCUT_TIKTOK_APPLICATION_MODE!=="sandbox"||process.env.NEXCUT_TIKTOK_OAUTH_MODE!=="sandbox")return undefined;
  const runtime=await import("./runtime");return runtime.resolveSandboxApplication();
 });
}
