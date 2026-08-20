import { acquisitionRequestFingerprint, validateAcquisitionRequest } from "./contracts";
import type { AcquisitionIdempotencyStore } from "./idempotency";
import type { AcquisitionRuntime, PoTokenProvider } from "./sourceAdapter";
import { SourceAdapterRegistry } from "./sourceAdapter";
import { cleanupAcquisitionWorkspace, createAcquisitionWorkspace } from "./workspace";
import { AcquisitionWorkerFailure, type AcquisitionMediaMetadata, type AcquisitionRequest, type AcquisitionResult } from "./types";

export type AcquisitionArtifactConsumer = (artifact: Readonly<{
  acquisitionId: string;
  path: string;
  media: AcquisitionMediaMetadata;
}>) => Promise<string>;

export type AcquisitionMediaInspector = (path: string, runtime: AcquisitionRuntime, maxBytes: number) => Promise<AcquisitionMediaMetadata>;

export class AcquisitionWorkerCore {
  constructor(private readonly dependencies: Readonly<{
    adapters: SourceAdapterRegistry;
    idempotency: AcquisitionIdempotencyStore;
    runtime: AcquisitionRuntime;
    authorityRoot: string;
    inspectMedia: AcquisitionMediaInspector;
    consumeArtifact: AcquisitionArtifactConsumer;
    provider?: PoTokenProvider;
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
        try {
          const executionSignal = signal ? AbortSignal.any([signal, leaseSignal]) : leaseSignal;
          if (executionSignal.aborted) throw new AcquisitionWorkerFailure("acquisition-cancelled", true);
          workspace = await createAcquisitionWorkspace(request.acquisitionId, this.dependencies.authorityRoot);
          const adapter = this.dependencies.adapters.resolve(request);
          await adapter.acquire({ request, workspace, runtime: this.dependencies.runtime, provider: this.dependencies.provider, signal: executionSignal });
          const media = await this.dependencies.inspectMedia(workspace.mediaPath, this.dependencies.runtime, request.maxBytes);
          const artifactReference = await this.dependencies.consumeArtifact({ acquisitionId: request.acquisitionId, path: workspace.mediaPath, media });
          return Object.freeze({ acquisitionId: request.acquisitionId, status: "succeeded", artifactReference, media });
        } catch (error) {
          const failure = error instanceof AcquisitionWorkerFailure ? error : new AcquisitionWorkerFailure("unknown-acquisition-failure");
          return Object.freeze({ acquisitionId: request.acquisitionId, status: "failed", errorCode: failure.code, retryable: failure.retryable });
        } finally {
          if (workspace) await cleanupAcquisitionWorkspace(request.acquisitionId, this.dependencies.authorityRoot);
        }
      },
      signal,
    ).catch((error: unknown) => {
      const failure = error instanceof AcquisitionWorkerFailure ? error : new AcquisitionWorkerFailure("unknown-acquisition-failure");
      return Object.freeze({ acquisitionId: request.acquisitionId, status: "failed", errorCode: failure.code, retryable: failure.retryable });
    });
  }
}
