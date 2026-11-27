-- V000009__expand_asset_import_platform.sql
-- Additive migration: expand asset_import_requests platform check constraint to include 'tiktok'

ALTER TABLE workflow.asset_import_requests
  DROP CONSTRAINT ck_asset_import_authority;

ALTER TABLE workflow.asset_import_requests
  ADD CONSTRAINT ck_asset_import_authority
  CHECK (command_version = '1.0' AND platform IN ('youtube', 'tiktok'));
