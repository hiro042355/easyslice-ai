import test from "node:test";
import assert from "node:assert/strict";
import { createReferenceWorkflowApiFoundation } from "../../lib/server/workflowApi/referenceWorkflowApiFoundation";
import type { Sensitive } from "../../lib/assets/types";
import type { ProviderJobReference } from "../../lib/providerClients/types";
import type { ProviderUploadPendingReference } from "../../lib/pendingUploads/types";
import type { ReferenceWorkflowIntegrationRuntime } from "../../lib/workflowEntry/types";
import type { WorkflowApiPrincipal, WorkflowApiRequestContext } from "../../lib/workflowApi/types";
const confidentialFixture = <T>(value: T): Sensitive<T> => value as Sensitive<T>;
const principal: WorkflowApiPrincipal = { principalVersion: "1.0", actorType: "user", subjectRef: "synthetic-owner", tenantRef: "synthetic-tenant", region: "synthetic-region", permissions: ["workflow:poll-upload", "workflow:poll-generation"] };
const context: WorkflowApiRequestContext = { contextVersion: "1.0", baselineTime: "2030-01-01T00:00:00.000Z", requestRef: "synthetic-request", correlationRef: "synthetic-correlation", attempt: 1 };
for (const command of ["poll-upload", "poll-generation"] as const) test("vault kind cannot dispatch a different internal reference: " + command, async () => {
  let calls = 0;
  const forbidden = async (): Promise<never> => { calls++; throw new Error("unexpected-runtime-dispatch"); };
  const runtime: ReferenceWorkflowIntegrationRuntime = { runtimeVersion: "1.0", supportedOperations: ["generate-vocal"], startAccepted: forbidden, entryPoints: { pollUpload: forbidden, pollGeneration: forbidden, resume: forbidden, getResult: forbidden, cancel: forbidden } };
  const foundation = createReferenceWorkflowApiFoundation(runtime);
  const upload = confidentialFixture<Omit<ProviderUploadPendingReference, keyof Sensitive<unknown>>>({ referenceVersion: "1.0", kind: "provider-upload", pendingRef: "synthetic-pending" });
  const job = confidentialFixture<Omit<ProviderJobReference, keyof Sensitive<unknown>>>({ providerId: "reference-provider", providerApiVersion: "reference-api-v1", operation: "generate-vocal", jobReference: "synthetic-job", clientVersion: "1.0.0" });
  const ownership = { tenantRef: principal.tenantRef, region: principal.region, subjectRef: principal.subjectRef, operation: "generate-vocal" as const, deletionState: "active" as const, legalHold: false };
  const reference = foundation.referenceVault.registerInternal(command === "poll-upload" ? "upload-pending" : "generation-job", command === "poll-upload" ? job : upload, ownership);
  const result = command === "poll-upload"
    ? await foundation.service.pollUpload({ request: { requestVersion: "1.0", command, pendingReference: { ...reference, kind: "upload-pending" }, idempotencyKey: "synthetic-idem" }, principal, context })
    : await foundation.service.pollGeneration({ request: { requestVersion: "1.0", command, generationReference: { ...reference, kind: "generation-job" }, idempotencyKey: "synthetic-idem" }, principal, context });
  assert.equal(result.status, "error");
  if (result.status === "error") assert.equal(result.body.code, "reference-unavailable");
  assert.equal(calls, 0);
});
