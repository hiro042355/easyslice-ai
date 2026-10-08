import { randomBytes, randomUUID } from "node:crypto";
import type { ConnectionResponse } from "../../tiktokConnection/contracts";
import { TokenCustody, type KeyProvider } from "./custody";
import { PgOAuthStore, type Claim, type Connection } from "./store";
import { identity, localOnly, LOCAL_APP, LOCAL_ORIGIN, reject, SCOPES, stateDigest, type Session } from "./security";
export class MockTikTokOAuthProvider {
  #scenario:"SUCCESS"|"INVALID"|"FAIL"="SUCCESS"; #calls=0;
  constructor(){Object.seal(this);}
  get calls(){return this.#calls;}
  scenario(value:"SUCCESS"|"INVALID"|"FAIL"){this.#scenario=value;}
  async exchange(code:string,secret:string,uid:string){this.#calls++;if(!code.startsWith("synthetic-code") || secret!=="synthetic-client-secret" || this.#scenario==="FAIL") reject("PROVIDER_REJECTED");return {openId:`synthetic-open-${uid}`,displayName:"Synthetic Creator",accessToken:`synthetic_access_${randomBytes(16).toString("hex")}`,refreshToken:`synthetic_refresh_${randomBytes(16).toString("hex")}`,expiresIn:this.#scenario==="INVALID"?-1:3600,scopes:[...SCOPES]};}
}
Object.freeze(MockTikTokOAuthProvider.prototype);
export class LocalTikTokService {
  readonly custody:TokenCustody;
  constructor(readonly store:PgOAuthStore,keys:KeyProvider,readonly provider:MockTikTokOAuthProvider,target:string){localOnly(target);if(Object.getPrototypeOf(provider)!==MockTikTokOAuthProvider.prototype) reject("MOCK_PROVIDER_REQUIRED");this.custody=new TokenCustody(keys);Object.freeze(this);}
  async start(session:Session,random:()=>Buffer=()=>randomBytes(32)):Promise<string>{identity(session);const bytes=random();if(bytes.length!==32) reject("STATE_REJECTED");const raw=bytes.toString("base64url");await this.store.issue(session,stateDigest(raw));return `${LOCAL_ORIGIN}/_mock/tiktok/authorize?state=${raw}`;}
  async callback(session:Session,raw:string,code:string,providerDenied=false):Promise<void>{const hash=stateDigest(raw);let claim:Claim|undefined;try{claim=await this.store.claim(session,hash);if(providerDenied || !code || code.length>256 || !code.startsWith("synthetic-code")) reject("PROVIDER_REJECTED");const s=identity(session);const response=await this.provider.exchange(code,"synthetic-client-secret",s.uid);
    if(!response.openId.startsWith("synthetic-open-") || !response.accessToken.startsWith("synthetic_access_") || !response.refreshToken.startsWith("synthetic_refresh_") || !Number.isSafeInteger(response.expiresIn) || response.expiresIn<=0 || response.expiresIn>86400 || SCOPES.some(scope=>!response.scopes.includes(scope))) reject("PROVIDER_REJECTED");
    const c:Omit<Connection,"envelope">={uid:s.uid,app:LOCAL_APP,environment:"sandbox",openId:response.openId,generation:randomUUID(),displayName:response.displayName,scopes:Object.freeze([...response.scopes]),expiresAt:await this.store.now()+response.expiresIn*1000,revoked:false};const connection=Object.freeze({...c,envelope:this.custody.encrypt({accessToken:response.accessToken,refreshToken:response.refreshToken},c)});identity(session);await this.store.complete(claim,connection);
  }catch{if(claim)try{await this.store.failed(claim);}catch{/* ambiguous DB outcome stays non-reusable */}reject("OAUTH_REJECTED");}}
  async connection(session:Session):Promise<ConnectionResponse>{const c=await this.store.connection(session);if(!c || c.revoked) return {version:"1",status:"NOT_CONNECTED"};if(c.expiresAt<=await this.store.now()) return {version:"1",status:"REAUTH_REQUIRED"};try{this.custody.decrypt(c);}catch{return {version:"1",status:"ERROR",error:"CONNECTION_CHECK_FAILED"};}return Object.freeze({version:"1",status:"CONNECTED",account:Object.freeze({displayName:c.displayName})});}
  async disconnect(session:Session):Promise<void>{await this.store.disconnect(session);}
}
