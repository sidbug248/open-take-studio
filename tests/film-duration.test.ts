import test from 'node:test';
import assert from 'node:assert/strict';
import {storedVideoDuration} from '../client/film-duration';

test('film duration accepts finite original measurements in direct and nested metadata',()=>{
 assert.equal(storedVideoDuration({metadata:{duration:5.167}}),5.167);
 assert.equal(storedVideoDuration({metadata:{videoInfo:{duration:3.25}}}),3.25);
 assert.equal(storedVideoDuration({metadata:{probe:{format:{duration:'4.125'}}}}),4.125);
});
test('film duration never substitutes requested settings or a shortened discovery loop',()=>{
 assert.equal(storedVideoDuration({metadata:{settings:{duration:10},preview:{duration:4},motionComposition:{duration:6}}}),undefined);
 for(const duration of [null,0,-1,'Infinity','unknown',false])assert.equal(storedVideoDuration({metadata:{duration}}),undefined);
});
