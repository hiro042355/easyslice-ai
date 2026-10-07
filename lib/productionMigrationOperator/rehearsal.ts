import { ARTIFACTS, type PreflightInput } from "./contracts";
import { LocalFixture, LocalMigrationSession, type FixtureOptions } from "./session";
import { issueLocalRehearsalAuthorization } from "./authorization";

export function rehearsalInput(): PreflightInput {
  const target = {kind:"LOCAL_REHEARSAL" as const,id:"fixture_target",database:"fixture_database",identity:"MIGRATOR" as const};
  const migrations = [{filename:"V000001__fixture.sql",sha256:"1".repeat(64)}];
  const history = {schema:"fixture_history",table:"fixture_ledger",targetId:target.id,database:target.database,verified:"YES" as const,locations:1};
  const privileges = {targetId:target.id,database:target.database,identityVerified:"YES" as const,databaseVerified:"YES" as const,schemaExists:"YES" as const,connect:"YES" as const,usage:"YES" as const,create:"YES" as const,ownershipAlter:"YES" as const,historyReadable:"YES" as const,historyAuthoritative:"YES" as const};
  return {expectedCommit:"a".repeat(40),actualCommit:"a".repeat(40),worktreeClean:true,indexClean:true,target,migrations,approvedManifest:migrations,untrackedMigrations:[],knownCollisions:[],flyway:ARTIFACTS.flyway,proxy:ARTIFACTS.proxy,history,privileges,transport:{adapter:"IN_MEMORY",binding:"LOOPBACK_PRIVATE_NAMESPACE",publishedPorts:false,restartPolicy:"NONE",credentialModel:"NONE",sessionMs:30_000}};
}
export function createRehearsal(options: FixtureOptions = {}) {
  const fixture = new LocalFixture(options);
  const session = new LocalMigrationSession(fixture);
  // Explicit local-only approval is separate from preflight / validate success.
  const approve = (review = session.review(), expiresAt = fixture.now+10_000) => issueLocalRehearsalAuthorization(review,expiresAt,fixture.now);
  return Object.freeze({fixture,session,approve});
}
