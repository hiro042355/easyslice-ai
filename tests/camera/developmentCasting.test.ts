import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDevelopmentCastingStore,type CastingAuthority} from '../../lib/server/characterEngine/developmentCasting';
function fixture(){let locked=true;const authority:CastingAuthority={authorizeProject:async(o,p)=>o==='owner-1'&&p==='project-1',sceneBelongsToProject:async(p,s)=>p==='project-1'&&s==='scene-1',lockedIdentity:async(c,r)=>locked&&c==='hero'&&r==='hero-rev-1'?{ok:true,identity:{characterId:c,revisionId:r,ownerUserId:'owner-1',locked:true}}:{ok:false,code:'MALFORMED_RESPONSE'}};return {store:createDevelopmentCastingStore(authority),unlock:()=>{locked=false;}};}
test('development Casting uses locked opaque revision; duplicate/project/owner/scene guards',async()=>{
 const {store}=fixture();const c=await store.cast('owner-1','project-1','hero','hero-rev-1');assert.equal(c.status,'DRAFT');
 await assert.rejects(store.cast('owner-1','project-1','hero','hero-rev-1'),/DUPLICATE/);
 await assert.rejects(store.list('other','project-1'),/FORBIDDEN/);await assert.rejects(store.confirm('owner-1','project-2',c.castingId),/FORBIDDEN/);
 await assert.rejects(store.assign('owner-1','project-1','scene-1',c.castingId,{}),/CONFIRMED/);
 await store.confirm('owner-1','project-1',c.castingId);await assert.rejects(store.assign('owner-1','project-1','other',c.castingId,{}),/SCENE_FORBIDDEN/);
 await assert.rejects(Reflect.apply(store.assign,undefined,['owner-1','project-1','scene-1',c.castingId,[]]),/INVALID_APPEARANCE/);
 const constraints=['no identity change'];await store.assign('owner-1','project-1','scene-1',c.castingId,{artStyleConstraints:constraints});constraints[0]='mutated';
 assert.deepEqual((await store.listScenes('owner-1','project-1'))[0].appearance.artStyleConstraints,['no identity change']);
 await assert.rejects(store.assign('owner-1','project-1','scene-1',c.castingId,{}),/DUPLICATE/);await store.remove('owner-1','project-1',c.castingId);assert.equal((await store.listScenes('owner-1','project-1')).length,0);
});
test('lock/revision validated server-side at creation and confirmation',async()=>{
 const {store,unlock}=fixture();await assert.rejects(store.cast('owner-1','project-1','hero','wrong'),/LOCK_AUTHORITY/);
 const c=await store.cast('owner-1','project-1','hero','hero-rev-1');unlock();await assert.rejects(store.confirm('owner-1','project-1',c.castingId),/LOCK_AUTHORITY/);
});
test('parallel duplicate creation is serialized after authority observation',async()=>{
 const {store}=fixture();const result=await Promise.allSettled([store.cast('owner-1','project-1','hero','hero-rev-1'),store.cast('owner-1','project-1','hero','hero-rev-1')]);
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.filter(r=>r.status==='rejected').length,1);
});
test('foreign character owner and removal racing a lock read cannot authorize confirmation',async()=>{
 const foreign=createDevelopmentCastingStore({authorizeProject:async()=>true,sceneBelongsToProject:async()=>true,lockedIdentity:async(c,r)=>({ok:true,identity:{characterId:c,revisionId:r,ownerUserId:'other',locked:true}})});
 await assert.rejects(foreign.cast('owner-1','project-1','hero','hero-rev-1'),/LOCK_AUTHORITY/);
 let block=false,resume:undefined|(()=>void),arrived:undefined|(()=>void);const observed=new Promise<void>(r=>{arrived=r;});
 const store=createDevelopmentCastingStore({authorizeProject:async()=>true,sceneBelongsToProject:async()=>true,lockedIdentity:async(c,r)=>{if(block){arrived?.();await new Promise<void>(r=>{resume=r;});}return {ok:true,identity:{characterId:c,revisionId:r,ownerUserId:'owner-1',locked:true}};}});
 const row=await store.cast('owner-1','project-1','hero','hero-rev-1');block=true;const confirmation=store.confirm('owner-1','project-1',row.castingId);await observed;await store.remove('owner-1','project-1',row.castingId);resume?.();await assert.rejects(confirmation,/CASTING_CHANGED/);
});
