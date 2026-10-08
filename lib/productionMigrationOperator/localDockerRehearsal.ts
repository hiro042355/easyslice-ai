import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ARTIFACTS, binding, fail, type PreflightInput } from "./contracts";
import { LocalMigrationSession } from "./session";
import { issueLocalRehearsalAuthorization } from "./authorization";
import { rehearsalInput } from "./rehearsal";

export const LOCAL_ENDPOINT = "npipe:////./pipe/dockerDesktopLinuxEngine";
export const POSTGRES_IMAGE = "postgres:18.4@sha256:c2d42a104eb6b37b286a2d9c5cf83f349de4d6516d513d00a2bd9610e2c2e5e4";
const FLYWAY_IMAGE = `${ARTIFACTS.flyway.image}:${ARTIFACTS.flyway.version}@${ARTIFACTS.flyway.digest}`;
const BASELINE = "e6a1f004c38b43820c7a00503d21a0f1263bb25e";
const DOCKER = "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe";
type Scenario = "success" | "partial" | "slow" | "wrapper" | "invalid";
type Stage = "START" | "INFO" | "VALIDATE" | "MIGRATE" | "POST_VALIDATE" | "STOP";
type Result = { code: number; output: string };
export type Safety = Readonly<{ target: string; endpoint: string; context: string; os: string; operatingSystem: string; externalUrl?: string; mounts: readonly string[]; network: string; ports: readonly number[]; privileged: boolean; identity: string }>;
export function checkLocalSafety(s: Safety): void {
  if (s.target === "PRODUCTION") fail("PRODUCTION_ADAPTER_UNAVAILABLE");
  if (s.target === "NON_PRODUCTION_CLOUD_SQL") fail("CLOUD_ADAPTER_UNAVAILABLE");
  if (s.target !== "LOCAL_REHEARSAL") fail("TARGET_REQUIRED");
  if (s.endpoint !== LOCAL_ENDPOINT || s.context !== "desktop-linux" || s.os !== "linux" || s.operatingSystem !== "Docker Desktop" || s.externalUrl !== undefined || s.mounts.length || s.network !== "PRIVATE_DISPOSABLE" || s.ports.length || s.privileged) fail("TRANSPORT_CONTRACT_REJECTED");
  if (s.identity !== "MIGRATOR") fail("IDENTITY_REJECTED");
}
// Closed environment: no inherited Docker override, ADC, database URL or auth settings.
function childEnvironment(extra: Record<string,string> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV:"test", SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, TEMP: process.env.TEMP, TMP: process.env.TMP, ...extra };
}
async function docker(args: readonly string[], extra: Record<string,string> = {}, input?: string, timeout = 60_000, pin = true): Promise<Result> {
  return new Promise((resolve,reject) => {
    const child = spawn(DOCKER,[...(pin ? ["--host",LOCAL_ENDPOINT] : []),...args],{env:childEnvironment(extra),windowsHide:true,stdio:["pipe","pipe","pipe"]});
    let output = "";
    const timer = setTimeout(()=>{child.kill();reject(new Error("LOCAL_PROCESS_TIMEOUT"));},timeout);
    const append = (chunk: Buffer) => { output += chunk.toString(); if (Buffer.byteLength(output)>256_000) {child.kill();clearTimeout(timer);reject(new Error("BOUNDED_OUTPUT_EXCEEDED"));} };
    child.stdout.on("data",append); child.stderr.on("data",append);
    child.on("error",()=>{clearTimeout(timer);reject(new Error("LOCAL_PROCESS_FAILED"));});
    child.on("close",code=>{clearTimeout(timer);resolve({code:code??1,output});});
    child.stdin.on("error",()=>{}); child.stdin.end(input);
  });
}
function requireOk(r: Result): string { if(r.code!==0) fail("TRANSPORT_FAILED"); return r.output.trim(); }
function validationPassed(r:Result): boolean { if(r.code!==0) return false; try {return (parseJson(r) as {validationSuccessful?:boolean}).validationSuccessful===true;} catch {return false;} }
function parseJson(r: Result): unknown { const raw=requireOk(r); try{return JSON.parse(raw.slice(raw.indexOf("{")));}catch{fail("VALIDATION_FAILED");} }
async function localAuthority(): Promise<void> {
  // Selected context must also match. All subsequent commands explicitly pin the verified local pipe.
  if (process.env.DOCKER_HOST && process.env.DOCKER_HOST !== LOCAL_ENDPOINT) fail("TRANSPORT_CONTRACT_REJECTED");
  if (process.env.DOCKER_CONTEXT && process.env.DOCKER_CONTEXT !== "desktop-linux") fail("TRANSPORT_CONTRACT_REJECTED");
  if (process.env.DOCKER_CONFIG) fail("TRANSPORT_CONTRACT_REJECTED");
  const context = requireOk(await docker(["context","show"],{USERPROFILE:process.env.USERPROFILE??""},undefined,60_000,false));
  const endpoint = requireOk(await docker(["context","inspect",context,"--format","{{.Endpoints.docker.Host}}"],{USERPROFILE:process.env.USERPROFILE??""},undefined,60_000,false));
  const info = requireOk(await docker(["info","--format","{{.OSType}}|{{.OperatingSystem}}"])).split("|");
  checkLocalSafety({target:"LOCAL_REHEARSAL",endpoint,context,os:info[0],operatingSystem:info[1],mounts:[],network:"PRIVATE_DISPOSABLE",ports:[],privileged:false,identity:"MIGRATOR"});
  for(const [image,digest] of [[POSTGRES_IMAGE,POSTGRES_IMAGE.split("@")[1]],[FLYWAY_IMAGE,ARTIFACTS.flyway.digest]]) {
    const r=JSON.parse(requireOk(await docker(["image","inspect",image]))) as {RepoDigests:string[];Os:string;Architecture:string;Config:{Volumes:object|null}}[];
    if(r.length!==1 || r[0].Os!=="linux" || r[0].Architecture!=="amd64" || !r[0].RepoDigests.some(v=>v.endsWith(`@${digest}`))) fail("ARTIFACT_MISMATCH");
    if(image===FLYWAY_IMAGE && r[0].Config.Volumes && Object.keys(r[0].Config.Volumes).length) fail("TRANSPORT_CONTRACT_REJECTED");
  }
}
export type Evidence = { roleSeparation:boolean; historyInitialized:boolean; historyRows:number; checksums:boolean; ordered:boolean; seedRows:number; failedMarkerAbsent:boolean; checksumRejected:boolean; duplicateRejected:boolean; missingRejected:boolean; futureRejected:boolean; outOfOrderRejected:boolean; lockRejected:boolean; versionVerified:boolean; postgresVersion:string; migrationsStarted:number; migrationsRecorded:number; bootstrapMutationStatements:number; containersCleaned:boolean; networkCleaned:boolean; noVolumes:boolean; noHostPorts:boolean };
function emptyEvidence(): Evidence { return {roleSeparation:false,historyInitialized:false,historyRows:0,checksums:false,ordered:false,seedRows:0,failedMarkerAbsent:false,checksumRejected:false,duplicateRejected:false,missingRejected:false,futureRejected:false,outOfOrderRejected:false,lockRejected:false,versionVerified:false,postgresVersion:"",migrationsStarted:0,migrationsRecorded:0,bootstrapMutationStatements:0,containersCleaned:false,networkCleaned:false,noVolumes:false,noHostPorts:false}; }
const FIXTURE_HASHES:Readonly<Record<string,string>>=Object.freeze({
  'success/V000001__seed.sql': 'a95edb8ab39069b6ce21915f36682c3c5b9bec35c68d8aa25c9809feeab66323',
  'success/V000002__extend.sql': '6770145b3cdb4c9bb63d9220a2974c442cb50f74837ec94861aa907174155fb3',
  'partial/V000001__seed.sql': 'a95edb8ab39069b6ce21915f36682c3c5b9bec35c68d8aa25c9809feeab66323',
  'partial/V000002__failure.sql': '2f56127d1b179cb4c113cfeb8ae81e67403103ee9d4457cbde9fb0c17baa2c83',
  'slow/V000001__seed.sql': 'b607baae340912fbfe39d04c02308ff0bf1310947a6a412f11f1ce42cec7e452',
  'slow/V000002__extend.sql': '6770145b3cdb4c9bb63d9220a2974c442cb50f74837ec94861aa907174155fb3',
});
export function checkSyntheticSnapshot(scenario:string,files:Readonly<Record<string,string>>):void {
  const kind=scenario==="wrapper" || scenario==="invalid"?"success":scenario;
  const approved=Object.keys(FIXTURE_HASHES).filter(k=>k.startsWith(`${kind}/`));
  if(approved.length!==2 || Object.keys(files).length!==2 || Object.entries(files).some(([name,contents])=>FIXTURE_HASHES[`${kind}/${name}`]!==createHash("sha256").update(contents).digest("hex"))) fail("MANIFEST_MISMATCH");
}
const brands = new WeakSet<object>();
export interface GuardedLocalDriver { readonly now:number; readonly pending:readonly string[]; committedCount():number; perform(stage:Stage):Promise<void>; failureOutcome():"ROLLED_BACK"|"COMMIT_UNKNOWN"|"UNKNOWN"; checkInput(input:PreflightInput):void }
export function isGuardedLocalDriver(v: unknown): v is GuardedLocalDriver { return typeof v === "object" && v !== null && brands.has(v); }

