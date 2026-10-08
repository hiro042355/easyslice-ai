import { CONNECTION_STATES, type ConnectionResponse, type ConnectionState } from "./contracts";

export type VerifiedServerContext = Readonly<{ authenticated: true; accountOwnership: "MATCH"; appEnvironment: "MATCH"; connectionCurrent: true }>;
export type ConnectionView = Readonly<{ kind: "TIKTOK_CONNECTION_VIEW" }>;
export type Presentation = Readonly<{ state: ConnectionState; label: string; guidance: string; account: string; error: string | null; connectEnabled: false; disconnectEnabled: false; publicationEnabled: false }>;
const views = new WeakMap<object,Presentation>();
const messages:Record<ConnectionState,readonly [string,string]> = {
  NOT_CONNECTED: ["未接続", "TikTokアカウントはまだ接続されていません。接続機能の公開後に連携できます。"],
  CONNECTING: ["接続を確認中", "接続結果の確認が完了するまでお待ちください。"],
  CONNECTED: ["接続済み", "接続情報は確認済みです。投稿機能はまだ利用できません。"],
  REAUTH_REQUIRED: ["再認証が必要", "接続の有効期限が切れたか、許可が取り消されました。接続機能の公開後に再認証してください。"],
  DISCONNECTING: ["接続解除を確認中", "接続解除の確認が完了するまでお待ちください。"],
  ERROR: ["接続情報を確認できません", "接続情報の確認に失敗しました。時間をおいてご確認ください。"],
  UNAVAILABLE: ["接続機能は準備中", "TikTokの接続機能はまだ利用できません。公開後にこの画面から接続できます。"],
};
const errors:Record<string,string> = {SESSION_REQUIRED:"ログインしてから接続情報をご確認ください。",CONNECTION_CHECK_FAILED:"接続情報を確認できませんでした。",CONNECTION_EXPIRED:"TikTokの再認証が必要です。"};
function snapshot(state:ConnectionState,account="接続アカウントなし",error:string|null=null):Presentation {
  return Object.freeze({state,label:messages[state][0],guidance:messages[state][1],account,error,connectEnabled:false,disconnectEnabled:false,publicationEnabled:false});
}
const unavailable=snapshot("UNAVAILABLE");
/** Trusted server projection seam, not an authentication verifier. Used through server-only facade. */
export function projectVerifiedServerResponse(response:ConnectionResponse,context:VerifiedServerContext):ConnectionView {
  let value=unavailable;
  try {
    const verified=context?.authenticated===true && context.accountOwnership==="MATCH" && context.appEnvironment==="MATCH" && context.connectionCurrent===true;
    if(verified && response?.version==="1" && CONNECTION_STATES.includes(response.status)) {
      const raw=response.account?.displayName;
      const name=typeof raw==="string" && raw.trim()===raw && raw.length>0 && raw.length<=64 && !/[\u0000-\u001f\u007f]|https?:|[<>]/.test(raw) ? raw : null;
      // CONNECTED requires both server verification and a bounded account identity.
      if(response.status!=="CONNECTED" || name) value=snapshot(response.status,response.status==="CONNECTED"?name!:"接続アカウントなし",response.status==="ERROR"?(Object.prototype.hasOwnProperty.call(errors,response.error??"") ? errors[response.error!] : errors.CONNECTION_CHECK_FAILED):null);
    }
  } catch { value=unavailable; }
  const handle=Object.freeze({kind:"TIKTOK_CONNECTION_VIEW" as const});views.set(handle,value);return handle;
}
export function readConnectionView(view?:ConnectionView):Presentation {
  return view && typeof view==="object" ? views.get(view)??unavailable : unavailable;
}
