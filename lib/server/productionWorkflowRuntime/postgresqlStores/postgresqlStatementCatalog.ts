import type { PostgreSQLSliceAStatementCatalog } from "./types";

const statementMetadata: Readonly<Record<string, Readonly<{ parameterCount: number; cardinality: "none" | "single" | "many"; accessMode: "read" | "write" }>>> = Object.freeze({
  "slice-a.final.insert": { parameterCount: 12, cardinality: "many", accessMode: "write" },
  "slice-a.final.read": { parameterCount: 1, cardinality: "single", accessMode: "read" },
  "slice-a.final.cas": { parameterCount: 4, cardinality: "single", accessMode: "write" },
  "slice-a.reference.insert": { parameterCount: 13, cardinality: "many", accessMode: "write" },
  "slice-a.reference.read": { parameterCount: 1, cardinality: "single", accessMode: "read" },
  "slice-a.reference.cas": { parameterCount: 4, cardinality: "single", accessMode: "write" },
  "slice-a.outbox.insert": { parameterCount: 7, cardinality: "many", accessMode: "write" },
  "slice-a.outbox.read": { parameterCount: 1, cardinality: "single", accessMode: "read" },
  "slice-a.outbox.claim": { parameterCount: 4, cardinality: "many", accessMode: "write" },
  "slice-a.outbox.renew": { parameterCount: 5, cardinality: "many", accessMode: "write" },
  "slice-a.outbox.release": { parameterCount: 5, cardinality: "many", accessMode: "write" },
  "slice-a.outbox.reconcile": { parameterCount: 3, cardinality: "many", accessMode: "write" },
  "slice-a.outbox.deliver": { parameterCount: 3, cardinality: "many", accessMode: "write" },
  "slice-a.atomic.lookup": { parameterCount: 3, cardinality: "single", accessMode: "read" },
});

