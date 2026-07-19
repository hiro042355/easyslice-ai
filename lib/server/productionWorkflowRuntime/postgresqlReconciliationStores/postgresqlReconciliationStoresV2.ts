import type { DurableWorkflowTransactionContext } from "../durableTransaction";
import { normalizeExpectedPriorStates } from "./postgresqlReconciliationPreconditions";
import { decodeRequest, decodeResolution, transitionRequestV2 } from "./postgresqlReconciliationStores";
import { execute, sameDigest, validFingerprint, validIdentity, validUuid } from "./postgresqlReconciliationStoreUtils";
import type { ReconciliationRequestRecord, ReconciliationRequestStore, ReconciliationRequestStoreV2, ReconciliationRequestTransitionInputV2, ReconciliationResolutionAppendResultV2, ReconciliationUuidGenerator, ResolutionAtomicInputV2, ResolutionRecord, ResolutionStore, ResolutionStoreV2, StoreRecordResult } from "./types";

const classifyParent = async (context: DurableWorkflowTransactionContext, input: ResolutionAtomicInputV2): Promise<StoreRecordResult<ResolutionRecord>> => {
  const value = await execute(context.database, "reconciliation.request.read", [input.requestIdentity.algorithmVersion, input.requestIdentity.digest], "single");
  if (value.status !== "success" || value.rows.length !== 1) return value.status === "failure" ? { status: "unavailable" } : { status: "corrupted" };
  const parent: ReconciliationRequestRecord | undefined = decodeRequest(value.rows[0]!);
  if (!parent) return { status: "corrupted" };
  if (["resolved", "still-unknown", "corrupted", "manual-repair-required", "cancelled"].includes(parent.state)) return { status: "terminal" };
  if (parent.writerEpoch !== input.authority.writerEpoch) return { status: "stale-writer" };
  if (parent.fencingRevision !== input.authority.expectedFence || !parent.claimOwner || !sameDigest(parent.claimOwner.digest, input.authority.owner.digest)) return { status: "stale-fence" };
  if (parent.revision !== input.expectedRequestRevision) return { status: "stale-revision" };
  if (!input.expectedPriorStates.includes(parent.state as typeof input.expectedPriorStates[number])) return { status: "wrong-prior-state" };
  return { status: "conflict" };
};

export const createPostgreSQLReconciliationRequestStoreV2 = (base: ReconciliationRequestStore): ReconciliationRequestStoreV2 => Object.freeze({
  ...base,
  storeVersionV2: "2.0" as const,
  transitionV2: (context: DurableWorkflowTransactionContext, input: ReconciliationRequestTransitionInputV2) => transitionRequestV2(context, input),
});

export const createPostgreSQLReconciliationResolutionStoreV2 = (base: ResolutionStore, ids: ReconciliationUuidGenerator): ResolutionStoreV2 => Object.freeze({
  ...base,
  storeVersionV2: "2.0" as const,
  async appendForAtomicTransitionV2(context: DurableWorkflowTransactionContext, input: ResolutionAtomicInputV2): Promise<StoreRecordResult<ResolutionRecord>> {
    const states = normalizeExpectedPriorStates(input.expectedPriorStates);
    const draft = input.draft;
    const generatedId = ids.generate();
    if (!states || !validUuid(generatedId) || !validIdentity(input.requestIdentity, "reconciliation-request") || !validIdentity(input.authority.owner, "claim-owner") || !validIdentity(draft.identity, "resolution") || !validIdentity(draft.tenant, "tenant") || !validFingerprint(draft.fingerprint, "resolution-semantic")) return { status: "corrupted" };
    const parameters = [generatedId,draft.requestId,draft.identity.algorithmVersion,draft.identity.digest,draft.tenant.digest,draft.tenant.algorithmVersion,draft.sequence,draft.resolutionClass,draft.reasonCode,JSON.stringify(draft.summary),draft.committedRevision,draft.resolvedAt,draft.fingerprint.algorithmVersion,draft.fingerprint.digest,input.requestIdentity.algorithmVersion,input.requestIdentity.digest,input.expectedRequestRevision,`{${states.join(",")}}`,input.authority.writerEpoch,input.authority.owner.digest,input.authority.expectedFence] as const;
    const inserted = await execute(context.database, "reconciliation.resolution.insert.v2", parameters, "many");
    if (inserted.status === "failure") return { status: "unavailable" };
    if (inserted.status === "success" && inserted.rows.length === 1) {
      const record = decodeResolution(inserted.rows[0]!);
      return record ? Object.freeze({ status: "created" as const, record }) : { status: "corrupted" };
    }
    const existing = await execute(context.database, "reconciliation.resolution.read", [draft.identity.algorithmVersion, draft.identity.digest], "single");
    if (existing.status === "success" && existing.rows.length === 1) {
      const record = decodeResolution(existing.rows[0]!);
      if (!record) return { status: "corrupted" };
      return sameDigest(record.fingerprint.digest, draft.fingerprint.digest) ? Object.freeze({ status: "replayed" as const, record }) : { status: "conflict" };
    }
    return classifyParent(context, Object.freeze({ ...input, expectedPriorStates: states }));
  },
  async appendStandaloneV2(context:DurableWorkflowTransactionContext,input:ResolutionAtomicInputV2):Promise<ReconciliationResolutionAppendResultV2>{
    const result=await this.appendForAtomicTransitionV2(context,input);
    if(result.status==="created"||result.status==="replayed")return Object.freeze({status:result.status});
    if(result.status==="unavailable")return Object.freeze({status:"unavailable",retryable:true});
    if(result.status==="corrupted"||result.status==="legacy-unready"||result.status==="not-found")return Object.freeze({status:"corrupted"});
    const conflictClass=result.status==="stale-revision"?"stale-revision":result.status==="stale-fence"?"stale-fence":result.status==="stale-writer"?"writer-epoch-mismatch":result.status==="wrong-prior-state"?"wrong-prior-state":result.status==="terminal"?"terminal-preserved":"semantic-conflict";
    return Object.freeze({status:"conflict",conflictClass});
  },
});
