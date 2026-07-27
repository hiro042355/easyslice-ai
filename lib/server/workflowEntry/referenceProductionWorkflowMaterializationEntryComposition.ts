import type {
  AuthorityLocatorRuntimeCompositionDependencies,
} from "../authorityLocatorRuntimeComposition/types";
import type {
  InputMaterializationDependencies,
} from "../inputMaterialization/referenceFilesystemInputMaterializationAdapter";
import {
  createProductionWorkflowMaterializationEntryComposition,
} from "./productionWorkflowMaterializationEntryComposition";

export const createReferenceProductionWorkflowMaterializationEntryComposition =
  () => {
    let runtimeInvocations = 0;
    const authorityLocator:
      AuthorityLocatorRuntimeCompositionDependencies = Object.freeze({
        authority: Object.freeze({
          policy: Object.freeze({
            evaluate() {
              runtimeInvocations += 1;
              return Object.freeze({
                resultVersion: "1.0",
                status: "rejected",
                failure: "internal-failure",
              }) as never;
            },
          }),
          validation: Object.freeze({
            validateProviderInput() {
              runtimeInvocations += 1;
              return Object.freeze({
                resultVersion: "1.0",
                status: "rejected",
                failure: "internal-failure",
              });
            },
          }),
        }),
        locator: Object.freeze({
          strategy: Object.freeze({
            locate() {
              runtimeInvocations += 1;
              return Object.freeze({
                resultVersion: "2.0",
                status: "internal-failure",
              }) as never;
            },
          }),
          validation: Object.freeze({
            validateProviderInput() {
              runtimeInvocations += 1;
              return Object.freeze({
                resultVersion: "1.0",
                status: "rejected",
                failure: "internal-failure",
              }) as never;
            },
          }),
        }),
      });
    const materialization:
      InputMaterializationDependencies = Object.freeze({
        sourceLocator: Object.freeze({
          locateSource() {
            runtimeInvocations += 1;
            return { location: "unused-source" };
          },
        }),
        workspaceLocator: Object.freeze({
          locateWorkspace() {
            runtimeInvocations += 1;
            return { location: "unused-workspace" };
          },
        }),
        filesystem: Object.freeze({
          inspect() {
            runtimeInvocations += 1;
            return { exists: false, kind: "other" as const };
          },
          copyExclusive() {
            runtimeInvocations += 1;
          },
        }),
      });

    return Object.freeze({
      composition:
        createProductionWorkflowMaterializationEntryComposition({
          authorityLocator,
          materialization,
        }),
      runtimeInvocations: () => runtimeInvocations,
      constructionOrder: () => Object.freeze([
        "authority-runtime-composition",
        "locator-runtime-composition",
        "authority-locator-binding",
        "locator-materialization-handoff",
        "production-filesystem-materialization-composition",
        "locator-materialization-runtime-binding",
        "workflow-materialization-entry-integration",
      ]),
    });
  };
