import type {
  AuthorityLocatorRuntimeBindingResult,
} from "../authorityLocatorRuntimeBinding/types";
import type {
  MaterializationRuntimeComposition,
} from "../inputMaterialization/materializationRuntimeCompositionTypes";
import type {
  LocatorMaterializationHandoffResult,
} from "../locatorMaterializationHandoff/types";
import type {
  LocatorMaterializationRuntimeBindingResult,
} from "../locatorMaterializationRuntimeBinding/types";
import {
  executeWorkflowMaterializationEntryIntegration,
} from "./workflowMaterializationEntryIntegration";
import type {
  WorkflowMaterializationEntryInput,
  WorkflowMaterializationEntryResult,
} from "./workflowMaterializationEntryContractTypes";

export type ReferenceWorkflowMaterializationEntryIntegrationScenario =
  Readonly<{
    authorityLocatorBindingResult: AuthorityLocatorRuntimeBindingResult;
    handoffResult?: LocatorMaterializationHandoffResult;
    materializationRuntimeBindingResult?:
      LocatorMaterializationRuntimeBindingResult;
  }>;

export const createReferenceWorkflowMaterializationEntryIntegrationFixture =
  (
    scenario: ReferenceWorkflowMaterializationEntryIntegrationScenario,
    materializationRuntimeComposition: MaterializationRuntimeComposition,
  ) => {
    const order: string[] = [];
    const receivedInputs: WorkflowMaterializationEntryInput[] = [];
    let authorityInvocations = 0;
    let locatorInvocations = 0;
    let handoffInvocations = 0;
    let materializationBindingInvocations = 0;

    return Object.freeze({
      async execute(
        input: WorkflowMaterializationEntryInput,
      ): Promise<WorkflowMaterializationEntryResult> {
        receivedInputs.push(input);
        return executeWorkflowMaterializationEntryIntegration(input, {
          authorityLocatorBinding: Object.freeze({
            async execute(): Promise<AuthorityLocatorRuntimeBindingResult> {
              authorityInvocations += 1;
              order.push("authority");
              if (
                scenario.authorityLocatorBindingResult.status === "completed" ||
                (
                  scenario.authorityLocatorBindingResult.status === "failed" &&
                  scenario.authorityLocatorBindingResult.stage === "locator"
                )
              ) {
                locatorInvocations += 1;
                order.push("locator");
              }
              return scenario.authorityLocatorBindingResult;
            },
          }),
          handoff: Object.freeze({
            prepare(): LocatorMaterializationHandoffResult {
              handoffInvocations += 1;
              order.push("handoff");
              return scenario.handoffResult ??
                Object.freeze({
                  resultVersion: "1.0",
                  status: "rejected",
                  failure: "internal-failure",
                });
            },
          }),
          materializationBinding: Object.freeze({
            async bind(): Promise<
              LocatorMaterializationRuntimeBindingResult
            > {
              materializationBindingInvocations += 1;
              order.push("materialization");
              return scenario.materializationRuntimeBindingResult ??
                Object.freeze({
                  resultVersion: "1.0",
                  status: "rejected",
                  stage: "internal",
                  failure: "internal-failure",
                });
            },
          }),
          materializationRuntimeComposition,
        });
      },
      invocationOrder: () => Object.freeze([...order]),
      authorityInvocations: () => authorityInvocations,
      locatorInvocations: () => locatorInvocations,
      handoffInvocations: () => handoffInvocations,
      materializationBindingInvocations: () =>
        materializationBindingInvocations,
      receivedInputs: () => Object.freeze([...receivedInputs]),
    });
  };
