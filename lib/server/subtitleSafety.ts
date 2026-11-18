/** Pure validation; never performs acquisition or provider requests. */
export function subtitleSourceUrl(value:unknown):string|undefined{
 if(typeof value!=='string'||value.length>4096)return;
 try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port||!['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(url.hostname))return;return url.href;}catch{return;}
}
export type SubtitleLine={second:number;text:string};
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export function parseJson3Subtitles(value:unknown):SubtitleLine[]{
 if(!record(value))throw Error('INVALID_SUBTITLE_DATA');
 if(value.events===undefined)return [];
 if(!Array.isArray(value.events))throw Error('INVALID_SUBTITLE_DATA');
 return value.events.flatMap((event:unknown)=>{
  if(!record(event))throw Error('INVALID_SUBTITLE_DATA');
  if(!event.segs)return [];
  if(!Array.isArray(event.segs))throw Error('INVALID_SUBTITLE_DATA');
  if(!event.segs.length)return [];
  if(typeof event.tStartMs!=='number'||!Number.isFinite(event.tStartMs)||event.tStartMs<0)throw Error('INVALID_SUBTITLE_DATA');
  const text=event.segs.map((seg:unknown)=>{if(!record(seg)||typeof seg.utf8!=='string')throw Error('INVALID_SUBTITLE_DATA');return seg.utf8;}).join('').replace(/\n/g,' ').trim();
  return text?[{second:Math.floor(event.tStartMs/1000),text}]:[];
 });
}
