-- NONDEPLOYABLE CANDIDATE. No Flyway version assigned; never copy to Production without a separate gate.
CREATE SCHEMA tiktok_oauth;
REVOKE ALL ON SCHEMA tiktok_oauth FROM PUBLIC;
CREATE TABLE tiktok_oauth.states (
 id uuid PRIMARY KEY, digest text UNIQUE NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
 uid text NOT NULL CHECK(length(uid) BETWEEN 1 AND 128), session_id text NOT NULL CHECK(session_id ~ '^[0-9a-f]{64}$'),
 app text NOT NULL CHECK(length(app)>0), environment text NOT NULL CHECK(environment IN ('sandbox','staging','production')),
 scope_digest text NOT NULL CHECK(scope_digest ~ '^[0-9a-f]{64}$'), redirect text NOT NULL CHECK(redirect='https://www.nexcutai.com/api/tiktok/oauth/callback'),
 issued_at timestamptz NOT NULL DEFAULT statement_timestamp(), expires_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','CLAIMED','CONSUMED','FAILED')), claim_id uuid,
 CHECK(expires_at>issued_at AND expires_at<=issued_at+interval '10 minutes'),
 CHECK((status='PENDING' AND claim_id IS NULL) OR (status<>'PENDING' AND claim_id IS NOT NULL))
);
CREATE INDEX states_retention ON tiktok_oauth.states(expires_at);
CREATE INDEX states_owner_pending ON tiktok_oauth.states(uid,app,environment,status);
CREATE TABLE tiktok_oauth.connections (
 uid text NOT NULL CHECK(length(uid) BETWEEN 1 AND 128), app text NOT NULL CHECK(length(app)>0),
 environment text NOT NULL CHECK(environment IN ('sandbox','staging','production')), open_id text NOT NULL CHECK(length(open_id)>0),
 generation uuid NOT NULL, display_name text NOT NULL, scopes jsonb NOT NULL CHECK(jsonb_typeof(scopes)='array'),
 expires_at timestamptz NOT NULL, key_id text NOT NULL CHECK(length(key_id)>0),
 nonce bytea NOT NULL, ciphertext bytea NOT NULL, tag bytea NOT NULL, revoked boolean NOT NULL DEFAULT false,
 PRIMARY KEY(uid,app,environment), UNIQUE(app,environment,open_id),
 UNIQUE(uid,app,environment,open_id,generation),
 CHECK((NOT revoked AND octet_length(nonce)=12 AND octet_length(tag)=16 AND octet_length(ciphertext)>0)
 OR (revoked AND octet_length(nonce)=0 AND octet_length(tag)=0 AND octet_length(ciphertext)=0))
);
CREATE INDEX connections_expiry ON tiktok_oauth.connections(expires_at);
CREATE TABLE tiktok_oauth.publication_grants (
 id uuid PRIMARY KEY, uid text NOT NULL, app text NOT NULL, environment text NOT NULL,
 open_id text NOT NULL, generation uuid NOT NULL, binding text NOT NULL CHECK(binding ~ '^[0-9a-f]{64}$'),
 consented_at timestamptz NOT NULL DEFAULT statement_timestamp(), expires_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','CLAIMED','USED','FAILED')),
 CHECK(expires_at>consented_at AND expires_at<=consented_at+interval '5 minutes'),
 FOREIGN KEY(uid,app,environment) REFERENCES tiktok_oauth.connections(uid,app,environment) ON DELETE CASCADE
);
CREATE INDEX publication_retention ON tiktok_oauth.publication_grants(expires_at);
CREATE INDEX publication_owner_pending ON tiktok_oauth.publication_grants(uid,app,environment,status);
CREATE FUNCTION tiktok_oauth.enforce_terminal() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF (OLD.status='PENDING' AND NEW.status NOT IN ('PENDING','CLAIMED','FAILED'))
 OR (OLD.status='CLAIMED' AND NEW.status NOT IN ('CLAIMED','CONSUMED','USED','FAILED'))
 OR (OLD.status IN ('CONSUMED','USED','FAILED') AND NEW.status<>OLD.status) THEN
 RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='terminal transition rejected'; END IF;
 IF TG_TABLE_NAME='states' THEN
 IF (NEW.uid,NEW.session_id,NEW.app,NEW.environment,NEW.digest,NEW.scope_digest,NEW.redirect,NEW.issued_at,NEW.expires_at) IS DISTINCT FROM (OLD.uid,OLD.session_id,OLD.app,OLD.environment,OLD.digest,OLD.scope_digest,OLD.redirect,OLD.issued_at,OLD.expires_at) THEN
 RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='state binding immutable'; END IF;
 END IF;
 IF TG_TABLE_NAME='publication_grants' THEN
 IF (NEW.uid,NEW.app,NEW.environment,NEW.open_id,NEW.generation,NEW.binding,NEW.consented_at,NEW.expires_at) IS DISTINCT FROM (OLD.uid,OLD.app,OLD.environment,OLD.open_id,OLD.generation,OLD.binding,OLD.consented_at,OLD.expires_at) THEN
 RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='consent binding immutable'; END IF;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION tiktok_oauth.enforce_terminal() FROM PUBLIC;
CREATE TRIGGER state_terminal BEFORE UPDATE ON tiktok_oauth.states FOR EACH ROW EXECUTE FUNCTION tiktok_oauth.enforce_terminal();
CREATE TRIGGER grant_terminal BEFORE UPDATE ON tiktok_oauth.publication_grants FOR EACH ROW EXECUTE FUNCTION tiktok_oauth.enforce_terminal();
REVOKE ALL ON ALL TABLES IN SCHEMA tiktok_oauth FROM PUBLIC;
-- Runtime and retention grants deliberately absent: exact existing identities/ownership are UNKNOWN.
