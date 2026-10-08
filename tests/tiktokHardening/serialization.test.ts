import assert from "node:assert/strict";
import {test} from "node:test";
import {inspect} from "node:util";
import {randomBytes} from "node:crypto";
import {IntegrationTokenVault} from "../../lib/server/tiktokIntegration/vault";
import {ManagedTokenVault} from "../../lib/server/tiktokKeys/managedVault";
import {syntheticKmsClient,fixtureKmsVersion} from "./kmsFixture";
import type {Connection} from "../../lib/server/tiktokIntegration/store";
const tokens={accessToken:"synthetic_access_serialization",refreshToken:"synthetic_refresh_serialization"};
const c:Omit<Connection,"envelope">={uid:"synthetic:serialization",app:"synthetic-app",environment:"staging",openId:"synthetic-open",generation:"synthetic-generation",displayName:"Synthetic",scopes:["user.info.basic","video.publish"],expiresAt:Date.now()+3600000,revoked:false};
const key=randomBytes(32);
const factories={integration:()=>new IntegrationTokenVault({current:()=>({id:"synthetic-key",key}),resolve:()=>key}),managed:()=>{return new ManagedTokenVault({execution:"LOCAL_TEST",activeVersion:fixtureKmsVersion,readableVersions:[fixtureKmsVersion]},syntheticKmsClient());}};
for(const [name,factory] of Object.entries(factories)){
 test(name+" decrypted credentials remain readable and immutable",async()=>{const v=factory(),e=await v.encrypt(tokens,c),out=await v.decrypt({...c,envelope:e});assert.deepEqual(out,tokens);assert.equal(Object.isFrozen(out),true);});
 test(name+" JSON response and nested audit serialization redact decrypted tokens",async()=>{const v=factory(),e=await v.encrypt(tokens,c),out=await v.decrypt({...c,envelope:e});assert.equal(JSON.stringify(out),'{"credentials":"[REDACTED]"}');assert.doesNotMatch(JSON.stringify({tokens:out}),/synthetic_access|synthetic_refresh/);});
 test(name+" ordinary diagnostic inspection redacts decrypted tokens",async()=>{const v=factory(),e=await v.encrypt(tokens,c),out=await v.decrypt({...c,envelope:e});assert.doesNotMatch(inspect({tokens:out}),/synthetic_access|synthetic_refresh/);assert.match(inspect(out),/REDACTED/);});
 test(name+" protected tokens can be reencrypted without serializing their redaction DTO",async()=>{const v=factory(),e=await v.encrypt(tokens,c),out=await v.decrypt({...c,envelope:e}),again=await v.encrypt(out,c);assert.deepEqual(await v.decrypt({...c,envelope:again}),tokens);});
}
