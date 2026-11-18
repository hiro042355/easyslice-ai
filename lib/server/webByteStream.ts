import type {Readable} from 'node:stream';

/** Node and DOM stream declarations differ; validate bytes rather than cast. */
export function webByteStream(source:Readable):ReadableStream<Uint8Array>{
 const iterator:AsyncIterator<unknown>=source[Symbol.asyncIterator]();
 return new ReadableStream<Uint8Array>({
  async pull(controller){
   try{const next=await iterator.next();if(next.done){controller.close();return;}
    if(!(next.value instanceof Uint8Array))throw Error('INVALID_BYTE_STREAM');
    controller.enqueue(Uint8Array.from(next.value));
   }catch(error){source.destroy();controller.error(error);}
  },
  cancel(){source.destroy();},
 });
}
