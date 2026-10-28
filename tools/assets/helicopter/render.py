"""Reimport the deliverable GLB and render reproducible review views with Blender 5.2.

Run from the repository root: blender -b --python-exit-code 1 --python tools/assets/helicopter/render.py
These are offline art previews, not evidence of Babylon/gameplay integration.
"""
import bpy
import math
import json
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'asset-source/helicopter/previews'
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'packages/content/runtime/models/helicopter/helicopter.glb'))
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=32
scene.cycles.seed=41
scene.render.resolution_x=960
scene.render.resolution_y=720
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='AgX'
scene.render.film_transparent=False
scene.world=bpy.data.worlds.new('review_world')
scene.world.use_nodes=True
world=scene.world.node_tree.nodes['Background']

parts={o.name:o for o in scene.objects if o.type=='MESH'}
# Imported animation clips remain in the GLB. Render exact independent phases explicitly.
for o in scene.objects:
    o.animation_data_clear()
    if o.name.startswith('rotor_'):
        o.rotation_mode='XYZ'; o.rotation_euler=(0,0,0)

def matte(name,color):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes['Principled BSDF'];p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.8
    return m
groundmat=matte('review_asphalt',(.12,.15,.18))
linemat=matte('review_road_marks',(.40,.40,.32))
bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,-2.5))
ground=bpy.context.object;ground.name='review_ground';ground.data.materials.append(groundmat)
for y in range(-15,16,5):
    bpy.ops.mesh.primitive_cube_add(size=1,location=(-5,y,-2.48))
    stripe=bpy.context.object;stripe.scale=(.15,2,.01);stripe.data.materials.append(linemat)

def area(name,location,power,color,size):
    bpy.ops.object.light_add(type='AREA',location=location)
    o=bpy.context.object;o.name=name;o.data.energy=power;o.data.color=color;o.data.shape='DISK';o.data.size=size
    o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
    return o
key=area('review_key',(2,-8,12),1900,(1,.91,.78),7)
rim=area('review_rim',(-6,5,8),1400,(.62,.78,1),6)
fill=area('review_fill',(8,-1,5),700,(.75,.85,1),8)
bpy.ops.object.camera_add(location=(12,-17,13))
camera=bpy.context.object;camera.name='review_camera';camera.data.type='ORTHO';camera.data.ortho_scale=14.5
camera.rotation_euler=(Vector((0,1,0))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.camera=camera

def render(name):
    scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)

lighting={
 'noon':((.35,.42,.52),.65,1900,(1,.91,.78),1400,700),
 'dusk':((.12,.16,.28),.35,1200,(1,.48,.19),1100,450),
 'night':((.035,.055,.10),.18,550,(.47,.66,1),850,220),
}
for name,(color,strength,kpower,kcolor,rpower,fpower) in lighting.items():
    world.inputs[0].default_value=(*color,1);world.inputs[1].default_value=strength
    key.data.energy=kpower;key.data.color=kcolor;rim.data.energy=rpower;fill.data.energy=fpower
    render(name)

world.inputs[0].default_value=(.35,.42,.52,1);world.inputs[1].default_value=.65
key.data.energy=1900;key.data.color=(1,.91,.78);rim.data.energy=1400;fill.data.energy=700
original={name:o.location.copy() for name,o in parts.items()}
offsets={'cockpit':(0,-1.8,-.1),'cabin':(0,0,0),'tail_boom':(0,1.6,.1),
 'tail_fin':(0,3.2,.6),'wing_left':(-2,0,.2),'wing_right':(2,0,.2),
 'skid_left':(-1.5,0,-1),'skid_right':(1.5,0,-1),
 'rotor_main':(0,0,2.3),'rotor_tail':(1.8,3.2,1.6)}
for name,o in parts.items():o.location+=Vector(offsets[name])
camera.data.ortho_scale=18
render('exploded')
for name,o in parts.items():o.location=original[name]
camera.data.ortho_scale=14.5
scene.render.resolution_x=640;scene.render.resolution_y=480;scene.cycles.samples=16
for frame in range(12):
    parts['rotor_main'].rotation_euler.z=math.tau*frame/12
    parts['rotor_tail'].rotation_euler.x=math.tau*frame/6
    render(f'rotor-{frame:02}')

(OUT/'capture.json').write_text(json.dumps({'blender':bpy.app.version_string,
 'renderer':'Cycles CPU','samples':32,'seed':41,'viewTransform':'AgX',
 'camera':{'projection':'orthographic','position':[12,-17,13],'lookAt':[0,1,0],'spanMeters':14.5},
 'resolution':[960,720],'lighting':lighting,
 'rotorSequence':{'frames':12,'resolution':[640,480],'samples':16,'mainTurns':1,'tailTurns':2},
 'note':'Offline reimported GLB; ground is a review stage at -2.5 m. Actual game altitude, camera, shaders and performance are not verified.'},indent=2)+'\n')
