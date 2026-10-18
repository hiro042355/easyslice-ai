import {readFile,stat} from 'node:fs/promises';
import {isUuid} from './durableMediaOwnership/storageKey';
import {checkMediaCancellation,MediaRequestFailure,withRequestMediaWorkspace} from './requestMediaWorkspace';
import type {RouteAuthenticationResult} from './productionIdentity/routeGuardCore';
import {readBoundedJsonBody} from './boundedJsonBody';

export type OwnedClipTranscriptInput=Readonly<{ownerUid:string;jobId:string;mediaId:string;start:number;end:number;signal:AbortSignal}>;
export type ClipTranscriptDependencies=Readonly<{
 resolve:(input:OwnedClipTranscriptInput)=>Promise<Readonly<{storageKey:string}>|undefined>;
 download:(key:string,destination:string,signal:AbortSignal)=>Promise<void>;
 extract:(source:string,audio:string,start:number,duration:number,signal:AbortSignal)=>Promise<void>;
 transcribe:(audio:Buffer,signal:AbortSignal)=>Promise<string>;
}>;
export async function transcribeOwnedClip(input:OwnedClipTranscriptInput,deps:ClipTranscriptDependencies):Promise<string>{
 if(!input.ownerUid||!isUuid(input.jobId)||!isUuid(input.mediaId)||!Number.isFinite(input.start)||!Number.isFinite(input.end)||input.start<0||input.end<=input.start||input.end-input.start>600||input.end>86400)throw new MediaRequestFailure('invalid-request');
 checkMediaCancellation(input.signal);
 const media=await deps.resolve(input);if(!media)throw new MediaRequestFailure('resource-not-found');
 return withRequestMediaWorkspace(async ws=>{
  checkMediaCancellation(input.signal);
  await deps.download(media.storageKey,ws.file('source.mp4'),input.signal);
  await ws.assertRegular('source.mp4');checkMediaCancellation(input.signal);
  await deps.extract(ws.file('source.mp4'),ws.file('audio.wav'),input.start,input.end-input.start,input.signal);
  await ws.assertRegular('audio.wav');checkMediaCancellation(input.signal);
  if((await stat(ws.file('audio.wav'))).size>32*1024*1024)throw new MediaRequestFailure('provider-failed');
  const text=await deps.transcribe(await readFile(ws.file('audio.wav')),input.signal);
  checkMediaCancellation(input.signal);
  if(typeof text!=='string'||text.length>65536)throw new MediaRequestFailure('provider-failed');
  return text.trim()||'文字起こし結果が空でした。音声が小さい、または無音の可能性があります。';
 },input.signal);
}
export function createClipTranscriptRoute(deps:Readonly<{authenticate:(r:Request)=>Promise<RouteAuthenticationResult>;transcribe:(i:OwnedClipTranscriptInput)=>Promise<string>}>){
 return async(request:Request):Promise<Response>=>{
  const auth=await deps.authenticate(request);if(!auth.ok)return auth.response;
  const fail=(error:string,status:number)=>Response.json({success:false,error},{status,headers:{'cache-control':'private, no-store'}});
  try{
   if(request.headers.get('origin')!==new URL(request.url).origin)return fail('invalid-origin',403);
   if(new URL(request.url).search||!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')??''))return fail('invalid-request',400);
   const raw=await readBoundedJsonBody(request,8192).catch(()=>{throw new MediaRequestFailure('invalid-request');});
   if(!raw||typeof raw!=='object'||Array.isArray(raw))return fail('invalid-request',400);
   const b=raw as Record<string,unknown>;
   if(Object.keys(b).some(k=>!['jobId','mediaId','start','end'].includes(k))||typeof b.jobId!=='string'||!isUuid(b.jobId)||typeof b.mediaId!=='string'||!isUuid(b.mediaId))return fail('invalid-request',400);
   const numeric=(v:unknown)=>typeof v==='number'?v:typeof v==='string'&&/^\d+(?:\.\d+)?$/.test(v)?Number(v):NaN;
   const start=numeric(b.start),end=numeric(b.end);
   if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end-start>600||end>86400)return fail('invalid-request',400);
   const transcript=await deps.transcribe({ownerUid:auth.context.identity.userId,jobId:b.jobId,mediaId:b.mediaId,start,end,signal:request.signal});
   return Response.json({success:true,transcript},{headers:{'cache-control':'private, no-store'}});
  }catch(error){
   if(error instanceof MediaRequestFailure)return fail(error.code,error.code==='resource-not-found'?404:error.code==='cancelled'?499:error.code==='invalid-request'?400:502);
   return fail('transcript-failed',502);
  }
 };
}
