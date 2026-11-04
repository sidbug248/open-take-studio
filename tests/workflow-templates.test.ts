import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import AdmZip from 'adm-zip';
import { studioWorkflowTemplates } from '../server/workflow-templates.ts';
import { makeWorkflowVersion, rejectWorkflowSecrets } from '../server/workflow-schema.ts';
import { validateAgainstNodeInfo, type WorkflowPort } from '../server/workflow-port.ts';
import { createWorkflowRouter } from '../server/workflow-routes.ts';
import type { WorkflowWorker } from '../server/workflow-worker.ts';
import { createStore } from '../server/store.ts';
import { LocalFileStorage } from '../server/media.ts';
import { CredentialUnavailableError, type CredentialSource } from '../server/credential-source.ts';
import type { WorkflowGraph, WorkflowVersion } from '../shared/workflow-types.ts';
import type { Asset, Project, Take } from '../shared/types.ts';

const nodeInfo = {
  ...JSON.parse(readFileSync(new URL('../docs/schemas/native-audio-nodes.json', import.meta.url), 'utf8')),
  ...JSON.parse(readFileSync(new URL('../docs/schemas/native-meshy-nodes.json', import.meta.url), 'utf8')),
};
type Template = ReturnType<typeof studioWorkflowTemplates>[number];
function template(id: string): Template {
  const value = studioWorkflowTemplates().find(item => item.id === id);
  assert.ok(value, `Missing template ${id}`);
  return value;
}
function graphForValidation(definition: Template['definition']): WorkflowGraph {
  const graph = structuredClone(definition.apiGraph);
  for (const binding of definition.bindings) if (['image', 'audio', 'video'].includes(binding.kind)) {
    graph[binding.nodeId]!.inputs[binding.inputName] = { __type: 'core/ASSET', info: { id: `fixture-${binding.key}` } };
  }
  return graph;
}

