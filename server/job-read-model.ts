import type {DatabaseSync} from 'node:sqlite';
import type {Job} from '../shared/types.ts';
import type {JobStatusSummary} from '../shared/presentation-contract.ts';

const scalarKeys=['id','projectId','takeId','modelId','provider','requestId','idempotencyKey','state','routerStatus','delivery','queuePosition','errorType','errorMessage','httpStatus','diagnosticRequestId','attempts','collectAttempts','nextPollAt','createdAt','updatedAt','submittedAt','completedAt'] as const;
const workflowKeys=['origin','versionAssetId','graphSha256','target','cloudStatus','progress','submissionOutcome'] as const;
export function statusBody(job:Job):Record<string,unknown>{
  const body:Record<string,unknown>={executionRoute:job.executionRoute??'router',inputs:{},bodiesOmitted:true};
  for(const key of scalarKeys)if(job[key]!==undefined)body[key]=key==='errorMessage'?String(job[key]).slice(0,2000):job[key];
  if(job.workflow)body.workflow={...Object.fromEntries(workflowKeys.filter(key=>job.workflow![key]!==undefined).map(key=>[key,job.workflow![key]])),values:{}};
  return body;
}
export function ensureJobReadModel(db:DatabaseSync){
  db.exec('CREATE TABLE IF NOT EXISTS job_status (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, state TEXT NOT NULL, updated_at TEXT NOT NULL, data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS job_status_project_state ON job_status(project_id,state,updated_at);');
  // Reversible projection only. Existing full records stay unchanged; only missing summaries are backfilled.
  const fields=scalarKeys.flatMap(key=>[`'${key}'`,key==='errorMessage'?"substr(json_extract(j.body,'$.errorMessage'),1,2000)":`json_extract(j.body,'$.${key}')`]).join(',');
  const workflow=workflowKeys.flatMap(key=>[`'${key}'`,`json_extract(j.body,'$.workflow.${key}')`]).join(',');
  db.exec(`WITH missing AS MATERIALIZED (SELECT id,project_id,jsonb(data) AS body FROM jobs original WHERE NOT EXISTS(SELECT 1 FROM job_status s WHERE s.id=original.id))
    INSERT INTO job_status(id,project_id,state,updated_at,data)
    SELECT j.id,j.project_id,json_extract(j.body,'$.state'),json_extract(j.body,'$.updatedAt'),
      json_object(${fields},'executionRoute',coalesce(json_extract(j.body,'$.executionRoute'),'router'),'inputs',json('{}'),'bodiesOmitted',json('true'),
      'workflow',CASE WHEN json_type(j.body,'$.workflow')='object' THEN json_object(${workflow},'values',json('{}')) ELSE NULL END)
    FROM missing j;`);
}
export function writeJobReadModel(db:DatabaseSync,job:Job){db.prepare('INSERT INTO job_status(id,project_id,state,updated_at,data) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,state=excluded.state,updated_at=excluded.updated_at,data=excluded.data').run(job.id,job.projectId,job.state,job.updatedAt,JSON.stringify(statusBody(job)));}
export function readJobSummaries(db:DatabaseSync,projectId:string):JobStatusSummary[]{
  const rows=db.prepare('SELECT s.data,EXISTS(SELECT 1 FROM archived_jobs a WHERE a.job_id=s.id) AS archived FROM job_status s WHERE s.project_id=? ORDER BY s.updated_at,s.id').all(projectId) as {data:string;archived:number}[];
  return rows.map(row=>{const value=JSON.parse(row.data);for(const key of Object.keys(value))if(value[key]===null)delete value[key];return{...value,archived:!!row.archived} as JobStatusSummary;});
}
