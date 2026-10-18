import {randomUUID} from 'node:crypto';
import type {CharacterResult} from './clientCore';

/** Contract 5 domain shape, NOT the incompatible legacy HTTP assignment shape.
 * Explicit development-only process memory. No production composition or route.
 */
type Status='DRAFT'|'READY'|'CONFIRMED'|'REMOVED';
export type CastingRecord=Readonly<{castingId:string;characterId:string;productionProjectId:string;productionType:'AI_MV';identityRevisionId:string;status:Status;createdAt:string;updatedAt:string}>;
export type SceneAssignment=Readonly<{sceneAssignmentId:string;productionProjectId:string;sceneId:string;castingId:string;characterId:string;identityRevisionId:string;appearance:Readonly<{expression?:string;pose?:string;outfit?:string;cameraFraming?:string;sceneAction?:string;emotionalState?:string;artStyleConstraints?:readonly string[]}>;status:Status;createdAt:string;updatedAt:string}>;
export type CastingAuthority={
 authorizeProject(ownerUid:string,projectId:string):Promise<boolean>;
 sceneBelongsToProject(projectId:string,sceneId:string):Promise<boolean>;
 lockedIdentity(characterId:string,revisionId:string):Promise<CharacterResult>;
};
export function createDevelopmentCastingStore(authority:CastingAuthority){
 if(process.env.NODE_ENV==='production')throw Error('DEVELOPMENT_ONLY');
 const castings=new Map<string,CastingRecord>(),scenes=new Map<string,SceneAssignment>();
 const id=(x:string)=>{if(typeof x!=='string'||!x.trim()||x.length>160)throw Error('INVALID_IDENTIFIER');};
 async function project(owner:string,p:string){id(owner);id(p);if(!await authority.authorizeProject(owner,p))throw Error('PROJECT_FORBIDDEN');}
 async function locked(owner:string,c:string,r:string){const result=await authority.lockedIdentity(c,r);if(!result.ok||!result.identity.locked||result.identity.characterId!==c||result.identity.revisionId!==r||result.identity.ownerUserId!==owner)throw Error('LOCK_AUTHORITY_REQUIRED');}
 return Object.freeze({mode:'DEVELOPMENT_ONLY' as const,
  async cast(owner:string,p:string,c:string,r:string):Promise<CastingRecord>{
   await project(owner,p);await locked(owner,c,r);
   if([...castings.values()].some(x=>x.productionProjectId===p&&x.characterId===c&&x.status!=='REMOVED'))throw Error('DUPLICATE_CASTING');
   const at=new Date().toISOString();const row:CastingRecord=Object.freeze({castingId:randomUUID(),characterId:c,identityRevisionId:r,productionProjectId:p,productionType:'AI_MV',status:'DRAFT',createdAt:at,updatedAt:at});castings.set(row.castingId,row);return row;
  },
  async list(owner:string,p:string){await project(owner,p);return Object.freeze([...castings.values()].filter(x=>x.productionProjectId===p&&x.status!=='REMOVED'));},
  async confirm(owner:string,p:string,castingId:string):Promise<CastingRecord>{
   await project(owner,p);const c=castings.get(castingId);if(!c||c.productionProjectId!==p||c.status==='REMOVED')throw Error('CASTING_NOT_FOUND');
   await locked(owner,c.characterId,c.identityRevisionId);
   if(castings.get(castingId)!==c)throw Error('CASTING_CHANGED');
   const next=Object.freeze({...c,status:'CONFIRMED' as const,updatedAt:new Date().toISOString()});castings.set(castingId,next);return next;
  },
  async assign(owner:string,p:string,sceneId:string,castingId:string,appearance:SceneAssignment['appearance']):Promise<SceneAssignment>{
   await project(owner,p);id(sceneId);if(!await authority.sceneBelongsToProject(p,sceneId))throw Error('SCENE_FORBIDDEN');
   const c=castings.get(castingId);if(!c||c.productionProjectId!==p||c.status!=='CONFIRMED')throw Error('CONFIRMED_CASTING_REQUIRED');
   await locked(owner,c.characterId,c.identityRevisionId);if(castings.get(castingId)!==c)throw Error('CASTING_CHANGED');
   if([...scenes.values()].some(x=>x.productionProjectId===p&&x.sceneId===sceneId&&x.castingId===castingId&&x.status!=='REMOVED'))throw Error('DUPLICATE_SCENE_ASSIGNMENT');
   const allowed=['expression','pose','outfit','cameraFraming','sceneAction','emotionalState','artStyleConstraints'];
   if(!appearance||Object.keys(appearance).some(k=>!allowed.includes(k)))throw Error('INVALID_APPEARANCE');
   for(const [key,value] of Object.entries(appearance)){if(key==='artStyleConstraints'){if(!Array.isArray(value)||value.length>32||value.some(x=>typeof x!=='string'||x.length>500))throw Error('INVALID_APPEARANCE');}else if(typeof value!=='string'||value.length>500)throw Error('INVALID_APPEARANCE');}
   const snapshot=Object.freeze({...appearance,...(appearance.artStyleConstraints?{artStyleConstraints:Object.freeze([...appearance.artStyleConstraints])}:{})});
   const at=new Date().toISOString();const row:SceneAssignment=Object.freeze({sceneAssignmentId:randomUUID(),productionProjectId:p,sceneId,castingId,characterId:c.characterId,identityRevisionId:c.identityRevisionId,appearance:snapshot,status:'DRAFT',createdAt:at,updatedAt:at});scenes.set(row.sceneAssignmentId,row);return row;
  },
  async remove(owner:string,p:string,castingId:string){
   await project(owner,p);const c=castings.get(castingId);if(!c||c.productionProjectId!==p)throw Error('CASTING_NOT_FOUND');
   const at=new Date().toISOString();castings.set(castingId,Object.freeze({...c,status:'REMOVED',updatedAt:at}));
   for(const [key,row] of scenes)if(row.castingId===castingId)scenes.set(key,Object.freeze({...row,status:'REMOVED',updatedAt:at}));
  },
  async listScenes(owner:string,p:string){await project(owner,p);return Object.freeze([...scenes.values()].filter(x=>x.productionProjectId===p&&x.status!=='REMOVED'));},
 });
}
