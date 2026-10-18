import test from 'node:test';import assert from 'node:assert/strict';import React,{act,StrictMode,useState} from 'react';import {JSDOM} from 'jsdom';
import SubtitleEditor from '../../components/SubtitleEditor';import {useObjectUrl} from '../../hooks/useObjectUrl';
async function domTest(run:(host:HTMLElement,render:(node:React.ReactNode)=>Promise<void>)=>Promise<void>){
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost'});const values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true};const before=Object.keys(values).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)] as const);
 for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 const {createRoot}=await import('react-dom/client');const host=dom.window.document.getElementById('root')!,root=createRoot(host);
 try{await run(host,node=>act(async()=>{root.render(node);}));}finally{await act(async()=>root.unmount());dom.window.close();for(const [key,descriptor] of before){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}}
}
test('subtitle editor preserves dirty draft, resets selection, saves and accepts external replacement in StrictMode',async()=>domTest(async(host,render)=>{
 let saved='',saves=0,duration=20;
 function Harness({duration}:{duration:number}){const [text,setText]=useState('first line\nsecond line');return <><SubtitleEditor transcriptText={text} videoDuration={duration} hasTranslatedText onSaveTranscript={value=>{saved=value;saves++;setText(value);}}/><button id="replace" onClick={()=>setText('replacement')}>replace source</button><button id="clear" onClick={()=>setText('')}>clear source</button></>;}
 const component=()=> <StrictMode><Harness duration={duration}/></StrictMode>;
 await render(component());const textarea=()=>host.querySelector('textarea')!;assert.equal(textarea().value,'first line');
 await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value')!.set!.call(textarea(),'edited first');textarea().dispatchEvent(new window.Event('input',{bubbles:true}));});
 duration=30;await render(component());assert.equal(textarea().value,'edited first');assert.equal(saves,0);
 await act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('second line'))!.click();});assert.equal(textarea().value,'second line');
 await act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('＋字幕追加'))!.click();});assert.equal(textarea().value,'新しい字幕');
 await act(async()=>{[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('保存してPreview'))!.click();});assert.equal(saves,1);assert.ok(saved.includes('新しい字幕'));assert.ok(host.textContent?.includes('翻訳字幕も更新'));
 await act(async()=>host.querySelector<HTMLButtonElement>('#replace')!.click());assert.equal(textarea().value,'replacement');assert.equal(host.textContent?.includes('翻訳字幕も更新'),false);assert.equal(saves,1);
 await act(async()=>host.querySelector<HTMLButtonElement>('#clear')!.click());assert.equal(host.querySelector('textarea'),null);
}));
test('object URL subscription creates no render-owned resource and revokes all StrictMode/replacement resources',async()=>domTest(async(host,render)=>{
 const create=Object.getOwnPropertyDescriptor(URL,'createObjectURL'),revoke=Object.getOwnPropertyDescriptor(URL,'revokeObjectURL');const created:string[]=[],revoked:string[]=[];
 Object.defineProperty(URL,'createObjectURL',{configurable:true,value:()=>{const value='blob:fixture-'+created.length;created.push(value);return value;}});Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:(value:string)=>revoked.push(value)});
 function Preview({blob}:{blob:Blob|null}){return <output>{useObjectUrl(blob)}</output>;}
 try{const {renderToString}=await import('react-dom/server');assert.equal(renderToString(<Preview blob={new Blob(['server'])}/>),'<output></output>');assert.equal(created.length,0);await render(<StrictMode><Preview blob={new Blob(['a'])}/></StrictMode>);assert.ok(host.textContent?.startsWith('blob:fixture-'));await render(<StrictMode><Preview blob={new Blob(['b'])}/></StrictMode>);await render(<StrictMode><Preview blob={null}/></StrictMode>);assert.equal(host.textContent,'');assert.deepEqual([...created].sort(),[...revoked].sort());}
 finally{if(create)Object.defineProperty(URL,'createObjectURL',create);if(revoke)Object.defineProperty(URL,'revokeObjectURL',revoke);}
}));
