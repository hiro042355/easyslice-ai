import { constants, copyFile, lstat } from "node:fs/promises";
import path from "node:path";
import type {
  InputMaterializationAuditEntry,
  InputMaterializationClassification,
  InputMaterializationContext,
  InputMaterializationDecision,
  InputMaterializationReasonCode,
  InputMaterializationRequest,
  InputMaterializationRetryClassification,
  InputMaterializationValidation,
  InputMaterializationValidationIssue,
} from "./types";

type LocatedArtifact = Readonly<{ location: string }>;
type LocatedWorkspace = Readonly<{ location: string }>;
type FilesystemEntry = Readonly<{
  exists: boolean;
  kind: "file" | "directory" | "symbolic-link" | "other";
}>;
export type SourceArtifactLocatorCapability = Readonly<{
  locateSource(reference: Readonly<{ opaqueReference: string }>): LocatedArtifact | Promise<LocatedArtifact>;
}>;
export type WorkspaceLocatorCapability = Readonly<{
  locateWorkspace(reference: Readonly<{ opaqueReference: string }>): LocatedWorkspace | Promise<LocatedWorkspace>;
}>;
export type FilesystemMaterializationCapability = Readonly<{
  inspect(location: string): FilesystemEntry | Promise<FilesystemEntry>;
  copyExclusive(source: string, destination: string): void | Promise<void>;
}>;
export type InputMaterializationDependencies = Readonly<{
  sourceLocator: SourceArtifactLocatorCapability;
  workspaceLocator: WorkspaceLocatorCapability;
  filesystem?: FilesystemMaterializationCapability;
}>;

const safeReference = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};
const defaultFilesystem: FilesystemMaterializationCapability = {
  inspect: async (location) => {
    try {
      const value = await lstat(location);
      return {
        exists: true,
        kind: value.isSymbolicLink() ? "symbolic-link" :
          value.isFile() ? "file" : value.isDirectory() ? "directory" : "other",
      };
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return { exists: false, kind: "other" };
      throw error;
    }
  },
  copyExclusive: async (source, destination) => {
    await copyFile(source, destination, constants.COPYFILE_EXCL);
  },
};
const isNodeError = (error: unknown, code: string): boolean =>
  typeof error === "object" && error !== null && "code" in error &&
  (error as Readonly<{ code?: unknown }>).code === code;
const retryFor = (classification: InputMaterializationClassification): InputMaterializationRetryClassification =>
  classification === "materialized" ? "retry-not-required" :
  classification === "invalid" || classification === "rejected" ? "retry-not-allowed" :
  classification === "already-exists" ? "retry-requires-policy-change" :
  classification === "unavailable" ? "retry-safe" : "retry-external-policy";

export const validateInputMaterializationRequest = (
  request: InputMaterializationRequest,
  context: InputMaterializationContext,
): InputMaterializationValidation => {
  const issues: InputMaterializationValidationIssue[] = [];
  if (!request || request.requestVersion !== "1.0" || !context || context.contextVersion !== "1.0")
    issues.push("request-missing");
  if (!request?.requestIdentity) issues.push("request-identity-missing");
  if (!request?.operationIdentity || !context?.executionOperationIdentity)
    issues.push("operation-identity-missing");
  const ownership = request?.ownership;
  if (!ownership?.authenticatedTenantReference || !ownership.requestTenantReference ||
    !ownership.sourceTenantReference || !ownership.workspaceTenantReference)
    issues.push("tenant-identity-missing");
  const source = request?.sourceArtifact?.opaqueSourceArtifactReference;
  const workspace = request?.workspace?.opaqueWorkspaceReference;
  const destination = request?.materializedArtifact?.opaqueMaterializedArtifactReference;
  if (!workspace || !context?.executionWorkspaceReference) issues.push("workspace-identity-missing");
  if (!source) issues.push("source-reference-missing");
  if (!destination) issues.push("materialized-reference-missing");
  if (source && !safeReference.test(source)) issues.push("source-reference-invalid");
  if (workspace && !safeReference.test(workspace)) issues.push("workspace-reference-invalid");
  if (destination && !safeReference.test(destination)) issues.push("materialized-reference-invalid");
  if (!request?.policy || request.policy.policyVersion !== "1.0" ||
    request.policy.collisionPolicy !== "reject-existing")
    issues.push("policy-unsupported");
  if (source && destination && source === destination) issues.push("reference-collision");
  return deepFreeze(issues.length === 0
    ? { status: "valid" }
    : { status: "invalid", issues: issues.map((issueCode, sequence) => ({ sequence, issueCode })) });
};

export class ReferenceFilesystemInputMaterializationAdapter {
  readonly #sourceLocator: SourceArtifactLocatorCapability;
  readonly #workspaceLocator: WorkspaceLocatorCapability;
  readonly #filesystem: FilesystemMaterializationCapability;
  readonly #completedRequests = new Set<string>();

  constructor(dependencies: InputMaterializationDependencies) {
    this.#sourceLocator = dependencies.sourceLocator;
    this.#workspaceLocator = dependencies.workspaceLocator;
    this.#filesystem = dependencies.filesystem ?? defaultFilesystem;
  }

