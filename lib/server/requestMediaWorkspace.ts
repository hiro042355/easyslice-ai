import {spawn} from 'node:child_process';
import {chmod,lstat,mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

// Exclude playlist/concat/image-sequence demuxers that can open caller-described files.
export const LOCAL_MEDIA_INPUT_OPTIONS=Object.freeze(['-protocol_whitelist','file,pipe','-format_whitelist','mov,matroska,webm,avi,mpegts,mpeg,ogg,flv']);

export class MediaRequestFailure extends Error {
 constructor(readonly code:'cancelled'|'invalid-path'|'process-failed'|'process-timeout'|'resource-not-found'|'invalid-request'|'provider-failed') {super(code);}
}
export function checkMediaCancellation(signal?:AbortSignal):void{
 if(signal?.aborted)throw new MediaRequestFailure('cancelled');
}
/** Request-local lifetime. Never derive a filesystem location from a user/job ID. */
export async function withRequestMediaWorkspace<T>(operation:(workspace:Readonly<{root:string;file:(name:string)=>string;assertRegular:(name:string)=>Promise<void>}>)=>Promise<T>,signal?:AbortSignal):Promise<T>{
 checkMediaCancellation(signal);
 const parent=await realpath(tmpdir());
 const root=await mkdtemp(path.join(parent,'nexcut-media-'));
 try{
  await chmod(root,0o700);
  const file=(name:string)=>{
   if(!/^[a-z][a-z0-9-]*\.(mp4|wav|flac|srt|ass|json3|txt)$/.test(name))throw new MediaRequestFailure('invalid-path');
   return path.join(root,name);
  };
  const assertRegular=async(name:string)=>{
   const candidate=file(name),info=await lstat(candidate);
   if(!info.isFile()||info.isSymbolicLink()||await realpath(candidate)!==candidate)throw new MediaRequestFailure('invalid-path');
  };
  checkMediaCancellation(signal);
  return await operation(Object.freeze({root,file,assertRegular}));
 }finally{
  // Only this invocation's securely allocated directory; operation settles first.
  await rm(root,{recursive:true,force:true});
 }
}

/** Resolve/reject on close, not AbortError: cleanup must not race an active child. */
export async function runMediaProcess(executable:string,args:readonly string[],signal?:AbortSignal,timeoutMs=120000):Promise<void>{
 checkMediaCancellation(signal);
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>300000)throw new MediaRequestFailure('invalid-request');
 await new Promise<void>((resolve,reject)=>{
  const child=spawn(executable,[...args],{shell:false,windowsHide:true,stdio:'ignore'});
  let cancelled=false,timedOut=false,spawnFailed=false;
  const stop=()=>{cancelled=true;child.kill('SIGKILL');};
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},timeoutMs);
  signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
  child.once('error',()=>{spawnFailed=true;});
  child.once('close',code=>{
   clearTimeout(timer);signal?.removeEventListener('abort',stop);
   if(cancelled)reject(new MediaRequestFailure('cancelled'));
   else if(timedOut)reject(new MediaRequestFailure('process-timeout'));
   else if(spawnFailed||code!==0)reject(new MediaRequestFailure('process-failed'));
   else resolve();
  });
 });
}

/** Bounded internal diagnostics. Probe commands may exit nonzero; callers must validate evidence. */
export async function captureMediaProcess(executable:string,args:readonly string[],signal?:AbortSignal,timeoutMs=30000):Promise<Readonly<{code:number|null;stderr:string}>>{
 checkMediaCancellation(signal);
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>300000)throw new MediaRequestFailure('invalid-request');
 return new Promise((resolve,reject)=>{
  const child=spawn(executable,[...args],{shell:false,windowsHide:true,stdio:['ignore','ignore','pipe']});
  const chunks:Buffer[]=[];let size=0,cancelled=false,timedOut=false,spawnFailed=false;
  child.stderr.on('data',(chunk:Buffer)=>{const bounded=chunk.subarray(0,Math.max(0,65536-size));if(bounded.length){chunks.push(Buffer.from(bounded));size+=bounded.length;}});
  const stop=()=>{cancelled=true;child.kill('SIGKILL');};
  const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},timeoutMs);
  signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
  child.once('error',()=>{spawnFailed=true;});
  child.once('close',code=>{
   clearTimeout(timer);signal?.removeEventListener('abort',stop);
   if(cancelled)reject(new MediaRequestFailure('cancelled'));
   else if(timedOut)reject(new MediaRequestFailure('process-timeout'));
   else if(spawnFailed)reject(new MediaRequestFailure('process-failed'));
   else resolve(Object.freeze({code,stderr:Buffer.concat(chunks).toString('utf8')}));
  });
 });
}
