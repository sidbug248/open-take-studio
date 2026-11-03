import {test} from 'node:test';
import assert from 'node:assert/strict';
import {creationRoute} from '../shared/creation-routing.ts';
import {MODEL_REGISTRY as models} from '../server/model-registry.ts';
import type {Asset} from '../shared/types.ts';
const assets=[{id:'original-image',kind:'image'},{id:'original-video',kind:'video'},{id:'original-audio',kind:'audio'}] as Asset[];
test('opening film uses original first frame and excludes incompatible reference mode',()=>{const route=creationRoute('film',models,assets);assert.equal(route.modelId,'minimax/minimax-h3');assert.deepEqual(route.inputAssetIds,{first_frame:'original-image'});assert.equal(route.view,'studio');});
test('performance retains actual video plus appearance reference',()=>{const route=creationRoute('performance',models,assets);assert.equal(route.modelId,'higgsfield/higgsfield-genjutsu-motion-transfer-v1.0');assert.equal(route.inputAssetIds.video,'original-video');assert.deepEqual(route.inputAssetIds.images,['original-image']);});
test('sound and playable outcomes open local editors with originals and no inference submission',()=>{const sound=creationRoute('motion',models,assets),play=creationRoute('playable',models,assets);assert.equal(sound.view,'motion');assert.equal(sound.initialAudioAssetId,'original-audio');assert.deepEqual(sound.inputAssetIds,{});assert.equal(play.view,'playable');assert.equal(play.initialAssetId,'original-image');});
