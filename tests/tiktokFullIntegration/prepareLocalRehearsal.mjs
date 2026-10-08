import { verifyB7Artifact } from "../../scripts/verifyTikTokB7Artifact.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, realpath, cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
const run=promisify(execFile);
const root=fileURLToPath(new URL("../../",import.meta.url));
const expected="7f16aa12c75f7f20a50b88c50b4e7e5b13f11196";
const env={SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,TEMP:process.env.TEMP,TMP:process.env.TMP};
async function command(exe,args){return (await run(exe,args,{env,windowsHide:true,maxBuffer:1024*1024,timeout:60000})).stdout.trim();}
try {
 if(process.argv.length!==3)throw new Error("PUBLISHER_ROOT_REQUIRED");
 const publisher=await realpath(resolve(process.argv[2]));
 if(await command("git",["--no-optional-locks","-C",publisher,"rev-parse","HEAD"])!==expected)throw new Error("B7_CHECKPOINT_MISMATCH");
 await command("git",["--no-optional-locks","-C",publisher,"diff","--quiet","HEAD","--","src"]);
 const out=join(tmpdir(),"nexcut-mission07-build"),tsc=join(root,"node_modules/typescript/bin/tsc");
 const options={esModuleInterop:true,module:"CommonJS",target:"ES2022",moduleResolution:"Node",strict:true,skipLibCheck:true,typeRoots:[join(root,"node_modules/@types")],types:["node","react","react-dom"],lib:["dom","dom.iterable","esnext"],jsx:"react-jsx"};
 const config=join(tmpdir(),"nexcut-mission07-compile.json");
 const files=["lib/server/productionIdentity/productionOwnerUidProofRoute.ts","tests/productionIdentity/productionOwnerUidProofRoute.test.ts","tests/productionIdentity/sessionLifecycleFakeE2E.test.ts","lib/server/tiktokKeys/index.ts","lib/server/tiktokHttp/nativeTransport.ts","lib/server/tiktokPublisherB7/index.ts","tests/tiktokHardening/callback.test.ts","tests/tiktokHardening/serialization.test.ts","tests/tiktokHardening/chunkBoundary.test.ts","tests/tiktokHardening/publisher.test.ts","tests/tiktokHardening/keys.test.ts","tests/tiktokHardening/transport.test.ts","lib/server/tiktokIntegration/index.ts","lib/server/tiktokIntegration/publisher.ts","tests/tiktokIntegration/postgresql.test.tsx","tests/tiktokIntegration/client.test.tsx","tests/tiktokConnection/jsdom.d.ts","tests/tiktokFirebase/auth.test.ts","tests/tiktokHttp/adapter.test.ts","tests/tiktokFullIntegration/full.test.tsx"].map(p=>join(root,p));
 await writeFile(config,JSON.stringify({compilerOptions:{...options,rootDir:root,outDir:out},files},null,2));
 await command(process.execPath,[tsc,"--project",config]);
 await command(process.execPath,[tsc,"--project",config,"--noEmit","--target","ES2017"]);
 const manifest=await verifyB7Artifact();await cp(join(root,"lib/server/tiktokPublisherB7/artifact"),join(out,"publisher"),{recursive:true});await cp(join(root,"lib/server/tiktokPublisherB7/artifact"),join(out,"lib/server/tiktokPublisherB7/artifact"),{recursive:true});
 await writeFile(join(out,"publisher-provenance.json"),JSON.stringify({commit:expected,sourceTrackedClean:true,tree:manifest.publisherTree}));
 console.log("LOCAL_BUILD_PASS",JSON.stringify({publisherCheckpoint:expected,sourceTrackedClean:true,focusedStrictTypecheck:"ES2017_PASS",output:"nexcut-mission07-build",sourceChanges:0}));
}catch{console.error("LOCAL_BUILD_FAILED");process.exitCode=1;}
