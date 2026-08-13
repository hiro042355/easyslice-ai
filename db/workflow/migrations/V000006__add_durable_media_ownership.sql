CREATE TABLE workflow.jobs (
  id uuid PRIMARY KEY,
  owner_uid text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT ck_jobs_owner_uid CHECK (length(owner_uid) > 0),
  CONSTRAINT ck_jobs_status CHECK (status IN ('created', 'processing', 'completed', 'failed'))
);

CREATE INDEX ix_jobs_owner_created
  ON workflow.jobs (owner_uid, created_at DESC);

CREATE TABLE workflow.media (
  id uuid PRIMARY KEY,
  job_id uuid NOT NULL,
  storage_key text NOT NULL UNIQUE,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT fk_media_job FOREIGN KEY (job_id) REFERENCES workflow.jobs(id) ON DELETE CASCADE,
  CONSTRAINT ck_media_kind CHECK (kind IN ('input', 'work')),
  CONSTRAINT ck_media_storage_key CHECK (
    storage_key ~ '^jobs/[0-9a-f-]{36}/(input|work)/[0-9a-f-]{36}\.[a-z0-9]+$'
  )
);

CREATE INDEX ix_media_job_created
  ON workflow.media (job_id, created_at DESC);

CREATE TABLE workflow.exports (
  id uuid PRIMARY KEY,
  job_id uuid NOT NULL,
  storage_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT fk_exports_job FOREIGN KEY (job_id) REFERENCES workflow.jobs(id) ON DELETE CASCADE,
  CONSTRAINT ck_exports_storage_key CHECK (
    storage_key ~ '^jobs/[0-9a-f-]{36}/output/[0-9a-f-]{36}\.[a-z0-9]+$'
  )
);

CREATE INDEX ix_exports_job_created
  ON workflow.exports (job_id, created_at DESC);
