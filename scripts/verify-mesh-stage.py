import bpy, json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
expected=root/'artifacts'/'inspection-build'/'mesh-posters'/'open-take-mesh-preview-stage.blend'
if Path(bpy.data.filepath).resolve()!=expected.resolve():
    raise RuntimeError('Not the task-owned stage')
scene=bpy.context.scene
receipt={'verifiedBy':'Isolated installed Blender CLI reopen','filepath':bpy.data.filepath,'scene':scene.name,'camera':scene.camera.name if scene.camera else None,'engine':scene.render.engine,'dimensions':[scene.render.resolution_x,scene.render.resolution_y],'objects':[o.name for o in scene.objects],'meshCount':len([o for o in scene.objects if o.type=='MESH'])}
(expected.parent/'reopen-receipt.json').write_text(json.dumps(receipt,indent=2))
print(json.dumps(receipt))
