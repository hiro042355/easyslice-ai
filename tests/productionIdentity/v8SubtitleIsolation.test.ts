import test from 'node:test';
import assert from 'node:assert/strict';
import {access,mkdtemp,readFile,rm,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createAuthenticatedRouteGuard} from '../../lib/server/productionIdentity/routeGuardCore';
import {createClipTranscriptRoute,transcribeOwnedClip,type ClipTranscriptDependencies,type OwnedClipTranscriptInput} from '../../lib/server/clipTranscriptCore';
import {MediaRequestFailure,runMediaProcess,withRequestMediaWorkspace} from '../../lib/server/requestMediaWorkspace';
import {createJobTempDirectories,cleanupJobTempRoot} from '../../lib/server/durableMediaOwnership/tempIsolation';
import {createJapaneseClipProvider} from '../../lib/server/clipTranscriptProvider';
import {createSubtitleTranslationRoute} from '../../lib/server/subtitleTranslationCore';
const job='11111111-1111-4111-8111-111111111111',media='22222222-2222-4222-8222-222222222222';
const input=(ownerUid='alice',jobId=job):OwnedClipTranscriptInput=>({ownerUid,jobId,mediaId:media,start:2,end:4,signal:new AbortController().signal});
const exists=async(p:string)=>access(p).then(()=>true,()=>false);

