import type { Sensitive } from "@/lib/assets/types";
import type {
  AssetStoreWriterV2, CleanupSchedulerV2, ContentInspector, ContentScanner,
  DuplicateAssetLookup, ImportedAssetReference, ImportedAssetRegistryV2,
  IngestionJournalV2, MediaSanitizer, OutputIngestionAudit, OutputIngestionIssue,
  OutputIngestionJournalIdentityV2, OutputIngestionJournalRecordV2,
  OutputIngestionMutationClassV2, OutputIngestionMutationIdentityV2,
  OutputIngestionPlan, OutputIngestionReasonCode, OutputIngestionRecoveryRequiredV2,
  OutputIngestionRegistryReceiptV2, OutputIngestionResult, OutputIngestionStorageReceiptV2,
  ProvenanceStoreV2, ProviderOutputAccess, ProviderOutputFetcher,
  ProviderOutputReferenceBundle,
} from "./types";
import { deepCopy, deepFreeze, normalizeMime } from "./outputIngestionUtils";

export type ReferenceOutputIngestionDependencies = Readonly<{
  fetcher: ProviderOutputFetcher;
  inspector: ContentInspector;
  scanner: ContentScanner;
  sanitizer: MediaSanitizer;
  duplicateLookup: DuplicateAssetLookup;
  store: AssetStoreWriterV2;
  registry: ImportedAssetRegistryV2;
  journal: IngestionJournalV2;
  provenance: ProvenanceStoreV2;
  cleanup: CleanupSchedulerV2;
}>;
export type ReferenceOutputIngestionExecutionResult = OutputIngestionResult|OutputIngestionRecoveryRequiredV2;

const reasonOrder:readonly OutputIngestionReasonCode[]=["output-reference-invalid","output-fetch-failed","output-fetch-timeout","output-too-large","output-empty","mime-type-mismatch","checksum-mismatch","metadata-missing","duration-mismatch","dimensions-mismatch","content-scan-pending","content-quarantined","content-blocked","storage-write-failed","registry-create-failed","provenance-write-failed","duplicate-content-reused","ingestion-cancelled","cleanup-required","idempotency-conflict"];
const sortedReasons=(values:readonly OutputIngestionReasonCode[])=>[...new Set(values)].sort((a,b)=>reasonOrder.indexOf(a)-reasonOrder.indexOf(b));
const mimeClass=(mime:string):"audio"|"video"|"image"|"unknown"=>mime.startsWith("audio/")?"audio":mime.startsWith("video/")?"video":mime.startsWith("image/")?"image":"unknown";
const fingerprint=(plan:OutputIngestionPlan)=>JSON.stringify({version:plan.planVersion,provider:plan.providerId,api:plan.providerApiVersion,operation:plan.operation,items:plan.items,policy:plan.policy,context:plan.context,idempotency:plan.idempotency});

type ItemJournal={record:OutputIngestionJournalRecordV2;identity:OutputIngestionJournalIdentityV2};
type ReceiptResult<T>={status:"resolved";receipt:T}|{status:"failed";issue:OutputIngestionIssue}|{status:"recovery-required";result:OutputIngestionRecoveryRequiredV2};

