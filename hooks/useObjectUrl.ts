"use client";
import {useMemo,useSyncExternalStore} from 'react';

/** Subscription owns the browser resource; render and SSR never allocate it. */
function createObjectUrlStore(blob:Blob|null){
  let value='';const listeners=new Set<()=>void>();
  return {
   snapshot:()=>value,
   subscribe(listener:()=>void){
    listeners.add(listener);
    if(blob&&!value){value=URL.createObjectURL(blob);for(const notify of listeners)notify();}
    return ()=>{listeners.delete(listener);if(!listeners.size&&value){URL.revokeObjectURL(value);value='';}};
   },
  };
}
export function useObjectUrl(blob:Blob|null):string{
 const store=useMemo(()=>createObjectUrlStore(blob),[blob]);
 return useSyncExternalStore(store.subscribe,store.snapshot,()=> '');
}
