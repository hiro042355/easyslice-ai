import type {
  GenerationJobCancellationReference,
  GenerationJobPriority,
  GenerationJobRequest,
  GenerationJobResultProjection,
  GenerationJobResumeReference,
  GenerationJobSchedulingClassification,
  GenerationJobSelection,
} from "../generationJobEntry/types";
import type {
  HttpAudit,
  HttpAuditEntry,
  HttpFailureClassification,
  HttpHeaderProjection,
  HttpRequestEnvelope,
  HttpResponseEnvelope,
  HttpResultProjection,
  HttpValidation,
  HttpValidationIssue,
} from "./types";

export type HttpAdapterValue =
  | null
  | boolean
  | number
  | string
  | readonly HttpAdapterValue[]
  | Readonly<{ [key: string]: HttpAdapterValue }>;

export type HttpGenerationJobBody = Readonly<{
  bodyContractVersion: "1.0";
  job: Readonly<{ jobId: string; jobVersion: string }>;
  selection: GenerationJobSelection;
  input: Readonly<{ [key: string]: HttpAdapterValue }>;
  attemptIdentity: string;
  attempt: number;
  callerClassification: "authenticated-user" | "internal-service" | "system";
  executionClassification: "interactive" | "service" | "maintenance";
  priority: GenerationJobPriority;
  scheduling: GenerationJobSchedulingClassification;
  metadata: readonly Readonly<{
    name: "locale" | "source-classification" | "trace-classification";
    value: string;
    declarationOrder: number;
  }>[];
  resume?: GenerationJobResumeReference;
  cancellation: GenerationJobCancellationReference;
}>;

export type HttpGenerationJobResponseBody = Readonly<{
  responseVersion: "1.0";
  status: "accepted" | "completed" | "partial" | "failed" | "cancelled" | "recovery-required" | "rejected";
  job: Readonly<{ jobId: string; jobVersion: string }>;
  scheduling?: GenerationJobSchedulingClassification;
  output?: HttpAdapterValue;
  reasonCodes: readonly string[];
}>;

export type HttpGenerationJobEntryCapability = Readonly<{
  execute(
    request: GenerationJobRequest<Readonly<{ [key: string]: HttpAdapterValue }>>,
  ): Promise<GenerationJobResultProjection<HttpAdapterValue>>;
}>;

export type ReferenceHttpAdapterDependencies = Readonly<{
  generationJobEntry: HttpGenerationJobEntryCapability;
}>;

const INBOUND_HEADERS = Object.freeze(["content-type", "request-id", "correlation-id"] as const);

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const copyValue = (value: HttpAdapterValue): HttpAdapterValue => {
  if (Array.isArray(value)) return value.map(copyValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copyValue(child)]));
  }
  return value;
};

const issue = (
  issues: HttpValidationIssue[],
  reasonCode: HttpValidationIssue["reasonCode"],
  field: HttpValidationIssue["field"],
): void => {
  issues.push({ reasonCode, field, sequence: issues.length });
};

export const validateHttpGenerationJobEnvelope = (
  envelope: HttpRequestEnvelope<HttpGenerationJobBody>,
): HttpValidation => {
  const issues: HttpValidationIssue[] = [];
  if (envelope.envelopeVersion !== "1.0") issue(issues, "invalid-envelope", "envelope");
  if (envelope.metadata.request.identityVersion !== "1.0" || envelope.metadata.request.requestIdentity.length === 0) {
    issue(issues, "invalid-request-identity", "identity");
  }
  if (envelope.metadata.correlation.identityVersion !== "1.0" ||
    envelope.metadata.correlation.correlationIdentity.length === 0) {
    issue(issues, "invalid-correlation-identity", "correlation");
  }
  if (envelope.metadata.metadataVersion !== "1.0" || envelope.metadata.route !== "generation-job") {
    issue(issues, "invalid-route", "route");
  }
  if (envelope.metadata.method !== "create") issue(issues, "invalid-method", "method");
  const orderedHeaders = [...envelope.headers].sort((left, right) => left.declarationOrder - right.declarationOrder);
  const headerNames = orderedHeaders.map((header) => header.nameClassification);
  if (orderedHeaders.some((header, index) => header.headerVersion !== "1.0" ||
    header.declarationOrder !== index || !INBOUND_HEADERS.includes(header.nameClassification as never))) {
    issue(issues, "invalid-header", "header");
  }
  if (new Set(headerNames).size !== headerNames.length) issue(issues, "duplicate-header", "header");
  const value = envelope.body.value;
  if (envelope.body.bodyVersion !== "1.0" || envelope.body.classification !== "structured" ||
    value === undefined || value.bodyContractVersion !== "1.0" || value.job.jobId.length === 0 ||
    value.job.jobVersion.length === 0 || value.selection.selectionVersion !== "1.0" ||
    value.input === null || Array.isArray(value.input) || typeof value.input !== "object") {
    issue(issues, "invalid-body", "body");
  }
  if (envelope.metadata.bodySizeClassification === "too-large") issue(issues, "body-too-large", "body");
  if (envelope.metadata.contentClassification !== "structured") issue(issues, "unsupported-content", "body");
  return deepFreeze(issues.length === 0 ? { status: "valid" } : { status: "invalid", issues });
};

