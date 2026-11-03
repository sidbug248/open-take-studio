import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';

const directory = path.resolve('artifacts/next-build/spatial-evidence');
const receipt = JSON.parse(await readFile(path.join(directory, 'verification-receipt.json'), 'utf8'));
const exported = receipt.glbs.find((item: any) => item.assetId === 'ccf297bd-4f6f-47d5-bb21-6d975951cd49');
assert.ok(exported, 'The final Orbit GLB must be present in the real export audit');
const bytes = await readFile(path.join(directory, exported.file));
const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)).trim());
const bounds = new Box3();
const names: string[] = [];
let meshInstances = 0;
function visit(index: number, parent: Matrix4) {
  const node = gltf.nodes[index];
  names.push(node.name ?? `node-${index}`);
  const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(
    new Vector3().fromArray(node.translation ?? [0, 0, 0]),
    new Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
    new Vector3().fromArray(node.scale ?? [1, 1, 1]),
  );
  const world = parent.clone().multiply(local);
  if (node.mesh !== undefined) {
    meshInstances++;
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      const accessor = gltf.accessors[primitive.attributes.POSITION];
      assert.equal(accessor.type, 'VEC3');
      assert.ok(accessor.min && accessor.max, 'Exported positions must have explicit bounds');
      const geometry = new Box3(new Vector3().fromArray(accessor.min), new Vector3().fromArray(accessor.max));
      bounds.union(geometry.applyMatrix4(world));
    }
  }
  for (const child of node.children ?? []) visit(child, world);
}
for (const index of gltf.scenes[gltf.scene ?? 0].nodes) visit(index, new Matrix4());
assert.equal(meshInstances, 3);
assert.equal(names.includes('Ground'), false, 'The presentation ground must not dominate model framing');
const size = bounds.getSize(new Vector3()).toArray();
assert.ok(size.every(value => value > 0 && value < 10), 'The exported sculpture must keep useful model bounds');
assert.ok(gltf.cameras?.length > 0, 'The saved camera must be present in the editable GLB');
assert.ok(gltf.extensions?.KHR_lights_punctual?.lights?.length > 0, 'Movable scene lights must be exported');
const result = {
  verifiedAt: new Date().toISOString(), assetId: exported.assetId, file: exported.file,
  sha256: exported.sha256, meshInstances, nodeNames: names,
  worldBounds: { min: bounds.min.toArray(), max: bounds.max.toArray(), size },
  presentationGroundExcluded: true, cameras: gltf.cameras.length,
  lights: gltf.extensions.KHR_lights_punctual.lights.length,
  preservation: 'The earlier Amber model export remains untouched as its original version.',
};
await writeFile(path.join(directory, 'glb-bounds-receipt.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
