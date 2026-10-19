import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceWorkflowBrowserTimerAdapter as timer} from '../../hooks/referenceWorkflowHookTimerAdapter';

test('reviewed browser timer adapter is dormant, one-shot and cancellable',async()=>{
 let called=0;const handle=timer.schedule(1,()=>called++);timer.cancel(handle);
 await new Promise<void>(resolve=>{timer.schedule(10,resolve);});assert.equal(called,0);
 await new Promise<void>(resolve=>{timer.schedule(1,()=>{called++;resolve();});});assert.equal(called,1);
});
