import {
  createFilesystemMaterializationStrategyAdapter,
} from "./filesystemMaterializationStrategyAdapter";
import type {
  DeterministicFilesystemMaterializationAdapterInvocation,
  DeterministicFilesystemMaterializationAdapterMode,
  DeterministicFilesystemMaterializationStrategyAdapterFixture,
} from "./filesystemMaterializationStrategyAdapterTypes";
import {
  copyInputMaterializationDecision,
} from "./productionMaterializationProvider";
import type {
  InputMaterializationContext,
  InputMaterializationDecision,
  InputMaterializationRequest,
} from "./types";

const copyRequest = (
  request: InputMaterializationRequest,
): InputMaterializationRequest => Object.freeze({
  ...request,
  sourceArtifact: Object.freeze({ ...request.sourceArtifact }),
  workspace: Object.freeze({ ...request.workspace }),
  materializedArtifact: Object.freeze({ ...request.materializedArtifact }),
  ownership: Object.freeze({ ...request.ownership }),
  policy: Object.freeze({ ...request.policy }),
});

const copyContext = (
  context: InputMaterializationContext,
): InputMaterializationContext => Object.freeze({ ...context });

export const createDeterministicFilesystemMaterializationStrategyAdapterFixture =
  (
    decision: InputMaterializationDecision,
    mode: DeterministicFilesystemMaterializationAdapterMode = "synchronous",
  ): DeterministicFilesystemMaterializationStrategyAdapterFixture => {
    const fixedDecision = copyInputMaterializationDecision(decision);
    const captured:
      DeterministicFilesystemMaterializationAdapterInvocation[] = [];
    const order: string[] = [];
    const filesystemAdapter = Object.freeze({
      materialize(
        request: InputMaterializationRequest,
        context: InputMaterializationContext,
      ): InputMaterializationDecision | Promise<InputMaterializationDecision> {
        order.push("filesystem-adapter");
        captured.push(Object.freeze({
          request: copyRequest(request),
          context: copyContext(context),
        }));
        if (mode === "throw") {
          throw new Error("deterministic filesystem adapter failure");
        }
        if (mode === "reject") {
          return Promise.reject(
            new Error("deterministic filesystem adapter rejection"),
          );
        }
        const result = copyInputMaterializationDecision(fixedDecision);
        return mode === "asynchronous" ? Promise.resolve(result) : result;
      },
    });

    return Object.freeze({
      strategy: createFilesystemMaterializationStrategyAdapter({
        filesystemAdapter,
      }),
      filesystemAdapter,
      invocationCount(): number {
        return captured.length;
      },
      invocationOrder(): readonly string[] {
        return Object.freeze([...order]);
      },
      invocations():
        readonly DeterministicFilesystemMaterializationAdapterInvocation[] {
        return Object.freeze(captured.map((invocation) => Object.freeze({
          request: copyRequest(invocation.request),
          context: copyContext(invocation.context),
        })));
      },
      returnedDecision(): InputMaterializationDecision {
        return copyInputMaterializationDecision(fixedDecision);
      },
    });
  };
