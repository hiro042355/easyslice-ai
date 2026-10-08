import {REQUIRED_SCOPES} from "../tiktokHttp/adapter";
/** TikTok Login Kit documents scopes and error_description on the callback. No echo is an authority grant. */
export function parseProviderCallback(url:URL):Readonly<{state:string;code:string;denied:boolean}> {
 const query=url.searchParams,allowed=["state","code","scopes","error","error_description"];
 if([...query.keys()].some(k=>!allowed.includes(k))||allowed.some(k=>query.getAll(k).length>1)||query.getAll("state").length!==1||query.has("code")===query.has("error"))throw new Error("CALLBACK_REJECTED");
 const state=query.get("state")!,code=query.get("code")??"",error=query.get("error"),description=query.get("error_description");
 if(state.length>128||code.length>2048||(query.has("code")&&!code)||(error!==null&&(!error||error.length>128))||(description!==null&&(description.length>2048||error===null)))throw new Error("CALLBACK_REJECTED");
 let scopeRejected=false;const raw=query.get("scopes");
 if(raw!==null){if(raw.length>512)throw new Error("CALLBACK_REJECTED");const scopes=raw.split(",");scopeRejected=scopes.length!==REQUIRED_SCOPES.length||new Set(scopes).size!==scopes.length||scopes.some(s=>!REQUIRED_SCOPES.includes(s));}
 // Provider text is discarded; authoritative scopes still come from the validated server token response.
 return Object.freeze({state,code,denied:error!==null||scopeRejected});
}
