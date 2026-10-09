import {inspect} from "node:util";
import {randomUUID} from "node:crypto";
import {identity} from "../localTikTok/security";
import {MockHttpTransport} from "../tiktokHttp/adapter";
import {FirebasePublisherBridge,type IntegrationMedia,type Selection} from "../tiktokIntegration/publisher";
import type {WorkerConfiguration} from "./configuration";
export type WorkerJob=Readonly<{kind:"CREATOR_INFO";media:IntegrationMedia}>|Readonly<{kind:"PUBLISH";media:IntegrationMedia;creator:object;selection:Selection;grant:string}>|Readonly<{kind:"OBSERVE";grant:string}>;
export type JobReceipt=Readonly<{id:string;kind:WorkerJob["kind"];status:"QUEUED"|"RUNNING"|"SUCCEEDED"|"FAILED"|"CANCELLED";attempts:number;execution:"SYNTHETIC"}>;
interface StoredJob {receipt:JobReceipt;spec:WorkerJob;owner:string;session:string;generation:string;openId:string;result?:unknown}
/** Bounded manual local queue. B7 remains the sole publishing engine; no timers/background polling/retries. */
export class MockTikTokWorker {
 readonly #jobs=new Map<string,StoredJob>();readonly #keys=new Map<string,string>();#closed=false;#running:Promise<void>|undefined;
 constructor(readonly bridge:FirebasePublisherBridge,readonly configuration:WorkerConfiguration,private readonly audit:(e:Readonly<{kind:string;status:string;attempts:number;execution:"SYNTHETIC"}>)=>void=()=>{}){
  if(!configuration.enabled||configuration.mode!=="LOCAL_TEST"||bridge.service.execution!=="LOCAL_TEST"||!(bridge.transport instanceof MockHttpTransport)||bridge.service.store.environment!=="staging"||configuration.maxJobs!==128||typeof configuration.postingEnabled!=="boolean")throw new Error("WORKER_DISABLED");
  this.configuration=Object.freeze({...configuration});
 }
 [inspect.custom](){return this.toJSON();}
 toJSON(){return {execution:"SYNTHETIC",closed:this.#closed,jobs:this.#jobs.size,credentials:"[REDACTED]"};}
 async submit(request:Request,spec:WorkerJob,key:string){if(this.#closed||!/^[A-Za-z0-9_-]{1,80}$/.test(key)||!["CREATOR_INFO","PUBLISH","OBSERVE"].includes(spec.kind))throw new Error("JOB_REJECTED");
  const allowed=spec.kind==="CREATOR_INFO"?["kind","media"]:spec.kind==="PUBLISH"?["kind","media","creator","selection","grant"]:["kind","grant"];if(Object.keys(spec).length!==allowed.length||Object.keys(spec).some(k=>!allowed.includes(k)))throw new Error("JOB_REJECTED");
  if(spec.kind==="PUBLISH"&&!this.configuration.postingEnabled)throw new Error("POSTING_DISABLED");
  const handle=await this.bridge.service.session(request),session=identity(handle),owned=await this.bridge.service.vault.resolve(handle,this.bridge.service.store);if(owned.connection.uid!==session.uid)throw new Error("JOB_REJECTED");const binding=session.uid+":"+session.sessionId+":"+spec.kind+":"+key,existing=this.#keys.get(binding);
  if(existing){const job=this.#jobs.get(existing)!;const same=job.spec.kind===spec.kind&&(spec.kind==="CREATOR_INFO"?job.spec.kind==="CREATOR_INFO"&&job.spec.media===spec.media:spec.kind==="PUBLISH"?job.spec.kind==="PUBLISH"&&job.spec.grant===spec.grant&&job.spec.media===spec.media&&job.spec.creator===spec.creator&&JSON.stringify(job.spec.selection)===JSON.stringify(spec.selection):job.spec.kind==="OBSERVE"&&job.spec.grant===spec.grant);if(!same)throw new Error("JOB_BINDING_REJECTED");return job.receipt;}
  if(this.#closed||this.#jobs.size>=this.configuration.maxJobs)throw new Error("JOB_REJECTED");
  const id=randomUUID(),receipt=Object.freeze({id,kind:spec.kind,status:"QUEUED" as const,attempts:0,execution:"SYNTHETIC" as const});this.#jobs.set(id,{receipt,spec:Object.freeze({...spec,...(spec.kind==="PUBLISH"?{selection:Object.freeze({...spec.selection})}:{})}),owner:session.uid,session:session.sessionId,generation:owned.connection.generation,openId:owned.connection.openId});this.#keys.set(binding,id);return receipt;
 }
 async #owned(request:Request,id:string){const job=this.#jobs.get(id),handle=await this.bridge.service.session(request),session=identity(handle);if(!job||job.owner!==session.uid||job.session!==session.sessionId)throw new Error("JOB_REJECTED");const owned=await this.bridge.service.vault.resolve(handle,this.bridge.service.store);if(owned.connection.uid!==job.owner||owned.connection.generation!==job.generation||owned.connection.openId!==job.openId)throw new Error("JOB_REJECTED");return job;}
 async read(request:Request,id:string){return (await this.#owned(request,id)).receipt;}
 async result(request:Request,id:string){const job=await this.#owned(request,id);if(job.receipt.status!=="SUCCEEDED")throw new Error("JOB_NOT_SUCCEEDED");return job.result;}
 async runOne(request:Request,id:string){if(this.#closed)throw new Error("WORKER_CLOSED");const job=await this.#owned(request,id);if(this.#closed)throw new Error("WORKER_CLOSED");if(job.receipt.status!=="QUEUED")return job.receipt;if(this.#running)throw new Error("WORKER_BUSY");
  job.receipt=Object.freeze({...job.receipt,status:"RUNNING",attempts:1});
  const task=(async()=>{try{const current=identity(await this.bridge.service.session(request));if(current.uid!==job.owner||current.sessionId!==job.session)throw new Error("JOB_REJECTED");const s=job.spec;job.result=s.kind==="CREATOR_INFO"?await this.bridge.creator(request,s.media):s.kind==="PUBLISH"?await this.bridge.publish(request,s.media,s.creator,s.selection,s.grant):await this.bridge.reconcile(request,s.grant,{maxObservations:1,deadlineMs:Date.now()+5000});job.receipt=Object.freeze({...job.receipt,status:"SUCCEEDED"});}catch{job.result=undefined;job.receipt=Object.freeze({...job.receipt,status:"FAILED"});}finally{try{this.audit(Object.freeze({kind:job.receipt.kind,status:job.receipt.status,attempts:1,execution:"SYNTHETIC"}));}catch{/* no raw error logging */}}})();this.#running=task;try{await task;return job.receipt;}finally{this.#running=undefined;}
 }
 async shutdown(){this.#closed=true;if(this.#running)await this.#running;for(const job of this.#jobs.values()){if(job.receipt.status==="QUEUED")job.receipt=Object.freeze({...job.receipt,status:"CANCELLED"});job.result=undefined;}this.#jobs.clear();this.#keys.clear();}
}
