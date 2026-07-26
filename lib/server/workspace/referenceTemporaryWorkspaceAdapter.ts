import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  WorkspaceCleanupClassification, WorkspacePreparationAuditEntry,
  WorkspaceFilesystem, WorkspacePreparationDecision, WorkspacePreparationRequest, WorkspaceReasonCode,
  WorkspaceState, WorkspaceValidation, WorkspaceValidationIssue,
} from "./types";

const defaultFilesystem: WorkspaceFilesystem = {
  mkdir: async (location) => { await mkdir(location, { recursive: false }); },
  rm: async (location) => { await rm(location, { recursive: true, force: false }); },
};
const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};
const safeReference = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export const validateWorkspaceRequest = (request: WorkspacePreparationRequest): WorkspaceValidation => {
  const issues: WorkspaceValidationIssue[] = [];
  if (!request || request.requestVersion !== "1.0" || !request.requestIdentity) issues.push("request-missing");
  if (!request?.workspace?.opaqueWorkspaceReference || !safeReference.test(request.workspace.opaqueWorkspaceReference))
    issues.push("workspace-identity-missing");
  if (!request?.ownership?.authenticatedTenantReference || !request.ownership.workspaceTenantReference)
    issues.push("tenant-missing");
  if (!request?.ownership?.authenticatedOwnershipReference || !request.ownership.workspaceOwnershipReference)
    issues.push("ownership-missing");
  if (!request?.retention || request.retention.policyVersion !== "1.0" ||
    !["request-scoped", "execution-scoped"].includes(request.retention.classification))
    issues.push("policy-unsupported");
  if (request?.retention?.cleanupRequired !== true) issues.push("cleanup-policy-invalid");
  return deepFreeze(issues.length ? {
    status: "invalid", issues: issues.map((issueCode, sequence) => ({ sequence, issueCode })),
  } : { status: "valid" });
};

export class ReferenceTemporaryWorkspaceAdapter {
  readonly #filesystem: WorkspaceFilesystem;
  readonly #root: string;
  readonly #states = new Map<string, WorkspaceState>();
  constructor(options: Readonly<{ root?: string; filesystem?: WorkspaceFilesystem }> = {}) {
    this.#root = options.root ?? path.join(os.tmpdir(), "easyslice-workspaces");
    this.#filesystem = options.filesystem ?? defaultFilesystem;
  }

  async reserve(request: WorkspacePreparationRequest): Promise<WorkspacePreparationDecision> {
    const rejection = this.#precondition(request);
    if (rejection) return rejection;
    const reference = request.workspace.opaqueWorkspaceReference;
    if (this.#states.has(reference))
      return this.#decision(request, "rejected", "workspace-duplicate", "failed", "not-required");
    this.#states.set(reference, "reserved");
    return this.#decision(request, "available", "workspace-reserved", "reserved", "not-required");
  }

  async prepare(request: WorkspacePreparationRequest): Promise<WorkspacePreparationDecision> {
    const rejection = this.#precondition(request);
    if (rejection) return rejection;
    const reference = request.workspace.opaqueWorkspaceReference;
    if (this.#states.get(reference) !== "reserved")
      return this.#decision(request, "rejected", this.#states.has(reference) ? "workspace-duplicate" : "workspace-not-found", "failed", "not-required");
    try {
      await this.#filesystem.mkdir(this.#location(reference));
      this.#states.set(reference, "prepared");
      return this.#decision(request, "available", "workspace-prepared", "prepared", "not-required");
    } catch {
      this.#states.set(reference, "failed");
      return this.#decision(request, "unavailable", "workspace-failed", "failed", "not-required");
    }
  }

  async lookup(request: WorkspacePreparationRequest): Promise<WorkspacePreparationDecision> {
    const rejection = this.#precondition(request);
    if (rejection) return rejection;
    const reference = request.workspace.opaqueWorkspaceReference;
    let state = this.#states.get(reference);
    if (!state) return this.#decision(request, "not-found", "workspace-not-found", "failed", "not-required");
    if (state === "prepared") {
      state = "active";
      this.#states.set(reference, state);
    }
    const reason = state === "reserved" ? "workspace-reserved" :
      state === "active" ? "workspace-active" :
      state === "cleanup-required" ? "workspace-cleanup-required" :
      state === "cleaned" ? "workspace-cleaned" : "workspace-failed";
    return this.#decision(request, state === "failed" ? "unavailable" : "available", reason, state, "not-required");
  }

  async cleanup(request: WorkspacePreparationRequest): Promise<WorkspacePreparationDecision> {
    const rejection = this.#precondition(request);
    if (rejection) return rejection;
    const reference = request.workspace.opaqueWorkspaceReference;
    const original = this.#states.get(reference);
    if (!original) return this.#decision(request, "not-found", "workspace-not-found", "failed", "not-required");
    if (!["prepared", "active", "failed"].includes(original))
      return this.#decision(request, "rejected", "workspace-duplicate", original, "not-required");
    this.#states.set(reference, "cleanup-required");
    try {
      await this.#filesystem.rm(this.#location(reference));
      this.#states.set(reference, "cleaned");
      return this.#decision(request, "available", "workspace-cleaned", "cleaned", "completed");
    } catch {
      this.#states.set(reference, original);
      return this.#decision(request, original === "failed" ? "unavailable" : "available",
        original === "prepared" ? "workspace-prepared" : "workspace-failed", original, "failed", true, "cleanup-failure");
    }
  }

  #precondition(request: WorkspacePreparationRequest): WorkspacePreparationDecision | undefined {
    if (validateWorkspaceRequest(request).status === "invalid")
      return this.#decision(request, "rejected", "workspace-invalid", "failed", "not-required", false);
    if (request.ownership.authenticatedTenantReference !== request.ownership.workspaceTenantReference ||
      request.ownership.authenticatedOwnershipReference !== request.ownership.workspaceOwnershipReference)
      return this.#decision(request, "rejected", "workspace-ownership-mismatch", "failed", "not-required", false);
    return undefined;
  }
  #location(reference: string): string { return path.join(this.#root, reference); }
  #decision(
    request: WorkspacePreparationRequest, classification: WorkspacePreparationDecision["classification"],
    reasonCode: WorkspaceReasonCode, state: WorkspaceState,
    cleanupClassification: WorkspaceCleanupClassification, includeReference = true,
    auditReasonCode: WorkspaceReasonCode = reasonCode,
  ): WorkspacePreparationDecision {
    const entry: WorkspacePreparationAuditEntry = {
      entryVersion: "1.0", sequence: 0, state, reasonCode: auditReasonCode, cleanupClassification,
    };
    return deepFreeze({
      decisionVersion: "1.0", classification, reasonCode,
      ...(includeReference && request?.workspace?.opaqueWorkspaceReference
        ? { workspace: { referenceVersion: "1.0", opaqueWorkspaceReference: request.workspace.opaqueWorkspaceReference } }
        : {}),
      lifecycle: { lifecycleVersion: "1.0", state },
      cleanupClassification,
      audit: { auditVersion: "1.0", entries: [entry] },
    });
  }
}
