GRANT USAGE ON SCHEMA tiktok_oauth TO oauth_candidate_runtime;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA tiktok_oauth TO oauth_candidate_runtime;
INSERT INTO tiktok_oauth.states(id,digest,uid,session_id,app,environment,scope_digest,redirect,expires_at)
VALUES('00000000-0000-0000-0000-000000000001',repeat('a',64),'fixture-user',repeat('b',64),'fixture-app','sandbox',repeat('c',64),'https://www.nexcutai.com/api/tiktok/oauth/callback',statement_timestamp()+interval '1 minute');
DO $$ BEGIN
 BEGIN INSERT INTO tiktok_oauth.states SELECT * FROM tiktok_oauth.states; RAISE EXCEPTION 'duplicate accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN UPDATE tiktok_oauth.states SET expires_at=issued_at+interval '11 minutes'; RAISE EXCEPTION 'TTL accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN UPDATE tiktok_oauth.states SET uid='wrong-user'; RAISE EXCEPTION 'binding change accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 IF EXISTS(SELECT FROM tiktok_oauth.states WHERE uid='wrong-user') THEN RAISE EXCEPTION 'owner predicate leaked'; END IF;
END $$;
SELECT 'CONSTRAINTS_OWNERSHIP_BINDING=PASS';
INSERT INTO tiktok_oauth.connections VALUES('fixture-user','fixture-app','sandbox','fixture-open','00000000-0000-0000-0000-000000000002','fixture','["user.info.basic","video.publish"]',statement_timestamp()+interval '1 hour','fixture-key',decode(repeat('01',12),'hex'),decode('010203','hex'),decode(repeat('02',16),'hex'),false);
DO $$ BEGIN
 BEGIN UPDATE tiktok_oauth.connections SET tag=decode('00','hex'); RAISE EXCEPTION 'invalid custody accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT 'ENVELOPE_SHAPE=PASS';
INSERT INTO tiktok_oauth.publication_grants(id,uid,app,environment,open_id,generation,binding,expires_at)
VALUES('00000000-0000-0000-0000-000000000003','fixture-user','fixture-app','sandbox','fixture-open','00000000-0000-0000-0000-000000000002',repeat('d',64),statement_timestamp()+interval '1 minute');
UPDATE tiktok_oauth.publication_grants SET status='CLAIMED';
UPDATE tiktok_oauth.publication_grants SET status='USED';
DO $$ BEGIN
 BEGIN UPDATE tiktok_oauth.publication_grants SET status='PENDING'; RAISE EXCEPTION 'consent replay accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT 'CONSENT_SINGLE_USE=PASS';
BEGIN;
DELETE FROM tiktok_oauth.publication_grants;
ROLLBACK;
DO $$ BEGIN IF (SELECT count(*) FROM tiktok_oauth.publication_grants)<>1 THEN RAISE EXCEPTION 'rollback failed'; END IF; END $$;
SELECT 'ROLLBACK=PASS';
SET ROLE oauth_candidate_runtime;
DO $$ BEGIN
 BEGIN CREATE TABLE tiktok_oauth.forbidden(id int); RAISE EXCEPTION 'runtime DDL accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM tiktok_oauth.connections; RAISE EXCEPTION 'runtime deletion accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'LEAST_PRIVILEGE=PASS';
