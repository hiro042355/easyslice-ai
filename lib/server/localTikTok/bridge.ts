import { randomUUID, createHash } from "node:crypto";
import { digest, identity, localOnly, reject, type Session } from "./security";
import { LocalTikTokService } from "./service";
import type { Connection } from "./store";
// Narrow mapping from committed B7 7f16aa12... ControlledActivationSession stages.
export type B7Stage="creator_info"|"init"|"upload"|"status";
export type Media=Readonly<{kind:"LOCAL_SYNTHETIC_MEDIA"}>;
export type Creator=Readonly<{kind:"LOCAL_CREATOR_INFO"}>;
export type Selection=Readonly<{mode:"DIRECT_POST";source:"FILE_UPLOAD";privacy:"SELF_ONLY";title:string;allowComments:boolean;allowDuet:boolean;allowStitch:boolean;brandContent:false;brandOrganic:false;commercialDisclosureEnabled:false;isAigc:boolean}>;
export type Approval=Readonly<{approved:true;previewConfirmed:true;musicConsent:true;reference:string}>;
type MediaFacts={id:string;sha256:string;bytes:Buffer;durationSec:number;byteLength:number;source:"FILE_UPLOAD"};
type CreatorFacts={uid:string;openId:string;generation:string;revision:string;observedAt:number;privacy:readonly string[];maxDuration:number;commentDisabled:boolean;duetDisabled:boolean;stitchDisabled:boolean};
const mediaFacts=new WeakMap<object,MediaFacts>();const creatorFacts=new WeakMap<object,CreatorFacts>();
export function syntheticMedia(id:string,bytes:Buffer,durationSec=1):Media {if(!id.startsWith("synthetic-media-") || !Buffer.isBuffer(bytes) || !bytes.length || bytes.length>5*1024*1024 || !Number.isFinite(durationSec) || durationSec<=0 || durationSec>180) reject("MEDIA_REJECTED");const copy=Buffer.from(bytes);const handle=Object.freeze({kind:"LOCAL_SYNTHETIC_MEDIA" as const});mediaFacts.set(handle,{id,sha256:createHash("sha256").update(copy).digest("hex"),bytes:copy,durationSec,byteLength:copy.length,source:"FILE_UPLOAD"});return handle;}
export class MockB7Publisher {
  #fault:B7Stage|"STALE_CREATOR"|null=null;
  #counts={creator_info:0,init:0,upload:0,status:0};
  #transferredBytes=0; get transferredBytes(){return this.#transferredBytes;}
  constructor(){Object.seal(this);}
  fault(stage:B7Stage|"STALE_CREATOR"|null){this.#fault=stage;}
  get counts(){return Object.freeze({...this.#counts});}
  async creator(accessToken:string,c:Connection,now:number):Promise<CreatorFacts>{if(!accessToken.startsWith("synthetic_access_")) reject("MOCK_CREDENTIAL_REQUIRED");this.#counts.creator_info++;if(this.#fault==="creator_info") reject("CREATOR_INFO_UNAVAILABLE");return {uid:c.uid,openId:c.openId,generation:c.generation,revision:randomUUID(),observedAt:now-(this.#fault==="STALE_CREATOR"?300_001:0),privacy:Object.freeze(["SELF_ONLY"]),maxDuration:180,commentDisabled:true,duetDisabled:true,stitchDisabled:true};}
  session(accessToken:string,media:MediaFacts){if(media.source!=="FILE_UPLOAD" || media.byteLength!==media.bytes.length || media.sha256!==createHash("sha256").update(media.bytes).digest("hex")) reject("MEDIA_REJECTED");if(!accessToken.startsWith("synthetic_access_")) reject("MOCK_CREDENTIAL_REQUIRED");let authorized:B7Stage|null=null;let state="preflight_ready";const publishId=`synthetic-publish-${randomUUID()}`;
    return Object.freeze({authorizeStage:(stage:B7Stage,decision:Readonly<{approved:true;reference:string}>)=>{if(decision.approved!==true || !decision.reference || (stage==="init"?state!=="preflight_ready":stage==="upload"?state!=="initialized":stage==="status"?state!=="uploaded":true)) reject("B7_STAGE_REJECTED");authorized=stage;},executeStage:async(stage:B7Stage)=>{if(authorized!==stage) reject("B7_STAGE_REJECTED");authorized=null;this.#counts[stage]++;if(this.#fault===stage){state="unknown";reject("MOCK_STAGE_FAILED");}if(stage==="upload")this.#transferredBytes+=media.byteLength;state=stage==="init"?"initialized":stage==="upload"?"uploaded":"observed";return {state,publishId,status:stage==="status"?"MOCK_PUBLISHED":undefined,httpStatus:200};}});
  }
}
Object.freeze(MockB7Publisher.prototype);
export class LocalPublisherBridge {
  constructor(readonly service:LocalTikTokService,readonly publisher:MockB7Publisher,target:string){localOnly(target);if(Object.getPrototypeOf(publisher)!==MockB7Publisher.prototype) reject("MOCK_PUBLISHER_REQUIRED");Object.freeze(this);}
  async creator(session:Session):Promise<Creator>{const {connection,tokens}=await this.service.custody.resolve(session,this.service.store);if(!connection.scopes.includes("video.publish")) reject("POSTING_SCOPE_REQUIRED");const facts=await this.publisher.creator(tokens.accessToken,connection,await this.service.store.now());const handle=Object.freeze({kind:"LOCAL_CREATOR_INFO" as const});creatorFacts.set(handle,Object.freeze(facts));return handle;}
  async #review(session:Session,media:Media,creator:Creator,selection:Selection){const {connection}=await this.service.custody.resolve(session,this.service.store);const m=mediaFacts.get(media);const c=creatorFacts.get(creator);const now=await this.service.store.now();
    if(!m || !c || c.uid!==identity(session).uid || c.openId!==connection.openId || c.generation!==connection.generation || c.observedAt>now || now-c.observedAt>300_000 || !connection.scopes.includes("video.publish") || selection.mode!=="DIRECT_POST" || selection.source!=="FILE_UPLOAD" || selection.privacy!=="SELF_ONLY" || !c.privacy.includes(selection.privacy) || m.durationSec>c.maxDuration || typeof selection.title!=="string" || selection.title.length>150 || selection.brandContent!==false || selection.brandOrganic!==false || selection.commercialDisclosureEnabled!==false || typeof selection.isAigc!=="boolean" || (selection.allowComments && c.commentDisabled) || (selection.allowDuet && c.duetDisabled) || (selection.allowStitch && c.stitchDisabled)) reject("PUBLICATION_REJECTED");
    const binding=digest(JSON.stringify([connection.uid,connection.openId,connection.app,connection.environment,connection.generation,m.id,m.sha256,m.byteLength,m.durationSec,selection.mode,selection.source,selection.privacy,selection.title,selection.allowComments,selection.allowDuet,selection.allowStitch,selection.brandContent,selection.brandOrganic,selection.commercialDisclosureEnabled,selection.isAigc,c.revision,c.observedAt,c.privacy,c.maxDuration,c.commentDisabled,c.duetDisabled,c.stitchDisabled]));return {connection,binding,now,creatorExpires:c.observedAt+300_000};
  }
  async consent(session:Session,media:Media,creator:Creator,selection:Selection,approval:Approval):Promise<string>{if(approval?.approved!==true || approval.previewConfirmed!==true || approval.musicConsent!==true || typeof approval.reference!=="string" || !approval.reference.startsWith("synthetic-decision-")) reject("CONSENT_REQUIRED");const review=await this.#review(session,media,creator,selection);return this.service.store.issueGrant(review.connection,review.binding,Math.min(review.now+300_000,review.creatorExpires,identity(session).expiresAt,review.connection.expiresAt));}
  async publish(session:Session,media:Media,creator:Creator,selection:Selection,grant:string):Promise<Readonly<{execution:"MOCK_ONLY";status:"MOCK_PUBLISHED"}>> {if(typeof grant!=="string" || !/^[a-f0-9-]{36}$/.test(grant)) reject("AUTHORIZATION_REQUIRED");const review=await this.#review(session,media,creator,selection);await this.service.store.claimGrant(session,review.connection,grant,review.binding);
    try {const {tokens}=await this.service.custody.resolve(session,this.service.store);const adapter=this.publisher.session(tokens.accessToken,mediaFacts.get(media)!);let correlation="";
      for(const stage of ["init","upload","status"] as const){await this.service.custody.resolve(session,this.service.store);adapter.authorizeStage(stage,{approved:true,reference:grant});const result=await adapter.executeStage(stage);if(!result.publishId.startsWith("synthetic-publish-") || (correlation && correlation!==result.publishId)) reject("CORRELATION_REJECTED");correlation=result.publishId;}
      await this.service.store.finishGrant(grant,true);return Object.freeze({execution:"MOCK_ONLY",status:"MOCK_PUBLISHED"});
    }catch{await this.service.store.finishGrant(grant,false);reject("PUBLICATION_FAILED");}
  }
}
