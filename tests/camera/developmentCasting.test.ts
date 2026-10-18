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
 const constraints=['no identity change'];await store.assign('owner-1','project-1','scene-1',c.castingId,{artStyleConstraints:constraints});constraints[0]='mutated';
 assert.deepEqual((await store.listScenes('owner-1','project-1'))[0].appearance.artStyleConstraints,['no identity change']);
 await assert.rejects(store.assign('owner-1','project-1','scene-1',c.castingId,{}),/DUPLICATE/);await store.remove('owner-1','project-1',c.castingId);assert.equal((await store.listScenes('owner-1','project-1')).length,0);
});
test('lock/revision validated server-side at creation and confirmation',async()=>{
 const {store,unlock}=fixture();await assert.rejects(store.cast('owner-1','project-1','hero','wrong'),/LOCK_AUTHORITY/);
 const c=await store.cast('owner-1','project-1','hero','hero-rev-1');unlock();await assert.rejects(store.confirm('owner-1','project-1',c.castingId),/LOCK_AUTHORITY/);
});
