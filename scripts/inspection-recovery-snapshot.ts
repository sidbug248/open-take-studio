import {writeFile} from 'node:fs/promises';
import {Store} from '../server/store.ts';
import {config} from '../server/config.ts';
const store=new Store(config.dataDir);
const projectId='f03f4e1f-d214-464a-9743-77fd14575fa8';
const jobs=store.listJobs(projectId).map(j=>({id:j.id,takeId:j.takeId,modelId:j.modelId,state:j.state,requestId:j.requestId,idempotencyKey:j.idempotencyKey,attempts:j.attempts,completedAt:j.completedAt}));
const phase=process.argv.includes('--after')?'after':'before';
await writeFile(`artifacts/inspection-build/creator-review/${phase}-restart-jobs.json`,JSON.stringify({capturedAt:new Date().toISOString(),projectId,jobs},null,2));
console.log(JSON.stringify({phase,jobs}));store.close();
