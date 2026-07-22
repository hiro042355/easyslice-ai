import type { AssetStoreWriteInputV2, AssetStoreWriteResultV2, AssetStoreWriterV2, OutputIngestionAuthoritativeLookupResultV2, OutputIngestionMutationIdentityV2, OutputIngestionReplayEvidenceV2, OutputIngestionStorageReceiptV2 } from "./types";
import { deepCopy } from "./outputIngestionUtils";

export type ReferencePersistenceScenarioV2 = "normal"|"outcome-unknown-committed"|"corrupted"|"unavailable";

export class ReferencePersistenceAssetStoreV2 implements AssetStoreWriterV2 {
  readonly #receipts = new Map<string, OutputIngestionStorageReceiptV2>();
  constructor(private readonly scenario:ReferencePersistenceScenarioV2="normal"){}

  async write(input:AssetStoreWriteInputV2):Promise<AssetStoreWriteResultV2>{
    if(this.scenario==="corrupted")return{status:"corrupted",retryable:false};
    if(this.scenario==="unavailable")return{status:"unavailable",retryable:true};
    const old=this.#receipts.get(input.mutationIdentity.identityRef);
    if(old){if(old.mutationIdentity.semanticFingerprint!==input.mutationIdentity.semanticFingerprint)return{status:"semantic-conflict",retryable:false};return{status:"replayed",receipt:deepCopy(old),replayEvidence:evidence(old.mutationIdentity,"storage")};}
    const receipt={receiptVersion:"2.0",mutationIdentity:deepCopy(input.mutationIdentity),locatorRef:`[reference-v2-storage-${input.mutationIdentity.identityRef}]`,storedBytes:input.sizeBytes,checksum:input.checksum} as unknown as OutputIngestionStorageReceiptV2;
    this.#receipts.set(input.mutationIdentity.identityRef,deepCopy(receipt));
    if(this.scenario==="outcome-unknown-committed")return{status:"outcome-unknown",retryable:false,recoveryRequired:true};
    return{status:"written",receipt:deepCopy(receipt)};
  }

  async lookupAuthoritative(identity:OutputIngestionMutationIdentityV2):Promise<OutputIngestionAuthoritativeLookupResultV2<OutputIngestionStorageReceiptV2>>{
    if(this.scenario==="corrupted")return{status:"corrupted"};
    if(this.scenario==="unavailable")return{status:"unavailable",retryable:true};
    const receipt=this.#receipts.get(identity.identityRef);if(!receipt)return{status:"not-committed"};
    if(receipt.mutationIdentity.semanticFingerprint!==identity.semanticFingerprint)return{status:"semantic-conflict"};
    return{status:"committed",receipt:deepCopy(receipt),replayEvidence:evidence(identity,"storage")};
  }
}

export function referenceReplayEvidenceV2(identity:OutputIngestionMutationIdentityV2,suffix:string):OutputIngestionReplayEvidenceV2{return evidence(identity,suffix);}
function evidence(identity:OutputIngestionMutationIdentityV2,suffix:string){return{evidenceVersion:"2.0",mutationIdentity:deepCopy(identity),evidenceRef:`[reference-v2-evidence-${suffix}-${identity.identityRef}]`,semanticFingerprint:identity.semanticFingerprint} as unknown as OutputIngestionReplayEvidenceV2;}
