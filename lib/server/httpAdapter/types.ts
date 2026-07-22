export type HttpRequestIdentity = Readonly<{
  identityVersion: "1.0";
  requestIdentity: string;
}>;

export type HttpCorrelationIdentity = Readonly<{
  identityVersion: "1.0";
  correlationIdentity: string;
}>;

export type HttpRouteClassification =
  | "generation-job"
  | "workflow-entry"
  | "health"
  | "status";

export type HttpMethodClassification = "read" | "create" | "replace" | "update" | "remove";

export type HttpRequestMetadata = Readonly<{
  metadataVersion: "1.0";
  route: HttpRouteClassification;
  method: HttpMethodClassification;
  request: HttpRequestIdentity;
  correlation: HttpCorrelationIdentity;
  bodySizeClassification: "empty" | "small" | "medium" | "large" | "too-large";
  contentClassification: "structured" | "binary-reference" | "none" | "unsupported";
}>;

export type HttpHeaderProjection = Readonly<{
  headerVersion: "1.0";
  nameClassification: "content-type" | "request-id" | "correlation-id" | "cache-control" | "retry-advice";
  value: string;
  declarationOrder: number;
}>;

export type HttpBodyProjection<TPublicBody> = Readonly<{
  bodyVersion: "1.0";
  classification: "structured" | "empty";
  value?: Readonly<TPublicBody>;
}>;

export type HttpRequestEnvelope<TPublicBody> = Readonly<{
  envelopeVersion: "1.0";
  metadata: HttpRequestMetadata;
  headers: readonly HttpHeaderProjection[];
  body: HttpBodyProjection<TPublicBody>;
}>;

export type HttpResponseEnvelope<TPublicBody> = Readonly<{
  envelopeVersion: "1.0";
  request: HttpRequestIdentity;
  correlation: HttpCorrelationIdentity;
  statusCode: number;
  statusClassification: "informational" | "successful" | "redirect" | "client-error" | "server-error";
  headers: readonly HttpHeaderProjection[];
  body: HttpBodyProjection<TPublicBody>;
}>;

export type HttpValidationIssue = Readonly<{
  reasonCode:
    | "invalid-envelope"
    | "invalid-request-identity"
    | "invalid-correlation-identity"
    | "invalid-route"
    | "invalid-method"
    | "invalid-header"
    | "duplicate-header"
    | "invalid-body"
    | "body-too-large"
    | "unsupported-content";
  field: "envelope" | "identity" | "correlation" | "route" | "method" | "header" | "body";
  sequence: number;
}>;

export type HttpValidation =
  | Readonly<{ status: "valid" }>
  | Readonly<{
      status: "invalid";
      issues: readonly HttpValidationIssue[];
    }>;

export type HttpFailureClassification = Readonly<{
  classification: "invalid" | "unauthorized" | "not-found" | "conflict" | "unavailable" | "internal";
  errorCode:
    | "request-invalid"
    | "content-unsupported"
    | "body-too-large"
    | "access-denied"
    | "target-not-found"
    | "request-conflict"
    | "service-unavailable"
    | "internal-error";
  safeMessageClassification: "request" | "content" | "access" | "target" | "conflict" | "availability" | "internal";
}>;

export type HttpAuditEntry = Readonly<{
  entryVersion: "1.0";
  sequence: number;
  stage: "validation" | "adaptation" | "projection";
  outcome: string;
  reasonCode: string;
}>;

export type HttpAudit = Readonly<{
  auditVersion: "1.0";
  request: HttpRequestIdentity;
  correlation: HttpCorrelationIdentity;
  entries: readonly HttpAuditEntry[];
  reasonCodes: readonly string[];
}>;

export type HttpSuccessfulResult<TPublicBody> = Readonly<{
  resultVersion: "1.0";
  status: "successful";
  response: HttpResponseEnvelope<TPublicBody>;
  audit: HttpAudit;
}>;

export type HttpRejectedResult<TPublicBody> = Readonly<{
  resultVersion: "1.0";
  status: "rejected";
  response: HttpResponseEnvelope<TPublicBody>;
  failures: readonly HttpFailureClassification[];
  audit: HttpAudit;
}>;

export type HttpUnavailableResult<TPublicBody> = Readonly<{
  resultVersion: "1.0";
  status: "unavailable";
  response: HttpResponseEnvelope<TPublicBody>;
  failures: readonly HttpFailureClassification[];
  audit: HttpAudit;
}>;

export type HttpResultProjection<TPublicBody> =
  | HttpSuccessfulResult<TPublicBody>
  | HttpRejectedResult<TPublicBody>
  | HttpUnavailableResult<TPublicBody>;
