"use client";
import { useEffect, useState } from "react";
import { unavailableConnectionApi, isLocalConnectionApi, type ConnectionApi } from "../../lib/client/localTikTokConnectionApi";
import type { ConnectionResponse } from "../../lib/tiktokConnection/contracts";
import { projectVerifiedServerResponse } from "../../lib/tiktokConnection/viewCore";
import {TikTokPermissionNotice} from "./TikTokPermissionNotice";
import { TikTokConnectionCard } from "./TikTokConnectionCard";
export function TikTokConnectionPanel({api=unavailableConnectionApi}:{api?:ConnectionApi}) {
  const [response,setResponse]=useState<ConnectionResponse>({version:"1",status:"UNAVAILABLE"});
  const [loading,setLoading]=useState(false);const [confirm,setConfirm]=useState(false);
  useEffect(()=>{let active=true;if(!isLocalConnectionApi(api)) return;void api.getConnection().then(value=>{if(active)setResponse(value);}).catch(()=>{if(active)setResponse({version:"1",status:"ERROR",error:"CONNECTION_CHECK_FAILED"});});return()=>{active=false;};},[api]);
  const run=async(operation:"connect"|"disconnect")=>{if(!isLocalConnectionApi(api) || loading)return;setLoading(true);setResponse({version:"1",status:operation==="connect"?"CONNECTING":"DISCONNECTING"});setConfirm(false);try{if(operation==="connect")await api.startOAuth();else await api.disconnect();setResponse(await api.getConnection());}catch{setResponse({version:"1",status:"ERROR",error:"CONNECTION_CHECK_FAILED"});}finally{setLoading(false);}};
  // Only the explicitly injected local/test route client produces verified evidence here.
  // Production/default has no producer or enabling flag and remains UNAVAILABLE.
  const view=projectVerifiedServerResponse(response,{authenticated:true,accountOwnership:"MATCH",appEnvironment:"MATCH",connectionCurrent:true});
  return <div><TikTokConnectionCard view={view} /><TikTokPermissionNotice />{isLocalConnectionApi(api)?<section aria-label="Local test connection workflow" className="mt-4 rounded-xl border border-white/10 p-4">
    <p className="mb-3 text-sm text-amber-200">ローカルの合成テスト環境です。実際のTikTok接続・投稿は行いません。</p>
    <button type="button" disabled={loading || response.status==="CONNECTED"} onClick={()=>void run("connect")} className="rounded-lg border border-cyan-300/30 px-4 py-2 text-sm disabled:opacity-50">テスト接続</button>
    <button type="button" disabled={loading || response.status!=="CONNECTED"} onClick={()=>setConfirm(true)} className="ml-3 rounded-lg border border-white/10 px-4 py-2 text-sm disabled:opacity-50">テスト接続を解除</button>
    {confirm?<div role="dialog" aria-label="接続解除の確認" className="mt-4"><p>このテスト接続を解除しますか？</p><button type="button" onClick={()=>void run("disconnect")} className="mt-2 rounded-lg border border-white/10 px-4 py-2">解除する</button><button type="button" onClick={()=>setConfirm(false)} className="ml-3 px-4 py-2">キャンセル</button></div>:null}
  </section>:null}</div>;
}
