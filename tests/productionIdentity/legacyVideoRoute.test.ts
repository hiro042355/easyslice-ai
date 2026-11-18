import test from 'node:test';import assert from 'node:assert/strict';import {createLegacyVideoRoute} from '../../lib/server/legacyVideoRouteCore';
const job='11111111-1111-4111-8111-111111111111',media='22222222-2222-4222-8222-222222222222',exported='33333333-3333-4333-8333-333333333333';
test('legacy shared files are unavailable and anonymous requests cannot redirect',async()=>{
 let calls=0;const route=createLegacyVideoRoute(async()=>{calls++;return {ok:true};});
 for(const query of ['', '?type=burned','?jobId=../secret&mediaId='+media,'?exportId='+exported+'&mediaId='+media,'?exportId='+exported+'&exportId='+exported,'?exportId='+exported+'&url=https://foreign.example']){const response=await route(new Request('https://app.example/api/video'+query));assert.equal(response.status,404);assert.equal(response.headers.get('location'),null);}
 assert.equal(calls,6);const denied=await createLegacyVideoRoute(async()=>({ok:false,response:new Response(null,{status:401})}))(new Request('https://app.example/api/video?exportId='+exported));assert.equal(denied.status,401);assert.equal(denied.headers.get('location'),null);
});
test('identified video requests use relative existing owner-scoped routes, never raw filenames',async()=>{
 const route=createLegacyVideoRoute(async()=>({ok:true}));
 for(const [query,target] of [['?jobId='+job+'&mediaId='+media,'/api/media/'+job+'/'+media],['?type=burned&exportId='+exported,'/api/exports/'+exported]]){const response=await route(new Request('https://untrusted-host.example/api/video'+query));assert.equal(response.status,307);assert.equal(response.headers.get('location'),target);assert.equal(response.headers.get('cache-control'),'private, no-store');}
});
