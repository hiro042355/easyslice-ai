import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,statSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {buildCameraFfmpegFilter} from '../../lib/server/ffmpegCameraFilter';
import {createDefaultCameraMovement} from '../../lib/camera/cameraEngine';
const ffmpeg=process.env.NEXCUT_TEST_FFMPEG;
for(const type of ['PAN','ZOOM','CRANE_SIMULATION'] as const)test(`synthetic real MP4 export: ${type}`,{skip:!ffmpeg},()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'nexcut-mp4-'));
 try{
  const output=path.join(directory,'output.mp4');const movement={...createDefaultCameraMovement('clip',type),endTime:1};
  const filter=buildCameraFfmpegFilter([movement],1,320,180,10);assert.ok(filter);
  execFileSync(ffmpeg!,['-v','error','-y','-f','lavfi','-i','testsrc2=size=320x180:rate=10:duration=1','-vf',filter,'-frames:v','10','-c:v','libx264',output],{stdio:'pipe',timeout:30000});
  assert.ok(statSync(output).size>0);
  execFileSync(ffmpeg!,['-v','error','-i',output,'-f','null','-'],{stdio:'pipe',timeout:30000});
 }finally{rmSync(directory,{recursive:true,force:true});}
});
