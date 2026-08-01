CREATE TABLE workflow.workflow_completion_states (
  workflow_identity_version text NOT NULL,
  workflow_identity_namespace text NOT NULL,
  workflow_identity_value text NOT NULL,
  state text NOT NULL,
  revision bigint NOT NULL,
  logical_attempt_identity_version text,
  logical_attempt_identity_namespace text,
  logical_attempt_identity_value text,
  completion_timestamp timestamptz,
  result_reference_version text,
  result_reference_identity text,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT pk_workflow_completion_states PRIMARY KEY (
    workflow_identity_version,
    workflow_identity_namespace,
    workflow_identity_value
  ),
  CONSTRAINT ck_workflow_completion_states_identity CHECK (
    workflow_identity_version = '1.0'
    AND length(workflow_identity_namespace) > 0
    AND length(workflow_identity_value) > 0
  ),
  CONSTRAINT ck_workflow_completion_states_state CHECK (
    state IN ('eligible-for-completion', 'completed')
  ),
  CONSTRAINT ck_workflow_completion_states_revision CHECK (
    revision >= 0
    AND ((state = 'eligible-for-completion' AND revision = 0) OR (state = 'completed' AND revision = 1))
  ),
  CONSTRAINT ck_workflow_completion_states_evidence CHECK (
    (
      state = 'eligible-for-completion'
      AND logical_attempt_identity_version IS NULL
      AND logical_attempt_identity_namespace IS NULL
      AND logical_attempt_identity_value IS NULL
      AND completion_timestamp IS NULL
      AND result_reference_version IS NULL
      AND result_reference_identity IS NULL
    ) OR (
      state = 'completed'
      AND logical_attempt_identity_version = '1.0'
      AND length(logical_attempt_identity_namespace) > 0
      AND length(logical_attempt_identity_value) > 0
      AND completion_timestamp IS NOT NULL
      AND result_reference_version = '1.0'
      AND length(result_reference_identity) > 0
    )
  )
);

CREATE INDEX ix_workflow_completion_states_state
  ON workflow.workflow_completion_states (state);
