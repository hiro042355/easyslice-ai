"use client";
import {useMemo,useEffect,useState} from "react";
import {createSandboxConnectionApi} from "../../lib/client/sandboxTikTokConnectionApi";
import {unavailableConnectionApi} from "../../lib/client/localTikTokConnectionApi";
import {TikTokConnectionPanel} from "./TikTokConnectionPanel";
/** Server hint only. Actual enabled state/CSRF/ownership always comes from installed authenticated server routes. */
export function TikTokSandboxConnectionPanel({enabled=false}:{enabled?:boolean}){
 const [failed,setFailed]=useState(false);
 useEffect(()=>{let active=true;queueMicrotask(()=>{if(active)setFailed(new URL(window.location.href).searchParams.get("tiktok")==="error");});return()=>{active=false;};},[]);
 const api=useMemo(()=>enabled?createSandboxConnectionApi({request:(path,init)=>fetch(path,init),navigate:path=>{window.location.assign(path);}},"SANDBOX"):unavailableConnectionApi,[enabled]);
 return <>{failed?<p role="alert" className="mb-4 rounded border border-red-300/25 p-3 text-red-200">TikTok認証を完了できませんでした。接続状態はサーバーで確認します。</p>:null}<TikTokConnectionPanel api={api}/></>;
}
