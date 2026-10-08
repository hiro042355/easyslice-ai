import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { fileURLToPath } from "node:url";

const endpoint="npipe:////./pipe/dockerDesktopLinuxEngine";
const dockerExe="C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe";
const pgImage="sha256:c2d42a104eb6b37b286a2d9c5cf83f349de4d6516d513d00a2bd9610e2c2e5e4";
const nodeImage="sha256:876479697e6f272e7897f9cebc5d43090e4e7ba164de9eb11e07767bff075011";
const id=`mission03migration_${randomUUID().replaceAll("-","")}`;
const network=`${id}_net`,pgName=`${id}_pg`,nodeName=`${id}_node`;
const password=randomBytes(24).toString("hex");
let networkCreated=false,pgCreated=false,nodeCreated=false;
function environment(extra={}){return {SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,TEMP:process.env.TEMP,TMP:process.env.TMP,...extra};}
async function docker(args,extra={},input,timeout=60_000,pin=true){return new Promise((resolvePromise,reject)=>{const child=spawn(dockerExe,[...(pin?["--host",endpoint]:[]),...args],{env:environment(extra),windowsHide:true,stdio:["pipe","pipe","pipe"]});let output="";const timer=setTimeout(()=>{child.kill();reject(new Error("LOCAL_TIMEOUT"));},timeout);const append=chunk=>{output+=chunk.toString();if(Buffer.byteLength(output)>1024*1024){child.kill();clearTimeout(timer);reject(new Error("BOUNDED_OUTPUT_EXCEEDED"));}};child.stdout.on("data",append);child.stderr.on("data",append);child.on("error",()=>{clearTimeout(timer);reject(new Error("LOCAL_PROCESS_FAILED"));});child.on("close",code=>{clearTimeout(timer);resolvePromise({code:code??1,output});});child.stdin.on("error",()=>{});child.stdin.end(input);});}
const ok=result=>{if(result.code!==0){console.error(result.output.replaceAll(password,"[REDACTED]"));throw new Error("LOCAL_COMMAND_FAILED");}return result.output.trim();};
async function cleanup(){
  for(const [name,created] of [[nodeName,nodeCreated],[pgName,pgCreated]])if(created){const r=await docker(["rm","--force","--volumes",name]);if(r.code!==0 && (await docker(["inspect",name])).code===0)throw new Error("CLEANUP_FAILED");}
  if(networkCreated){const r=await docker(["network","rm",network]);if(r.code!==0 && (await docker(["network","inspect",network])).code===0)throw new Error("CLEANUP_FAILED");}
  const containers=ok(await docker(["ps","--all","--quiet","--filter",`label=nexcut.mission03migration=${id}`]));const networks=ok(await docker(["network","ls","--quiet","--filter",`label=nexcut.mission03migration=${id}`]));if(containers || networks)throw new Error("CLEANUP_FAILED");
  console.log("LOCAL_CLEANUP",JSON.stringify({containersRemaining:0,networksRemaining:0,publishedPorts:0,credentialMounts:0,persistentVolumes:0}));
}
try{
  if(process.argv.length!==2 || process.env.DOCKER_CONFIG || (process.env.DOCKER_HOST && process.env.DOCKER_HOST!==endpoint) || (process.env.DOCKER_CONTEXT && process.env.DOCKER_CONTEXT!=="desktop-linux"))throw new Error("LOCAL_DOCKER_REQUIRED");
  const profile={USERPROFILE:process.env.USERPROFILE??""};if(ok(await docker(["context","show"],profile,undefined,60_000,false))!=="desktop-linux" || ok(await docker(["context","inspect","desktop-linux","--format","{{.Endpoints.docker.Host}}"],profile,undefined,60_000,false))!==endpoint || ok(await docker(["info","--format","{{.OSType}}|{{.OperatingSystem}}"] ))!=="linux|Docker Desktop")throw new Error("LOCAL_DOCKER_REQUIRED");
  for(const image of [pgImage,nodeImage]){const meta=JSON.parse(ok(await docker(["image","inspect",image])))[0];if(meta.Os!=="linux" || meta.Architecture!=="amd64" || !meta.RepoDigests.some(v=>v.endsWith(`@${image}`)))throw new Error("ARTIFACT_MISMATCH");}
  networkCreated=true;ok(await docker(["network","create","--internal","--driver","bridge","--label",`nexcut.mission03migration=${id}`,network]));networkCreated=true;
  pgCreated=true;ok(await docker(["create","--name",pgName,"--label",`nexcut.mission03migration=${id}`,"--pull","never","--platform","linux/amd64","--network",network,"--user","postgres","--cap-drop","ALL","--security-opt","no-new-privileges:true","--restart","no","--tmpfs","/var/lib/postgresql:rw,mode=1777","--env","POSTGRES_PASSWORD","--env","POSTGRES_USER=local_owner","--env","POSTGRES_DB=oauth_local_test",pgImage,"-c","listen_addresses=127.0.0.1"],{POSTGRES_PASSWORD:password}));pgCreated=true;ok(await docker(["start",pgName]));
  let ready=false;for(let i=0;i<30;i++){if((await docker(["exec",pgName,"pg_isready","-h","127.0.0.1","-U","local_owner","-d","oauth_local_test"])).code===0){ready=true;break;}await new Promise(r=>setTimeout(r,200));}if(!ready)throw new Error("DATABASE_NOT_READY");
  const meta=JSON.parse(ok(await docker(["inspect",pgName])))[0];const net=JSON.parse(ok(await docker(["network","inspect",network])))[0];if(meta.HostConfig.Privileged || meta.HostConfig.NetworkMode!==network || Object.keys(meta.HostConfig.PortBindings??{}).length || meta.Mounts.some(m=>m.Type!=="tmpfs") || !net.Internal)throw new Error("ISOLATION_FAILED");
  const sql=async input=>ok(await docker(["exec","--interactive","--env","PGPASSWORD",pgName,"psql","--no-psqlrc","-h","127.0.0.1","-U","local_owner","-d","oauth_local_test","--tuples-only","--no-align","--set","ON_ERROR_STOP=1"],{PGPASSWORD:password},input));
  await sql("CREATE SCHEMA rehearsal_history; CREATE ROLE oauth_candidate_runtime NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT; REVOKE CREATE ON SCHEMA public FROM PUBLIC;");
  nodeCreated=true;
  ok(await docker(["create","--name",nodeName,"--label",`nexcut.mission03migration=${id}`,"--pull","never","--platform","linux/amd64","--network",`container:${meta.Id}`,"--cap-drop","ALL","--security-opt","no-new-privileges:true","--restart","no","--env","FLYWAY_URL=jdbc:postgresql://127.0.0.1:5432/oauth_local_test","--env","FLYWAY_USER=local_owner","--env","FLYWAY_PASSWORD","--tmpfs","/tmp:rw,mode=1777",nodeImage,"-outputType=json","-locations=filesystem:/flyway","-defaultSchema=rehearsal_history","-schemas=rehearsal_history","-createSchemas=false","-baselineOnMigrate=false","-cleanDisabled=true","-outOfOrder=false","-validateOnMigrate=true","-validateMigrationNaming=true","-ignoreMigrationPatterns=*:pending","-lockRetryCount=0","-connectRetries=0","migrate"],{FLYWAY_PASSWORD:password}));
  const candidate=fileURLToPath(new URL("./NONDEPLOYABLE_oauth_candidate.sql",import.meta.url));
  if(!(await readFile(candidate,"utf8")).startsWith("-- NONDEPLOYABLE CANDIDATE."))throw new Error("CANDIDATE_REQUIRED");
  // Test V1 exists only inside disposable container; no Production version is assigned.
  ok(await docker(["cp",candidate,`${nodeName}:/flyway/V1__local_candidate.sql`]));
  const migration=await docker(["start","--attach",nodeName]);
  if(migration.code!==0 || Number(ok(await docker(["inspect",nodeName,"--format","{{.State.ExitCode}}"])))!==0){console.error(migration.output.replaceAll(password,"[REDACTED]"));throw new Error("CANDIDATE_MIGRATION_FAILED");}
  console.log("CANDIDATE_FRESH_FLYWAY=PASS");
  console.log(await sql(await readFile(new URL("./assertions.sql",import.meta.url),"utf8")));
  const race=await Promise.all([1,2].map(()=>sql("UPDATE tiktok_oauth.states SET status='CLAIMED',claim_id='00000000-0000-0000-0000-000000000099' WHERE id='00000000-0000-0000-0000-000000000001' AND uid='fixture-user' AND session_id=repeat('b',64) AND status='PENDING' AND expires_at>statement_timestamp() RETURNING 'winner';")));
  if(race.filter(v=>v.includes("winner")).length!==1)throw new Error("CONCURRENT_CLAIM_FAILED");
  console.log("CANDIDATE_CONCURRENT_CLAIM=PASS");
  await sql("UPDATE tiktok_oauth.states SET status='CONSUMED'; DO $$ BEGIN BEGIN UPDATE tiktok_oauth.states SET status='PENDING',claim_id=NULL; RAISE EXCEPTION 'state replay accepted'; EXCEPTION WHEN check_violation THEN NULL; END; END $$;"); console.log("CANDIDATE_STATE_REPLAY=PASS");
  const rerun=await docker(["start","--attach",nodeName]);if(rerun.code!==0)throw new Error("IDEMPOTENT_FLYWAY_FAILED");
  console.log("CANDIDATE_FLYWAY_IDEMPOTENCY=PASS");
  await sql("UPDATE rehearsal_history.flyway_schema_history SET checksum=checksum+1 WHERE version='1';");
  const rejectCollision=await docker(["start","--attach",nodeName]);const rejectedExit=Number(ok(await docker(["inspect",nodeName,"--format","{{.State.ExitCode}}"] )));
  if(rejectCollision.code===0 && rejectedExit===0)throw new Error("COLLISION_NOT_REJECTED");
  console.log("CANDIDATE_CHECKSUM_COLLISION=PASS");
  console.log("LOCAL_VERSIONED_MIGRATIONS=1; PRODUCTION_MIGRATIONS=0; SCHEMA_FIXTURES=1");
}catch(error){console.error("LOCAL_REHEARSAL_FAILED",error.message);process.exitCode=1;}finally{try{await cleanup();}catch{console.error("LOCAL_CLEANUP_FAILED");process.exitCode=1;}}
