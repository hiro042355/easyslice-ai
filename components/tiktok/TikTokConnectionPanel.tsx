"use client";
import { useEffect, useState } from "react";
import { unavailableConnectionApi, isLocalConnectionApi, type ConnectionApi } from "../../lib/client/localTikTokConnectionApi";
import type { ConnectionResponse } from "../../lib/tiktokConnection/contracts";
import { projectVerifiedServerResponse } from "../../lib/tiktokConnection/viewCore";
import {isSandboxConnectionApi,isSyntheticSandboxApi} from "../../lib/client/sandboxTikTokConnectionApi";
import {useRef} from "react";
import {TikTokPermissionNotice} from "./TikTokPermissionNotice";
import { TikTokConnectionCard } from "./TikTokConnectionCard";
export function TikTokConnectionPanel({api=unavailableConnectionApi}:{api?:ConnectionApi}) {
  const [response,setResponse]=useState<ConnectionResponse>({version:"1",status:"UNAVAILABLE"});
  const interactive=isLocalConnectionApi(api)||isSyntheticSandboxApi(api)||isSandboxConnectionApi(api);const synthetic=isLocalConnectionApi(api)||isSyntheticSandboxApi(api);const inFlight=useRef(false);
  const [loading,setLoading]=useState(false);const [confirm,setConfirm]=useState(false);
  useEffect(()=>{let active=true;if(!interactive) return;void api.getConnection().then(value=>{if(active)setResponse(value);}).catch(()=>{if(active)setResponse({version:"1",status:"ERROR",error:"CONNECTION_CHECK_FAILED"});});return()=>{active=false;};},[api,interactive]);
  const run=async(operation:"connect"|"disconnect")=>{if(!interactive || inFlight.current)return;inFlight.current=true;setLoading(true);setResponse({version:"1",status:operation==="connect"?"CONNECTING":"DISCONNECTING"});setConfirm(false);try{if(operation==="connect"){const result=await api.startOAuth();if(result.status==="UNAVAILABLE"){setResponse({version:"1",status:"UNAVAILABLE"});return;}if(isSandboxConnectionApi(api))return;}else await api.disconnect();setResponse(await api.getConnection());}catch{setResponse({version:"1",status:"ERROR",error:"CONNECTION_CHECK_FAILED"});}finally{inFlight.current=false;setLoading(false);}};
  // Only branded clients produce a response; the server remains the authentication authority.
  // Default remains UNAVAILABLE; a UI hint cannot install or authorize server dependencies.
  const view=projectVerifiedServerResponse(response,{authenticated:true,accountOwnership:"MATCH",appEnvironment:"MATCH",connectionCurrent:true});
  return <div><TikTokConnectionCard view={view} hideActions={interactive} /><TikTokPermissionNotice />{interactive?<section aria-label={synthetic?"Local test connection workflow":"Sandbox connection workflow"} className="mt-4 rounded-xl border border-white/10 p-4">
    <p className="mb-3 text-sm text-amber-200">{synthetic?"ローカルの合成テスト環境です。実際のTikTok接続・投稿は行いません。":"Sandbox 用の接続画面です。本番 TikTok Connect・投稿は無効です。"}</p>
    <button type="button" disabled={loading || response.status==="CONNECTING" || response.status==="UNAVAILABLE" || response.status==="CONNECTED"} onClick={()=>void run("connect")} className="rounded-lg border border-cyan-300/30 px-4 py-2 text-sm disabled:opacity-50">{synthetic?"テスト接続":response.status==="REAUTH_REQUIRED"?"TikTokを再認証":"TikTokに接続"}</button>
    <button type="button" disabled={loading || response.status!=="CONNECTED"} onClick={()=>setConfirm(true)} className="ml-3 rounded-lg border border-white/10 px-4 py-2 text-sm disabled:opacity-50">{synthetic?"テスト接続を解除":"接続を解除"}</button>
    {confirm?<div role="dialog" aria-label="接続解除の確認" className="mt-4"><p>{synthetic?"このテスト接続を解除しますか？":"この接続を解除しますか？"}</p><button type="button" onClick={()=>void run("disconnect")} className="mt-2 rounded-lg border border-white/10 px-4 py-2">解除する</button><button type="button" onClick={()=>setConfirm(false)} className="ml-3 px-4 py-2">キャンセル</button></div>:null}
  </section>:null}</div>;
}
