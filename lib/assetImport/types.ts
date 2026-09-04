export type AssetImportState =
  | "acquiring"
  | "succeeded"
  | "failed_retryable"
  | "failed_final"
  | "reconciliation_required";

export type CanonicalAssetImportSource = Readonly<{
  platform: "youtube";
  videoId: string;
  normalizedUrl: string;
}>;

export type AssetImportSuccess = Readonly<{
  responseVersion: "1.0";
  status: "succeeded";
  jobId: string;
  mediaId: string;
  durationSeconds: number;
  source: CanonicalAssetImportSource;
}>;

export type AssetImportResult =
  | AssetImportSuccess
  | Readonly<{ responseVersion: "1.0"; status: "in_progress" | "reconciliation_required"; retryAfterClass: "short" }>
  | Readonly<{ responseVersion: "1.0"; status: "failed"; code: "acquisition_retryable" | "acquisition_final" | "persistence_failure" | "timeout"; retryable: boolean }>;
