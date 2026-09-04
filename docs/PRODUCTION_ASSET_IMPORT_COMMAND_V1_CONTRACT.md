# Production Asset Import Command V1

`POST /api/v1/assets/import` is the single production asset-import command.
It requires authenticated owner identity, same-origin validation, the existing
PostgreSQL-backed production CSRF token, a bounded `Idempotency-Key` header,
and the exact `{ "requestVersion": "1.0", "sourceUrl": string }` body.

The server reuses the canonical URL classifier. V1 supports only canonical
YouTube inputs and performs no generic URL fetch. Durable idempotency is keyed
by `(owner_uid, idempotency_key)` and binds the request to a framed SHA-256 of
the canonical source identity. Replays never start another acquisition.

The V1 importer reuses the existing packaged yt-dlp, MP4 inspection, GCS, and
Job/Media ownership behavior behind the asset-import service boundary. The
legacy `/api/youtube/ingest` command is retired with `410`. Provider-specific
and AWS experiment behavior is outside this contract.
