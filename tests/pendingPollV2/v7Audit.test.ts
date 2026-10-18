import test from 'node:test';import assert from 'node:assert/strict';import {audit} from '../../lib/pendingPollV2/pendingPollV2Utils';
test('poll audit counts typed statuses without dereferencing malformed observations',()=>{
 const value=audit('failed',{items:[null,{},'invalid',{status:'accepted'},{status:'processing'},{status:'completed'},{status:'omitted'}]},'generate-vocal',1,[]);
 assert.equal(value.pendingItemCount,2);assert.equal(value.processingItemCount,1);assert.equal(value.completedItemCount,1);assert.equal(value.omittedItemCount,1);assert.equal(value.failedItemCount,0);assert.deepEqual(value.reasonCodes,[]);assert.equal(value.operation,'generate-vocal');
 assert.equal(audit('failed',null,'generate-vocal',1,[]).pendingItemCount,0);
});