  async materialize(
    request: InputMaterializationRequest,
    context: InputMaterializationContext,
  ): Promise<InputMaterializationDecision> {
    const validation = validateInputMaterializationRequest(request, context);
    if (validation.status === "invalid")
      return this.#decision("invalid", validation.issues.some((issue) => issue.issueCode === "policy-unsupported")
        ? "policy-unsupported" : validation.issues.some((issue) => issue.issueCode === "reference-collision")
          ? "reference-collision" : "request-invalid", false, ["request-validation"]);
    if (this.#completedRequests.has(request.requestIdentity))
      return this.#decision("rejected", "duplicate-request", false, ["request-validation"]);
    if (!this.#ownershipMatches(request, context))
      return this.#decision("rejected", "ownership-mismatch", false,
        ["request-validation", "policy-validation", "ownership-validation"]);

    let source: LocatedArtifact;
    try {
      source = { ...(await this.#sourceLocator.locateSource({
        opaqueReference: request.sourceArtifact.opaqueSourceArtifactReference,
      })) };
    } catch {
      return this.#decision("unavailable", "source-unavailable", false,
        ["request-validation", "policy-validation", "ownership-validation", "reference-validation", "source-resolution"]);
    }
    let workspace: LocatedWorkspace;
    try {
      workspace = { ...(await this.#workspaceLocator.locateWorkspace({
        opaqueReference: request.workspace.opaqueWorkspaceReference,
      })) };
    } catch {
      return this.#decision("unavailable", "workspace-unavailable", false,
        ["request-validation", "policy-validation", "ownership-validation", "reference-validation", "source-resolution", "workspace-resolution"]);
    }

    const sourceEntry = await this.#inspect(source.location, "source");
    if (sourceEntry.decision) return sourceEntry.decision;
    const workspaceEntry = await this.#inspect(workspace.location, "workspace");
    if (workspaceEntry.decision) return workspaceEntry.decision;
    if (sourceEntry.entry?.kind !== "file")
      return this.#decision("rejected", "source-not-regular", false, ["source-validation"]);
    if (workspaceEntry.entry?.kind !== "directory")
      return this.#decision("rejected", "workspace-not-directory", false, ["workspace-validation"]);

    const destination = path.resolve(workspace.location, request.materializedArtifact.opaqueMaterializedArtifactReference);
    const relative = path.relative(path.resolve(workspace.location), destination);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
      return this.#decision("rejected", "destination-outside-workspace", false, ["containment-validation"]);
    const destinationEntry = await this.#inspect(destination, "destination");
    if (destinationEntry.decision) return destinationEntry.decision;
    if (destinationEntry.entry?.exists)
      return this.#decision("already-exists", "destination-already-exists", false, ["collision-validation"]);
    try {
      await this.#filesystem.copyExclusive(source.location, destination);
    } catch (error) {
      return this.#decision(
        isNodeError(error, "EEXIST") ? "already-exists" : "failed",
        isNodeError(error, "EEXIST") ? "destination-already-exists" : "copy-failed",
        false,
        ["copy"],
      );
    }
    this.#completedRequests.add(request.requestIdentity);
    return this.#decision("materialized", "materialization-completed", true,
      ["request-validation", "policy-validation", "ownership-validation", "reference-validation",
        "source-resolution", "workspace-resolution", "source-validation", "workspace-validation",
        "containment-validation", "collision-validation", "copy", "result-projection"],
      request.materializedArtifact.opaqueMaterializedArtifactReference);
  }

  #ownershipMatches(request: InputMaterializationRequest, context: InputMaterializationContext): boolean {
    const ownership = request.ownership;
    return ownership.projectionVersion === "1.0" &&
      ownership.authenticatedTenantReference === ownership.requestTenantReference &&
      ownership.authenticatedTenantReference === ownership.sourceTenantReference &&
      ownership.authenticatedTenantReference === ownership.workspaceTenantReference &&
      ownership.authenticatedOwnershipReference === ownership.sourceOwnershipReference &&
      ownership.authenticatedOwnershipReference === ownership.workspaceOwnershipReference &&
      ownership.authenticatedOwnershipReference === ownership.operationOwnershipReference &&
      request.workspace.opaqueWorkspaceReference === context.executionWorkspaceReference &&
      request.operationIdentity === context.executionOperationIdentity;
  }

  async #inspect(location: string, target: "source" | "workspace" | "destination"):
  Promise<Readonly<{ entry?: FilesystemEntry; decision?: InputMaterializationDecision }>> {
    try {
      const entry = { ...(await this.#filesystem.inspect(location)) };
      if (!entry.exists && target === "source")
        return { decision: this.#decision("rejected", "source-not-found", false, ["source-validation"]) };
      if (!entry.exists && target === "workspace")
        return { decision: this.#decision("rejected", "workspace-not-found", false, ["workspace-validation"]) };
      return { entry };
    } catch {
      return {
        decision: this.#decision("unavailable",
          target === "source" ? "source-unavailable" :
            target === "workspace" ? "workspace-unavailable" : "dependency-failure",
          false, [target === "source" ? "source-validation" :
            target === "workspace" ? "workspace-validation" : "collision-validation"]),
      };
    }
  }

  #decision(
    classification: InputMaterializationClassification,
    reasonCode: InputMaterializationReasonCode,
    available: boolean,
    stages: readonly InputMaterializationAuditEntry["stage"][],
    materializedReference?: string,
  ): InputMaterializationDecision {
    const retryClassification = retryFor(classification);
    return deepFreeze({
      decisionVersion: "1.0",
      classification,
      reasonCode,
      materializedArtifactAvailable: available,
      ...(available && materializedReference
        ? { materializedArtifact: {
          referenceVersion: "1.0" as const,
          opaqueMaterializedArtifactReference: materializedReference,
        } }
        : {}),
      retryClassification,
      audit: {
        auditVersion: "1.0",
        entries: stages.map((stage, sequence) => ({
          entryVersion: "1.0", sequence, stage, classification, reasonCode, retryClassification,
        })),
      },
    });
  }
}