class Database {
  readonly id = `rehearsal_${randomUUID().replace(/-/g,"")}`;
  readonly network = `${this.id}_net`;
  readonly pgName = `${this.id}_pg`;
  readonly ownerPassword = randomBytes(24).toString("hex");
  readonly migratorPassword = randomBytes(24).toString("hex");
  readonly runtimePassword = randomBytes(24).toString("hex");
  readonly flyways = new Set<string>();
  readonly evidence = emptyEvidence();
  pg = "";
  networkCreated = false;
  pgCreated = false;
  users = 0;
  #cleanup: Promise<void> | undefined;
  constructor(readonly scenario:Scenario,readonly files:Readonly<Record<string,string>>) {}
  async setup(): Promise<void> {
    await localAuthority();
    requireOk(await docker(["network","create","--internal","--driver","bridge","--label",`nexcut.rehearsal=${this.id}`,this.network]));this.networkCreated=true;
    requireOk(await docker(["create","--name",this.pgName,"--label",`nexcut.rehearsal=${this.id}`,"--pull","never","--platform","linux/amd64","--network",this.network,"--user","postgres","--cap-drop","ALL","--security-opt","no-new-privileges:true","--restart","no","--tmpfs","/var/lib/postgresql:rw,mode=1777","--env","POSTGRES_PASSWORD","--env","POSTGRES_USER=rehearsal_owner","--env","POSTGRES_DB=rehearsal_db",POSTGRES_IMAGE,"-c","listen_addresses=127.0.0.1"],{POSTGRES_PASSWORD:this.ownerPassword}));this.pgCreated=true;
    this.pg=requireOk(await docker(["inspect",this.pgName,"--format","{{.Id}}"]));
    if(!/^[a-f0-9]{64}$/.test(this.pg)) fail("TRANSPORT_FAILED");
    requireOk(await docker(["start",this.pg]));
    // Readiness queries are not migration retries. No SQL/migrate operation is retried.
    let ready=false;
    for(let n=0;n<30;n++) {const r=await docker(["exec",this.pg,"pg_isready","-h","127.0.0.1","-U","rehearsal_owner","-d","rehearsal_db"]);if(r.code===0){ready=true;break;}await new Promise(r=>setTimeout(r,200));}
    if(!ready) fail("TRANSPORT_FAILED");
    const safety=JSON.parse(requireOk(await docker(["inspect",this.pg]))) as {HostConfig:{Privileged:boolean;NetworkMode:string;PortBindings:object|null;RestartPolicy:{Name:string}};Mounts:{Type:string;Destination:string}[];NetworkSettings:{Ports:Record<string,unknown>}}[];
    const p=safety[0]; if(p.HostConfig.Privileged || p.HostConfig.NetworkMode!==this.network || p.HostConfig.RestartPolicy.Name!=="no" || Object.keys(p.HostConfig.PortBindings??{}).length || Object.values(p.NetworkSettings.Ports).some(v=>v!==null) || p.Mounts.some(m=>m.Type!=="tmpfs")) fail("TRANSPORT_CONTRACT_REJECTED");
    const net=JSON.parse(requireOk(await docker(["network","inspect",this.network]))) as {Internal:boolean;Driver:string}[];
    if(net.length!==1 || !net[0].Internal || net[0].Driver!=="bridge") fail("TRANSPORT_CONTRACT_REJECTED");
    this.evidence.noVolumes=true;this.evidence.noHostPorts=true;
    const sql = `CREATE ROLE rehearsal_runtime LOGIN PASSWORD '${this.runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
CREATE ROLE rehearsal_migrator LOGIN PASSWORD '${this.migratorPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
REVOKE ALL ON DATABASE rehearsal_db FROM PUBLIC;
GRANT CONNECT ON DATABASE rehearsal_db TO rehearsal_runtime, rehearsal_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA rehearsal_schema AUTHORIZATION rehearsal_migrator;
GRANT USAGE ON SCHEMA rehearsal_schema TO rehearsal_runtime;
CREATE SCHEMA rehearsal_history AUTHORIZATION rehearsal_owner;
CREATE SCHEMA rehearsal_protected AUTHORIZATION rehearsal_owner;
CREATE TABLE rehearsal_protected.protected (id integer);
GRANT USAGE ON SCHEMA rehearsal_protected TO rehearsal_runtime, rehearsal_migrator;
GRANT SELECT ON rehearsal_protected.protected TO rehearsal_runtime, rehearsal_migrator;
CREATE TABLE rehearsal_history.flyway_schema_history (installed_rank integer NOT NULL PRIMARY KEY, version varchar(50), description varchar(200) NOT NULL, type varchar(20) NOT NULL, script varchar(1000) NOT NULL, checksum integer, installed_by varchar(100) NOT NULL, installed_on timestamp NOT NULL DEFAULT now(), execution_time integer NOT NULL, success boolean NOT NULL);
CREATE INDEX flyway_schema_history_s_idx ON rehearsal_history.flyway_schema_history (success);
GRANT USAGE, CREATE ON SCHEMA rehearsal_history TO rehearsal_migrator;
ALTER TABLE rehearsal_history.flyway_schema_history OWNER TO rehearsal_migrator;
REVOKE CREATE ON SCHEMA rehearsal_history FROM rehearsal_migrator;`;
    const result=await this.sql("owner",sql);requireOk(result);
    this.evidence.bootstrapMutationStatements=result.output.split(/\r?\n/).filter(v=>/^(CREATE|ALTER|GRANT|REVOKE)/.test(v)).length;
    this.evidence.postgresVersion=requireOk(await this.sql("owner","SHOW server_version;"));
    if(!/^18\.4(?:\s|$)/.test(this.evidence.postgresVersion)) fail("ARTIFACT_MISMATCH");
    if(requireOk(await this.sql("owner","SHOW listen_addresses;"))!=="127.0.0.1") fail("TRANSPORT_CONTRACT_REJECTED");
    await this.verifyRoles();
    this.evidence.historyInitialized=requireOk(await this.sql("migrator","SELECT count(*) FROM rehearsal_history.flyway_schema_history;"))==="0";
    if(!this.evidence.historyInitialized) fail("HISTORY_UNVERIFIED");
    if(this.scenario === "invalid") { requireOk(await this.sql("owner", "INSERT INTO rehearsal_history.flyway_schema_history (installed_rank,version,description,type,script,checksum,installed_by,execution_time,success) VALUES (1, '000001', 'seed', 'SQL', 'V000001__seed.sql', 0, 'rehearsal_migrator', 0, true);")); this.evidence.bootstrapMutationStatements++; }
  }
  async sql(role:"owner"|"runtime"|"migrator",sql:string): Promise<Result> {
    const password=role==="owner"?this.ownerPassword:role==="runtime"?this.runtimePassword:this.migratorPassword;
    return docker(["exec","--interactive","--env","PGPASSWORD",this.pg,"psql","--no-psqlrc","--host","127.0.0.1","--username",`rehearsal_${role}`,"--dbname","rehearsal_db","--tuples-only","--no-align","--set","ON_ERROR_STOP=1","--set","VERBOSITY=verbose"],{PGPASSWORD:password},sql);
  }
  async verifyRoles():Promise<void> {
    for(const role of ["runtime","migrator"] as const) {
      const identity=requireOk(await this.sql(role,`SELECT current_user = 'rehearsal_${role}' AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolinherit AND (SELECT datdba <> oid FROM pg_database WHERE datname=current_database()) FROM pg_roles WHERE rolname=current_user;`));
      if(identity!=="t") fail("PRIVILEGE_UNVERIFIED");
    }
    const usage=requireOk(await this.sql("owner","SELECT has_schema_privilege('rehearsal_runtime','rehearsal_schema','USAGE') AND NOT has_schema_privilege('rehearsal_runtime','rehearsal_schema','CREATE') AND has_schema_privilege('rehearsal_migrator','rehearsal_schema','USAGE') AND has_schema_privilege('rehearsal_migrator','rehearsal_schema','CREATE');"));
    if(usage!=="t") fail("PRIVILEGE_UNVERIFIED");
    for(const [role,sql] of [["runtime","CREATE SCHEMA forbidden;"],["runtime","CREATE TABLE rehearsal_schema.forbidden (id integer);"],["runtime","ALTER TABLE rehearsal_protected.protected ADD COLUMN forbidden integer;"],["runtime","SET ROLE rehearsal_migrator;"],["migrator","CREATE SCHEMA forbidden;"],["migrator","CREATE TABLE public.forbidden (id integer);"],["migrator","CREATE TABLE rehearsal_history.forbidden (id integer);"],["migrator","CREATE TABLE rehearsal_protected.forbidden (id integer);"],["migrator","SET ROLE rehearsal_owner;"]] as const) {
      const r=await this.sql(role,sql);if(r.code===0 || !r.output.includes("42501")) fail("PRIVILEGE_UNVERIFIED");
    }
    requireOk(await this.sql("migrator","BEGIN; CREATE TABLE rehearsal_schema.allowed (id integer); ALTER TABLE rehearsal_schema.allowed ADD COLUMN label text; ROLLBACK;"));
    this.evidence.roleSeparation=true;
  }
  async flyway(operation:"info"|"validate"|"migrate",files=this.files):Promise<Result> {
    const name=`${this.id}_fw_${randomUUID().replace(/-/g,"")}`;
    const dir=await mkdtemp(join(tmpdir(),"nexcut-synthetic-sql-"));
    try {
      for(const [filename,contents] of Object.entries(files)) {if(!/^V\d{6}__[a-z_]+\.sql$/.test(filename)) fail("VERSION_INVALID");await writeFile(join(dir,filename),contents);}
      // No CLI credential values; only names. The generated disposable env is never receipted.
      requireOk(await docker(["create","--name",name,"--label",`nexcut.rehearsal=${this.id}`,"--pull","never","--platform","linux/amd64","--network",`container:${this.pg}`,"--cap-drop","ALL","--security-opt","no-new-privileges:true","--restart","no","--env","FLYWAY_URL","--env","FLYWAY_USER","--env","FLYWAY_PASSWORD","--tmpfs","/tmp:rw,mode=1777",FLYWAY_IMAGE,"-outputType=json","-locations=filesystem:/flyway/sql","-defaultSchema=rehearsal_history","-schemas=rehearsal_history,rehearsal_schema","-table=flyway_schema_history","-createSchemas=false","-cleanDisabled=true","-baselineOnMigrate=false","-outOfOrder=false","-validateOnMigrate=true","-validateMigrationNaming=true","-ignoreMigrationPatterns=*:pending","-lockRetryCount=0","-connectRetries=0",operation],{FLYWAY_URL:"jdbc:postgresql://127.0.0.1:5432/rehearsal_db",FLYWAY_USER:"rehearsal_migrator",FLYWAY_PASSWORD:this.migratorPassword}));
      this.flyways.add(name);
      const config=JSON.parse(requireOk(await docker(["inspect",name]))) as {HostConfig:{Privileged:boolean;NetworkMode:string;PortBindings:object|null;RestartPolicy:{Name:string}};Mounts:{Type:string}[]}[];
      if(config.length!==1 || config[0].HostConfig.Privileged || config[0].HostConfig.NetworkMode!==`container:${this.pg}` || config[0].HostConfig.RestartPolicy.Name!=="no" || Object.keys(config[0].HostConfig.PortBindings??{}).length || config[0].Mounts.some(m=>m.Type!=="tmpfs")) fail("TRANSPORT_CONTRACT_REJECTED");
      requireOk(await docker(["cp",`${dir}\\.`,`${name}:/flyway/sql`]));
      const result=await docker(["start","--attach",name]);
      // `start --attach` propagates the container's exit code on this Docker version; inspect is authoritative.
      const exit=Number(requireOk(await docker(["inspect",name,"--format","{{.State.ExitCode}}"])));result.code=exit;
      return result;
    } finally {
      try { if(this.flyways.has(name)) { const removed=await docker(["rm","--force",name]); if(removed.code!==0 && (await docker(["inspect",name])).code===0) fail("CLEANUP_FAILED"); this.flyways.delete(name); } }
      finally { await rm(dir,{recursive:true,force:true}); }
    }
  }
  async snapshot():Promise<void> {
    const rows=JSON.parse(requireOk(await this.sql("owner","SELECT coalesce(json_agg(json_build_object('rank',installed_rank,'version',version,'checksum',checksum,'success',success) ORDER BY installed_rank),'[]') FROM rehearsal_history.flyway_schema_history;"))) as {rank:number;version:string;checksum:number|null;success:boolean}[];
    this.evidence.historyRows=rows.length;this.evidence.migrationsRecorded=rows.filter(r=>r.success).length;
    this.evidence.ordered=rows.every((r,i)=>r.rank===i+1 && Number(r.version)===i+1 && r.success);
    this.evidence.checksums=rows.every(r=>Number.isInteger(r.checksum));
    this.evidence.failedMarkerAbsent=requireOk(await this.sql("owner","SELECT to_regclass('rehearsal_schema.failed_marker') IS NULL;"))==="t";
    const exists=requireOk(await this.sql("owner","SELECT to_regclass('rehearsal_schema.seed') IS NOT NULL;"))==="t";
    this.evidence.seedRows=exists?Number(requireOk(await this.sql("owner","SELECT count(*) FROM rehearsal_schema.seed;"))):0;
  }
  async negativeHistoryChecks():Promise<void> {
    const first=Object.keys(this.files).sort()[0];const second=Object.keys(this.files).sort()[1];
    const rejected=async(files:Readonly<Record<string,string>>,needle:RegExp)=>{const r=await this.flyway("validate",files);return !validationPassed(r) && needle.test(r.output);};
    this.evidence.checksumRejected=await rejected({...this.files,[first]:this.files[first]+"\nSELECT 123;\n"},/CHECKSUM_MISMATCH|checksum mismatch/i);
    // Real duplicate filename remains valid migration syntax, distinct description/same version.
    this.evidence.duplicateRejected=await rejected({...this.files,"V000001__duplicate.sql":this.files[first]},/more than one migration|duplicate/i);
    this.evidence.missingRejected=await rejected({[second]:this.files[second]},/APPLIED_VERSIONED_MIGRATION_NOT_RESOLVED|applied migration not resolved locally/i);
    this.evidence.futureRejected=await rejected({[first]:this.files[first]},/APPLIED_VERSIONED_MIGRATION_NOT_RESOLVED|applied migration not resolved locally/i);
    // Synthetic future row and lower unapplied version are distinct real history states.
    requireOk(await this.sql("owner","BEGIN; UPDATE rehearsal_history.flyway_schema_history SET version='000003' WHERE installed_rank=2; COMMIT;"));
    const out=await this.flyway("validate",this.files);
    this.evidence.outOfOrderRejected=!validationPassed(out) && /RESOLVED_VERSIONED_MIGRATION_NOT_APPLIED|resolved migration not applied/i.test(out.output);
    requireOk(await this.sql("owner","BEGIN; UPDATE rehearsal_history.flyway_schema_history SET version='000002' WHERE installed_rank=2; COMMIT;"));
    if(!this.evidence.checksumRejected || !this.evidence.duplicateRejected || !this.evidence.missingRejected || !this.evidence.futureRejected || !this.evidence.outOfOrderRejected) fail("POST_VALIDATION_FAILED");
  }
  async waitForMigrationStart():Promise<void> {
    for(let n=0;n<50;n++) {
      const r=await this.sql("owner","SELECT count(*) FROM pg_stat_activity WHERE usename='rehearsal_migrator' AND state='active' AND query LIKE '%pg_sleep(8)%';");
      if(r.code===0 && Number(r.output.trim())>0) return;
      await new Promise(r=>setTimeout(r,200));
    }
    fail("MIGRATION_FAILED");
  }
  async cleanup():Promise<void> {
    if(this.#cleanup) return this.#cleanup;
    this.#cleanup=(async()=>{
      for(const name of [...this.flyways]) {requireOk(await docker(["rm","--force",name]));this.flyways.delete(name);}
      if(this.pgCreated) {requireOk(await docker(["rm","--force","--volumes",this.pg]));this.pgCreated=false;}
      if(this.networkCreated) {requireOk(await docker(["network","rm",this.network]));this.networkCreated=false;}
      const containers=requireOk(await docker(["ps","--all","--quiet","--filter",`label=nexcut.rehearsal=${this.id}`]));
      const networks=requireOk(await docker(["network","ls","--quiet","--filter",`label=nexcut.rehearsal=${this.id}`]));
      this.evidence.containersCleaned=containers==="";this.evidence.networkCleaned=networks==="";
      if(!this.evidence.containersCleaned || !this.evidence.networkCleaned) fail("CLEANUP_FAILED");
    })();return this.#cleanup;
  }
}
class Driver implements GuardedLocalDriver {
  #closed=false; #failure:"ROLLED_BACK"|"COMMIT_UNKNOWN"|"UNKNOWN"="UNKNOWN";
  #pending:readonly string[]=[];
  readonly input:PreflightInput;
  constructor(readonly db:Database,sessionMs:number) {
    db.users++;
    const base=rehearsalInput();const entries=Object.entries(db.files).map(([filename,contents])=>({filename,sha256:createHash("sha256").update(contents).digest("hex")}));
    const target={kind:"LOCAL_REHEARSAL" as const,id:db.id,database:"rehearsal_db",identity:"MIGRATOR" as const};
    this.input={...base,expectedCommit:BASELINE,actualCommit:BASELINE,target,migrations:entries,approvedManifest:entries,history:{...base.history,schema:"rehearsal_history",table:"flyway_schema_history",targetId:db.id,database:target.database},privileges:{...base.privileges,targetId:db.id,database:target.database},transport:{adapter:"LOCAL_DOCKER",credentialModel:"DISPOSABLE_LOCAL",binding:"LOOPBACK_PRIVATE_NAMESPACE",publishedPorts:false,restartPolicy:"NONE",sessionMs}};
    brands.add(this);Object.freeze(this);
  }
  get now():number {return Date.now();}
  get pending():readonly string[]{return this.#pending;}
  failureOutcome(){return this.#failure;}
  committedCount():number {return this.db.evidence.migrationsRecorded;}
  checkInput(input:PreflightInput):void {if(binding(input)!==binding(this.input)) fail("MANIFEST_MISMATCH");}
  async perform(stage:Stage):Promise<void> {
    if(stage==="STOP") {if(!this.#closed){this.#closed=true;if(--this.db.users===0) await this.db.cleanup();}return;}
    if(this.#closed) fail("STATE_REJECTED");
    if(stage==="START") return;
    if(stage==="INFO" && this.db.scenario==="wrapper") throw new Error("disposable-secret SQL wrapper test");
    if(stage==="INFO" || stage==="VALIDATE") {
      if(stage==="VALIDATE") {const result=await this.db.flyway("validate");if(!validationPassed(result)) fail("VALIDATION_FAILED");const doc=parseJson(result) as {flywayVersion?:string};this.db.evidence.versionVerified=doc.flywayVersion===ARTIFACTS.flyway.version;if(!this.db.evidence.versionVerified) fail("ARTIFACT_MISMATCH");}
      const doc=parseJson(await this.db.flyway("info")) as {migrations:{version:string;state:string}[]};
      this.#pending=Object.freeze(doc.migrations.filter(r=>r.state==="Pending").map(r=>String(Number(r.version)).padStart(6,"0")).sort());
      return;
    }
    if(stage==="MIGRATE") {
      this.db.evidence.migrationsStarted++;
      const r=await this.db.flyway("migrate");
      if(r.code!==0) {
        this.db.evidence.lockRejected=/Unable to acquire.*lock|Could not acquire.*lock|Unable to obtain.*lock|Number of retries exceeded.*acquire.*lock|lock.*(?:timeout|timed out)/i.test(r.output);
        await this.db.snapshot();
        if(/division by zero/.test(r.output) && this.db.evidence.failedMarkerAbsent) this.#failure="ROLLED_BACK";
        fail("MIGRATION_FAILED");
      }await this.db.snapshot();return;
    }
    if(!validationPassed(await this.db.flyway("validate"))) fail("POST_VALIDATION_FAILED");await this.db.snapshot();
    if(this.db.scenario==="success") await this.db.negativeHistoryChecks();
  }
}
Object.freeze(Driver.prototype);

/** Explicit local-only factory: no URLs, credentials, mounts, commands or target switches. */
export async function createLocalDockerRehearsal(scenario:Scenario="success", runners:1|2=1,sessionMs=120_000) {
  if(!["success","partial","slow","wrapper","invalid"].includes(scenario) || ![1,2].includes(runners) || !Number.isSafeInteger(sessionMs) || sessionMs<1 || sessionMs>300_000) fail("TRANSPORT_CONTRACT_REJECTED");
  const names=scenario==="partial"?["V000001__seed.sql","V000002__failure.sql"]:["V000001__seed.sql","V000002__extend.sql"];
  const files:Record<string,string>={};
  for(const name of names) files[name]=await readFile(new URL(`../../tests/productionMigrationOperator/fixtures/${scenario === "wrapper" || scenario === "invalid" ? "success" : scenario}/${name}`,import.meta.url),"utf8");
  checkSyntheticSnapshot(scenario,files);
  const db=new Database(scenario,Object.freeze(files));
  try {
    await db.setup();
    const handles=Array.from({length:runners},()=>{
      const driver=new Driver(db,sessionMs);const session=new LocalMigrationSession(driver);
      const input=structuredClone(driver.input);
      return Object.freeze({session,input,approve:()=>issueLocalRehearsalAuthorization(session.review(),Date.now()+30_000,Date.now())});
    });
    return Object.freeze({handles:Object.freeze(handles),evidence:()=>Object.freeze({...db.evidence}),waitForMigrationStart:()=>db.waitForMigrationStart(),cleanup:()=>Promise.all(handles.map(h=>h.session.cancel()))});
  } catch(error) {await db.cleanup();throw error;}
}
