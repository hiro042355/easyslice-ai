import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import type {DecodedIdToken} from "firebase-admin/auth";
import {composeSandboxTikTokApplication} from "../../lib/server/tiktokApplication/composition";
import {validateSandboxApplicationEnvironment} from "../../lib/server/tiktokApplication/configuration";
import {installAuthorizedSandboxApplication} from "../../lib/server/tiktokApplication/runtime";
import {IntegrationPgStore} from "../../lib/server/tiktokIntegration/store";
import {ManagedTokenVault} from "../../lib/server/tiktokKeys/managedVault";
import {syntheticKmsClient,fixtureKmsVersion} from "../tiktokHardening/kmsFixture";
import {CanonicalFirebaseSessionVerifier,stateDigest} from "../../lib/server/localTikTok/security";
import {MockHttpTransport,CALLBACK_URI} from "../../lib/server/tiktokHttp/adapter";
import {GET as callback} from "../../app/api/tiktok/oauth/callback/route";
import {POST as start} from "../../app/api/tiktok/oauth/start/route";
import {GET as connection} from "../../app/api/tiktok/connection/route";
import {POST as disconnect} from "../../app/api/tiktok/disconnect/route";
let phase="preflight";
async function main(){
 if(process.env.LOCAL_TEST_POSTGRES!=="YES")throw new Error("LOCAL_RUNNER_REQUIRED");
 Object.assign(process.env,{NEXCUT_TIKTOK_APPLICATION_MODE:"sandbox",NEXCUT_TIKTOK_OAUTH_MODE:"sandbox",NEXCUT_TIKTOK_CLIENT_KEY:"synthetic-client",NEXCUT_TIKTOK_CLIENT_SECRET:"synthetic-client-secret",NEXCUT_TIKTOK_REDIRECT_URI:CALLBACK_URI});
 let realNetwork=0;globalThis.fetch=(()=>{realNetwork++;throw new Error("NETWORK_FORBIDDEN");}) as typeof fetch;
 const pool=new Pool({host:"127.0.0.1",port:5432,database:"oauth_local_test",user:"oauth_test_runtime",password:process.env.LOCAL_TEST_DB_PASSWORD,ssl:false,query_timeout:5000});
 const uid="synthetic:mission08-next-"+randomUUID(),cookie="synthetic-next-cookie",now=Math.floor(Date.now()/1000);let tokenCalls=0,revokeCalls=0,authorityCalls=0;
 try{
 const execution={mode:"SERVER_GATED" as const,authorize:async()=>{authorityCalls++;}};
 const verifier=new CanonicalFirebaseSessionVerifier({verifySessionCookie:async(value,revoked)=>{assert.equal(value,cookie);assert.equal(revoked,true);return {uid,sub:uid,iss:"https://session.firebase.google.com/synthetic-project",aud:"synthetic-project",iat:now-10,exp:now+3600,auth_time:now-10,firebase:{identities:{},sign_in_provider:"google.com"}} as DecodedIdToken;},verifyIdToken:async()=>{throw new Error("ID_TOKEN_FORBIDDEN");}},uid);
 const transport=new MockHttpTransport(async(url)=>{if(new URL(url).pathname==="/v2/oauth/token/"){tokenCalls++;return Response.json({open_id:"synthetic-next-open",access_token:"synthetic_access_fixture",refresh_token:"synthetic_refresh_fixture",token_type:"Bearer",expires_in:3600,refresh_expires_in:86400,scope:"user.info.basic,video.publish"});}if(new URL(url).pathname==="/v2/oauth/revoke/"){revokeCalls++;return Response.json({});}throw new Error("UNEXPECTED_PROVIDER_STAGE");});
 const store=new IntegrationPgStore(pool,execution,{app:"synthetic-client",redirect:CALLBACK_URI});
 const app=composeSandboxTikTokApplication(validateSandboxApplicationEnvironment(process.env),{store,keys:new ManagedTokenVault({execution:"LOCAL_TEST",activeVersion:fixtureKmsVersion,readableVersions:[fixtureKmsVersion]},syntheticKmsClient()),transport,verifier,execution,csrf:s=>verifier.csrf(s)});
 phase="install";await installAuthorizedSandboxApplication(app);
 const req=(path:string,method="GET",body?:string,csrf?:string)=>new Request(new URL(path,"https://www.nexcutai.com"),{method,headers:{cookie:"__Host-nexcut_session="+cookie,...(method==="POST"?{origin:"https://www.nexcutai.com","x-nexcut-local-csrf":csrf??"","content-type":"application/json"}:{})},body});
 const mutation=async(path:string,body?:string)=>req(path,"POST",body,verifier.csrf(await verifier.verify(req("/api/tiktok/connection"))));
 phase="start";const issued=await start(await mutation("/api/tiktok/oauth/start"));assert.equal(issued.status,303);const state=new URL(issued.headers.get("location")!).searchParams.get("state")!;
 phase="callback";const result=await callback(req("/api/tiktok/oauth/callback?state="+state+"&code=synthetic-next-code"));assert.equal(result.status,303);assert.equal(result.headers.get("location"),"https://www.nexcutai.com/settings/connections");assert.equal(tokenCalls,1);
 phase="durable-state";assert.equal((await pool.query("SELECT status FROM tiktok_oauth.states WHERE digest=$1",[stateDigest(state)])).rows[0].status,"CONSUMED");
 phase="encrypted-envelope";const persisted=(await store.connection(await verifier.verify(req("/api/tiktok/connection"))))!;assert.equal(persisted.envelope.formatVersion,2);assert.ok(persisted.envelope.wrappedKey!.length>0);assert.ok(!persisted.envelope.ciphertext.toString().includes("synthetic_access_fixture"));
 phase="connection-dto";const safe=await connection(req("/api/tiktok/connection"));assert.equal(safe.status,200);assert.deepEqual(await safe.json(),{version:"1",status:"CONNECTED",account:{displayName:"TikTok connected account"}});
 phase="replay";assert.equal((await callback(req("/api/tiktok/oauth/callback?state="+state+"&code=synthetic-next-code"))).status,400);assert.equal(tokenCalls,1);
 phase="disconnect";assert.equal((await disconnect(await mutation("/api/tiktok/disconnect",JSON.stringify({confirm:true})))).status,200);assert.equal((await connection(req("/api/tiktok/connection"))).status,200);const revoked=(await store.connection(await verifier.verify(req("/api/tiktok/connection"))))!;assert.equal(revoked.revoked,true);assert.equal(revoked.envelope.ciphertext.length,0);assert.equal(revoked.envelope.wrappedKey!.length,0);assert.equal(revokeCalls,1);assert.ok(authorityCalls>10);assert.equal(realNetwork,0);console.log("NEXT_POSTGRES_LIFECYCLE_PASS");
 }finally{await pool.end();}
}
main().catch((error:unknown)=>{console.error("NEXT_POSTGRES_LIFECYCLE_FAILED",phase,error instanceof Error?error.name:"UNKNOWN");process.exitCode=1;});
