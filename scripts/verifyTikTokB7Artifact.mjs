import { readFile, readdir, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
export async function verifyB7Artifact(){
 const root=fileURLToPath(new URL("../lib/server/tiktokPublisherB7/",import.meta.url)),artifact=join(root,"artifact"),manifest=JSON.parse(await readFile(join(root,"manifest.json"),"utf8"));
 if(manifest.publisherCommit!=="7f16aa12c75f7f20a50b88c50b4e7e5b13f11196"||manifest.files.length!==40)throw new Error("B7_MANIFEST_REJECTED");
 const found=[];async function walk(dir){for(const item of await readdir(dir,{withFileTypes:true})){if(item.isSymbolicLink())throw new Error("B7_LINK_REJECTED");const path=join(dir,item.name);if(item.isDirectory())await walk(path);else found.push(path);}}await walk(artifact);
 if(found.length!==manifest.files.length)throw new Error("B7_EXTRA_FILE_REJECTED");
 for(const entry of manifest.files){if(!/^[a-zA-Z0-9_/-]+\.(js|d\.ts)$/.test(entry.path)||entry.path.includes(".."))throw new Error("B7_PATH_REJECTED");const path=resolve(artifact,entry.path);if(await realpath(path)!==path||createHash("sha256").update(await readFile(path)).digest("hex")!==entry.sha256)throw new Error("B7_CHECKSUM_REJECTED");}
 return manifest;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){verifyB7Artifact().then(v=>console.log("B7_ARTIFACT_PASS",JSON.stringify({commit:v.publisherCommit,files:v.files.length}))).catch(()=>{console.error("B7_ARTIFACT_FAILED");process.exitCode=1;});}