const failure = (
  classification: HttpFailureClassification["classification"],
  errorCode: HttpFailureClassification["errorCode"],
  safeMessageClassification: HttpFailureClassification["safeMessageClassification"],
): HttpFailureClassification => ({ classification, errorCode, safeMessageClassification });

export class ReferenceHttpAdapterRuntime {
  readonly #generationJobEntry: HttpGenerationJobEntryCapability;

  constructor(dependencies: ReferenceHttpAdapterDependencies) {
    this.#generationJobEntry = dependencies.generationJobEntry;
  }

  async adapt(
    envelope: HttpRequestEnvelope<HttpGenerationJobBody>,
  ): Promise<HttpResultProjection<HttpGenerationJobResponseBody>> {
    const entries: HttpAuditEntry[] = [];
    const addAudit = (stage: HttpAuditEntry["stage"], outcome: string, reasonCode: string): void => {
      entries.push({ entryVersion: "1.0", sequence: entries.length, stage, outcome, reasonCode });
    };
    const audit = (): HttpAudit => deepFreeze({
      auditVersion: "1.0",
      request: { ...envelope.metadata.request },
      correlation: { ...envelope.metadata.correlation },
      entries: entries.map((entry) => ({ ...entry })),
      reasonCodes: entries.map((entry) => entry.reasonCode),
    });
    const headers = (): readonly HttpHeaderProjection[] => deepFreeze([
      { headerVersion: "1.0", nameClassification: "content-type", value: "structured", declarationOrder: 0 },
      { headerVersion: "1.0", nameClassification: "request-id", value: envelope.metadata.request.requestIdentity, declarationOrder: 1 },
      { headerVersion: "1.0", nameClassification: "correlation-id", value: envelope.metadata.correlation.correlationIdentity, declarationOrder: 2 },
      { headerVersion: "1.0", nameClassification: "cache-control", value: "non-persistent", declarationOrder: 3 },
    ]);
    const response = (
      statusCode: number,
      statusClassification: HttpResponseEnvelope<HttpGenerationJobResponseBody>["statusClassification"],
      body: HttpGenerationJobResponseBody,
    ): HttpResponseEnvelope<HttpGenerationJobResponseBody> => deepFreeze({
      envelopeVersion: "1.0",
      request: { ...envelope.metadata.request },
      correlation: { ...envelope.metadata.correlation },
      statusCode,
      statusClassification,
      headers: headers(),
      body: { bodyVersion: "1.0", classification: "structured", value: body },
    });
    const safeBody = (
      status: HttpGenerationJobResponseBody["status"],
      reasonCodes: readonly string[],
      job = envelope.body.value?.job ?? { jobId: "unavailable", jobVersion: "unavailable" },
      output?: HttpAdapterValue,
      scheduling?: GenerationJobSchedulingClassification,
    ): HttpGenerationJobResponseBody => deepFreeze({
      responseVersion: "1.0",
      status,
      job: { ...job },
      ...(scheduling === undefined ? {} : { scheduling }),
      ...(output === undefined ? {} : { output: copyValue(output) }),
      reasonCodes: [...reasonCodes],
    });

    const validation = validateHttpGenerationJobEnvelope(envelope);
    if (validation.status === "invalid") {
      addAudit("validation", "invalid", "http-request-invalid");
      return deepFreeze({
        resultVersion: "1.0",
        status: "rejected",
        response: response(400, "client-error", safeBody("rejected", ["http-request-invalid"])),
        failures: [failure("invalid", "request-invalid", "request")],
        audit: audit(),
      });
    }
    addAudit("validation", "valid", "http-request-valid");
    const value = envelope.body.value;
    if (value === undefined) {
      addAudit("adaptation", "invalid", "http-body-unavailable");
      return deepFreeze({
        resultVersion: "1.0",
        status: "rejected",
        response: response(400, "client-error", safeBody("rejected", ["http-body-unavailable"])),
        failures: [failure("invalid", "request-invalid", "request")],
        audit: audit(),
      });
    }
    const request: GenerationJobRequest<Readonly<{ [key: string]: HttpAdapterValue }>> = deepFreeze({
      requestVersion: "1.0",
      requestIdentity: envelope.metadata.request.requestIdentity,
      job: { ...value.job },
      selection: { ...value.selection },
      input: copyValue(value.input) as Readonly<{ [key: string]: HttpAdapterValue }>,
      context: {
        contextVersion: "1.0",
        correlationIdentity: envelope.metadata.correlation.correlationIdentity,
        attemptIdentity: value.attemptIdentity,
        attempt: value.attempt,
        callerClassification: value.callerClassification,
        executionClassification: value.executionClassification,
        cancellation: { ...value.cancellation },
      },
      metadata: { metadataVersion: "1.0", fields: value.metadata.map((field) => ({ ...field })) },
      priority: value.priority,
      scheduling: value.scheduling,
      ...(value.resume === undefined ? {} : { resume: { ...value.resume } }),
    });
    addAudit("adaptation", "adapted", "generation-job-request-projected");

    let rawResult: unknown;
    try {
      rawResult = await this.#generationJobEntry.execute(request);
    } catch {
      addAudit("projection", "unavailable", "generation-job-dependency-failed");
      return deepFreeze({
        resultVersion: "1.0",
        status: "unavailable",
        response: response(503, "server-error", safeBody("failed", ["generation-job-dependency-failed"], value.job)),
        failures: [failure("unavailable", "service-unavailable", "availability")],
        audit: audit(),
      });
    }
    if (rawResult === null || typeof rawResult !== "object" || !("status" in rawResult)) {
      addAudit("projection", "unavailable", "generation-job-result-unsupported");
      return deepFreeze({
        resultVersion: "1.0",
        status: "unavailable",
        response: response(500, "server-error", safeBody("failed", ["generation-job-result-unsupported"], value.job)),
        failures: [failure("internal", "internal-error", "internal")],
        audit: audit(),
      });
    }
    const result = rawResult as GenerationJobResultProjection<HttpAdapterValue>;
    const reasons = result.audit.reasonCodes;
    if (result.status === "accepted") {
      addAudit("projection", "successful", "http-generation-job-accepted");
      return deepFreeze({ resultVersion: "1.0", status: "successful", response: response(202, "successful", safeBody("accepted", reasons, result.job, undefined, result.scheduling)), audit: audit() });
    }
    if (result.status === "completed" || result.status === "partial") {
      addAudit("projection", "successful", `http-generation-job-${result.status}`);
      return deepFreeze({ resultVersion: "1.0", status: "successful", response: response(result.status === "completed" ? 200 : 207, "successful", safeBody(result.status, reasons, result.job, result.output)), audit: audit() });
    }
    if (result.status === "cancelled") {
      addAudit("projection", "successful", "http-generation-job-cancelled");
      return deepFreeze({ resultVersion: "1.0", status: "successful", response: response(200, "successful", safeBody("cancelled", reasons, result.job)), audit: audit() });
    }
    if (result.status === "recovery-required") {
      addAudit("projection", "unavailable", "http-generation-job-recovery-required");
      return deepFreeze({ resultVersion: "1.0", status: "unavailable", response: response(202, "successful", safeBody("recovery-required", reasons, result.job)), failures: [failure("unavailable", "service-unavailable", "availability")], audit: audit() });
    }
    if (result.status === "rejected") {
      addAudit("projection", "rejected", "http-generation-job-rejected");
      return deepFreeze({ resultVersion: "1.0", status: "rejected", response: response(403, "client-error", safeBody("rejected", reasons, result.job)), failures: [failure("unauthorized", "access-denied", "access")], audit: audit() });
    }
    addAudit("projection", "unavailable", "http-generation-job-failed");
    return deepFreeze({ resultVersion: "1.0", status: "unavailable", response: response(503, "server-error", safeBody("failed", reasons, result.job)), failures: [failure("unavailable", "service-unavailable", "availability")], audit: audit() });
  }
}
