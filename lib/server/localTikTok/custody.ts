import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { reject, type Session, identity } from "./security";
import type { Connection, Envelope, PgOAuthStore } from "./store";
export interface KeyProvider { current():Readonly<{id:string;key:Buffer}>; resolve(id:string):Buffer|undefined }
export class SyntheticKeyProvider implements KeyProvider {
  readonly #id=`local-${randomBytes(8).toString("hex")}`; readonly #key=randomBytes(32);
  current(){return {id:this.#id,key:Buffer.from(this.#key)};} resolve(id:string){return id===this.#id?Buffer.from(this.#key):undefined;}
}
export type Tokens=Readonly<{accessToken:string;refreshToken:string}>;
export function aad(c:Omit<Connection,"envelope">):Buffer{return Buffer.from(JSON.stringify([c.uid,c.openId,c.app,c.environment,c.generation,c.expiresAt,c.scopes]));}
export class TokenCustody {
  constructor(readonly keys:KeyProvider){Object.freeze(this);}
  toJSON(){return {execution:"LOCAL_TEST",custody:"ENCRYPTED"};}
  encrypt(tokens:Tokens,c:Omit<Connection,"envelope">):Envelope {if(!tokens.accessToken.startsWith("synthetic_access_") || !tokens.refreshToken.startsWith("synthetic_refresh_") || !c.uid.startsWith("synthetic:") || c.environment!=="sandbox" || c.app!=="synthetic-app") reject("LOCAL_CREDENTIAL_REQUIRED");const k=this.keys.current();if(!k || !k.id.startsWith("local-") || k.key.length!==32) reject("KEY_UNAVAILABLE");const nonce=randomBytes(12);const cipher=createCipheriv("aes-256-gcm",k.key,nonce);cipher.setAAD(Buffer.concat([aad(c),Buffer.from(k.id)]));const ciphertext=Buffer.concat([cipher.update(JSON.stringify(tokens),"utf8"),cipher.final()]);return Object.freeze({keyId:k.id,nonce,ciphertext,tag:cipher.getAuthTag()});}
  decrypt(c:Connection):Tokens {try{if(c.revoked || c.environment!=="sandbox" || c.expiresAt<=Date.now()) reject("CUSTODY_REJECTED");const e=c.envelope;const key=this.keys.resolve(e.keyId);if(!key || key.length!==32 || e.nonce.length!==12 || e.tag.length!==16) reject("CUSTODY_REJECTED");const cipher=createDecipheriv("aes-256-gcm",key,e.nonce);cipher.setAAD(Buffer.concat([aad(c),Buffer.from(e.keyId)]));cipher.setAuthTag(e.tag);const payload=JSON.parse(Buffer.concat([cipher.update(e.ciphertext),cipher.final()]).toString());if(typeof payload.accessToken!=="string" || !payload.accessToken.startsWith("synthetic_access_") || typeof payload.refreshToken!=="string" || !payload.refreshToken.startsWith("synthetic_refresh_")) reject("CUSTODY_REJECTED");return Object.freeze({accessToken:payload.accessToken,refreshToken:payload.refreshToken});}catch{reject("CUSTODY_REJECTED");}}
  async resolve(session:Session,store:PgOAuthStore):Promise<Readonly<{connection:Connection;tokens:Tokens}>> {const s=identity(session);const c=await store.connection(session);if(!c || c.uid!==s.uid || c.environment!=="sandbox" || c.revoked || c.expiresAt<=await store.now()) reject("CONNECTION_REQUIRED");return {connection:c,tokens:this.decrypt(c)};}
}
