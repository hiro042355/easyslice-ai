# Database Implementation Specification: Relational Schema and Constraints

This document defines the exact PostgreSQL DDL, types, constraints, and indexes required for the publication domain and Bilibili publisher integration.

---

## 1. Schema Definitions
The publication layer utilizes two PostgreSQL schemas:
- `workflow`: Managed in `hiro042355/easyslice-ai` via Flyway (Target migration: `V000010__add_publication_management_foundation.sql`).
- `publisher`: Managed in `hiro042355/nexcut-bilibili-publisher` for microservice-local idempotency and chunk tracking.

---

## 2. Table Specifications (`workflow` schema)

### 2.1 Table: `workflow.publications`
Operational master state entity for video publications across platforms.

```sql
CREATE TABLE workflow.publications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_uid text NOT NULL,
  tenant_id text NOT NULL DEFAULT 'default',
  job_id uuid NOT NULL,
  export_id uuid NOT NULL,
  platform text NOT NULL,
  status text NOT NULL DEFAULT 'QUEUED',
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  platform_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_applied_sequence integer NOT NULL DEFAULT 0,
  current_attempt integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  external_publication_id text,
  external_url text,
  failure_reason text,
  revision bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT pk_publications PRIMARY KEY (id),
  CONSTRAINT uq_publications_id_tenant UNIQUE (id, tenant_id),
  CONSTRAINT ck_publications_platform CHECK (platform IN ('bilibili', 'youtube', 'tiktok')),
  CONSTRAINT ck_publications_status CHECK (
    status IN ('QUEUED', 'DISPATCHED', 'UPLOADING', 'SUBMITTED', 'PROCESSING', 'PUBLISHED', 'FAILED', 'RECONCILING')
  ),
  CONSTRAINT ck_publications_attempts CHECK (current_attempt >= 0 AND max_attempts > 0),
  CONSTRAINT ck_publications_sequence CHECK (last_applied_sequence >= 0),
  CONSTRAINT ck_publications_revision CHECK (revision >= 0),

  CONSTRAINT fk_publications_job_owner
    FOREIGN KEY (job_id, owner_uid) REFERENCES workflow.jobs(id, owner_uid) ON DELETE RESTRICT,
  CONSTRAINT fk_publications_export_job
    FOREIGN KEY (export_id, job_id) REFERENCES workflow.exports(id, job_id) ON DELETE RESTRICT
);

CREATE INDEX ix_publications_owner_status ON workflow.publications (owner_uid, status, updated_at DESC);
CREATE INDEX ix_publications_platform_external ON workflow.publications (platform, external_publication_id)
  WHERE external_publication_id IS NOT NULL;
```

---

### 2.2 Table: `workflow.publication_outbox`
Transactional outbox pattern guaranteeing at-least-once delivery to publisher microservices with monotonic lease fencing.

```sql
CREATE TABLE workflow.publication_outbox (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL,
  platform text NOT NULL,
  destination_endpoint text NOT NULL,
  payload jsonb NOT NULL,
  payload_sha256 bytea NOT NULL,
  state text NOT NULL DEFAULT 'PENDING',
  lease_owner text,
  lease_expires_at timestamptz,
  fencing_token bigint NOT NULL DEFAULT 0,
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 10,
  next_attempt_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT pk_publication_outbox PRIMARY KEY (id),
  CONSTRAINT ck_outbox_state CHECK (state IN ('PENDING', 'LEASED', 'DISPATCHED', 'COMPLETED', 'DEADLETTER')),
  CONSTRAINT ck_outbox_hash CHECK (octet_length(payload_sha256) = 32),
  CONSTRAINT ck_outbox_token CHECK (fencing_token >= 0),
  CONSTRAINT fk_outbox_publication
    FOREIGN KEY (publication_id) REFERENCES workflow.publications(id) ON DELETE RESTRICT
);

CREATE INDEX ix_outbox_claim ON workflow.publication_outbox (state, next_attempt_at)
  WHERE state IN ('PENDING', 'LEASED');
```

