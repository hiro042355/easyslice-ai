import test from 'node:test';
import assert from 'node:assert/strict';
import {access,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Readable} from 'node:stream';
import {createAuthenticatedRouteGuard} from '../../lib/server/productionIdentity/routeGuardCore';
import {createMediaConvertRoute,readBoundedMultipart} from '../../lib/server/mediaConvertCore';
import {LOCAL_MEDIA_INPUT_OPTIONS,captureMediaProcess,runMediaProcess,withRequestMediaWorkspace} from '../../lib/server/requestMediaWorkspace';
import {downloadRequestMedia,readBoundedMediaOutput} from '../../lib/server/requestMediaIo';
import {createGeneratedAssetBoundary,fetchGeneratedAsset} from '../../lib/server/generatedAssetBoundaryCore';

const authenticate=createAuthenticatedRouteGuard({verifyIdToken:async()=>({uid:'alice',sub:'alice',iat:1,exp:9999999999,auth_time:1,aud:'offline',iss:'offline',firebase:{identities:{},sign_in_provider:'password'}}),verifySessionCookie:async()=>{throw Error('unused');}});
const exists=async(p:string)=>access(p).then(()=>true,()=>false);
const upload=(text='synthetic',name='same.mp4',origin='https://nexcut.test',signal?:AbortSignal)=>{
 const form=new FormData();form.set('file',new File([text],name));
 return new Request('https://nexcut.test/api/convert',{method:'POST',headers:{authorization:'Bearer synthetic',origin},body:form,signal});
};
test('conversion authenticates before parsing or processing and rejects foreign origin',async()=>{
 let calls=0;const route=createMediaConvertRoute({authenticate,convert:async()=>{calls++;}});
 assert.equal((await route(new Request('https://nexcut.test/api/convert',{method:'POST'}))).status,401);
 assert.equal((await route(upload('x','same.mp4','https://foreign.test'))).status,403);assert.equal(calls,0);
});
test('six concurrent conversion requests with identical hostile names deliver only their own bytes and remove only their own directories',async()=>{
 const roots:string[]=[];let arrived=0,release!:()=>void;const barrier=new Promise<void>(r=>{release=r;});
 const route=createMediaConvertRoute({authenticate,convert:async(source,dest)=>{
  roots.push(path.dirname(source));assert.equal(path.basename(source),'source.mp4');
  if(++arrived===6)release();await barrier;
  await writeFile(dest,await readFile(source),{flag:'wx'});
 }});
 const responses=await Promise.all(Array.from({length:6},(_,i)=>route(upload('owner-project-'+i,'../../same.mp4'))));
 for(const [i,response] of responses.entries()){assert.equal(response.status,200);assert.equal(await response.text(),'owner-project-'+i);assert.equal(response.headers.get('cache-control'),'private, no-store');}
 assert.equal(new Set(roots).size,6);for(const root of roots)assert.equal(await exists(root),false);
});
for(const phase of ['failure','cancel'] as const)test('conversion '+phase+' removes workspace without leaking internal diagnostics',async()=>{
 let root='';const controller=new AbortController();
 const route=createMediaConvertRoute({authenticate,convert:async(source)=>{root=path.dirname(source);if(phase==='cancel')controller.abort();throw Error('token=synthetic/private/path');}});
 const response=await route(upload('x','same.mp4','https://nexcut.test',controller.signal));
 assert.equal(response.status,phase==='cancel'?499:502);assert.doesNotMatch(await response.text(),/token=|private\/path/);assert.equal(await exists(root),false);
});
test('multipart byte limits count actual streamed bytes regardless of claimed length',async()=>{
 const request=new Request('https://nexcut.test/api/convert',{method:'POST',headers:{'content-type':'multipart/form-data; boundary=synthetic','content-length':'1'},body:'x'.repeat(4096)});
 await assert.rejects(readBoundedMultipart(request,128),/invalid-request/);
});
test('request object download is exclusive and output size is checked before delivery',async()=>{
 await withRequestMediaWorkspace(async ws=>{
  await downloadRequestMedia(Readable.from([Buffer.from('source')]),ws.file('source.mp4'),new AbortController().signal);
  await assert.rejects(downloadRequestMedia(Readable.from(['overwrite']),ws.file('source.mp4'),new AbortController().signal));
  assert.equal(await readFile(ws.file('source.mp4'),'utf8'),'source');
  await assert.rejects(readBoundedMediaOutput(ws.file('source.mp4'),3),/process-failed/);
 });
});
test('captured process diagnostics are byte bounded and cancellation/timeout wait for close',async()=>{
 const result=await captureMediaProcess(process.execPath,['-e','process.stderr.write("x".repeat(100000));process.exitCode=1']);
 assert.equal(result.code,1);assert.equal(Buffer.byteLength(result.stderr),65536);
 await assert.rejects(captureMediaProcess(process.execPath,['-e','setInterval(()=>{},100)'],undefined,20),/process-timeout/);
 const controller=new AbortController();setTimeout(()=>controller.abort(),20);
 await assert.rejects(captureMediaProcess(process.execPath,['-e','setInterval(()=>{},100)'],controller.signal),/cancelled/);
});
test('generated asset auth/origin/body gates run before provider handler; Unicode DTO preserved',async()=>{
 let calls=0;const route=createGeneratedAssetBoundary(authenticate,async request=>{calls++;return Response.json(await request.json());});
 const request=(body:string,origin='https://nexcut.test')=>new Request('https://nexcut.test/api/ai-mv',{method:'POST',headers:{authorization:'Bearer synthetic',origin,'content-type':'application/json'},body});
 assert.equal((await route(new Request('https://nexcut.test/api/ai-mv',{method:'POST'}))).status,401);
 assert.equal((await route(request('{}','https://foreign.test'))).status,403);
 assert.equal((await route(request('x'.repeat(140000)))).status,400);assert.equal(calls,0);
 assert.deepEqual(await (await route(request('{"story":"日本語"}'))).json(),{story:'日本語'});assert.equal(calls,1);
});
test('provider response bounds and error normalization use mock transport only',async()=>{
 const url='https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',signal=new AbortController().signal;
 const failed=await fetchGeneratedAsset(url,{},signal,async()=>new Response('token=private/path',{status:429}));
 assert.equal(failed.status,429);assert.doesNotMatch(await failed.text(),/token=|private\/path/);
 await assert.rejects(fetchGeneratedAsset('https://foreign.test',{},signal,async()=>{throw Error('must not run');}),/invalid-provider/);
});
test('actual packaged FFmpeg converts synthetic local media inside request-owned lifetime',async()=>{
 const executable=process.env.NEXCUT_TEST_FFMPEG;assert.ok(executable,'local FFmpeg required');
 let source:Buffer;
 await withRequestMediaWorkspace(async ws=>{await runMediaProcess(executable,['-nostdin','-f','lavfi','-i','color=c=blue:s=160x90:d=1','-c:v','libx264','-y',ws.file('source.mp4')]);source=await readFile(ws.file('source.mp4'));});
 const form=new FormData();form.set('file',new File([Uint8Array.from(source!)],'synthetic.mp4'));
 const route=createMediaConvertRoute({authenticate,convert:async(input,output,signal)=>runMediaProcess(executable,['-nostdin',...LOCAL_MEDIA_INPUT_OPTIONS,'-i',input,'-c:v','libx264','-c:a','aac','-y',output],signal)});
 const response=await route(new Request('https://nexcut.test/api/convert',{method:'POST',headers:{authorization:'Bearer synthetic',origin:'https://nexcut.test'},body:form}));
 assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.subarray(4,8).toString(),'ftyp');
});

test('local playlist disguised as media cannot open another file through FFmpeg',async()=>{
 const executable=process.env.NEXCUT_TEST_FFMPEG;assert.ok(executable);
 await withRequestMediaWorkspace(async ws=>{
  await writeFile(ws.file('source.mp4'),'#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nfile:///not-authorized/private.ts\n#EXT-X-ENDLIST\n');
  const result=await captureMediaProcess(executable,['-nostdin',...LOCAL_MEDIA_INPUT_OPTIONS,'-i',ws.file('source.mp4'),'-f','null','-']);
  assert.notEqual(result.code,0);assert.match(result.stderr,/not.*whitelist|Invalid data|format.*not allowed/i);
 });
});
