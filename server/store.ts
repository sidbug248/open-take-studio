import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Asset, Job, Project, ProjectDetail, Recipe, Shot, Take } from '../shared/types.ts';
import {ensureJobReadModel,writeJobReadModel,readJobSummaries} from './job-read-model.ts';

type Tables = 'projects' | 'assets' | 'takes' | 'jobs' | 'shots' | 'recipes';
type Entity = Project | Asset | Take | Job | Shot | Recipe;
export interface OperationReceipt<T = unknown> { key: string; fingerprint: string; result: T; createdAt: string; }
export interface RunnableJobQuery { executionRoute?:'router'|'comfy-workflow'; dueAt?:string; excludeIds?:readonly string[]; limit?:number; }

/** Durable local repository. Media is managed separately, so a hosted repository can replace this. */
export class Store {
  readonly db: DatabaseSync;
  readonly dataDir: string;
  constructor(dataDir: string, options: {readOnly?:boolean} = {}) {
    this.dataDir = path.resolve(dataDir);
    if(!options.readOnly)mkdirSync(this.dataDir, { recursive: true });
    this.db = new DatabaseSync(path.join(this.dataDir, 'studio.sqlite'),{readOnly:!!options.readOnly});
    if(options.readOnly){this.db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');return;}
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
    for (const table of ['projects', 'assets', 'takes', 'jobs', 'shots', 'recipes'] as Tables[]) {
      this.db.exec(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, project_id TEXT, data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS ${table}_project ON ${table}(project_id);`);
    }
    this.db.exec('CREATE TABLE IF NOT EXISTS job_identities (idempotency_key TEXT PRIMARY KEY, job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id)); CREATE TABLE IF NOT EXISTS archived_jobs (job_id TEXT PRIMARY KEY REFERENCES jobs(id));');
    this.db.exec('CREATE TABLE IF NOT EXISTS operation_receipts (operation_key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, data TEXT NOT NULL);');
    this.db.exec("CREATE INDEX IF NOT EXISTS jobs_runnable_state_route ON jobs(json_extract(data,'$.state'),coalesce(json_extract(data,'$.executionRoute'),'router'),json_extract(data,'$.nextPollAt'),json_extract(data,'$.createdAt'));");
    ensureJobReadModel(this.db);
  }
  private get<T extends Entity>(table: Tables, id: string): T | undefined {
    const row = this.db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as T : undefined;
  }
  private list<T extends Entity>(table: Tables, projectId?: string): T[] {
    const rows = (projectId ? this.db.prepare(`SELECT data FROM ${table} WHERE project_id=?`).all(projectId) : this.db.prepare(`SELECT data FROM ${table}`).all()) as { data: string }[];
    return rows.map(row => JSON.parse(row.data) as T);
  }
  private upsert<T extends Entity>(table: Tables, value: T): T {
    this.db.prepare(`INSERT INTO ${table}(id,project_id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,data=excluded.data`).run(value.id, 'projectId' in value ? value.projectId : value.id, JSON.stringify(value));
    return value;
  }
  getProject = (id: string) => this.get<Project>('projects', id);
  getAsset = (id: string) => this.get<Asset>('assets', id);
  getTake = (id: string) => this.get<Take>('takes', id);
  getJob = (id: string) => this.get<Job>('jobs', id);
  getShot = (id: string) => this.get<Shot>('shots', id);
  getRecipe = (id: string) => this.get<Recipe>('recipes', id);
  listProjects = () => this.list<Project>('projects').sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  listAssets = (id?: string) => this.list<Asset>('assets', id).sort((a,b) => a.createdAt.localeCompare(b.createdAt));
  listTakes = (id?: string) => this.list<Take>('takes', id).sort((a,b) => a.createdAt.localeCompare(b.createdAt));
  listJobs = (id?: string) => this.list<Job>('jobs', id).sort((a,b) => a.createdAt.localeCompare(b.createdAt));
  listShots = (id?: string) => this.list<Shot>('shots', id).sort((a,b) => a.position - b.position);
  listRecipes = (id?: string) => this.list<Recipe>('recipes', id);
  upsertProject = (value: Project) => this.upsert('projects', value);
  upsertAsset = (value: Asset) => this.upsert('assets', value);
  upsertTake = (value: Take) => this.upsert('takes', value);
  upsertShot = (value: Shot) => this.upsert('shots', value);
  upsertRecipe = (value: Recipe) => this.upsert('recipes', value);
  upsertJob(value: Job): Job {
    // Keep identity and job updates atomic even when callers don't open a transaction.
    const existing = this.getJobByIdempotencyKey(value.idempotencyKey);
    if (existing && existing.id !== value.id) throw new Error('Idempotency identity already belongs to another job');
    const previous=this.getJob(value.id);
    if(previous&&previous.idempotencyKey!==value.idempotencyKey)throw new Error('An existing job must preserve its idempotency identity');
    this.transaction(()=>{
      this.upsert('jobs', value);
      writeJobReadModel(this.db,value);
      this.db.prepare('INSERT INTO job_identities(idempotency_key,job_id) VALUES(?,?) ON CONFLICT(job_id) DO UPDATE SET idempotency_key=excluded.idempotency_key').run(value.idempotencyKey, value.id);
    });
    return value;
  }
  getJobByIdempotencyKey(key: string): Job | undefined {
    const row = this.db.prepare('SELECT job_id FROM job_identities WHERE idempotency_key=?').get(key) as {job_id:string} | undefined;
    return row ? this.getJob(row.job_id) : undefined;
  }
  isArchivedJob(id: string): boolean { return !!this.db.prepare('SELECT 1 FROM archived_jobs WHERE job_id=?').get(id); }
  archiveJob(id: string): void { this.db.prepare('INSERT OR IGNORE INTO archived_jobs(job_id) VALUES(?)').run(id); }
  getOperationReceipt<T = unknown>(key: string): OperationReceipt<T> | undefined {
    const row = this.db.prepare('SELECT data FROM operation_receipts WHERE operation_key=?').get(key) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as OperationReceipt<T> : undefined;
  }
  putOperationReceipt<T>(receipt: OperationReceipt<T>): OperationReceipt<T> {
    const existing = this.getOperationReceipt<T>(receipt.key);
    if (existing) {
      if (existing.fingerprint !== receipt.fingerprint) throw Object.assign(new Error('This operation identity already belongs to different inputs.'), { status: 409 });
      return existing;
    }
    this.db.prepare('INSERT INTO operation_receipts(operation_key,fingerprint,data) VALUES(?,?,?)').run(receipt.key, receipt.fingerprint, JSON.stringify(receipt));
    return receipt;
  }
  listRunnableJobs(query:RunnableJobQuery={}): Job[] {
    // SQLite uses the state index before materializing JSON. Historical inline media never
    // crosses into JS on the worker timer; completed and archived records remain untouched.
    const clauses=["json_extract(j.data,'$.state') IN ('PENDING','SUBMITTING','IN_QUEUE','IN_PROGRESS','COLLECTING','RETRY_WAIT')",'NOT EXISTS (SELECT 1 FROM archived_jobs a WHERE a.job_id=j.id)'];
    const args:(string|number)[]=[];
    if(query.executionRoute){clauses.push("coalesce(json_extract(j.data,'$.executionRoute'),'router')=?");args.push(query.executionRoute);}
    if(query.dueAt){if(!Number.isFinite(Date.parse(query.dueAt)))throw new Error('Invalid job polling cutoff');clauses.push("(json_extract(j.data,'$.nextPollAt') IS NULL OR json_extract(j.data,'$.nextPollAt')<=?)");args.push(query.dueAt);}
    if(query.excludeIds?.length){clauses.push(`j.id NOT IN (${query.excludeIds.map(()=>'?').join(',')})`);args.push(...query.excludeIds);}
    let limit='';if(query.limit!==undefined){if(!Number.isSafeInteger(query.limit)||query.limit<0||query.limit>1000)throw new Error('Invalid runnable job limit');limit=' LIMIT ?';args.push(query.limit);}
    const rows=this.db.prepare(`SELECT j.data FROM jobs j WHERE ${clauses.join(' AND ')} ORDER BY json_extract(j.data,'$.createdAt'),j.id${limit}`).all(...args) as {data:string}[];
    return rows.map(row=>JSON.parse(row.data) as Job);
  }
  saveTakeAndJob(take: Take, job: Job): void { this.transaction(() => { this.upsertTake(take); this.upsertJob(job); }); }
  patchJob(id: string, patch: Partial<Job>, syncTakeStatus = true): Job {
    const current = this.getJob(id);
    if (!current) throw new Error('Job not found');
    const next: Job = { ...current, ...patch, id: current.id, projectId: current.projectId, takeId: current.takeId, idempotencyKey: current.idempotencyKey, updatedAt: new Date().toISOString() };
    this.transaction(() => {
      this.upsertJob(next);
      if (syncTakeStatus && patch.state) {
        const take = this.getTake(current.takeId);
        if (take) this.upsertTake({ ...take, status: next.state, updatedAt: next.updatedAt });
      }
    });
    return next;
  }
  projectDetail(id: string): ProjectDetail | undefined {
    const project = this.getProject(id);
    if (!project) return undefined;
    return {project, assets:this.listAssets(id), takes:this.listTakes(id), jobs:this.listJobs(id), shots:this.listShots(id), recipes:this.listRecipes(id)};
  }
  listJobSummaries=(projectId:string)=>readJobSummaries(this.db,projectId);
  projectWorkspace(id:string):ProjectDetail|undefined {
    const project=this.getProject(id);if(!project)return;
    return{project,assets:this.listAssets(id),takes:this.listTakes(id),jobs:this.listJobSummaries(id),shots:this.listShots(id),recipes:this.listRecipes(id)};
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('SAVEPOINT studio_transaction');
    try { const result = fn(); this.db.exec('RELEASE SAVEPOINT studio_transaction'); return result; }
    catch (error) { this.db.exec('ROLLBACK TO SAVEPOINT studio_transaction; RELEASE SAVEPOINT studio_transaction'); throw error; }
  }
  close(): void { this.db.close(); }
}
export const createStore = (dataDir: string) => new Store(dataDir);
