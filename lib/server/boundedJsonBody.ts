/** Count actual streamed bytes, including chunked/incorrect Content-Length bodies. */
export async function readBoundedJsonBody(source:Readonly<{body:ReadableStream<Uint8Array>|null}>,maxBytes:number):Promise<unknown>{
 const reader=source.body?.getReader();if(!reader)throw Error('invalid-json-body');
 const chunks:Uint8Array[]=[];let size=0;
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw Error('json-body-too-large');chunks.push(value);}
 }finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
}
