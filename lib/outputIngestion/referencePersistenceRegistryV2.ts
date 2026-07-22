import type { AssetMetadata, AssetRecord } from "@/lib/assets/types";
import type { AssetRegistryCreateInputV2, AssetRegistryCreateResultV2, ImportedAssetRegistryV2, OutputIngestionAuthoritativeLookupResultV2, OutputIngestionMutationIdentityV2, OutputIngestionRegistryReceiptV2 } from "./types";
import { deepCopy } from "./outputIngestionUtils";
import { referenceReplayEvidenceV2, type ReferencePersistenceScenarioV2 } from "./referencePersistenceAssetStoreV2";

export class ReferencePersistenceRegistryV2 implements ImportedAssetRegistryV2 {
  readonly #receipts=new Map<string,OutputIngestionRegistryReceiptV2>();
  constructor(private readonly scenario:ReferencePersistenceScenarioV2="normal"){}
  async create(input:AssetRegistryCreateInputV2):Promise<AssetRegistryCreateResultV2>{
    if(this.scenario==="corrupted")return{status:"corrupted",retryable:false};if(this.scenario==="unavailable")return{status:"unavailable",retryable:true};
    const old=this.#receipts.get(input.mutationIdentity.identityRef);if(old){if(old.mutationIdentity.semanticFingerprint!==input.mutationIdentity.semanticFingerprint)return{status:"semantic-conflict",retryable:false};return{status:"replayed",receipt:deepCopy(old),replayEvidence:referenceReplayEvidenceV2(old.mutationIdentity,"registry")};}
    const metadata:AssetMetadata=input.kind==="video"?{type:"video",durationSeconds:input.metadata.durationSeconds,width:input.metadata.width,height:input.metadata.height,codec:input.metadata.codec}:input.kind==="image"||input.kind==="character"||input.kind==="brand"?{type:"image",width:input.metadata.width,height:input.metadata.height}:{type:"audio",durationSeconds:input.metadata.durationSeconds,codec:input.metadata.codec};
    const record={schemaVersion:"1.0",assetId:`[reference-v2-asset-${input.slotIndex+1}]`,kind:input.kind,mimeType:input.mimeType,sizeBytes:input.sizeBytes,checksum:input.checksum,storageLocator:{locatorVersion:"1.0",locatorId:input.storageReceipt.locatorRef},status:input.availability,region:input.policy.destinationRegion,retentionClass:input.policy.retentionClass,integrityState:"verified",metadata} as AssetRecord;
    const receipt={receiptVersion:"2.0",mutationIdentity:deepCopy(input.mutationIdentity),record:deepCopy(record)} as unknown as OutputIngestionRegistryReceiptV2;this.#receipts.set(input.mutationIdentity.identityRef,deepCopy(receipt));
    if(this.scenario==="outcome-unknown-committed")return{status:"outcome-unknown",retryable:false,recoveryRequired:true};return{status:"created",receipt:deepCopy(receipt)};
  }
  async lookupAuthoritative(identity:OutputIngestionMutationIdentityV2):Promise<OutputIngestionAuthoritativeLookupResultV2<OutputIngestionRegistryReceiptV2>>{if(this.scenario==="corrupted")return{status:"corrupted"};if(this.scenario==="unavailable")return{status:"unavailable",retryable:true};const receipt=this.#receipts.get(identity.identityRef);if(!receipt)return{status:"not-committed"};if(receipt.mutationIdentity.semanticFingerprint!==identity.semanticFingerprint)return{status:"semantic-conflict"};return{status:"committed",receipt:deepCopy(receipt),replayEvidence:referenceReplayEvidenceV2(identity,"registry")};}
}
