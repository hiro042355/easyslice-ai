/** Local signal analysis only. No semantic section/chorus detection or asset authority. */
export const MAX_LOCAL_MUSIC_BYTES=32*1024*1024;
export type LocalMusicAnalysis=Readonly<{
  version:"local-pcm-v1";durationSeconds:number;sampleRate:number;channels:number;
  method:"rms-onset-autocorrelation";bpm:number|null;confidence:number;
  beats:readonly number[];energy:readonly Readonly<{start:number;end:number;rms:number}>[];
}>;
/** Read-only editing suggestions, not a replacement scene plan or generation job. */
export function suggestBeatCuts(analysis:LocalMusicAnalysis,beatsPerCut:2|4|8):readonly number[]{
  if(![2,4,8].includes(beatsPerCut))throw new Error("invalid-beat-spacing");
  return Object.freeze(analysis.beats.filter((t,i)=>i>0&&i%beatsPerCut===0&&t>0&&t<analysis.durationSeconds));
}
export function analyzeLocalWav(bytes:Uint8Array):LocalMusicAnalysis {
  const invalid=()=>new Error("16-bit PCM WAV（32 MiB以下・10分以下）を選択してください。");
  if(bytes.length<44 || bytes.length>MAX_LOCAL_MUSIC_BYTES)throw invalid();
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const text=(p:number)=>String.fromCharCode(...bytes.subarray(p,p+4));
  if(text(0)!=="RIFF"||text(8)!=="WAVE"||view.getUint32(4,true)+8!==bytes.length)throw invalid();
  let format:Readonly<{rate:number;channels:number;block:number}>|undefined;
  let data:Readonly<{offset:number;size:number}>|undefined;
  let chunkCount=0;
  for(let p=12;p<bytes.length;) {
    if(++chunkCount>4096)throw invalid();
    if(p+8>bytes.length)throw invalid();
    const size=view.getUint32(p+4,true),end=p+8+size;
    if(end>bytes.length || end+(size%2)>bytes.length)throw invalid();
    if(text(p)==="fmt ") {
      if(format || size<16 || view.getUint16(p+8,true)!==1 || view.getUint16(p+22,true)!==16)throw invalid();
      const channels=view.getUint16(p+10,true),rate=view.getUint32(p+12,true),block=view.getUint16(p+20,true);
      if(![1,2].includes(channels)||rate<8000||rate>192000||block!==channels*2||view.getUint32(p+16,true)!==rate*block)throw invalid();
      format={channels,rate,block};
    }else if(text(p)==="data") {
      if(data)throw invalid();data={offset:p+8,size};
    }
    p=end+(size%2);
  }
  if(!format||!data||data.size===0||data.size%format.block)throw invalid();
  const frames=data.size/format.block,duration=frames/format.rate;
  if(duration>600)throw invalid();
  const hop=Math.max(1,Math.round(format.rate*.02)),step=hop/format.rate;
  const energy:{start:number;end:number;rms:number}[]=[];
  for(let i=0;i<frames;i+=hop){
    const end=Math.min(frames,i+hop);let sum=0;
    for(let f=i;f<end;f++)for(let ch=0;ch<format.channels;ch++){
      const sample=view.getInt16(data.offset+f*format.block+ch*2,true)/32768;sum+=sample*sample;
    }
    energy.push(Object.freeze({start:i/format.rate,end:end/format.rate,rms:Math.sqrt(sum/((end-i)*format.channels))}));
  }
  const onset=energy.map((e,i)=>Math.max(0,e.rms-(energy[i-1]?.rms??0)));
  let bestLag=0,best=0;
  if(duration>=4)for(let lag=Math.ceil(60/(180*step));lag<=Math.floor(60/(60*step));lag++){
    let cross=0,a=0,b=0;
    for(let i=lag;i<onset.length;i++){cross+=onset[i]*onset[i-lag];a+=onset[i]**2;b+=onset[i-lag]**2;}
    const score=a*b>1e-12?cross/Math.sqrt(a*b):0;
    if(score>best+1e-6){best=score;bestLag=lag;}
  }
  const bpm=best>=.35&&bestLag?60/(bestLag*step):null;
  let phase=0;
  if(bestLag)for(let i=1;i<Math.min(bestLag,onset.length);i++)if(onset[i]>onset[phase])phase=i;
  const beats:number[]=[];
  if(bpm!==null)for(let t=phase*step;t<duration;t+=60/bpm)beats.push(Math.round(t*1e6)/1e6);
  return Object.freeze({version:"local-pcm-v1",durationSeconds:duration,sampleRate:format.rate,channels:format.channels,
    method:"rms-onset-autocorrelation",bpm,confidence:bpm===null?0:best,beats:Object.freeze(beats),energy:Object.freeze(energy)});
}
