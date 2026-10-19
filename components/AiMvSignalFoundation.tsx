"use client";
import {useRef,useState} from 'react';
import {analyzeLocalWav,suggestBeatCuts,MAX_LOCAL_MUSIC_BYTES,type LocalMusicAnalysis} from '@/lib/aiMvEvolution/musicIntelligence';

/** Reviewed, independently imported local signal slice. No upload/provider path. */
export function AiMvSignalFoundation(){
 const [analysis,setAnalysis]=useState<LocalMusicAnalysis|null>(null),[error,setError]=useState('');const epoch=useRef(0);
 async function inspect(file:File|undefined){const current=++epoch.current;setAnalysis(null);setError('');if(!file)return;
  if(file.size>MAX_LOCAL_MUSIC_BYTES){setError('32 MiB以下のWAVを選択してください。');return;}
  try{const result=analyzeLocalWav(new Uint8Array(await file.arrayBuffer()));if(current===epoch.current)setAnalysis(result);}catch{if(current===epoch.current)setError('16-bit PCM WAVを読み取れませんでした。');}
 }
 return <section aria-label="ローカル音源解析基盤" className="rounded-lg border border-cyan-400/20 p-4">
  <h2>ローカル音源解析</h2><p className="text-xs text-slate-400">WAVをブラウザ内で解析します。送信・保存・外部AI生成は行いません。既存の編集設定は変更しません。</p>
  <input type="file" accept=".wav,audio/wav" aria-label="ローカル解析するWAV" onChange={e=>{void inspect(e.target.files?.[0]);}}/>
  {error&&<p role="alert">{error}</p>}{analysis&&<div role="status"><p>長さ: {analysis.durationSeconds.toFixed(2)}秒 / 推定BPM: {analysis.bpm?.toFixed(1)??'未検出'}</p><p>4拍カット候補: {suggestBeatCuts(analysis,4).slice(0,16).map(x=>x.toFixed(2)).join(' / ')||'なし'}</p><p>意味的なサビ検出・Character生成・外部投稿の証明ではありません。</p></div>}
 </section>;
}
