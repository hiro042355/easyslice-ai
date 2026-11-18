import test from 'node:test';import assert from 'node:assert/strict';
import {subtitleSourceUrl,parseJson3Subtitles} from '../../lib/server/subtitleSafety';
test('subtitle source accepts only canonical HTTPS YouTube hosts, not shell or SSRF destinations',()=>{
 for(const input of ['https://youtu.be/example','https://www.youtube.com/watch?v=example'])assert.equal(typeof subtitleSourceUrl(input),'string');
 for(const input of [null,{},'file:///etc/passwd','http://127.0.0.1','https://youtube.com.evil.example/watch','https://user:secret@youtube.com/watch','https://youtube.com:8443/watch','" & echo injected & "'])assert.equal(subtitleSourceUrl(input),undefined);
});
test('JSON3 subtitle projection preserves valid text/timing and rejects malformed structures',()=>{
 assert.deepEqual(parseJson3Subtitles({events:[{tStartMs:1234,segs:[{utf8:'first\n'},{utf8:'second'}]},{segs:[]}]}),[{second:1,text:'first second'}]);
 assert.deepEqual(parseJson3Subtitles({}),[]);
 for(const value of [null,{events:{}},{events:[{tStartMs:'0',segs:[{utf8:'text'}]}]},{events:[{tStartMs:0,segs:[{utf8:{}}]}]}])assert.throws(()=>parseJson3Subtitles(value),/INVALID_SUBTITLE_DATA/);
});
