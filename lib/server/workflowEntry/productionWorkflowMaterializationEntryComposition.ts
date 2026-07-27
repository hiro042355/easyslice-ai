import {
  createAuthorityLocatorResolutionAdapter,
} from "../authorityLocatorResolution/authorityLocatorResolutionAdapter";
import {
  createAuthorityLocatorRuntimeBinding,
} from "../authorityLocatorRuntimeBinding/authorityLocatorRuntimeBinding";
import {
  createAuthorityLocatorRuntimeComposition,
} from "../authorityLocatorRuntimeComposition/authorityLocatorRuntimeComposition";
import type {
  AuthorityLocatorRuntimeCompositionDependencies,
} from "../authorityLocatorRuntimeComposition/types";
import {
  createProductionFilesystemMaterializationComposition,
} from "../inputMaterialization/productionFilesystemMaterializationComposition";
import type {
  InputMaterializationDependencies,
} from "../inputMaterialization/referenceFilesystemInputMaterializationAdapter";
import {
  createLocatorMaterializationHandoff,
} from "../locatorMaterializationHandoff/locatorMaterializationHandoff";
import {
  createLocatorMaterializationHandoffValidation,
} from "../locatorMaterializationHandoff/validation";
import {
  createLocatorMaterializationRuntimeBinding,
} from "../locatorMaterializationRuntimeBinding/locatorMaterializationRuntimeBinding";
import type {
  WorkflowMaterializationEntryInput,
  WorkflowMaterializationEntryResult,
} from "./workflowMaterializationEntryContractTypes";
import {
  executeWorkflowMaterializationEntryIntegration,
} from "./workflowMaterializationEntryIntegration";

type ProductionWorkflowMaterializationEntryCompositionDependencies =
  Readonly<{
    authorityLocator: AuthorityLocatorRuntimeCompositionDependencies;
    materialization: InputMaterializationDependencies;
  }>;

export const createProductionWorkflowMaterializationEntryComposition = (
  dependencies:
    ProductionWorkflowMaterializationEntryCompositionDependencies,
) => {
  const authorityLocatorRuntimeComposition =
    createAuthorityLocatorRuntimeComposition(
      dependencies.authorityLocator,
    );
  const authorityLocatorBinding = createAuthorityLocatorRuntimeBinding({
    composition: authorityLocatorRuntimeComposition,
    adapter: createAuthorityLocatorResolutionAdapter(),
  });
  const handoff = createLocatorMaterializationHandoff(
    createLocatorMaterializationHandoffValidation(),
  );
  const materializationRuntimeComposition =
    createProductionFilesystemMaterializationComposition(
      dependencies.materialization,
    );
  const materializationBinding =
    createLocatorMaterializationRuntimeBinding();
  const integration = Object.freeze({
    execute(
      input: WorkflowMaterializationEntryInput,
    ): Promise<WorkflowMaterializationEntryResult> {
      return executeWorkflowMaterializationEntryIntegration(input, {
        authorityLocatorBinding,
        handoff,
        materializationBinding,
        materializationRuntimeComposition,
      });
    },
  });

  return Object.freeze({
    authorityLocatorRuntimeComposition,
    authorityLocatorBinding,
    handoff,
    materializationRuntimeComposition,
    materializationBinding,
    integration,
  });
};