async function fixture(connected = false) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'open-take-workflow-templates-'));
  const store = createStore(directory);
  const media = new LocalFileStorage(directory);
  const timestamp = new Date().toISOString();
  const project: Project = { id: randomUUID(), name: 'Offline starter round-trip', description: '', createdAt: timestamp, updatedAt: timestamp };
  store.upsertProject(project);
  const calls = { validate: 0, upload: 0, submit: 0, get: 0, download: 0, executedGraph: 0, cancel: 0, tick: 0, resolve: 0 };
  const unexpected = (name: 'upload' | 'submit' | 'get' | 'download' | 'executedGraph' | 'cancel') => async () => {
    calls[name]++;
    throw new Error(`Unexpected provider operation while handling a template: ${name}`);
  };
  const port: WorkflowPort = {
    validate: async graph => { calls.validate++; return validateAgainstNodeInfo(graph, nodeInfo); },
    upload: unexpected('upload'), submit: unexpected('submit'), get: unexpected('get'),
    download: unexpected('download'), executedGraph: unexpected('executedGraph'), cancel: unexpected('cancel'),
  };
  const credentials: CredentialSource = {
    available: () => connected,
    resolve: () => {
      calls.resolve++;
      if (!connected) throw new CredentialUnavailableError('This fixture has no Comfy key');
      return { id: 'test-workflow-scope', apiKey: 'fixture-workflow-credential' };
    },
  };
  const worker = { tick: async () => { calls.tick++; }, isActive: () => false } as unknown as WorkflowWorker;
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', createWorkflowRouter(store, media, worker, port, credentials));
  app.use(((error: any, _request: any, response: any, _next: any) => response.status(error.status ?? 400).json({ error: error.message })) as express.ErrorRequestHandler);
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const post = (route: string, body: unknown) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return {
    project, store, media, base, post, calls,
    cleanup: async () => {
      await new Promise<void>(resolve => server.close(() => resolve()));
      store.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test('every starter validates against current public Cloud node contracts after media binding', () => {
  const templates = studioWorkflowTemplates();
  assert.deepEqual(templates.map(item => item.id).sort(), ['audio-cleanup', 'dubbing', 'mesh-image']);
  for (const starter of templates) {
    const version = makeWorkflowVersion(starter.definition);
    const validation = validateAgainstNodeInfo(graphForValidation(starter.definition), nodeInfo);
    assert.equal(validation.valid, true, `${starter.id}: ${JSON.stringify(validation.issues)}`);
    assert.equal(version.target, 'comfy-cloud');
    assert.equal(version.outputNodeIds.length, 1);
    assert.ok(version.bindings.some(binding => ['image', 'audio', 'video'].includes(binding.kind) && binding.required && binding.defaultValue === undefined));
    assert.doesNotThrow(() => rejectWorkflowSecrets(version));
    assert.match(starter.creditNote, /credit/i);
    assert.match(starter.verificationNote, /unverified|not yet verified/i);
  }
});

test('starter definitions are independent copies with preserved editable graphs', () => {
  const first = studioWorkflowTemplates();
  const original = studioWorkflowTemplates();
  first[0]!.definition.apiGraph['1']!.inputs.image = 'changed-locally.png';
  first[0]!.definition.bindings[0]!.label = 'Changed locally';
  first[0]!.name = 'Changed locally';
  assert.deepEqual(studioWorkflowTemplates(), original);
  for (const starter of original) {
    const editor = starter.definition.editorGraph as Record<string, any>;
    assert.equal(editor.nodes.length, Object.keys(starter.definition.apiGraph).length);
    assert.ok(editor.links.length > 0);
    for (const outputId of starter.definition.outputNodeIds) assert.ok(editor.nodes.some((node: any) => String(node.id) === outputId));
  }
});

test('a project can list, save, export and reimport every starter without a key or provider call', async () => {
  const f = await fixture();
  try {
    const response = await fetch(f.base + `/projects/${f.project.id}/workflow-templates`);
    assert.equal(response.status, 200);
    const templates = await response.json() as Template[];
    assert.equal(templates.length, 3);
    for (const starter of templates) {
      const created = await f.post(`/projects/${f.project.id}/workflows`, starter.definition);
      if (created.status !== 201) assert.fail(await created.text());
      const saved = await created.json() as { asset: Asset; take: Take; workflow: WorkflowVersion };
      assert.equal(saved.take.status, 'LOCAL');
      assert.equal(saved.take.jobId, undefined);
      assert.equal(saved.asset.projectId, f.project.id);
      assert.equal(saved.workflow.graphSha256, makeWorkflowVersion(starter.definition).graphSha256);
      const readback = await fetch(f.base + `/assets/${saved.asset.id}/workflow`);
      assert.equal(readback.status, 200);
      assert.deepEqual((await readback.json() as { workflow: WorkflowVersion }).workflow.apiGraph, starter.definition.apiGraph);

      for (const format of ['editor', 'api'] as const) {
        const exported = await fetch(f.base + `/assets/${saved.asset.id}/workflow/export?format=${format}`);
        assert.equal(exported.status, 200);
        assert.match(exported.headers.get('content-disposition') ?? '', /attachment/);
        assert.deepEqual(await exported.json(), format === 'editor' ? starter.definition.editorGraph : starter.definition.apiGraph);
      }
      const bundleResponse = await fetch(f.base + `/assets/${saved.asset.id}/workflow/export`);
      assert.equal(bundleResponse.status, 200);
      const bundle = new AdmZip(Buffer.from(await bundleResponse.arrayBuffer()));
      assert.equal(bundle.test(), true);
      assert.deepEqual(bundle.getEntries().map(entry => entry.entryName).sort(), ['README.txt', 'dependencies.json', 'workflow.api.json', 'workflow.editor.json', 'workflow.studio.json']);
      const portable = JSON.parse(bundle.readAsText('workflow.studio.json')) as WorkflowVersion;
      assert.deepEqual(JSON.parse(bundle.readAsText('workflow.api.json')), starter.definition.apiGraph);
      assert.deepEqual(JSON.parse(bundle.readAsText('workflow.editor.json')), starter.definition.editorGraph);
      assert.equal(JSON.parse(bundle.readAsText('dependencies.json')).graphSha256, saved.workflow.graphSha256);
      assert.doesNotThrow(() => rejectWorkflowSecrets(portable));

      const imported = await f.post(`/projects/${f.project.id}/workflows`, portable);
      if (imported.status !== 201) assert.fail(await imported.text());
      const restored = await imported.json() as { asset: Asset; take: Take; workflow: WorkflowVersion };
      assert.notEqual(restored.asset.id, saved.asset.id);
      assert.equal(restored.workflow.graphSha256, saved.workflow.graphSha256);
      assert.deepEqual(restored.workflow.bindings, saved.workflow.bindings);
      assert.equal(restored.take.status, 'LOCAL');
    }
    assert.equal(f.store.projectDetail(f.project.id)!.jobs.length, 0);
    assert.deepEqual(f.calls, { validate: 0, upload: 0, submit: 0, get: 0, download: 0, executedGraph: 0, cancel: 0, tick: 0, resolve: 0 });
    assert.equal((await fetch(f.base + '/projects/not-a-project/workflow-templates')).status, 404);
  } finally { await f.cleanup(); }
});

test('strict V3 validation rejects wrong languages, inactive dynamic controls, missing media and numeric limits', () => {
  const invalid: { id: string; field: string; mutate: (graph: WorkflowGraph) => void }[] = [
    { id: 'dubbing', field: 'model.target_language', mutate: graph => { graph['2']!.inputs['model.target_language'] = 'Not a supported language'; } },
    { id: 'dubbing', field: 'model.source_language', mutate: graph => { graph['2']!.inputs['model.source_language'] = 'English (US)'; } },
    { id: 'dubbing', field: 'model', mutate: graph => { graph['2']!.inputs.model = 'unsupported'; } },
    { id: 'dubbing', field: 'model.video', mutate: graph => { delete graph['2']!.inputs['model.video']; } },
    { id: 'dubbing', field: 'model.seed', mutate: graph => { graph['2']!.inputs['model.seed'] = .5; } },
    { id: 'dubbing', field: 'model.seed', mutate: graph => { graph['2']!.inputs['model.seed'] = 2147483648; } },
    { id: 'dubbing', field: 'model.unsupported_control', mutate: graph => { graph['2']!.inputs['model.unsupported_control'] = true; } },
    { id: 'audio-cleanup', field: 'loudness.target_lufs', mutate: graph => { graph['2']!.inputs.loudness = 'keep input level'; } },
    { id: 'audio-cleanup', field: 'strength', mutate: graph => { graph['2']!.inputs.strength = 1.1; } },
    { id: 'audio-cleanup', field: 'loudness.target_lufs', mutate: graph => { graph['2']!.inputs['loudness.target_lufs'] = -41; } },
    { id: 'mesh-image', field: 'should_remesh.target_polycount', mutate: graph => { graph['2']!.inputs['should_remesh.target_polycount'] = 99; } },
    { id: 'mesh-image', field: 'should_texture.texture_resolution', mutate: graph => { graph['2']!.inputs['should_texture.texture_resolution'] = '16k'; } },
    { id: 'dubbing', field: 'format.codec', mutate: graph => { graph['3']!.inputs['format.codec'] = 'not-a-codec'; } },
  ];
  for (const item of invalid) {
    const graph = graphForValidation(template(item.id).definition);
    item.mutate(graph);
    const validation = validateAgainstNodeInfo(graph, nodeInfo);
    assert.equal(validation.valid, false, `${item.id} ${item.field} unexpectedly passed`);
    assert.ok(validation.issues.some(issue => issue.field === item.field), JSON.stringify(validation.issues));
  }
  const keepLevel = graphForValidation(template('audio-cleanup').definition);
  keepLevel['2']!.inputs.loudness = 'keep input level';
  delete keepLevel['2']!.inputs['loudness.target_lufs'];
  assert.equal(validateAgainstNodeInfo(keepLevel, nodeInfo).valid, true);
});

test('explicit validation checks native settings without uploading media or submitting a generation', async () => {
  const f = await fixture(true);
  try {
    for (const id of ['dubbing', 'audio-cleanup', 'mesh-image']) {
      const definition = template(id).definition;
      const created = await f.post(`/projects/${f.project.id}/workflows`, definition);
      assert.equal(created.status, 201);
      const saved = await created.json() as { asset: Asset };
      const response = await f.post(`/workflows/${saved.asset.id}/validate`, {});
      assert.equal(response.status, 200);
      const validation = await response.json() as { valid: boolean; issues: unknown[] };
      assert.equal(validation.valid, true, JSON.stringify(validation.issues));
    }
    const invalid = template('dubbing').definition;
    invalid.apiGraph['2']!.inputs['model.target_language'] = 'Unsupported language';
    const created = await f.post(`/projects/${f.project.id}/workflows`, invalid);
    assert.equal(created.status, 201);
    const saved = await created.json() as { asset: Asset };
    const response = await f.post(`/workflows/${saved.asset.id}/validate`, {});
    assert.equal(response.status, 200);
    const result = await response.json() as { valid: boolean; issues: { field?: string }[] };
    assert.equal(result.valid, false);
    assert.ok(result.issues.some(issue => issue.field === 'model.target_language'));
    assert.equal(f.calls.validate, 4);
    assert.equal(f.calls.upload, 0);
    assert.equal(f.calls.submit, 0);
    assert.equal(f.calls.tick, 0);
    assert.equal(f.store.projectDetail(f.project.id)!.jobs.length, 0);
  } finally { await f.cleanup(); }
});