test('reproduces old same-job workspace overwrite and cross-request deletion using only synthetic files',async()=>{
 const parent=await mkdtemp(path.join(tmpdir(),'v8-old-proof-'));
 try{
  const a=await createJobTempDirectories(job,parent),b=await createJobTempDirectories(job,parent);
  assert.equal(a.root,b.root);
  await writeFile(path.join(a.work,'transcript.flac'),'first');
  await writeFile(path.join(b.work,'transcript.flac'),'second');
  assert.equal(await readFile(path.join(a.work,'transcript.flac'),'utf8'),'second');
  await cleanupJobTempRoot(job,parent);assert.equal(await exists(a.work),false);
 }finally{await rm(parent,{recursive:true,force:true});}
});
test('same filenames, same job, different users and projects remain isolated across six concurrent operations',async()=>{
 const roots:string[]=[];let arrived=0;let release!:()=>void;const ready=new Promise<void>(r=>{release=r;});
 const deps:ClipTranscriptDependencies={
  resolve:async i=>({storageKey:i.ownerUid+':'+i.jobId}),
  download:async(key,destination)=>{roots.push(path.dirname(destination));await writeFile(destination,key,{flag:'wx'});},
  extract:async(source,audio,start,duration)=>{assert.equal(start,2);assert.equal(duration,2);await writeFile(audio,await readFile(source),{flag:'wx'});if(++arrived===6)release();await ready;assert.equal(await exists(source),true);},
  transcribe:async audio=>audio.toString(),
 };
 const requests=Array.from({length:6},(_,n)=>input('owner-'+n,n%2?media:job));
 const results=await Promise.all(requests.map(i=>transcribeOwnedClip(i,deps)));
 assert.deepEqual(results,requests.map(i=>i.ownerUid+':'+i.jobId));assert.equal(new Set(roots).size,6);
 for(const root of roots)assert.equal(await exists(root),false);
});
test('one request cleanup never deletes another active same-job request output',async()=>{
 await withRequestMediaWorkspace(async a=>{
  await writeFile(a.file('audio.wav'),'active');
  await withRequestMediaWorkspace(async b=>{assert.notEqual(a.root,b.root);await writeFile(b.file('audio.wav'),'other');});
  assert.equal(await readFile(a.file('audio.wav'),'utf8'),'active');
 });
});
test('foreign project/media fails before temp download, extraction or inference',async()=>{
 let calls=0;const forbidden=async()=>{calls++;throw Error('forbidden');};
 await assert.rejects(transcribeOwnedClip(input(),{resolve:async()=>undefined,download:forbidden,extract:forbidden,transcribe:forbidden}),/resource-not-found/);
 assert.equal(calls,0);
});
for(const phase of ['download','extract','transcribe','cancel'] as const)test('request cleanup after '+phase+' failure is complete and bounded',async()=>{
 let root='';const controller=new AbortController();
 const deps:ClipTranscriptDependencies={resolve:async()=>({storageKey:'owned'}),download:async(_,p)=>{root=path.dirname(p);await writeFile(p,'input');if(phase==='download')throw Error('secret-path');},extract:async(_,p)=>{if(phase==='extract')throw Error('private stderr');await writeFile(p,'audio');if(phase==='cancel')controller.abort();},transcribe:async()=>{throw Error('provider secret');}};
 await assert.rejects(transcribeOwnedClip({...input(),signal:controller.signal},deps));assert.ok(root);assert.equal(await exists(root),false);
});
test('workspace traversal, alternate paths and symlink/junction inputs reject',async()=>{
 const parent=await mkdtemp(path.join(tmpdir(),'v8-link-target-'));
 try{await withRequestMediaWorkspace(async ws=>{
  for(const name of ['../audio.wav','C:\\private.wav','x/y.wav','audio.wav/other','https://host/x.wav'])assert.throws(()=>ws.file(name),/invalid-path/);
  await symlink(parent,ws.file('source.mp4'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(ws.assertRegular('source.mp4'),/invalid-path/);
 });assert.equal(await exists(parent),true);}finally{await rm(parent,{recursive:true,force:true});}
});
test('cancellation and timeout await child close before workspace cleanup; spawn failure is safe',async()=>{
 let root='';const controller=new AbortController();
 await assert.rejects(withRequestMediaWorkspace(async ws=>{root=ws.root;setTimeout(()=>controller.abort(),30);await runMediaProcess(process.execPath,['-e','setInterval(()=>{},1000)'],controller.signal);},controller.signal),/cancelled/);
 assert.equal(await exists(root),false);
 await assert.rejects(runMediaProcess(process.execPath,['-e','setInterval(()=>{},1000)'],undefined,20),/process-timeout/);
 await assert.rejects(runMediaProcess('nexcut-nonexistent-test-command',[]),/process-failed/);
});
test('authenticated route binds verified owner and numeric clip range, rejects unknown authority/path/body/origin',async()=>{
 const authenticate=createAuthenticatedRouteGuard({verifyIdToken:async()=>({uid:'alice',sub:'alice',iat:1,exp:9999999999,auth_time:1,aud:'offline',iss:'offline',firebase:{identities:{},sign_in_provider:'password'}}),verifySessionCookie:async()=>{throw Error('unused');}});
 let seen:OwnedClipTranscriptInput|undefined;const route=createClipTranscriptRoute({authenticate,transcribe:async i=>{seen=i;return '日本語';}});
 const request=(body:unknown,extra:Record<string,string>={})=>new Request('https://nexcut.test/api/transcript',{method:'POST',headers:{authorization:'Bearer synthetic','content-type':'application/json',origin:'https://nexcut.test',...extra},body:JSON.stringify(body)});
 const valid={jobId:job,mediaId:media,start:'2',end:'4'};
 const result=await route(request(valid));assert.equal(result.status,200);assert.deepEqual(await result.json(),{success:true,transcript:'日本語'});assert.equal(seen?.ownerUid,'alice');assert.equal(seen?.start,2);assert.equal(seen?.end,4);
 for(const body of [{start:2,end:4},{...valid,jobId:'../../other'},{...valid,ownerUid:'bob'},{...valid,path:'secret'},{...valid,end:1000},{...valid,start:-1},{...valid,start:'Infinity'},{...valid,extra:'x'.repeat(9000)},null]){seen=undefined;assert.equal((await route(request(body))).status,400);assert.equal(seen,undefined);}
 assert.equal((await route(request(valid,{origin:'https://foreign.test'}))).status,403);
 const denied=await route(new Request('https://nexcut.test/api/transcript',{method:'POST'}));assert.equal(denied.status,401);
 const unsafe=createClipTranscriptRoute({authenticate,transcribe:async()=>{throw Error('token=private/raw/path');}});
 const failure=await unsafe(request(valid));assert.equal(failure.status,502);assert.doesNotMatch(await failure.text(),/private|token=|raw\/path/);
});
test('Japanese clip provider preserves WAV/prompt/output contract and never leaks raw provider failures',async()=>{
 let calls=0;
 const transport:typeof fetch=async(url,init)=>{
  calls++;assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
  const body=JSON.parse(String(init?.body));assert.match(body.contents[0].parts[0].text,/日本語で文字起こし/);assert.equal(body.contents[0].parts[1].inline_data.mime_type,'audio/wav');
  return Response.json({candidates:[{content:{parts:[{text:'日本語\n字幕'}]}}]});
 };
 assert.equal(await createJapaneseClipProvider(()=> 'synthetic-only',transport)(Buffer.from('synthetic'),new AbortController().signal),'日本語\n字幕');assert.equal(calls,1);
 for(const response of [Response.json({error:{message:'private/token'}},{status:429}),Response.json({}),new Response('x'.repeat(300000))]){
  await assert.rejects(createJapaneseClipProvider(()=> 'synthetic-only',async()=>response)(Buffer.from('x'),new AbortController().signal),error=>error instanceof MediaRequestFailure&&error.message==='provider-failed');
 }
 await assert.rejects(createJapaneseClipProvider(()=>undefined,transport)(Buffer.from('x'),new AbortController().signal),/provider-failed/);assert.equal(calls,1);
 const aborted=new AbortController();aborted.abort();await assert.rejects(createJapaneseClipProvider(()=> 'synthetic-only',transport)(Buffer.from('x'),aborted.signal),/cancelled/);assert.equal(calls,1);
});
test('actual FFmpeg request-local WAV clip extraction completes before cleanup',async()=>{
 const executable=process.env.NEXCUT_TEST_FFMPEG;
 assert.ok(executable,'verified local FFmpeg is required, not skipped');let root='';
 await withRequestMediaWorkspace(async ws=>{
  root=ws.root;
  await runMediaProcess(executable,['-nostdin','-f','lavfi','-i','sine=frequency=440:duration=3','-c:a','pcm_s16le','-n',ws.file('source.wav')]);
  await runMediaProcess(executable,['-nostdin','-ss','1','-t','1','-i',ws.file('source.wav'),'-ac','1','-ar','16000','-n',ws.file('audio.wav')]);
  await ws.assertRegular('audio.wav');const audio=await readFile(ws.file('audio.wav'));
  assert.equal(audio.subarray(0,4).toString(),'RIFF');assert.ok(audio.length>=32000&&audio.length<33000);
 });assert.equal(await exists(root),false);
});
test('translation preserves direction and Unicode while normalizing malformed/secret provider errors',async()=>{
 const authenticate=createAuthenticatedRouteGuard({verifyIdToken:async()=>({uid:'alice',sub:'alice',iat:1,exp:9999999999,auth_time:1,aud:'offline',iss:'offline',firebase:{identities:{},sign_in_provider:'password'}}),verifySessionCookie:async()=>{throw Error('unused');}});
 const req=(direction:string,transcript='日本語')=>new Request('https://nexcut.test/api/translate-subtitle',{method:'POST',headers:{authorization:'Bearer synthetic',origin:'https://nexcut.test','content-type':'application/json'},body:JSON.stringify({direction,transcript})});
 let calls=0;
 const route=createSubtitleTranslationRoute({authenticate,readKey:()=> 'synthetic-only',fetchImpl:async(_,init)=>{calls++;const body=JSON.parse(String(init?.body));assert.match(body.contents[0].parts[0].text,/日本語の字幕を、英語/);return Response.json({candidates:[{content:{parts:[{text:'```json\n{"translatedText":"Hello 字幕"}\n```'}]}}]});}});
 assert.deepEqual(await (await route(req('ja-to-en'))).json(),{success:true,translatedText:'Hello 字幕'});assert.equal(calls,1);
 assert.equal((await route(req('unknown'))).status,400);assert.equal((await route(req('ja-to-en','x'.repeat(70000)))).status,400);assert.equal(calls,1);
 const failed=createSubtitleTranslationRoute({authenticate,readKey:()=> 'synthetic-only',fetchImpl:async()=>Response.json({error:{message:'token=private/path'}},{status:429})});
 const response=await failed(req('en-to-ja'));assert.equal(response.status,429);assert.doesNotMatch(await response.text(),/token=|private|path/);
});
