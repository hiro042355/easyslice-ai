import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {buildCameraFfmpegFilter} from '../../lib/server/ffmpegCameraFilter';
import {createDefaultCameraMovement,interpolateCameraTransform} from '../../lib/camera/cameraEngine';
import type {CameraMovement} from '../../lib/camera/cameraTypes';

// Opt-in executable supplied by the local test runner, never a network download.
const ffmpeg=process.env.NEXCUT_TEST_FFMPEG;
const cases:readonly [string,Partial<CameraMovement>][]=[
 ['static',{startZoom:1,endZoom:1,startPosition:{x:0,y:0},endPosition:{x:0,y:0}}],
 ['pan-left',{startPosition:{x:.15,y:0},endPosition:{x:-.15,y:0}}],
 ['pan-right',{startPosition:{x:-.15,y:0},endPosition:{x:.15,y:0}}],
 ['tilt-up',{startPosition:{x:0,y:.15},endPosition:{x:0,y:-.15}}],
 ['tilt-down',{startPosition:{x:0,y:-.15},endPosition:{x:0,y:.15}}],
 ['zoom-in',{startZoom:1,endZoom:2}],['zoom-out',{startZoom:2,endZoom:1}],
 ['zoom-pan',{startZoom:1,endZoom:2,startPosition:{x:0,y:0},endPosition:{x:.15,y:0}}],
 ['mid-clip',{startTime:.5,endTime:1.5}],['end-clip',{startTime:1,endTime:2}],
 ['ends-before-completion',{startTime:.4,endTime:1.2,startPosition:{x:-.1,y:.1},endPosition:{x:.1,y:-.1}}],
];
for(const [w,h] of [[320,180],[180,320],[256,256]] as const)for(const [name,overrides] of cases)test(`actual FFmpeg crop parity: ${name} ${w}x${h}`,{skip:!ffmpeg},()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'nexcut-camera-'));
 try{
  const fps=10,frames=21;
  // RGB coordinate ramp: output centre encodes source crop-centre position.
  const pixels=Buffer.alloc(w*h*3);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*3;pixels[i]=Math.round(x/(w-1)*255);pixels[i+1]=Math.round(y/(h-1)*255);pixels[i+2]=64;}
  const ppm=path.join(dir,'ramp.ppm');writeFileSync(ppm,Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`),pixels]));
  const movement:CameraMovement={...createDefaultCameraMovement(),startTime:0,endTime:2,startZoom:2,endZoom:2,startPosition:{x:0,y:0},endPosition:{x:0,y:0},...overrides};
  const filter=buildCameraFfmpegFilter([movement],2,w,h,fps);assert.ok(filter);
  const video=path.join(dir,'out.mkv');
  execFileSync(ffmpeg!,['-v','error','-y','-loop','1','-framerate',String(fps),'-i',ppm,'-vf',filter,'-frames:v',String(frames),'-c:v','ffv1',video],{stdio:'pipe',timeout:30000});
  const raw=execFileSync(ffmpeg!,['-v','error','-i',video,'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{maxBuffer:w*h*3*frames+1024,timeout:30000});
  assert.equal(raw.length,w*h*3*frames);
  for(const frame of [0,2,5,10,15,19,20]){
   const expected=interpolateCameraTransform([movement],frame/fps);
   for(const u of [.25,.5,.75])for(const v of [.25,.5,.75]){
    const i=frame*w*h*3+(Math.floor(h*v)*w+Math.floor(w*u))*3;
    assert.ok(Math.abs(raw[i]-255*(.5+expected.x+(u-.5)/expected.zoom))<=5,`${name} frame ${frame}: X ${raw[i]}`);
    assert.ok(Math.abs(raw[i+1]-255*(.5+expected.y+(v-.5)/expected.zoom))<=5,`${name} frame ${frame}: Y ${raw[i+1]}`);
   }
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('export rejects unbounded dimensions, frame rates and duration',()=>{
 const m={...createDefaultCameraMovement(),endTime:1};
 for(const n of [NaN,Infinity,0,-1,1e12])assert.equal(buildCameraFfmpegFilter([m],2,n,180,10),null);
 assert.equal(buildCameraFfmpegFilter([m],Infinity),null);
 assert.equal(buildCameraFfmpegFilter([m],2,320,180,121),null);
});
