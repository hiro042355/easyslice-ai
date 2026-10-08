-- LOCAL_TEST_ONLY. Disposable database bootstrap; not a Production migration.
CREATE ROLE oauth_test_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
REVOKE ALL ON DATABASE oauth_local_test FROM PUBLIC;
GRANT CONNECT ON DATABASE oauth_local_test TO oauth_test_runtime;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA local_tiktok_oauth;
CREATE TABLE local_tiktok_oauth.states (
 id uuid PRIMARY KEY, digest char(64) UNIQUE NOT NULL, uid text NOT NULL, session_id char(64) NOT NULL,
 app text NOT NULL, environment text NOT NULL CHECK(environment='sandbox'), scope_digest char(64) NOT NULL,
 redirect text NOT NULL, issued_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 status text NOT NULL CHECK(status IN ('PENDING','CLAIMED','CONSUMED','FAILED')), claim_id uuid,
 CHECK(expires_at > issued_at AND expires_at <= issued_at + interval '10 minutes'),
 CHECK((status='PENDING' AND claim_id IS NULL) OR (status<>'PENDING' AND claim_id IS NOT NULL))
);
CREATE TABLE local_tiktok_oauth.connections (
 uid text NOT NULL, app text NOT NULL, environment text NOT NULL CHECK(environment='sandbox'), open_id text NOT NULL,
 generation uuid NOT NULL, display_name text NOT NULL, scopes jsonb NOT NULL, expires_at timestamptz NOT NULL,
 key_id text NOT NULL, nonce bytea NOT NULL, ciphertext bytea NOT NULL, tag bytea NOT NULL,
 revoked boolean NOT NULL DEFAULT false, PRIMARY KEY(uid,app,environment), UNIQUE(app,environment,open_id)
);
CREATE TABLE local_tiktok_oauth.publication_grants (
 id uuid PRIMARY KEY, uid text NOT NULL, app text NOT NULL, environment text NOT NULL,
 open_id text NOT NULL, generation uuid NOT NULL, binding char(64) NOT NULL,
 consented_at timestamptz NOT NULL DEFAULT statement_timestamp(), expires_at timestamptz NOT NULL,
 status text NOT NULL CHECK(status IN ('PENDING','CLAIMED','USED','FAILED')),
 CHECK(expires_at > consented_at AND expires_at <= consented_at+interval '5 minutes')
);
GRANT USAGE ON SCHEMA local_tiktok_oauth TO oauth_test_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA local_tiktok_oauth TO oauth_test_runtime;
CREATE TABLE local_tiktok_oauth.mutation_audit (operation text NOT NULL, table_name text NOT NULL);
CREATE FUNCTION local_tiktok_oauth.audit_mutation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 INSERT INTO local_tiktok_oauth.mutation_audit VALUES (TG_OP,TG_TABLE_NAME);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER state_audit AFTER INSERT OR UPDATE OR DELETE ON local_tiktok_oauth.states FOR EACH ROW EXECUTE FUNCTION local_tiktok_oauth.audit_mutation();
CREATE TRIGGER connection_audit AFTER INSERT OR UPDATE OR DELETE ON local_tiktok_oauth.connections FOR EACH ROW EXECUTE FUNCTION local_tiktok_oauth.audit_mutation();
CREATE TRIGGER grant_audit AFTER INSERT OR UPDATE OR DELETE ON local_tiktok_oauth.publication_grants FOR EACH ROW EXECUTE FUNCTION local_tiktok_oauth.audit_mutation();
GRANT SELECT ON local_tiktok_oauth.mutation_audit TO oauth_test_runtime;
CREATE FUNCTION local_tiktok_oauth.enforce_state_transition() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF (OLD.status='PENDING' AND NEW.status NOT IN ('PENDING','CLAIMED'))
 OR (OLD.status='CLAIMED' AND NEW.status NOT IN ('CLAIMED','CONSUMED','FAILED'))
 OR (OLD.status IN ('CONSUMED','FAILED') AND NEW.status<>OLD.status) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='local state transition rejected';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_state_transition BEFORE UPDATE ON local_tiktok_oauth.states FOR EACH ROW EXECUTE FUNCTION local_tiktok_oauth.enforce_state_transition();
CREATE FUNCTION local_tiktok_oauth.enforce_grant_transition() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF (OLD.status='PENDING' AND NEW.status NOT IN ('PENDING','CLAIMED','FAILED'))
 OR (OLD.status='CLAIMED' AND NEW.status NOT IN ('CLAIMED','USED','FAILED'))
 OR (OLD.status IN ('USED','FAILED') AND NEW.status<>OLD.status) THEN
  RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='local grant transition rejected';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_grant_transition BEFORE UPDATE ON local_tiktok_oauth.publication_grants FOR EACH ROW EXECUTE FUNCTION local_tiktok_oauth.enforce_grant_transition();
