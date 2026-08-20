import type { ValidatedAcquisitionRequest } from "./contracts";
import type { AcquisitionWorkspace } from "./workspace";

export type AcquisitionRuntime = Readonly<{
  ytDlpExecutable: string;
  ffmpegExecutable: string;
  nodeExecutable: string;
  nodeMajorVersion: number;
}>;

export type PoTokenProviderStatus = "not-configured" | "available" | "unavailable" | "failed";

export interface PoTokenProvider {
  readonly authority: string;
  status(signal?: AbortSignal): Promise<PoTokenProviderStatus>;
  ytDlpArguments(): readonly string[];
}

export type SourceAcquisitionContext = Readonly<{
  request: ValidatedAcquisitionRequest;
  workspace: AcquisitionWorkspace;
  runtime: AcquisitionRuntime;
  provider?: PoTokenProvider;
  signal?: AbortSignal;
}>;

export interface SourceAdapter {
  readonly source: ValidatedAcquisitionRequest["source"];
  supports(request: ValidatedAcquisitionRequest): boolean;
  acquire(context: SourceAcquisitionContext): Promise<void>;
}

export class SourceAdapterRegistry {
  constructor(private readonly adapters: readonly SourceAdapter[]) {}

  resolve(request: ValidatedAcquisitionRequest): SourceAdapter {
    const matches = this.adapters.filter((adapter) => adapter.supports(request));
    if (matches.length !== 1) throw new Error(matches.length === 0 ? "unsupported-source" : "ambiguous-source-adapter");
    return matches[0]!;
  }
}
