import type {
  MediaExecutionCompositionCapability,
  MediaExecutionCompositionInput,
} from "../mediaExecutionComposition/types";

export type RouteAuthenticationProjection =
  | Readonly<{
    projectionVersion: "1.0";
    status: "authenticated";
    authenticatedSubjectReference: string;
  }>
  | Readonly<{
    projectionVersion: "1.0";
    status: "denied";
    reasonCode: "authentication-required" | "authorization-denied";
  }>;

export type RouteRequestProjection = Readonly<{
  projectionVersion: "1.0";
  requestIdentity: string;
  method: "POST";
  authentication: RouteAuthenticationProjection;
  compositionInput: MediaExecutionCompositionInput;
}>;

export type RouteMigrationInput = Readonly<{
  inputVersion: "1.0";
  request: RouteRequestProjection;
  composition: MediaExecutionCompositionCapability;
}>;

export type RouteResponseHeader = Readonly<{
  name: string;
  value: string;
}>;

export type RouteResponseBody =
  | Readonly<{
    bodyVersion: "1.0";
    classification: "json";
    content: Readonly<Record<string, string | number | boolean | null>>;
  }>
  | Readonly<{
    bodyVersion: "1.0";
    classification: "response-owned-archive";
    content: Blob;
  }>;

export type RouteSuccessProjection = Readonly<{
  projectionVersion: "1.0";
  status: "completed";
  httpStatus: 200;
  headers: readonly RouteResponseHeader[];
  body: RouteResponseBody;
  reasonCode: "request-completed";
}>;

export type RouteFailureProjection = Readonly<{
  projectionVersion: "1.0";
  status: "failed";
  httpStatus: 400 | 401 | 403 | 408 | 422 | 500 | 503;
  headers: readonly RouteResponseHeader[];
  body: RouteResponseBody;
  reasonCode:
    | "authentication-required"
    | "authorization-denied"
    | "request-invalid"
    | "execution-failed"
    | "execution-timed-out"
    | "execution-cancelled"
    | "dependency-unavailable";
}>;

export type RouteResponseProjection =
  | RouteSuccessProjection
  | RouteFailureProjection;

export type RouteMigrationAuditEntry = Readonly<{
  entryVersion: "1.0";
  sequence: number;
  stage:
    | "authentication"
    | "request-projection"
    | "composition-call"
    | "response-projection";
  status: "completed" | "failed";
  reasonCode: RouteSuccessProjection["reasonCode"] | RouteFailureProjection["reasonCode"];
}>;

export type RouteMigrationDecision = Readonly<{
  decisionVersion: "1.0";
  status: RouteResponseProjection["status"];
  httpStatus: RouteResponseProjection["httpStatus"];
  headers: readonly RouteResponseHeader[];
  body: RouteResponseBody;
  reasonCode: RouteSuccessProjection["reasonCode"] | RouteFailureProjection["reasonCode"];
  audit: Readonly<{
    auditVersion: "1.0";
    entries: readonly RouteMigrationAuditEntry[];
  }>;
}>;
