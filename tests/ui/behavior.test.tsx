import {test} from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {Modal} from '../../components/ui/Modal';
import {RadioGroup} from '../../components/ui/RadioGroup';
import {HamburgerMenu} from '../../components/ui/HamburgerMenu';
import {AccordionItem} from '../../components/ui/Accordion';
import {SelectionCard} from '../../components/ui/SelectionCard';
import {CameraEditor} from '../../components/CameraEditor';
import type {CameraMovement} from '../../lib/camera/cameraTypes';

async function withDom(run:(host:HTMLElement,render:(node:React.ReactNode)=>Promise<void>)=>Promise<void>){
 const dom=new JSDOM('<button id="outside">Outside</button><div id="root"></div>',{url:'http://localhost'});
 const keys=['window','document','navigator','HTMLElement','IS_REACT_ACT_ENVIRONMENT'];const prior=keys.map(k=>Object.getOwnPropertyDescriptor(globalThis,k));
 for(const [k,v] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true}))Object.defineProperty(globalThis,k,{value:v,configurable:true,writable:true});
 const host=dom.window.document.getElementById('root')!,root=createRoot(host);
 try{await run(host,async node=>{await act(async()=>root.render(node));});}finally{await act(async()=>root.unmount());dom.window.close();keys.forEach((k,i)=>{const p=prior[i];if(p)Object.defineProperty(globalThis,k,p);else Reflect.deleteProperty(globalThis,k);});}
}
test('Modal traps enabled focus, Escape closes and restores focus/scroll',async()=>withDom(async(host,render)=>{
 const outside=document.getElementById('outside')!;outside.focus();document.body.style.overflow='clip';let closes=0;
 await render(<Modal isOpen title="Modal" onClose={()=>closes++} isLoading onConfirm={()=>{}} confirmLabel="Confirm"/>);
 await act(async()=>{await new Promise(r=>setTimeout(r,60));});
 const close=host.querySelector<HTMLButtonElement>('button')!;assert.equal(document.activeElement,close);
 await act(async()=>document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true})));assert.equal(document.activeElement,close);
 await act(async()=>document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(closes,1);
 await render(null);assert.equal(document.activeElement,outside);assert.equal(document.body.style.overflow,'clip');
}));
test('RadioGroup arrows skip disabled options and move real DOM focus',async()=>withDom(async(host,render)=>{
 let selected='a';await render(<RadioGroup value="a" options={[{value:'a',label:'A'},{value:'b',label:'B',disabled:true},{value:'c',label:'C'}]} onChange={v=>{selected=v;}}/>);
 const inputs=host.querySelectorAll<HTMLInputElement>('input');inputs[0].focus();
 await act(async()=>inputs[0].dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true})));
 assert.equal(selected,'c');assert.equal(document.activeElement,inputs[2]);
}));
test('Hamburger opens focused modal navigation, Escape restores toggle',async()=>withDom(async(host,render)=>{
 await render(<HamburgerMenu links={[{href:'/ai-mv',label:'AI MV'}]}/>);const toggle=host.querySelector<HTMLButtonElement>('button')!;
 await act(async()=>toggle.click());assert.equal(toggle.getAttribute('aria-expanded'),'true');const dialog=host.querySelector('[role="dialog"]')!;assert.equal(document.activeElement,dialog.querySelector('button'));
 await act(async()=>document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(host.querySelector('[role="dialog"]'),null);assert.equal(document.activeElement,toggle);
}));
test('Accordion toggles actual region and disabled selection never activates',async()=>withDom(async(host,render)=>{
 let calls=0;await render(<><AccordionItem title="Details">Content</AccordionItem><SelectionCard title="Unavailable" disabled onClick={()=>calls++}/></>);
 await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());assert.ok(host.querySelector('[role="region"]'));
 const card=host.querySelector<HTMLElement>('[role="button"]')!;await act(async()=>{card.click();card.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));});assert.equal(calls,0);assert.equal(card.tabIndex,-1);
}));
test('Camera recommendations require acceptance then application, reject preserves settings',async()=>withDom(async(host,render)=>{
 let movements:readonly CameraMovement[]=[];
 await render(<CameraEditor clipDuration={12} movements={movements} onChangeMovements={m=>{movements=m;}}/>);
 const button=(text:string)=>[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===text)!;
 // Recommendation accordion is initially collapsed.
 const director=[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes('AI Camera'));
 if(director)await act(async()=>director.click());
 assert.equal(movements.length,0);assert.ok(button('Accept'));
 await act(async()=>button('Accept').click());assert.equal(movements.length,0);
 await act(async()=>button('Apply').click());assert.equal(movements.length,1);assert.equal(movements[0].approvalStatus,'APPLIED');
 const before=JSON.stringify(movements);await act(async()=>button('Reject').click());assert.equal(JSON.stringify(movements),before);
}));
