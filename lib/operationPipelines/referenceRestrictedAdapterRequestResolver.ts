import type { Sensitive } from "@/lib/assets/types";
import type { ProviderOperation } from "@/lib/providerClients/types";
import type {
  OperationAdapterRequest,
  OperationResumePipelineAuthorization,
  OperationResumePipelineContext,
  RestrictedAdapterRequestRecord,
  RestrictedAdapterRequestResolveResult,
  RestrictedAdapterRequestResolver,
} from "./referenceOperationResumeTypes";
import { copy, protectedFingerprint, validIso, validOpaque } from "./operationPipelineUtils";

type Entry = { record: RestrictedAdapterRequestRecord; request: Sensitive<OperationAdapterRequest> };
const expectedAdapter: Record<ProviderOperation, string> = {
  "generate-vocal": "reference-vocal-v1",
  "generate-music": "reference-music-v1",
  "generate-mv": "reference-mv-v1",
};

export class ReferenceRestrictedAdapterRequestResolver implements RestrictedAdapterRequestResolver {
  readonly #values = new Map<string, Entry>();

  register(record: RestrictedAdapterRequestRecord, request: Sensitive<OperationAdapterRequest>) {
    if (!record || !request || !validOpaque(record.payloadRef) || this.#values.has(protectedFingerprint(record.payloadRef))) {
      return { status: !record || !request || !validOpaque(record?.payloadRef) ? "invalid" as const : "conflict" as const };
    }
    this.#values.set(protectedFingerprint(record.payloadRef), copy({ record, request }));
    return { status: "registered" as const };
  }

  async resolve(
    reference: string,
    operation: ProviderOperation,
    context: OperationResumePipelineContext,
    authorization: OperationResumePipelineAuthorization,
  ): Promise<RestrictedAdapterRequestResolveResult> {
    if (!validOpaque(reference) || !validIso(context?.baselineTime)) return { status: "failed" };
    const entry = this.#values.get(protectedFingerprint(reference));
    if (!entry) return { status: "missing" };
    const record = entry.record;
    if (record.deletionState === "deleted") return { status: "deleted" };
    if (context.baselineTime >= record.expiresAt) return { status: "expired" };
    if (!authorization || authorization.authorizationVersion !== "1.0" ||
        authorization.permission !== "execute-operation-resume-pipeline" ||
        authorization.workflowOwnershipVerified !== true || authorization.deletionState !== "active" ||
        authorization.tenantRef !== record.tenantRef || authorization.region !== record.region) {
      return { status: "unauthorized" };
    }
    if (record.operation !== operation || authorization.operation !== operation) return { status: "operation-mismatch" };
    if (record.adapterId !== expectedAdapter[operation] || record.adapterVersion !== "1.0.0") return { status: "adapter-mismatch" };
    if (record.recordVersion !== "1.0" || record.requestSchemaVersion !== "1.0" || entry.request.requestSchemaVersion !== "1.0") {
      return { status: "schema-mismatch" };
    }
    return { status: "resolved", request: copy(entry.request) };
  }
}
