import {requireAuthenticatedRequest} from '@/lib/server/productionIdentity/routeGuard';
export const runtime='nodejs';
/** Current clients use owner-scoped /api/media/admit; shared legacy writes are forbidden. */
export async function POST(request:Request){
 const authentication=await requireAuthenticatedRequest(request);
 if(!authentication.ok)return authentication.response;
 return Response.json({success:false,error:'durable-media-admission-required'},{status:410,headers:{'cache-control':'private, no-store'}});
}