export const POSTGRESQL_SLICE_A_STATEMENT_CATALOG: PostgreSQLSliceAStatementCatalog = Object.freeze({
  catalogVersion: "1.0",
  statements: Object.freeze([
    { statementId: "slice-a.final.insert", sql: `INSERT INTO workflow.workflow_final_results (result_id,result_digest_algorithm,result_digest_version,result_digest,tenant_digest_algorithm,tenant_digest_version,tenant_digest,region,operation,result_status,result_version,record_version,schema_version,revision,terminal_payload,expires_at,retention_class,deletion_state,legal_hold_state) VALUES ($1,'sha256',1,$2,'sha256',1,$3,$4,$5,$6,1,1,1,$7,$8::jsonb,$9,$10,$11,$12) ON CONFLICT DO NOTHING RETURNING *` },
    { statementId: "slice-a.final.read", sql: `SELECT * FROM workflow.workflow_final_results WHERE result_digest_algorithm='sha256' AND result_digest_version=1 AND result_digest=$1` },
    { statementId: "slice-a.final.cas", sql: `UPDATE workflow.workflow_final_results SET deletion_state=$2,legal_hold_state=$3,revision=revision+1,updated_at=transaction_timestamp() WHERE result_digest_algorithm='sha256' AND result_digest_version=1 AND result_digest=$1 AND revision=$4 AND result_status IN ('completed','degraded','partial','failed','cancelled') RETURNING *` },
    { statementId: "slice-a.reference.insert", sql: `INSERT INTO workflow.workflow_result_references (reference_id,token_digest_algorithm,token_digest_version,token_digest,result_id,reference_kind,operation,owner_digest,tenant_digest,region,reference_state,record_version,schema_version,revision,expires_at,deletion_state,legal_hold_state) VALUES ($1,'sha256',1,$2,$3,$4,$5,$6,$7,$8,$9,1,1,$10,$11,$12,$13) ON CONFLICT DO NOTHING RETURNING *` },
    { statementId: "slice-a.reference.read", sql: `SELECT * FROM workflow.workflow_result_references WHERE token_digest_algorithm='sha256' AND token_digest_version=1 AND token_digest=$1` },
    { statementId: "slice-a.reference.cas", sql: `UPDATE workflow.workflow_result_references SET reference_state=$3,deletion_state=$4,revision=revision+1,updated_at=transaction_timestamp() WHERE token_digest_algorithm='sha256' AND token_digest_version=1 AND token_digest=$1 AND revision=$2 AND ($3<>'deleted' OR $4='deleted') RETURNING *` },
    { statementId: "slice-a.outbox.insert", sql: `INSERT INTO workflow.workflow_outbox_events (event_id,event_digest_algorithm,event_digest_version,event_digest,aggregate_kind,aggregate_digest,result_id,event_type,payload_version,schema_version,safe_payload,delivery_state,attempt,next_eligible_at,revision) VALUES ($1,'sha256',1,$2,'workflow-final-result',$3,$4,$5,1,1,$6::jsonb,'pending',0,$7,0) ON CONFLICT DO NOTHING RETURNING *` },
    { statementId: "slice-a.outbox.read", sql: `SELECT * FROM workflow.workflow_outbox_events WHERE event_digest_algorithm='sha256' AND event_digest_version=1 AND event_digest=$1` },
    { statementId: "slice-a.outbox.claim", sql: `WITH candidates AS (SELECT event_id FROM workflow.workflow_outbox_events WHERE ((delivery_state IN ('pending','reconciliation-required') AND next_eligible_at<=transaction_timestamp()) OR (delivery_state='claimed' AND lease_expires_at<=transaction_timestamp())) AND $2::timestamptz IS NOT NULL ORDER BY next_eligible_at,event_id FOR UPDATE SKIP LOCKED LIMIT $1) UPDATE workflow.workflow_outbox_events e SET delivery_state='claimed',claim_owner_digest=$3,fencing_revision=e.revision+1,lease_expires_at=$4,revision=e.revision+1,updated_at=transaction_timestamp(),safe_failure_class=NULL FROM candidates c WHERE e.event_id=c.event_id RETURNING e.*` },
    { statementId: "slice-a.outbox.renew", sql: `UPDATE workflow.workflow_outbox_events SET lease_expires_at=$5,revision=revision+1,updated_at=transaction_timestamp() WHERE event_digest_algorithm='sha256' AND event_digest_version=1 AND event_digest=$1 AND delivery_state='claimed' AND fencing_revision=$2 AND claim_owner_digest=$3 AND lease_expires_at>$4 RETURNING *` },
    { statementId: "slice-a.outbox.release", sql: `UPDATE workflow.workflow_outbox_events SET delivery_state='pending',claim_owner_digest=NULL,fencing_revision=NULL,lease_expires_at=NULL,next_eligible_at=$5,revision=revision+1,updated_at=transaction_timestamp() WHERE event_digest_algorithm='sha256' AND event_digest_version=1 AND event_digest=$1 AND delivery_state='claimed' AND fencing_revision=$2 AND claim_owner_digest=$3 AND lease_expires_at>$4 RETURNING *` },
    { statementId: "slice-a.outbox.reconcile", sql: `UPDATE workflow.workflow_outbox_events SET delivery_state='reconciliation-required',safe_failure_class=$3,revision=revision+1,updated_at=transaction_timestamp() WHERE event_digest_algorithm='sha256' AND event_digest_version=1 AND event_digest=$1 AND revision=$2 AND delivery_state<>'delivered' RETURNING *` },
    { statementId: "slice-a.outbox.deliver", sql: `UPDATE workflow.workflow_outbox_events SET delivery_state='delivered',claim_owner_digest=NULL,lease_expires_at=NULL,delivered_at=$3,revision=revision+1,updated_at=transaction_timestamp() WHERE event_digest_algorithm='sha256' AND event_digest_version=1 AND event_digest=$1 AND delivery_state='claimed' AND fencing_revision=$2 RETURNING *` },
    { statementId: "slice-a.atomic.lookup", sql: `SELECT (SELECT count(*) FROM workflow.workflow_final_results WHERE result_digest=$1) AS result_count,(SELECT count(*) FROM workflow.workflow_result_references WHERE token_digest=$2) AS reference_count,(SELECT count(*) FROM workflow.workflow_outbox_events WHERE event_digest=$3) AS outbox_count` },
  ].map((value) => Object.freeze({ ...value, ...statementMetadata[value.statementId]! }))),
});

export function registerPostgreSQLSliceAStatementCatalog(registrar: import("./types").PostgreSQLSliceAStatementCatalogRegistrar): "registered" | "already-registered" | "rejected" {
  return registrar.register(POSTGRESQL_SLICE_A_STATEMENT_CATALOG);
}
