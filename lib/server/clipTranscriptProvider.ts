import {MediaRequestFailure} from './requestMediaWorkspace';
import {readBoundedJsonBody} from './boundedJsonBody';
/** Existing Japanese plain-text clip contract; raw provider errors never leave this boundary. */
export function createJapaneseClipProvider(readKey:()=>string|undefined,fetchImpl:typeof fetch=fetch){
 return async(audio:Buffer,signal:AbortSignal):Promise<string>=>{
 if(signal.aborted)throw new MediaRequestFailure('cancelled');
 const apiKey=readKey();
 if(!apiKey||audio.length>32*1024*1024)throw new MediaRequestFailure('provider-failed');
 try{
  const response=await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',{
   method:'POST',signal:AbortSignal.any([signal,AbortSignal.timeout(60000)]),
   headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},
   body:JSON.stringify({contents:[{parts:[{text:'この音声の発話だけを日本語で文字起こししてください。説明、要約、補足、推測は一切しないでください。字幕として使いやすいように、1行は20文字以内を目安に短く区切ってください。句読点は少なめにしてください。聞き取れない部分は無理に補完せず、省略してください。'},{inline_data:{mime_type:'audio/wav',data:audio.toString('base64')}}]}]}),
  });
  if(!response.ok)throw new MediaRequestFailure('provider-failed');
  const data=await readBoundedJsonBody(response,256*1024);
  if(!data||typeof data!=='object'||!('candidates'in data)||!Array.isArray(data.candidates))throw new MediaRequestFailure('provider-failed');
  const candidate:unknown=data.candidates[0];
  if(!candidate||typeof candidate!=='object'||!('content'in candidate)||!candidate.content||typeof candidate.content!=='object'||!('parts'in candidate.content)||!Array.isArray(candidate.content.parts))throw new MediaRequestFailure('provider-failed');
  const part:unknown=candidate.content.parts[0];
  if(!part||typeof part!=='object'||!('text'in part)||typeof part.text!=='string')throw new MediaRequestFailure('provider-failed');
  return part.text;
 }catch{throw new MediaRequestFailure(signal.aborted?'cancelled':'provider-failed');}
 };
}
