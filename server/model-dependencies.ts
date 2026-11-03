import type { Store } from './store.ts';
import type { GenerationRequest, Job } from '../shared/types.ts';

export interface ModelDependency { taskId: string; jobId: string; takeId: string; modelId: string; stage: 'preview' | 'refine' | 'rig' | 'video'; name: string; }
function native(job: Job): Record<string, unknown> | undefined {
  return job.result && typeof job.result === 'object' && !Array.isArray(job.result) ? job.result as Record<string, unknown> : undefined;
}
/** Imported execution records cannot establish that a provider task is usable in
 * this workspace. IDs are offered only from completed, locally admitted jobs. */
export function listModelDependencies(store: Store, projectId: string): ModelDependency[] {
  // Project only supported predecessor results; historical request inputs stay in SQLite.
  const jobs=store.db.prepare("SELECT json_object('id',j.id,'takeId',json_extract(j.data,'$.takeId'),'modelId',json_extract(j.data,'$.modelId'),'state',json_extract(j.data,'$.state'),'requestId',json_extract(j.data,'$.requestId'),'result',json_extract(j.data,'$.result')) AS data FROM jobs j WHERE j.project_id=? AND json_extract(j.data,'$.state')='COMPLETED' AND json_extract(j.data,'$.modelId') IN ('kling/kling-v2-6','kling/videos-video-extend','meshy/meshy-7.1','meshy/rigging') AND NOT EXISTS(SELECT 1 FROM archived_jobs a WHERE a.job_id=j.id)").all(projectId) as {data:string}[];
  return jobs.map(row=>JSON.parse(row.data) as Job).flatMap<ModelDependency>(job => {
    const result = native(job), take = store.getTake(job.takeId);
    if (['kling/kling-v2-6', 'kling/videos-video-extend'].includes(job.modelId)) {
      const data = result?.data as any;
      if (job.state !== 'COMPLETED' || store.isArchivedJob(job.id) || !job.requestId || !take || take.projectId !== projectId || take.status !== 'COMPLETED' || take.provenance !== 'generated' || result?.code !== 0 || data?.task_status !== 'succeed') return [];
      return Array.isArray(data.task_result?.videos) ? data.task_result.videos.filter((video: any) => typeof video.id === 'string' && video.id.trim() && Number(video.duration) > 0 && Number(video.duration) <= 170).map((video: any) => ({ taskId: video.id, jobId: job.id, takeId: take.id, modelId: job.modelId, stage: 'video' as const, name: take.name })) : [];
    }
    if (job.state !== 'COMPLETED' || store.isArchivedJob(job.id) || !job.requestId || !take || take.projectId !== projectId || take.status !== 'COMPLETED' || take.provenance !== 'generated' || result?.status !== 'SUCCEEDED' || result.task_error || typeof result.id !== 'string' || !result.id.trim()) return [];
    // A local GLB survives expiry, but the provider no longer resolves its task.
    if (typeof result.expires_at === 'number' && result.expires_at <= Date.now()) return [];
    const stage = job.modelId === 'meshy/meshy-7.1' && result.type === 'text-to-3d-preview' ? 'preview'
      : job.modelId === 'meshy/meshy-7.1' && result.type === 'text-to-3d-refine' ? 'refine'
        : job.modelId === 'meshy/rigging' && result.type === 'rig' ? 'rig' : undefined;
    if (!stage) return [];
    return [{ taskId: result.id, jobId: job.id, takeId: take.id, modelId: job.modelId, stage, name: take.name }];
  });
}

/** Call before persisting or uploading generation inputs. This never dispatches
 * inference, mutates the request, or accepts an arbitrary user provider ID. */
export function validateModelDependencies(store: Store, request: Pick<GenerationRequest, 'modelId' | 'projectId' | 'settings' | 'parentTakeId' | 'sourceAssetId'>): ModelDependency | undefined {
  const dependency = request.modelId === 'meshy/meshy-7.1' && request.settings.mode === 'refine' ? { key: 'preview_task_id', stage: 'preview' }
    : request.modelId === 'meshy/rigging' ? { key: 'input_task_id', stage: 'refine' }
      : request.modelId === 'meshy/animations' ? { key: 'rig_task_id', stage: 'rig' }
        : request.modelId === 'kling/videos-video-extend' ? { key: 'video_id', stage: 'video' } : undefined;
  if (!dependency) return;
  const value = request.settings[dependency.key];
  const found = typeof value === 'string' ? listModelDependencies(store, request.projectId).find(item => item.taskId === value && item.stage === dependency.stage) : undefined;
  if (!found) throw new Error(`Choose a completed, usable ${dependency.stage === 'video' ? 'Kling video (at most 170 seconds)' : 'Meshy ' + dependency.stage + ' task'} from this project. Imported records, Router request IDs and tasks from other projects are not valid predecessors.`);
  if (request.parentTakeId && request.parentTakeId !== found.takeId) throw new Error('The parent take must be the selected model predecessor.');
  const sourceTake = store.getTake(found.takeId)!;
  if (request.sourceAssetId && !sourceTake.assetIds.includes(request.sourceAssetId)) throw new Error('Source asset must belong to the selected model predecessor.');
  if (dependency.stage === 'preview' && request.settings.enable_pbr === true && sourceTake.settings.art_style === 'sculpture') throw new Error('PBR textures are not supported for a sculpture preview.');
  return found;
}
