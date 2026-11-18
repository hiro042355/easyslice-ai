/** Offline package proof. Upstream ZIP and repository are never modified.
 * Only disposable extracted test cleanup moves to the parent, after the SQLite
 * owning child has exited. All upstream assertions remain byte-identical.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const Zip=require('adm-zip');
const zipPath=process.argv[2];if(!zipPath)throw Error('ZIP path required');
const bytes=fs.readFileSync(zipPath);if(createHash('sha256').update(bytes).digest('hex')!=='4948cfb9a91f53935e174ff81fafcf24a335cff74e5aa8ae21ee65ce898cff87')throw Error('ZIP checksum mismatch');
const zip=new Zip(bytes);if(!zip.test())throw Error('ZIP CRC failed');
let total=0;const seen=new Set();
for(const e of zip.getEntries()){
 const n=e.entryName,mode=(e.header.attr>>>16)&0xffff;total+=e.header.size;
 if(!n||n.startsWith('/')||n.includes('\\')||n.includes(':')||n.split('/').includes('..')||seen.has(n.toLowerCase())||(mode&0xf000)===0xa000||total>20000000)throw Error('Unsafe ZIP');seen.add(n.toLowerCase());
}
const parent=fs.realpathSync(os.tmpdir());const directory=fs.mkdtempSync(path.join(parent,'nexcut-character-proof-'));
let result;
try{
 zip.extractAllTo(directory,false);
 const root=path.join(directory,'nexcut-character-engine-0-nexcut-engine-development-eb546ed2');
 for(const [name,db] of [['mv-consumer.test.ts','TEST_MV_DB'],['e2e.test.ts','TEST_E2E_DB']]){
  const file=path.join(root,'src/domain/character',name),source=fs.readFileSync(file,'utf8');
  const needle=`fs.unlinkSync(${db});`;if(source.split(needle).length!==2)throw Error('Unexpected test cleanup source');
  fs.writeFileSync(file,source.replace(needle,'// Parent removes disposable DB after this child exits.'));
 }
 const env={};for(const k of ['PATH','Path','SystemRoot','WINDIR','ComSpec','TEMP','TMP'])if(process.env[k])env[k]=process.env[k];
 env.NEXCUT_AUTH_SECRET=randomBytes(32).toString('hex');
 const r=spawnSync(process.execPath,[require.resolve('tsx/cli'),'--test','--test-concurrency=1','src/domain/character/mv-consumer.test.ts','src/domain/character/e2e.test.ts'],{cwd:root,env,encoding:'utf8',timeout:60000,maxBuffer:1024*1024,windowsHide:true});
 result={mode:'ISOLATED_PARENT_CLEANUP_COMPATIBILITY_PROOF',upstreamUnchanged:true,assertionsChanged:false,exit:r.status,signal:r.signal,error:r.error?.code??null,output:(r.stdout??'')+(r.stderr??'')};
}finally{
 const resolved=path.resolve(directory);if(path.dirname(resolved)!==parent||!path.basename(resolved).startsWith('nexcut-character-proof-'))throw Error('Unsafe cleanup target');
 fs.rmSync(resolved,{recursive:true,force:true});
}
console.log(JSON.stringify({...result,parentCleanupSucceeded:true},null,2));process.exitCode=result.exit===0?0:1;
