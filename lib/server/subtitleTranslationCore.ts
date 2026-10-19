import type {RouteAuthenticationResult} from './productionIdentity/routeGuardCore';
import {readBoundedJsonBody} from './boundedJsonBody';
export function createSubtitleTranslationRoute(deps:Readonly<{authenticate:(request:Request)=>Promise<RouteAuthenticationResult>;readKey:()=>string|undefined;fetchImpl:typeof fetch}>){
 return async(req:Request):Promise<Response>=>{
  const auth=await deps.authenticate(req);if(!auth.ok)return auth.response;
  const fail=(status:number)=>Response.json({success:false,error:'subtitle-translation-failed'},{status,headers:{'cache-control':'private, no-store'}});
  try{
   if(req.headers.get('origin')!==new URL(req.url).origin)return fail(403);
   const body=await readBoundedJsonBody(req,128*1024);
   if(!body||typeof body!=='object'||!('transcript'in body)||typeof body.transcript!=='string'||!body.transcript.trim()||body.transcript.length>65536)return fail(400);
   const direction='direction'in body?body.direction:'en-to-ja';if(direction!=='en-to-ja'&&direction!=='ja-to-en')return fail(400);
   if(req.signal.aborted)return fail(499);
   const key=deps.readKey();if(!key)return fail(503);
   const instruction=direction==='ja-to-en'?'日本語の字幕を、英語のショート動画向けに自然な英語へ翻訳してください。':'英語の字幕を、日本語のショート動画向けに自然な日本語へ翻訳してください。';
   const prompt=`あなたはショート動画向けの字幕翻訳アシスタントです。次の字幕テキストを翻訳してください。条件: 直訳ではなく、ショート動画で読みやすい自然な話し言葉にする。意味を変えない。1行を短めにする。余計な説明は出さない。JSONだけで返す。${instruction}\n返却形式: {"translatedText":"翻訳後の字幕テキスト"}\n字幕:\n${body.transcript}`;
   const response=await deps.fetchImpl('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',{method:'POST',signal:AbortSignal.any([req.signal,AbortSignal.timeout(60000)]),headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{parts:[{text:prompt}]}]})});
   if(!response.ok)return fail(response.status===429?429:502);
   const data=await readBoundedJsonBody(response,256*1024);
   if(!data||typeof data!=='object'||!('candidates'in data)||!Array.isArray(data.candidates))return fail(502);
   const candidate:unknown=data.candidates[0];
   if(!candidate||typeof candidate!=='object'||!('content'in candidate)||!candidate.content||typeof candidate.content!=='object'||!('parts'in candidate.content)||!Array.isArray(candidate.content.parts))return fail(502);
   const part:unknown=candidate.content.parts[0];
   if(!part||typeof part!=='object'||!('text'in part)||typeof part.text!=='string')return fail(502);
   const parsed:unknown=JSON.parse(part.text.replace(/```json|```/g,'').trim());
   if(!parsed||typeof parsed!=='object'||!('translatedText'in parsed)||typeof parsed.translatedText!=='string'||parsed.translatedText.length>65536)return fail(502);
   return Response.json({success:true,translatedText:parsed.translatedText},{headers:{'cache-control':'private, no-store'}});
  }catch{return fail(502);}
 };
}
