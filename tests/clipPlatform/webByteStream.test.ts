import test from 'node:test';import assert from 'node:assert/strict';import {Readable} from 'node:stream';
import {webByteStream} from '../../lib/server/webByteStream';
test('byte stream bridges Response without casting and preserves bytes',async()=>{
 const result=await new Response(webByteStream(Readable.from([Buffer.from([0,1]),Buffer.from([2,255])]))).arrayBuffer();assert.deepEqual([...new Uint8Array(result)],[0,1,2,255]);
});
test('byte stream rejects object chunks and propagates cancellation',async()=>{
 await assert.rejects(new Response(webByteStream(Readable.from([{}]))).arrayBuffer(),/INVALID_BYTE_STREAM/);
 const source=new Readable({read(){}});await webByteStream(source).cancel();assert.equal(source.destroyed,true);
});
