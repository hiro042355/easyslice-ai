import type {
  InputMaterializationCapability,
  InputMaterializationContext,
  InputMaterializationDecision,
  InputMaterializationRequest,
} from "./types";
import type {
  ProductionMaterializationStrategyCapability,
} from "./productionMaterializationProviderTypes";

export type FilesystemMaterializationStrategyAdapterDependencies =
  Readonly<{
    filesystemAdapter: InputMaterializationCapability;
  }>;

export type FilesystemMaterializationStrategyAdapter =
  ProductionMaterializationStrategyCapability;

export type DeterministicFilesystemMaterializationAdapterMode =
  | "synchronous"
  | "asynchronous"
  | "throw"
  | "reject";

export type DeterministicFilesystemMaterializationAdapterInvocation =
  Readonly<{
    request: InputMaterializationRequest;
    context: InputMaterializationContext;
  }>;

export type DeterministicFilesystemMaterializationStrategyAdapterFixture =
  Readonly<{
    strategy: FilesystemMaterializationStrategyAdapter;
    filesystemAdapter: InputMaterializationCapability;
    invocationCount(): number;
    invocationOrder(): readonly string[];
    invocations():
      readonly DeterministicFilesystemMaterializationAdapterInvocation[];
    returnedDecision(): InputMaterializationDecision;
  }>;
