import { acquisitionRequestFingerprint, validateAcquisitionRequest } from "./contracts";
import type { AcquisitionIdempotencyStore } from "./idempotency";
import type { AcquisitionRuntime, PoTokenProvider } from "./sourceAdapter";
import { SourceAdapterRegistry } from "./sourceAdapter";
import { cleanupAcquisitionWorkspace, createAcquisitionWorkspace } from "./workspace";
import { AcquisitionWorkerFailure, type AcquisitionArtifactHandoff, type AcquisitionMediaMetadata, type AcquisitionRequest, type AcquisitionResult } from "./types";
import { AcquisitionTelemetryCollector, type AcquisitionSafeTelemetry } from "./telemetry";

export interface ArtifactHandoffStore {
  create(artifact: Readonly<{
  acquisitionId: string;
  path: string;
  media: AcquisitionMediaMetadata;
  }>): Promise<AcquisitionArtifactHandoff>;
}

export type AcquisitionMediaInspector = (path: string, runtime: AcquisitionRuntime, maxBytes: number) => Promise<AcquisitionMediaMetadata>;

export class AcquisitionWorkerCore {
  constructor(private readonly dependencies: Readonly<{
    adapters: SourceAdapterRegistry;
    idempotency: AcquisitionIdempotencyStore;
    runtime: AcquisitionRuntime;
    authorityRoot: string;
    inspectMedia: AcquisitionMediaInspector;
    handoffStore: ArtifactHandoffStore;
    provider?: PoTokenProvider;
    telemetryRuntime?: Readonly<{ pluginArtifact: boolean; nodeConfigured: boolean; nodeExecutable: boolean; nodeVersionMatch: boolean; ejsAvailable: boolean }>;
    retainTelemetry?(acquisitionId: string, telemetry: AcquisitionSafeTelemetry): void;
  }>) {}

  async execute(input: unknown, signal?: AbortSignal): Promise<AcquisitionResult> {
    let request: ReturnType<typeof validateAcquisitionRequest>;
    try {
      request = validateAcquisitionRequest(input);
    } catch (error) {
      const failure = error instanceof AcquisitionWorkerFailure ? error : new AcquisitionWorkerFailure("invalid-acquisition-request");
      const acquisitionId = typeof (input as Partial<AcquisitionRequest> | undefined)?.acquisitionId === "string"
        ? (input as Partial<AcquisitionRequest>).acquisitionId!
        : "invalid";
      return Object.freeze({ acquisitionId, status: "failed", errorCode: failure.code, retryable: failure.retryable });
    }
    return this.dependencies.idempotency.execute(
      request.acquisitionId,
      acquisitionRequestFingerprint(request),
      async (leaseSignal) => {
        let workspace: Awaited<ReturnType<typeof createAcquisitionWorkspace>> | undefined;
        const telemetry = new AcquisitionTelemetryCollector(this.dependencies.telemetryRuntime ?? {
          pluginArtifact: false, nodeConfigured: false, nodeExecutable: false, nodeVersionMatch: false, ejsAvailable: false,
        });
        try {
          telemetry.executionBegan();
          const executionSignal = signal ? AbortSignal.any([signal, leaseSignal]) : leaseSignal;
          if (executionSignal.aborted) throw new AcquisitionWorkerFailure("acquisition-cancelled", true);
          workspace = await createAcquisitionWorkspace(request.acquisitionId, this.dependencies.authorityRoot);
          const adapter = this.dependencies.adapters.resolve(request);
          await adapter.acquire({ request, workspace, runtime: this.dependencies.runtime, provider: this.dependencies.provider,
            telemetry, signal: executionSignal });
          const media = await this.dependencies.inspectMedia(workspace.mediaPath, this.dependencies.runtime, request.maxBytes);
          const handoff = await this.dependencies.handoffStore.create({ acquisitionId: request.acquisitionId,
            path: workspace.mediaPath, media });
          return Object.freeze({ acquisitionId: request.acquisitionId, status: "succeeded",
            artifactReference: handoff.artifactReference, media, handoff });
        } catch (error) {
          const failure = error instanceof AcquisitionWorkerFailure ? error : new AcquisitionWorkerFailure("unknown-acquisition-failure");
          telemetry.failure(failure.code);
          return Object.freeze({ acquisitionId: request.acquisitionId, status: "failed", errorCode: failure.code, retryable: failure.retryable });
        } finally {
          this.dependencies.retainTelemetry?.(request.acquisitionId, telemetry.snapshot());
          if (workspace) await cleanupAcquisitionWorkspace(request.acquisitionId, this.dependencies.authorityRoot);
        }
      },
      signal,
    ).catch((error: unknown) => {
      const failure = error instanceof AcquisitionWorkerFailure ? error : new AcquisitionWorkerFailure("unknown-acquisition-failure");
      return Object.freeze({ acquisitionId: request.acquisitionId, status: "failed", errorCode: failure.code, retryable: failure.retryable });
    });
  }

  lookup(acquisitionId: string): Promise<AcquisitionResult | undefined> {
    return this.dependencies.idempotency.lookup(acquisitionId);
  }
}
