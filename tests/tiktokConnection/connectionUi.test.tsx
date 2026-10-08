import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { TikTokConnectionCard } from "../../components/tiktok/TikTokConnectionCard";
import ConnectionsPage from "../../app/settings/connections/page";
import { CONNECTION_STATES, CONNECTION_ENDPOINTS, type ConnectionResponse } from "../../lib/tiktokConnection/contracts";
import { projectVerifiedServerResponse, readConnectionView, type ConnectionView, type VerifiedServerContext } from "../../lib/tiktokConnection/viewCore";
const verified:VerifiedServerContext={authenticated:true,accountOwnership:"MATCH",appEnvironment:"MATCH",connectionCurrent:true};
const render=(response?:ConnectionResponse)=>renderToStaticMarkup(createElement(TikTokConnectionCard,response?{view:projectVerifiedServerResponse(response,verified)}:{}));
for(const status of CONNECTION_STATES) test(`renders ${status} with every action disabled`,()=>{
  const html=render({version:"1",status,account:{displayName:"Synthetic Creator"},error:"CONNECTION_CHECK_FAILED"});const dom=new JSDOM(html);try{
    assert.equal(dom.window.document.querySelectorAll("button").length,3);
    for(const button of dom.window.document.querySelectorAll("button")){assert.equal(button.disabled,true);button.click();}
    assert.ok(dom.window.document.querySelector('[role="status"]')?.textContent);
    assert.equal(html.includes("Synthetic Creator"),status==="CONNECTED");
    assert.equal(!!dom.window.document.querySelector('[role="alert"]'),status==="ERROR");
  }finally{dom.window.close();}
});
test("live page always renders unavailable without backend or query-derived status",()=>{const html=renderToStaticMarkup(createElement(ConnectionsPage));assert.match(html,/接続機能は準備中/);assert.doesNotMatch(html,/接続済み|Synthetic Creator/);assert.equal(readConnectionView().state,"UNAVAILABLE");});
test("connected requires opaque projected evidence, never a lookalike",()=>{const fake={kind:"TIKTOK_CONNECTION_VIEW",status:"CONNECTED",verified:true} as unknown as ConnectionView;assert.equal(readConnectionView(fake).state,"UNAVAILABLE");});
for(const patch of [{authenticated:false},{accountOwnership:"MISMATCH"},{appEnvironment:"MISMATCH"},{connectionCurrent:false}]) test(`server evidence fails closed ${Object.keys(patch)[0]}`,()=>{const view=projectVerifiedServerResponse({version:"1",status:"CONNECTED",account:{displayName:"Synthetic Creator"}},{...verified,...patch} as VerifiedServerContext);assert.equal(readConnectionView(view).state,"UNAVAILABLE");});
for(const name of [null,"","x".repeat(65),"<script>unsafe</script>","https://unsafe.example","line\nfeed"]) test(`invalid account identity ${String(name).slice(0,12)} cannot display connected`,()=>{const view=projectVerifiedServerResponse({version:"1",status:"CONNECTED",account:{displayName:name}},verified);assert.equal(readConnectionView(view).state,"UNAVAILABLE");});
test("unknown fields, raw errors, tokens and credential references never render",()=>{const response={version:"1",status:"ERROR",error:"Bearer SECRET_RAW",access_token:"SECRET_ACCESS",refresh_token:"SECRET_REFRESH",clientSecret:"SECRET_CLIENT",state:"SECRET_STATE",cookie:"SECRET_COOKIE",credentialReference:"SECRET_REFERENCE",account:{displayName:"SECRET_ACCOUNT"}};const html=render(response as unknown as ConnectionResponse);assert.doesNotMatch(html,/SECRET_|Bearer/);assert.match(html,/接続情報を確認できませんでした/);});
test("snapshot does not alias mutable account input",()=>{const input:ConnectionResponse={version:"1",status:"CONNECTED",account:{displayName:"Synthetic Creator"}};const view=projectVerifiedServerResponse(input,verified);Object.assign(input.account!,{displayName:"SECRET_AFTER"});assert.equal(readConnectionView(view).account,"Synthetic Creator");assert.ok(Object.isFrozen(view));assert.ok(Object.isFrozen(readConnectionView(view)));});
test("future endpoint contract is fixed and has no live implementation",()=>{assert.deepEqual(CONNECTION_ENDPOINTS,{connection:{method:"GET",path:"/api/tiktok/connection"},start:{method:"POST",path:"/api/tiktok/oauth/start"},disconnect:{method:"POST",path:"/api/tiktok/disconnect"}});});
test("UI render and disabled clicks invoke no transport or storage",()=>{let calls=0;const original=globalThis.fetch;globalThis.fetch=(()=>{calls++;throw new Error("NETWORK_FORBIDDEN");}) as typeof fetch;try{render({version:"1",status:"CONNECTED",account:{displayName:"Synthetic Creator"}});assert.equal(calls,0);}finally{globalThis.fetch=original;}
  for(const file of ["components/tiktok/TikTokConnectionCard.tsx","app/settings/connections/page.tsx","lib/tiktokConnection/viewCore.ts","lib/tiktokConnection/contracts.ts","lib/server/tiktokConnectionUiProjection.ts"]){const code=readFileSync(file,"utf8");assert.doesNotMatch(code,/fetch\(|axios|localStorage|sessionStorage|document\.cookie|process\.env|https?:\/\/open\.tiktok|onClick=|dangerouslySetInnerHTML/);}
  assert.match(readFileSync("lib/server/tiktokConnectionUiProjection.ts","utf8"),/import "server-only"/);
});

test("wrong response version and hostile getters downgrade without raw output",()=>{assert.equal(readConnectionView(projectVerifiedServerResponse({version:"2",status:"CONNECTED",account:{displayName:"Synthetic Creator"}} as unknown as ConnectionResponse,verified)).state,"UNAVAILABLE");const hostile={};Object.defineProperty(hostile,"version",{get(){throw new Error("SECRET_GETTER");}});assert.equal(readConnectionView(projectVerifiedServerResponse(hostile as ConnectionResponse,verified)).state,"UNAVAILABLE");});
test("inherited error names cannot become rendered provider messages",()=>{const html=render({version:"1",status:"ERROR",error:"toString" as never});assert.match(html,/接続情報を確認できませんでした/);assert.doesNotMatch(html,/function|native code/);});
test("endpoint and state metadata cannot be mutated",()=>{assert.ok(Object.isFrozen(CONNECTION_STATES));assert.ok(Object.isFrozen(CONNECTION_ENDPOINTS.start));assert.throws(()=>Object.assign(CONNECTION_ENDPOINTS.start,{path:"https://external.example"}));});
