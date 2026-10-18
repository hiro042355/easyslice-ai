import test from "node:test";
import assert from "node:assert/strict";
import { analyzeLocalWav, suggestBeatCuts, MAX_LOCAL_MUSIC_BYTES } from "../../lib/aiMvEvolution/musicIntelligence";
export function wav(bpm:number|null=120,seconds=8,channels=1){
  const rate=8000,frames=seconds*rate,bytes=new Uint8Array(44+frames*channels*2),v=new DataView(bytes.buffer);
  for(const [p,s]of [[0,"RIFF"],[8,"WAVE"],[12,"fmt "],[36,"data"]] as const)for(let i=0;i<4;i++)bytes[p+i]=s.charCodeAt(i);
  v.setUint32(4,bytes.length-8,true);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,channels,true);
  v.setUint32(24,rate,true);v.setUint32(28,rate*channels*2,true);v.setUint16(32,channels*2,true);v.setUint16(34,16,true);v.setUint32(40,frames*channels*2,true);
  for(let i=0;i<frames;i++)for(let ch=0;ch<channels;ch++)v.setInt16(44+(i*channels+ch)*2,bpm!==null&&i%Math.round(rate*60/bpm)<80?(ch===1?-20000:20000):0,true);
  return bytes;
}
test("local PCM metadata and beat grid are deterministic; stereo phase cancellation does not erase energy",()=>{
  for(const channels of [1,2]){
    const bytes=wav(120,8,channels),before=bytes.slice(),a=analyzeLocalWav(bytes);
    assert.equal(a.durationSeconds,8);assert.equal(a.channels,channels);assert.equal(a.sampleRate,8000);
    assert.ok(a.bpm!==null&&Math.abs(a.bpm-120)<3);assert.ok(a.confidence>.9);
    assert.equal(a.beats.length,16);assert.ok(a.beats.every((t,i)=>t>=0&&t<8&&(!i||t>a.beats[i-1])));
    assert.deepEqual(a,analyzeLocalWav(bytes));assert.deepEqual(bytes,before);assert.ok(Object.isFrozen(a.energy[0]));
  }
});
test("silence and short audio do not invent a BPM or semantic musical sections",()=>{
  for(const bytes of [wav(null),wav(120,1)]){const a=analyzeLocalWav(bytes);assert.equal(a.bpm,null);assert.deepEqual(a.beats,[]);assert.equal(a.confidence,0);assert.equal("chorus" in a,false);}
});
test("beat-aware cut suggestions preserve source analysis and user-selected spacing",()=>{
  const a=analyzeLocalWav(wav()),before=JSON.stringify(a);
  assert.deepEqual(suggestBeatCuts(a,4),[2,4,6]);assert.deepEqual(suggestBeatCuts(a,8),[4]);
  assert.deepEqual(suggestBeatCuts(analyzeLocalWav(wav(null)),2),[]);assert.equal(JSON.stringify(a),before);
});
test("malformed WAV, inconsistent metadata, duplicate/truncated chunks and oversized input fail closed",()=>{
  for(const mutate of [
    (b:Uint8Array)=>b.subarray(0,20),
    (b:Uint8Array)=>{b[0]=0;return b;},
    (b:Uint8Array)=>{new DataView(b.buffer).setUint32(40,0xffffffff,true);return b;},
    (b:Uint8Array)=>{b[20]=3;return b;},
    (b:Uint8Array)=>{b[32]=3;return b;},
    (b:Uint8Array)=>{b[28]=0;return b;},
    (b:Uint8Array)=>{b[34]=24;return b;},
  ])assert.throws(()=>analyzeLocalWav(mutate(wav())));
  assert.throws(()=>analyzeLocalWav(new Uint8Array(MAX_LOCAL_MUSIC_BYTES+1)));
  const b=wav();const padded=new Uint8Array(b.length+16);padded.set(b,8);assert.deepEqual(analyzeLocalWav(padded.subarray(8,8+b.length)),analyzeLocalWav(b));
});
