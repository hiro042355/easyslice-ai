import assert from "node:assert/strict";
import {Pool} from "pg";
import {composeSandboxTikTokApplication} from "../../lib/server/tiktokApplication/composition";
import {validateSandboxApplicationEnvironment} from "../../lib/server/tiktokApplication/configuration";
import {installAuthorizedSandboxApplication,resolveSandboxApplication} from "../../lib/server/tiktokApplication/runtime";
import {IntegrationPgStore} from "../../lib/server/tiktokIntegration/store";
import {ManagedTokenVault} from "../../lib/server/tiktokKeys/managedVault";
import {syntheticKmsClient,fixtureKmsVersion} from "../tiktokHardening/kmsFixture";
import {CanonicalFirebaseSessionVerifier} from "../../lib/server/localTikTok/security";
import {MockHttpTransport,CALLBACK_URI} from "../../lib/server/tiktokHttp/adapter";
import {GET} from "../../app/api/tiktok/oauth/callback/route";
async function main(){
 Object.assign(process.env,{NEXCUT_TIKTOK_APPLICATION_MODE:"sandbox",NEXCUT_TIKTOK_OAUTH_MODE:"sandbox",NEXCUT_TIKTOK_CLIENT_KEY:"synthetic-client",NEXCUT_TIKTOK_CLIENT_SECRET:"synthetic-secret",NEXCUT_TIKTOK_REDIRECT_URI:CALLBACK_URI});
 const originalFetch=globalThis.fetch;let network=0;globalThis.fetch=(()=>{network++;throw new Error("NETWORK_FORBIDDEN");}) as typeof fetch;
 const pool=new Pool({host:"127.0.0.1",port:5432,database:"oauth_local_test",user:"oauth_test_runtime",ssl:false});let authorized=0;
 try{
 const execution={mode:"SERVER_GATED" as const,authorize:async()=>{authorized++;}};
 const verifier=new CanonicalFirebaseSessionVerifier({verifySessionCookie:async()=>{throw new Error("synthetic-no-session");},verifyIdToken:async()=>{throw new Error("synthetic-no-session");}},"synthetic-owner");
 const app=composeSandboxTikTokApplication(validateSandboxApplicationEnvironment(process.env),{store:new IntegrationPgStore(pool,execution,{app:"synthetic-client",redirect:CALLBACK_URI}),keys:new ManagedTokenVault({execution:"LOCAL_TEST",activeVersion:fixtureKmsVersion,readableVersions:[fixtureKmsVersion]},syntheticKmsClient()),transport:new MockHttpTransport(async()=>{throw new Error("UNEXPECTED_PROVIDER_IO");}),verifier,execution,csrf:s=>verifier.csrf(s)});
 assert.equal(resolveSandboxApplication(),undefined);await assert.rejects(()=>installAuthorizedSandboxApplication({...app}));
 process.env.NEXCUT_TIKTOK_CLIENT_SECRET="synthetic-other-secret";await assert.rejects(()=>installAuthorizedSandboxApplication(app));process.env.NEXCUT_TIKTOK_CLIENT_SECRET="synthetic-secret";
 await installAuthorizedSandboxApplication(app);assert.equal(resolveSandboxApplication(),app.routes);await assert.rejects(()=>installAuthorizedSandboxApplication(app));
 const response=await GET(new Request(CALLBACK_URI+"?state=synthetic&code=synthetic"));assert.equal(response.status,400);assert.deepEqual(await response.json(),{error:"OAUTH_REJECTED"});
 process.env.NEXCUT_TIKTOK_CLIENT_SECRET="synthetic-other-secret";assert.equal(resolveSandboxApplication(),undefined);assert.equal((await GET(new Request(CALLBACK_URI))).status,503);
 process.env.NEXCUT_TIKTOK_OAUTH_MODE="production";assert.equal((await GET(new Request(CALLBACK_URI))).status,503);
 assert.ok(authorized>=4);assert.equal(network,0);console.log("RUNTIME_NEXT_HANDLER_PASS");
 }finally{await pool.end();globalThis.fetch=originalFetch;}
}
main().catch(()=>{console.error("RUNTIME_NEXT_HANDLER_FAILED");process.exitCode=1;});
