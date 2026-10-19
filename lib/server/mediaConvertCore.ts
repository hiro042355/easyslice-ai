import {readFile,stat,writeFile} from 'node:fs/promises';
import type {RouteAuthenticationResult} from './productionIdentity/routeGuardCore';
import {checkMediaCancellation,MediaRequestFailure,withRequestMediaWorkspace} from './requestMediaWorkspace';

const MAX_INPUT=100*1024*1024;
/** Count multipart bytes before parsing. Uploaded names and Content-Length are not authority. */
export async function readBoundedMultipart(request:Request,maxBytes:number):Promise<FormData>{
 const reader=request.body?.getReader();if(!reader)throw new MediaRequestFailure('invalid-request');
 const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){checkMediaCancellation(request.signal);const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw new MediaRequestFailure('invalid-request');chunks.push(value);}}
 finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
 return new Response(Buffer.concat(chunks),{headers:{'content-type':request.headers.get('content-type')??''}}).formData();
}
export function createMediaConvertRoute(deps:Readonly<{
 authenticate:(request:Request)=>Promise<RouteAuthenticationResult>;
 convert:(source:string,destination:string,signal:AbortSignal)=>Promise<void>;
}>){
 return async(request:Request):Promise<Response>=>{
  const auth=await deps.authenticate(request);if(!auth.ok)return auth.response;
  const fail=(status:number)=>Response.json({success:false,error:'media-conversion-failed'},{status,headers:{'cache-control':'private, no-store'}});
  try{
   if(request.headers.get('origin')!==new URL(request.url).origin)return fail(403);
   if(new URL(request.url).search||!/^multipart\/form-data; boundary=/i.test(request.headers.get('content-type')??''))return fail(400);
   const form=await readBoundedMultipart(request,MAX_INPUT+64*1024),file=form.get('file');
   if(!(file instanceof File)||!file.size||file.size>MAX_INPUT||[...form.keys()].some(k=>k!=='file')||form.getAll('file').length!==1)return fail(400);
   const signal=AbortSignal.any([request.signal,AbortSignal.timeout(180000)]);
   return await withRequestMediaWorkspace(async ws=>{
    checkMediaCancellation(signal);
    await writeFile(ws.file('source.mp4'),Buffer.from(await file.arrayBuffer()),{flag:'wx',mode:0o600});
    await ws.assertRegular('source.mp4');
    await deps.convert(ws.file('source.mp4'),ws.file('converted.mp4'),signal);
    await ws.assertRegular('converted.mp4');checkMediaCancellation(signal);
    const size=(await stat(ws.file('converted.mp4'))).size;
    if(!size||size>256*1024*1024)throw new MediaRequestFailure('process-failed');
    const output=await readFile(ws.file('converted.mp4'));checkMediaCancellation(signal);
    return new Response(output,{headers:{'Content-Type':'video/mp4','Content-Disposition':'attachment; filename="converted.mp4"','Cache-Control':'private, no-store'}});
   },signal);
  }catch(error){return fail(request.signal.aborted?499:error instanceof MediaRequestFailure&&error.code==='invalid-request'?400:502);}
 };
}
