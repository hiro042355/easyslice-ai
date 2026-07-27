import type {
  SourceArtifactAuthorityResolutionInput,
} from "../sourceArtifactAuthority/types";
import type {
  MultiCutSourceArtifactHandoff,
} from "./multiCutSourceArtifactHandoffTypes";

const createAuthorityInput = (): SourceArtifactAuthorityResolutionInput =>
  Object.freeze({
    inputVersion: "1.0",
    sourceArtifact: Object.freeze({
      referenceVersion: "1.0",
      opaqueSourceArtifactReference: "source:multi-cut:reference",
    }),
    context: Object.freeze({
      contextVersion: "1.0",
      requestIdentity: "request:multi-cut:reference",
      operationIdentity: "operation:multi-cut:reference",
      ownershipScope: Object.freeze({
        scopeVersion: "1.0",
        sourceTenantReference: "tenant:reference",
        sourceOwnershipReference: "ownership:reference",
      }),
      authorizationEvidence: Object.freeze({
        evidenceVersion: "1.0",
        authorityDecisionReference: "authority-decision:reference",
        decision: "authorized",
      }),
    }),
  });

export const createReferenceMultiCutSourceArtifactHandoff =
  (): MultiCutSourceArtifactHandoff =>
    Object.freeze({
      handoffVersion: "1.0",
      authorityInput: createAuthorityInput(),
    });

export const createInvalidMultiCutSourceArtifactHandoffVersionCandidate =
  (): unknown => ({
    handoffVersion: "2.0",
    authorityInput: createAuthorityInput(),
  });

export const createMissingMultiCutSourceArtifactHandoffFieldCandidate =
  (): unknown => ({
    handoffVersion: "1.0",
  });
