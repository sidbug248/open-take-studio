"""Render actual managed GLBs in a separate Blender process. Never opens a user's scene."""
import bpy, json, math, time, sys
from pathlib import Path
from mathutils import Vector

root = Path(__file__).resolve().parents[1]
out = root / 'artifacts' / 'inspection-build' / 'mesh-posters'
out.mkdir(parents=True, exist_ok=True)
items = json.loads((out / 'sources.json').read_text(encoding='utf-8'))
report_path = out / 'render-receipt.json'
report = json.loads(report_path.read_text()) if report_path.exists() else []
done = {row['assetId'] for row in report if row.get('status') == 'rendered' and Path(row['output']).is_file()}

for item in items:
    if item['id'] in done:
        continue
    started = time.perf_counter()
    source = Path(item['path']).resolve()
    if source.parent != (root / 'data' / 'media').resolve():
        raise RuntimeError('Mesh is outside managed media')
    # This is the isolated factory process, never the connected user scene.
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.orphans_purge(do_recursive=True)
    scene = bpy.context.scene
    scene.name = 'Open Take / Actual mesh portrait'
    bpy.ops.import_scene.gltf(filepath=str(source))
    imported = list(scene.objects)
    meshes = [obj for obj in imported if obj.type == 'MESH']
    if not meshes:
        report.append({'assetId': item['id'], 'status': 'no mesh'})
        continue
    corners = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    low = Vector(tuple(min(p[i] for p in corners) for i in range(3)))
    high = Vector(tuple(max(p[i] for p in corners) for i in range(3)))
    center = (low + high) * .5
    size = high - low
    radius = max(size.length * .5, .05)
    pivot = bpy.data.objects.new('Open Take / centered source', None)
    scene.collection.objects.link(pivot)
    for obj in imported:
        if obj.parent is None:
            matrix = obj.matrix_world.copy()
            obj.parent = pivot
            obj.matrix_world = matrix
    pivot.location = -center
    # Keep source geometry and imported materials intact. All presentation belongs to this stage.
    bpy.ops.mesh.primitive_plane_add(size=radius * 200, location=(0, 0, -size.z * .5 - radius * .006))
    floor = bpy.context.object
    floor.name = 'Open Take / charcoal stage'
    material = bpy.data.materials.new('Open Take / stage finish')
    material.diffuse_color = (.035, .029, .05, 1)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (.035, .029, .05, 1)
    shader.inputs['Roughness'].default_value = .48
    floor.data.materials.append(material)
    world = bpy.data.worlds.new('Open Take / studio ambience')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes.get('Background').inputs['Color'].default_value = (.19, .2, .26, 1)
    world.node_tree.nodes.get('Background').inputs['Strength'].default_value = .45
    def area(name, location, energy, color, scale):
        data = bpy.data.lights.new(name, 'AREA')
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = Vector(location) * radius
        obj.rotation_euler = (-obj.location).to_track_quat('-Z', 'Y').to_euler()
        data.energy = energy * radius * radius
        data.color = color
        data.shape = 'DISK'
        data.size = scale * radius
    area('Open Take / soft key', (2.5, -3.5, 5), 750, (1, .88, .78), 4)
    area('Open Take / cool fill', (-3, -1, 2), 430, (.55, .74, 1), 3)
    area('Open Take / coral rim', (1, 3, 3), 850, (1, .42, .31), 3)
    camera_data = bpy.data.cameras.new('Open Take / object portrait')
    camera = bpy.data.objects.new('Open Take / object portrait', camera_data)
    scene.collection.objects.link(camera)
    camera.location = Vector((2.4, -4, 1.8)) * radius
    camera.rotation_euler = (-camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = radius * 2.55 * (960 / 600)
    camera_data.clip_start = max(radius / 1000, .0001)
    camera_data.clip_end = radius * 500
    scene.camera = camera
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 960
    scene.render.resolution_y = 600
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.exposure = .25
    if hasattr(scene, 'eevee') and hasattr(scene.eevee, 'taa_render_samples'):
        scene.eevee.taa_render_samples = 32
    destination = out / (item['id'] + '.png')
    scene.render.filepath = str(destination)
    bpy.ops.render.render(write_still=True)
    device = 'not exposed'
    try:
        import gpu
        device = gpu.platform.renderer_get()
    except Exception:
        pass
    row = {'assetId': item['id'], 'sourceSha256': item['sha256'], 'status': 'rendered', 'output': str(destination), 'renderer': scene.render.engine, 'blender': bpy.app.version_string, 'device': device, 'width': 960, 'height': 600, 'meshCount': len(meshes), 'wallSeconds': round(time.perf_counter() - started, 3), 'geometryAndMaterials': 'Imported from the stored GLB; presentation lights, framing and floor added locally'}
    if not report:
        scene_file = out / 'open-take-mesh-preview-stage.blend'
        bpy.ops.wm.save_as_mainfile(filepath=str(scene_file))
        row['sceneFile'] = str(scene_file)
    report.append(row)
    report_path.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print('OTS_POSTER ' + json.dumps(row), flush=True)
