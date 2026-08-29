# AWS acquisition egress experiment

Isolated, short-lived comparison infrastructure. This root uses its own local
Terraform state and must never share the Production GCP state root.

The first approved plan/apply provisions readiness infrastructure only. It does
not contain a YouTube URL and the fixed `run-once` entry point fails closed until
a separate Owner-approved action populates its local approval authority.

The sole controlled target authority is the root-owned, mode `0600`, non-symlink
file `/opt/nexcut-experiment/OWNER_ATTEMPT_APPROVED`. Its exact JSON contract is
`schemaVersion`, UUIDv4 `acquisitionId`, and one canonical public YouTube
`sourceUrl`. The SSM runbook exposes no target parameter, and `run-once` rejects
arguments and environment target overrides.

`ATTEMPT_CONSUMPTION_BOUNDARY` is the atomic creation of
`/opt/nexcut-experiment/attempt.claimed`, after local configuration, image, and
readiness checks and immediately before the sole Worker acquisition POST. Local
preflight failures do not create it. It is never removed after acquisition
success or failure, preventing a second Worker/yt-dlp invocation. A narrow,
fail-closed crash window remains between marker creation and Worker receipt of
the POST: the authorization can be consumed without an external request, but a
second external request is still blocked.

The Worker additionally scopes explicit yt-dlp zero-retry arguments to the
closed `EXPERIMENT` runtime/control mode pair: HTTP, fragment, extractor, and
file-access retries are all `0`. Unavailable fragments abort instead of being
skipped. Production mode retains its existing behavior. This prevents an
automatic re-attempt; it does not eliminate the normal metadata, player,
provider, manifest, and media requests required inside one acquisition.

Security boundaries: no ingress, no SSH key, IMDSv2 required, one Elastic IP,
SSM-only execution, ambient AWS role to GCP WIF, dedicated GCP service account
and bucket, and an eight-hour instance-initiated termination timer.

`/opt/nexcut-experiment/verify-safeguard` is the repository-owned, fail-closed
timer verifier. It reads typed `uint64` timer deadlines from systemd D-Bus and
compares realtime and monotonic deadlines only with the corresponding local
clock. Missing or unparseable evidence is `TIMESTAMP_UNAVAILABLE`, conflicting
clock evidence is `INCONSISTENT`, and the human-readable `list-timers` table is
never timing authority.
