import 'server-only';
import {createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {createDurableMediaOwnershipRepository} from './durableMediaOwnership/repository';
import {transcribeOwnedClip,type OwnedClipTranscriptInput} from './clipTranscriptCore';
import {withProductionMediaRuntime} from './productionMediaRuntime/composition';
import {resolvePackagedFfmpeg} from './packagedFfmpeg';
import {runMediaProcess} from './requestMediaWorkspace';
import {createJapaneseClipProvider} from './clipTranscriptProvider';

export const transcribeProductionOwnedClip=(input:OwnedClipTranscriptInput)=>withProductionMediaRuntime(async({pool,bucket})=>{
 const repository=createDurableMediaOwnershipRepository(pool);
 return transcribeOwnedClip(input,{
  async resolve(i){
   if(!await repository.resolveOwnedJob(i.jobId,i.ownerUid))return;
   const media=await repository.resolveOwnedMedia(i.mediaId,i.ownerUid);
   return media?.jobId===i.jobId?media:undefined;
  },
  async download(key,destination,signal){await pipeline(bucket.file(key).createReadStream(),createWriteStream(destination,{flags:'wx',mode:0o600}),{signal});},
  extract:(source,audio,start,duration,signal)=>runMediaProcess(resolvePackagedFfmpeg(),['-nostdin','-hide_banner','-n','-ss',String(start),'-t',String(duration),'-protocol_whitelist','file,pipe','-i',source,'-vn','-ac','1','-ar','16000',audio],signal),
  transcribe:createJapaneseClipProvider(()=>process.env.GEMINI_API_KEY),
 });
});
