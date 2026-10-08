import { protectTokenSerialization } from "../tiktokKeys/tokenSecrets";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Connection, Envelope, IntegrationPgStore } from "./store";
import type { KeyProvider, Tokens } from "../localTikTok/custody";
import { identity, reject, type Session } from "../localTikTok/security";
const aad=(c:Omit<Connection,"envelope">,keyId:string)=>Buffer.from(JSON.stringify([c.uid,c.app,c.environment,c.openId,c.generation,c.scopes,c.expiresAt,keyId]));
/** Server key-provider port; no environment loader, Production KMS call, or browser export. */
export class IntegrationTokenVault {
 constructor(private readonly keys:KeyProvider){}
 toJSON(){return {custody:"ENCRYPTED",credentials:"SERVER_ONLY"};}
 encrypt(tokens:Tokens,c:Omit<Connection,"envelope">):Envelope {
  if(!c.uid || !c.openId || !c.app || !["staging","production"].includes(c.environment) || c.revoked || c.expiresAt<=Date.now() || !tokens.accessToken || !tokens.refreshToken || tokens.accessToken.length>8192 || tokens.refreshToken.length>8192) reject("CUSTODY_REJECTED");
  const key=this.keys.current();if(!key.id || key.key.length!==32)reject("KEY_UNAVAILABLE");
  const nonce=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key.key,nonce);cipher.setAAD(aad(c,key.id));return Object.freeze({keyId:key.id,nonce,ciphertext:Buffer.concat([cipher.update(JSON.stringify({accessToken:tokens.accessToken,refreshToken:tokens.refreshToken}),"utf8"),cipher.final()]),tag:cipher.getAuthTag()});
 }
 decrypt(c:Connection):Tokens {try {const e=c.envelope,key=this.keys.resolve(e.keyId);if(c.revoked || c.expiresAt<=Date.now() || !key || key.length!==32 || e.nonce.length!==12 || e.tag.length!==16)reject("CUSTODY_REJECTED");const cipher=createDecipheriv("aes-256-gcm",key,e.nonce);cipher.setAAD(aad(c,e.keyId));cipher.setAuthTag(e.tag);const tokens:unknown=JSON.parse(Buffer.concat([cipher.update(e.ciphertext),cipher.final()]).toString());if(!tokens || typeof tokens!=="object" || !("accessToken" in tokens) || !("refreshToken" in tokens) || typeof tokens.accessToken!=="string" || typeof tokens.refreshToken!=="string" || !tokens.accessToken || !tokens.refreshToken)reject("CUSTODY_REJECTED");return protectTokenSerialization({accessToken:tokens.accessToken,refreshToken:tokens.refreshToken});}catch{reject("CUSTODY_REJECTED");}}
 async resolve(session:Session,store:IntegrationPgStore){const c=await store.connection(session);if(!c || c.uid!==identity(session).uid || c.revoked || c.expiresAt<=await store.now() || !c.scopes.includes("video.publish"))reject("CONNECTION_REQUIRED");return {connection:c,tokens:this.decrypt(c)};}
}