---

### 2.3 Table: `workflow.publication_events`
Append-only immutable event ledger for event sequencing and audit trails.

```sql
CREATE TABLE workflow.publication_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL,
  sequence_number integer NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  payload_hash bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT pk_publication_events PRIMARY KEY (id),
  CONSTRAINT uq_publication_events_seq UNIQUE (publication_id, sequence_number),
  CONSTRAINT ck_event_seq CHECK (sequence_number > 0),
  CONSTRAINT ck_event_hash CHECK (octet_length(payload_hash) = 32),
  CONSTRAINT fk_events_publication
    FOREIGN KEY (publication_id) REFERENCES workflow.publications(id) ON DELETE RESTRICT
);

CREATE INDEX ix_publication_events_order ON workflow.publication_events (publication_id, sequence_number ASC);
```

---

### 2.4 Table: `workflow.publication_callback_ingress_ledger`
High-volume raw transport log for forensic auditing, partitioned by range.

```sql
CREATE TABLE workflow.publication_callback_ingress_ledger (
  delivery_id uuid NOT NULL DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  platform text NOT NULL,
  transport_headers jsonb NOT NULL,
  raw_payload text NOT NULL,
  payload_sha256 bytea NOT NULL,
  signature_verified boolean NOT NULL DEFAULT false,
  remote_ip inet,

  CONSTRAINT pk_ingress_ledger PRIMARY KEY (delivery_id, received_at),
  CONSTRAINT ck_ingress_hash CHECK (octet_length(payload_sha256) = 32)
) PARTITION BY RANGE (received_at);

-- Monthly partition initialization
CREATE TABLE workflow.publication_callback_ingress_y2026m11 PARTITION OF workflow.publication_callback_ingress_ledger
  FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');
```

---

### 2.5 Table: `workflow.publication_audit_ledger`
Autonomous append-only immutable audit trail recording critical lifecycle events and administrative actions without hard foreign keys to business entities.

```sql
CREATE TABLE workflow.publication_audit_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL,
  owner_uid text NOT NULL,
  tenant_id text NOT NULL DEFAULT 'default',
  event_type text NOT NULL,
  actor text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_sha256 bytea,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT pk_publication_audit_ledger PRIMARY KEY (id),
  CONSTRAINT ck_audit_hash CHECK (payload_sha256 IS NULL OR octet_length(payload_sha256) = 32)
);

CREATE INDEX ix_publication_audit_ledger_pub ON workflow.publication_audit_ledger (publication_id, created_at ASC);
CREATE INDEX ix_publication_audit_ledger_owner ON workflow.publication_audit_ledger (owner_uid, created_at DESC);

-- Immutability enforcement trigger
CREATE OR REPLACE FUNCTION workflow.fn_enforce_immutable_audit()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Audit ledger records are immutable and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_ledger_immutable
BEFORE UPDATE OR DELETE ON workflow.publication_audit_ledger
FOR EACH ROW EXECUTE FUNCTION workflow.fn_enforce_immutable_audit();
```

---

## 3. Table Specifications (`publisher` schema - Microservice Local)

### 3.1 Table: `publisher.durable_ledger`
Ensures that duplicate HTTP requests from the outbox dispatcher are deduplicated atomically.

```sql
CREATE TABLE publisher.durable_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  payload_sha256 bytea NOT NULL,
  status text NOT NULL DEFAULT 'RECEIVED',
  bilibili_upload_token text,
  bilibili_bvid text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),

  CONSTRAINT pk_publisher_ledger PRIMARY KEY (id),
  CONSTRAINT uq_publisher_dedup UNIQUE (publication_id, idempotency_key),
  CONSTRAINT ck_ledger_status CHECK (status IN ('RECEIVED', 'UPLOADING', 'SUBMITTED', 'COMPLETED', 'FAILED'))
);
```