export class ReferenceOutputIngestionExecutor{
 readonly #dependencies:ReferenceOutputIngestionDependencies;
 constructor(dependencies:ReferenceOutputIngestionDependencies){this.#dependencies=Object.freeze({...dependencies});}

 async execute(plan:OutputIngestionPlan,bundle:ProviderOutputReferenceBundle):Promise<ReferenceOutputIngestionExecutionResult>{
  const bundleValid=bundle.providerId===plan.providerId&&bundle.providerApiVersion===plan.providerApiVersion&&bundle.operation===plan.operation&&bundle.items.length===plan.items.length&&new Set(bundle.items.map(item=>item.slotIndex)).size===bundle.items.length;
  if(!bundleValid)return this.failed(plan,[this.issue("output-reference-invalid")],0,0,0,0);
  const planFingerprint=fingerprint(plan),journals:ItemJournal[]=[],issues:OutputIngestionIssue[]=[],assets:ImportedAssetReference[]=[];
  let fetched=0,validated=0,reused=0;

  for(const item of plan.items){
   const journalIdentity=this.journalIdentity(plan,item.slotIndex,planFingerprint),storeIdentity=this.mutationIdentity("asset-store-write",plan,item.slotIndex,planFingerprint);
   const initial=this.journalRecord(journalIdentity,storeIdentity,item.slotIndex,item.role,"planned",1,false);
   const created=await this.#dependencies.journal.createIfAbsent(initial);
   if(created.status==="semantic-conflict")return this.failed(plan,[this.issue("idempotency-conflict",item.slotIndex)],bundle.items.length,fetched,validated,reused);
   if(created.status==="corrupted")return this.failed(plan,[this.issue("storage-write-failed",item.slotIndex)],bundle.items.length,fetched,validated,reused);
   if(created.status==="unavailable")return this.failed(plan,[this.issue("storage-write-failed",item.slotIndex,created.retryable)],bundle.items.length,fetched,validated,reused);
   let current=created.record;
   if(created.status==="replayed"&&current.terminal&&current.result)return deepFreeze(deepCopy(current.result));
   if(created.status==="replayed"&&!current.terminal){const projected=this.projectReplayRecovery(current);if(projected)return projected;return this.failed(plan,[this.issue("idempotency-conflict",item.slotIndex)],bundle.items.length,fetched,validated,reused);}
   journals.push({record:current,identity:journalIdentity});

   const reference=bundle.items.find(value=>value.slotIndex===item.slotIndex&&value.role===item.role);
   if(!reference){issues.push(this.issue("output-reference-invalid",item.slotIndex));continue;}
   if(plan.context.cancellation?.stage==="before-fetch"||plan.context.cancellation?.stage==="during-fetch"){issues.push(this.issue("ingestion-cancelled",item.slotIndex));continue;}
   const access={mode:"provider-reference",reference:reference.providerOutputReference} as unknown as ProviderOutputAccess;
   const fetchedResult=await this.#dependencies.fetcher.fetch({access,maximumBytes:item.maximumSizeBytes,requireHttps:plan.policy.requireHttps,redirectPolicy:plan.policy.redirectPolicy});
   if(fetchedResult.status==="failed"){issues.push(this.issue(fetchedResult.error.category==="fetch-timeout"?"output-fetch-timeout":fetchedResult.error.category==="payload-too-large"?"output-too-large":"output-fetch-failed",item.slotIndex,fetchedResult.error.retryable));continue;}fetched++;
   const inspected=await this.#dependencies.inspector.inspect(fetchedResult.content);if(inspected.status==="failed"){issues.push(this.issue("checksum-mismatch",item.slotIndex,inspected.error.retryable));continue;}
   const mime=normalizeMime(inspected.detectedMimeType),providerMime=normalizeMime(fetchedResult.metadata.mimeType),fetchMime=normalizeMime(fetchedResult.metadata.fetchContentType);
   if(!mime||!item.allowedMimeTypes.includes(mime)||(providerMime&&providerMime!==mime)||(fetchMime&&fetchMime!==mime)){issues.push(this.issue("mime-type-mismatch",item.slotIndex));continue;}
   if(inspected.actualSizeBytes<=0){issues.push(this.issue("output-empty",item.slotIndex));continue;}
   if(inspected.actualSizeBytes!==fetchedResult.metadata.sizeBytes||inspected.actualSizeBytes!==fetchedResult.metadata.contentLength||inspected.actualSizeBytes>item.maximumSizeBytes){issues.push(this.issue("output-too-large",item.slotIndex));continue;}
   if(!/^[0-9a-f]{64}$/.test(inspected.computedChecksum)||(fetchedResult.metadata.providerChecksum&&fetchedResult.metadata.providerChecksum!==inspected.computedChecksum)){issues.push(this.issue("checksum-mismatch",item.slotIndex));continue;}
   if(item.requireDurationMetadata&&(!inspected.metadata.durationSeconds||(item.expectedDuration&&Math.abs(inspected.metadata.durationSeconds-item.expectedDuration.targetSeconds)>item.expectedDuration.toleranceSeconds))){issues.push(this.issue(inspected.metadata.durationSeconds?"duration-mismatch":"metadata-missing",item.slotIndex));continue;}
   if(item.requireDimensions&&(!inspected.metadata.width||!inspected.metadata.height)){issues.push(this.issue("metadata-missing",item.slotIndex));continue;}validated++;
   const advancedValidation=await this.advance(current,journalIdentity,"content-validated");if(advancedValidation.status!=="updated")return this.journalFailure(plan,advancedValidation.status,item.slotIndex,bundle.items.length,fetched,validated,reused);current=advancedValidation.record;journals[journals.length-1].record=current;

   const scan=plan.policy.scanRequired?await this.#dependencies.scanner.scan(fetchedResult.content):{status:"passed" as const};
   if(scan.status!=="passed"&&scan.status!=="pending"){issues.push(this.issue(scan.status==="quarantined"?"content-quarantined":"content-blocked",item.slotIndex));continue;}if(scan.status==="pending")issues.push(this.issue("content-scan-pending",item.slotIndex));
   const sanitized=plan.policy.metadataStrippingRequired?await this.#dependencies.sanitizer.sanitize(fetchedResult.content):{status:"unchanged" as const,content:fetchedResult.content};if(sanitized.status==="failed"){issues.push(this.issue("cleanup-required",item.slotIndex));continue;}
   let record=await this.#dependencies.duplicateLookup.find({checksum:inspected.computedChecksum,sizeBytes:inspected.actualSizeBytes,mimeType:mime,policy:plan.policy});let registryReceipt:OutputIngestionRegistryReceiptV2|undefined;
   if(record){reused++;issues.push(this.issue("duplicate-content-reused",item.slotIndex));const duplicateStage=await this.advance(current,journalIdentity,"duplicate-reused");if(duplicateStage.status!=="updated")return this.journalFailure(plan,duplicateStage.status,item.slotIndex,bundle.items.length,fetched,validated,reused);current=duplicateStage.record;journals[journals.length-1].record=current;}
   else{
    if(plan.context.cancellation?.stage==="before-store"){issues.push(this.issue("ingestion-cancelled",item.slotIndex));continue;}
    const storeIntent=await this.advance(current,journalIdentity,"store-intent-recorded");if(storeIntent.status!=="updated")return this.journalFailure(plan,storeIntent.status,item.slotIndex,bundle.items.length,fetched,validated,reused);current=storeIntent.record;journals[journals.length-1].record=current;
    const stored=await this.#dependencies.store.write({capabilityVersion:"2.0",mutationIdentity:storeIdentity,content:sanitized.content,checksum:inspected.computedChecksum,sizeBytes:inspected.actualSizeBytes,mimeType:mime,policy:plan.policy});
    const storageResolution=await this.resolveStorage(stored,storeIdentity,item.slotIndex);if(storageResolution.status==="recovery-required"){await this.markUnknown(current,journalIdentity,"store-outcome-unknown",storeIdentity);return storageResolution.result;}if(storageResolution.status==="failed"){issues.push(storageResolution.issue);continue;}const storageReceipt=storageResolution.receipt;
    const storedStage=await this.advance(current,journalIdentity,"stored",{storageReceipt});if(storedStage.status!=="updated")return this.journalFailure(plan,storedStage.status,item.slotIndex,bundle.items.length,fetched,validated,reused);current=storedStage.record;journals[journals.length-1].record=current;
    if(plan.context.cancellation?.stage==="before-registry"){const cleanup=await this.requestCleanup(plan,item.slotIndex,storageReceipt);if(cleanup)return cleanup;issues.push(this.issue("ingestion-cancelled",item.slotIndex));continue;}
    const registryIdentity=this.mutationIdentity("asset-registry-create",plan,item.slotIndex,planFingerprint),registryIntent=await this.advance(current,journalIdentity,"registry-intent-recorded",{mutationIdentity:registryIdentity,storageReceipt});if(registryIntent.status!=="updated")return this.journalFailure(plan,registryIntent.status,item.slotIndex,bundle.items.length,fetched,validated,reused);current=registryIntent.record;journals[journals.length-1].record=current;
    const registered=await this.#dependencies.registry.create({capabilityVersion:"2.0",mutationIdentity:registryIdentity,slotIndex:item.slotIndex,kind:item.expectedKind,mimeType:mime,sizeBytes:inspected.actualSizeBytes,checksum:inspected.computedChecksum,metadata:inspected.metadata,availability:scan.status==="pending"?"pending-scan":"available",storageReceipt,policy:plan.policy});
    const registryResolution=await this.resolveRegistry(registered,registryIdentity,item.slotIndex);if(registryResolution.status==="recovery-required"){await this.markUnknown(current,journalIdentity,"registry-outcome-unknown",registryIdentity);return registryResolution.result;}if(registryResolution.status==="failed"){issues.push(registryResolution.issue);const cleanup=await this.requestCleanup(plan,item.slotIndex,storageReceipt);if(cleanup)return cleanup;continue;}registryReceipt=registryResolution.receipt;record=registryReceipt.record;
    const registeredStage=await this.advance(current,journalIdentity,"registered",{registryReceipt});if(registeredStage.status!=="updated")return this.journalFailure(plan,registeredStage.status,item.slotIndex,bundle.items.length,fetched,validated,reused);current=registeredStage.record;journals[journals.length-1].record=current;
   }
   if(!record){issues.push(this.issue("registry-create-failed",item.slotIndex));continue;}
   assets.push({assetId:record.assetId,kind:record.kind,role:item.role,mimeType:record.mimeType,sizeBytes:record.sizeBytes,checksum:record.checksum??inspected.computedChecksum,availability:record.status});
   if(registryReceipt){const provenanceIdentity=this.mutationIdentity("provenance-write",plan,item.slotIndex,planFingerprint),written=await this.#dependencies.provenance.write({capabilityVersion:"2.0",mutationIdentity:provenanceIdentity,record:{provenanceVersion:"1.0",sourceType:"provider-generation",providerId:plan.providerId,providerApiVersion:plan.providerApiVersion,operation:plan.operation,outputRole:item.role,restrictedProviderOutputReference:reference.providerOutputReference as unknown as Sensitive<string>,importedChecksum:inspected.computedChecksum},registryReceipt});const provenance=await this.resolveProvenance(written,provenanceIdentity,item.slotIndex);if(provenance.status==="recovery-required")return provenance.result;if(provenance.status==="failed")issues.push(provenance.issue);else{const provenanceStage=await this.advance(current,journalIdentity,"provenance-recorded",{provenanceReceipt:provenance.receipt});if(provenanceStage.status!=="updated")return this.journalFailure(plan,provenanceStage.status,item.slotIndex,bundle.items.length,fetched,validated,reused);current=provenanceStage.record;journals[journals.length-1].record=current;}}
  }

  const requiredComplete=plan.items.filter(item=>item.requirement==="required").every(item=>assets.some(asset=>asset.role===item.role&&(asset.availability==="available"||asset.availability==="pending-scan"))),status=assets.length===0?"failed":issues.some(value=>value.reasonCode!=="duplicate-content-reused")?"partial":"completed";
  const audit:OutputIngestionAudit={status,expectedCount:plan.items.length,receivedCount:bundle.items.length,fetchedCount:fetched,validatedCount:validated,importedCount:assets.length,reusedCount:reused,failedCount:issues.filter(value=>value.reasonCode!=="duplicate-content-reused").length,roles:[...new Set(plan.items.map(item=>item.role))],mimeClasses:[...new Set(assets.map(asset=>mimeClass(asset.mimeType)))],reasonCodes:sortedReasons(issues.map(value=>value.reasonCode))};
  const result:OutputIngestionResult=status==="failed"?{status,requiredOutputsComplete:false,issues,audit}:status==="partial"?{status,requiredOutputsComplete:requiredComplete,assets,issues,audit}:{status,requiredOutputsComplete:true,assets,audit};
  for(const journal of journals){if(journal.record.terminal)continue;const terminal=await this.advance(journal.record,journal.identity,status==="failed"?"failed":"completed",{terminal:true,result:deepCopy(result)});if(terminal.status!=="updated")return this.journalFailure(plan,terminal.status,journal.record.slotIndex,bundle.items.length,fetched,validated,reused);}
  return deepFreeze(deepCopy(result));
 }

 private async resolveStorage(result:Awaited<ReturnType<AssetStoreWriterV2["write"]>>,identity:OutputIngestionMutationIdentityV2,slot:number):Promise<ReceiptResult<OutputIngestionStorageReceiptV2>>{if(result.status==="written"||result.status==="replayed")return{status:"resolved",receipt:deepCopy(result.receipt)};if(result.status==="outcome-unknown"){const lookup=await this.#dependencies.store.lookupAuthoritative(identity);if(lookup.status==="committed")return{status:"resolved",receipt:deepCopy(lookup.receipt)};if(lookup.status==="unavailable")return{status:"recovery-required",result:this.recovery("store","authoritative-lookup-unavailable")};return{status:"failed",issue:this.issue(lookup.status==="semantic-conflict"?"idempotency-conflict":"storage-write-failed",slot,false)}}return{status:"failed",issue:this.issue(result.status==="semantic-conflict"?"idempotency-conflict":"storage-write-failed",slot,result.status==="unavailable"||result.status==="not-committed"?result.retryable:false)}}
 private async resolveRegistry(result:Awaited<ReturnType<ImportedAssetRegistryV2["create"]>>,identity:OutputIngestionMutationIdentityV2,slot:number):Promise<ReceiptResult<OutputIngestionRegistryReceiptV2>>{if(result.status==="created"||result.status==="replayed")return{status:"resolved",receipt:deepCopy(result.receipt)};if(result.status==="outcome-unknown"){const lookup=await this.#dependencies.registry.lookupAuthoritative(identity);if(lookup.status==="committed")return{status:"resolved",receipt:deepCopy(lookup.receipt)};if(lookup.status==="unavailable")return{status:"recovery-required",result:this.recovery("registry","authoritative-lookup-unavailable")};return{status:"failed",issue:this.issue(lookup.status==="semantic-conflict"?"idempotency-conflict":"registry-create-failed",slot,false)}}return{status:"failed",issue:this.issue(result.status==="semantic-conflict"?"idempotency-conflict":"registry-create-failed",slot,result.status==="unavailable"||result.status==="not-committed"?result.retryable:false)}}
 private async resolveProvenance(result:Awaited<ReturnType<ProvenanceStoreV2["write"]>>,identity:OutputIngestionMutationIdentityV2,slot:number):Promise<ReceiptResult<Extract<Awaited<ReturnType<ProvenanceStoreV2["lookupAuthoritative"]>>,{status:"committed"}>["receipt"]>>{if(result.status==="written"||result.status==="replayed")return{status:"resolved",receipt:deepCopy(result.receipt)};if(result.status==="outcome-unknown"){const lookup=await this.#dependencies.provenance.lookupAuthoritative(identity);if(lookup.status==="committed")return{status:"resolved",receipt:deepCopy(lookup.receipt)};if(lookup.status==="unavailable")return{status:"recovery-required",result:this.recovery("provenance","authoritative-lookup-unavailable")};return{status:"failed",issue:this.issue(lookup.status==="semantic-conflict"?"idempotency-conflict":"provenance-write-failed",slot)}}return{status:"failed",issue:this.issue(result.status==="semantic-conflict"?"idempotency-conflict":"provenance-write-failed",slot,result.status==="unavailable"||result.status==="not-committed"?result.retryable:false)}}
 private async requestCleanup(plan:OutputIngestionPlan,slot:number,storageReceipt:OutputIngestionStorageReceiptV2,registryReceipt?:OutputIngestionRegistryReceiptV2){const identity=this.mutationIdentity("cleanup-schedule",plan,slot,fingerprint(plan)),scheduled=await this.#dependencies.cleanup.schedule({capabilityVersion:"2.0",mutationIdentity:identity,reason:"cleanup-required",storageReceipt,...(registryReceipt?{registryReceipt}: {})});if(scheduled.status==="outcome-unknown"){const lookup=await this.#dependencies.cleanup.lookupAuthoritative(identity);if(lookup.status==="committed")return undefined;return this.recovery("cleanup",lookup.status==="unavailable"?"authoritative-lookup-unavailable":"outcome-unknown")}if(scheduled.status==="unavailable")return this.recovery("cleanup","authoritative-lookup-unavailable");return undefined;}
 private async advance(record:OutputIngestionJournalRecordV2,identity:OutputIngestionJournalIdentityV2,stage:OutputIngestionJournalRecordV2["stage"],extra:Partial<OutputIngestionJournalRecordV2>={}){const next={...deepCopy(record),...deepCopy(extra),stage,revision:record.revision+1} as OutputIngestionJournalRecordV2;return this.#dependencies.journal.compareAndSet({identity,expectedRevision:record.revision,expectedPriorStages:[record.stage],nextRecord:next});}
 private async markUnknown(record:OutputIngestionJournalRecordV2,identity:OutputIngestionJournalIdentityV2,stage:"store-outcome-unknown"|"registry-outcome-unknown",mutationIdentity:OutputIngestionMutationIdentityV2){await this.advance(record,identity,stage,{mutationIdentity});}
 private projectReplayRecovery(record:OutputIngestionJournalRecordV2){if(record.stage==="store-intent-recorded"||record.stage==="store-outcome-unknown")return this.recovery("store","outcome-unknown");if(record.stage==="registry-intent-recorded"||record.stage==="registry-outcome-unknown")return this.recovery("registry","outcome-unknown");return undefined;}
 private journalFailure(plan:OutputIngestionPlan,status:string,slot:number,received:number,fetched:number,validated:number,reused:number){return this.failed(plan,[this.issue(status==="semantic-conflict"?"idempotency-conflict":"storage-write-failed",slot)],received,fetched,validated,reused);}
 private mutationIdentity(mutationClass:OutputIngestionMutationClassV2,plan:OutputIngestionPlan,slot:number,semanticFingerprint:string){return{identityVersion:"2.0",mutationClass,identityRef:`[ingestion-${plan.idempotency?.ingestionKeyRef??plan.context.operationRef}-${slot}-${mutationClass}]`,semanticFingerprint} as unknown as OutputIngestionMutationIdentityV2;}
 private journalIdentity(plan:OutputIngestionPlan,slot:number,semanticFingerprint:string){return{identityVersion:"2.0",ingestionIdentityRef:`[ingestion-${plan.idempotency?.ingestionKeyRef??plan.context.operationRef}-${slot}]`,semanticFingerprint} as unknown as OutputIngestionJournalIdentityV2;}
 private journalRecord(identity:OutputIngestionJournalIdentityV2,mutationIdentity:OutputIngestionMutationIdentityV2,slotIndex:number,role:OutputIngestionJournalRecordV2["role"],stage:OutputIngestionJournalRecordV2["stage"],revision:number,terminal:boolean){return{recordVersion:"2.0",identity,slotIndex,role,stage,attempt:1,revision,terminal,mutationIdentity} as unknown as OutputIngestionJournalRecordV2;}
 private recovery(stage:OutputIngestionRecoveryRequiredV2["stage"],reason:OutputIngestionRecoveryRequiredV2["reason"]):OutputIngestionRecoveryRequiredV2{return{status:"recovery-required",recoveryVersion:"2.0",stage,reason,retryable:false};}
 private issue(reasonCode:OutputIngestionReasonCode,slotIndex?:number,retryable=false):OutputIngestionIssue{return{reasonCode,classification:"execution",...(slotIndex===undefined?{}:{slotIndex}),retryable};}
 private failed(plan:OutputIngestionPlan,issues:OutputIngestionIssue[],received:number,fetched:number,validated:number,reused:number):OutputIngestionResult{return{status:"failed",requiredOutputsComplete:false,issues,audit:{status:"failed",expectedCount:plan.items.length,receivedCount:received,fetchedCount:fetched,validatedCount:validated,importedCount:0,reusedCount:reused,failedCount:issues.length,roles:plan.items.map(item=>item.role),mimeClasses:[],reasonCodes:sortedReasons(issues.map(value=>value.reasonCode))}};}
}
