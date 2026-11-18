import {isUuid} from './durableMediaOwnership/storageKey';
type Authenticate=(request:Request)=>Promise<{ok:true}|{ok:false;response:Response}>;
export function legacyVideoTarget(url:URL):string|undefined{
 const query=url.searchParams,allowed=['jobId','mediaId','exportId','type'];
 if([...query.keys()].some(key=>!allowed.includes(key)||query.getAll(key).length!==1))return;
 const job=query.get('jobId'),media=query.get('mediaId'),exported=query.get('exportId'),type=query.get('type');
 if(type!==null&&type!=='burned')return;
 if(exported&&!job&&!media&&isUuid(exported))return '/api/exports/'+exported;
 if(!exported&&type===null&&job&&media&&isUuid(job)&&isUuid(media))return '/api/media/'+job+'/'+media;
}
export function createLegacyVideoRoute(authenticate:Authenticate){
 return async(request:Request):Promise<Response>=>{
  try{
   const auth=await authenticate(request);if(!auth.ok)return auth.response;
   const target=legacyVideoTarget(new URL(request.url));
   if(!target)return Response.json({error:'Video not found'},{status:404,headers:{'cache-control':'private, no-store'}});
   // Relative Location cannot redirect to a caller-controlled external origin.
   // Destination independently authenticates and applies canonical owner filters.
   return new Response(null,{status:307,headers:{location:target,'cache-control':'private, no-store'}});
  }catch{return Response.json({error:'Video unavailable'},{status:503,headers:{'cache-control':'private, no-store'}});}
 };
}
