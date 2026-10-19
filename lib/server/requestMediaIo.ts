import {createWriteStream} from 'node:fs';
import {lstat,readFile} from 'node:fs/promises';
import {Transform,type Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {checkMediaCancellation,MediaRequestFailure} from './requestMediaWorkspace';

/** Server-selected object only, exclusively created inside a private request workspace. */
export async function downloadRequestMedia(source:Readable,destination:string,signal:AbortSignal,maxBytes=2*1024*1024*1024):Promise<void>{
 let bytes=0;
 const bound=new Transform({transform(chunk:Buffer,_encoding,done){bytes+=chunk.length;done(bytes>maxBytes?new MediaRequestFailure('invalid-request'):null,chunk);}});
 await pipeline(source,bound,createWriteStream(destination,{flags:'wx',mode:0o600}),{signal});
 checkMediaCancellation(signal);
}
export async function readBoundedMediaOutput(filename:string,maxBytes=256*1024*1024):Promise<Buffer>{
 const info=await lstat(filename);
 if(!info.isFile()||info.isSymbolicLink()||info.size===0||info.size>maxBytes)throw new MediaRequestFailure('process-failed');
 return readFile(filename);
}
