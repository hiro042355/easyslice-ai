import test from "node:test";
import assert from "node:assert/strict";
import type { DecodedIdToken } from "firebase-admin/auth";
import { CanonicalFirebaseSessionVerifier, identity, digest } from "../../lib/server/localTikTok/security";
const uid = "synthetic:firebase-owner";
function fixture() {
  let revoked = false; let expiry = Math.floor(Date.now()/1000)+3600; let subject = uid; let issued = Math.floor(Date.now()/1000)-10;
  const calls: boolean[] = [];
  const verify = async (credential: string, checkRevoked?: boolean): Promise<DecodedIdToken> => {
    calls.push(checkRevoked === true);
    if (revoked || !credential.startsWith("synthetic-firebase-")) throw new Error("fixture-rejected");
    return {uid, sub: subject, aud:"synthetic-project", iss:"https://securetoken.google.com/synthetic-project", iat:issued, exp:expiry, auth_time:issued, firebase:{identities:{},sign_in_provider:"custom"}};
  };
  const verifier = new CanonicalFirebaseSessionVerifier({verifyIdToken:verify,verifySessionCookie:verify},uid);
  const request = (credential = "synthetic-firebase-cookie-1") => new Request("http://127.0.0.1:8765/api/tiktok/connection", {headers:{cookie:`__Host-nexcut_session=${credential}`}});
  return {verifier,request,calls,revoke:()=>{revoked=true;},expire:()=>{expiry=Math.floor(Date.now()/1000)-1;},subject:()=>{subject="synthetic:other";},future:()=>{issued=Math.floor(Date.now()/1000)+10;}};
}
test("verified canonical cookie binds Firebase UID and hashed exact credential",async()=>{const f=fixture();const s=await f.verifier.verify(f.request());assert.deepEqual(identity(s),{uid,sessionId:digest("synthetic-firebase-cookie-1"),expiresAt:identity(s).expiresAt});assert.deepEqual(f.calls,[true]);});
test("missing session rejected",async()=>{const f=fixture();await assert.rejects(f.verifier.verify(new Request("http://127.0.0.1:8765")));assert.equal(f.calls.length,0);});
test("malformed cookie rejected",async()=>{const f=fixture();await assert.rejects(f.verifier.verify(new Request("http://127.0.0.1:8765",{headers:{cookie:"__Host-nexcut_session=%zz"}})));});
test("unverified credential rejected",async()=>{const f=fixture();await assert.rejects(f.verifier.verify(f.request("unsigned-uid")));});
test("expired verified session rejected independently of verifier",async()=>{const f=fixture();f.expire();await assert.rejects(f.verifier.verify(f.request()));});
test("revocation rechecked on each request",async()=>{const f=fixture();await f.verifier.verify(f.request());f.revoke();await assert.rejects(f.verifier.verify(f.request()));assert.deepEqual(f.calls,[true,true]);});
test("logout means missing cookie cannot reuse prior request session",async()=>{const f=fixture();await f.verifier.verify(f.request());await assert.rejects(f.verifier.verify(new Request("http://127.0.0.1:8765")));});
test("changed credential changes durable session binding",async()=>{const f=fixture();const a=identity(await f.verifier.verify(f.request()));const b=identity(await f.verifier.verify(f.request("synthetic-firebase-cookie-2")));assert.equal(a.uid,b.uid);assert.notEqual(a.sessionId,b.sessionId);});
test("browser UID header and body cannot select identity",async()=>{const f=fixture();const r=new Request("http://127.0.0.1:8765",{method:"POST",headers:{cookie:"__Host-nexcut_session=synthetic-firebase-cookie-1","x-user-id":"attacker"},body:'{"uid":"attacker"}'});assert.equal(identity(await f.verifier.verify(r)).uid,uid);});
test("beta authorization reused and denies other users",async()=>{const f=fixture();const other=new CanonicalFirebaseSessionVerifier({verifyIdToken:async()=>{throw new Error();},verifySessionCookie:async()=>({uid:"synthetic:other",sub:"synthetic:other",iat:Math.floor(Date.now()/1000)-10,exp:Math.floor(Date.now()/1000)+60} as DecodedIdToken)},uid);await assert.rejects(other.verify(f.request()));});
test("subject UID mismatch rejected",async()=>{const f=fixture();f.subject();await assert.rejects(f.verifier.verify(f.request()));});
test("future issued-at rejected",async()=>{const f=fixture();f.future();await assert.rejects(f.verifier.verify(f.request()));});
test("opaque identity cannot be fabricated",()=>assert.throws(()=>identity(Object.freeze({kind:"VERIFIED_LOCAL_SESSION"}))));
test("CSRF is session-bound and changed session cannot reuse it",async()=>{const f=fixture();const a=await f.verifier.verify(f.request());const b=await f.verifier.verify(f.request("synthetic-firebase-cookie-2"));const r=new Request("http://127.0.0.1:8765/api/tiktok/disconnect",{headers:{origin:"http://127.0.0.1:8765","x-nexcut-local-csrf":f.verifier.csrf(a)}});f.verifier.verifyMutation(r,a);assert.throws(()=>f.verifier.verifyMutation(r,b));});
test("bearer uses canonical verifier and revocation checking",async()=>{const f=fixture();const r=new Request("http://127.0.0.1:8765",{headers:{authorization:"Bearer synthetic-firebase-token-1"}});assert.equal(identity(await f.verifier.verify(r)).uid,uid);assert.deepEqual(f.calls,[true]);});