"""Offline GLB reimport review renders, Blender 5.2 / Cycles CPU. Not an in-game test."""
import bpy,math,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'asset-source/db5/previews';OUT.mkdir(parents=True,exist_ok=True)

def render_lod(lod):
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.gltf(filepath=str(ROOT/f'packages/content/runtime/models/db5/db5-{lod}.glb'))
 s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=40;s.cycles.seed=17
 s.render.resolution_x=1000;s.render.resolution_y=700;s.render.resolution_percentage=100
 s.render.image_settings.file_format='JPEG';s.render.image_settings.quality=92;s.view_settings.view_transform='AgX'
 s.world=bpy.data.worlds.new('review_world');s.world.use_nodes=True
 bg=s.world.node_tree.nodes['Background'];bg.inputs[0].default_value=(.38,.44,.52,1);bg.inputs[1].default_value=.55
 parts={o.name:o for o in s.objects if o.type=='MESH'}
 for name in ('gun_left','gun_right'):parts[name].hide_render=True
 def aim(o,target):o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
 def light(loc,power,size,color):
  bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.data.color=color;aim(o,(0,0,.35));return o
 key=light((1,-4,6),950,5,(1,.94,.84));rim=light((-4,3,4),1250,4,(.65,.8,1));fill=light((5,1,3),600,5,(1,1,1))
 bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.319));floor=bpy.context.object
 m=bpy.data.materials.new('review_floor');m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.10,.13,.16,1);m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.6;floor.data.materials.append(m)
 bpy.ops.object.camera_add(location=(6,-8,4.2));camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=6.6;aim(camera,(0,.05,.30));s.camera=camera
 def shot(name):s.render.filepath=str(OUT/(name+'.jpg'));bpy.ops.render.render(write_still=True)
 shot(lod+'-neutral')
 if lod=='briefing':
  for name in ('gun_left','gun_right'):parts[name].hide_render=False
  shot('briefing-armed')
  camera.location=(6,8,3.8);aim(camera,(0,.1,.3));shot('briefing-rear')
  camera.location=(6,-8,4.2);aim(camera,(0,.05,.3))
  for name in ('gun_left','gun_right'):parts[name].hide_render=True
  for label,color,strength,kpower,kcolor,rpower,fpower in [
    ('dusk',(.14,.18,.30),.3,700,(1,.5,.22),850,300),
    ('night',(.025,.045,.08),.16,350,(.50,.67,1),600,200)]:
   bg.inputs[0].default_value=(*color,1);bg.inputs[1].default_value=strength
   key.data.energy=kpower;key.data.color=kcolor;rim.data.energy=rpower;fill.data.energy=fpower
   shot('briefing-'+label)
   for name in ('gun_left','gun_right'):parts[name].hide_render=False
   shot('briefing-'+label+'-armed')
   for name in ('gun_left','gun_right'):parts[name].hide_render=True
 if lod=='driving':
  camera.location=(6,-8,7);camera.data.ortho_scale=8.8;aim(camera,(0,0,.2))
  settings={'noon':((.38,.44,.52),.55,950,(1,.94,.84),1250,600),
    'dusk':((.14,.18,.30),.3,700,(1,.5,.22),850,300),
    'night':((.025,.045,.08),.16,350,(.50,.67,1),600,200)}
  for name,(color,strength,kpower,kcolor,rpower,fpower)in settings.items():
   bg.inputs[0].default_value=(*color,1);bg.inputs[1].default_value=strength
   key.data.energy=kpower;key.data.color=kcolor;rim.data.energy=rpower;fill.data.energy=fpower
   shot('driving-'+name)
   for part in ('gun_left','gun_right'):parts[part].hide_render=False
   shot('driving-'+name+'-armed')
   for part in ('gun_left','gun_right'):parts[part].hide_render=True
  bg.inputs[0].default_value=(.38,.44,.52,1);bg.inputs[1].default_value=.55
  key.data.energy=950;key.data.color=(1,.94,.84);rim.data.energy=1250;fill.data.energy=600
  for name in ('gun_left','gun_right'):parts[name].hide_render=False
  shot('driving-armed')
  for name in ('wheel_fl','wheel_fr'):
   parts[name].rotation_mode='XYZ';parts[name].rotation_euler.z=math.radians(28)
  shot('steering')
  for name in ('wheel_fl','wheel_fr'):parts[name].rotation_euler.z=0
  offsets={'body':(0,0,.55),'bonnet':(0,-.7,1.1),'boot':(0,.7,1.1),
   'door_left':(-1.1,0,.3),'door_right':(1.1,0,.3),'bumper_front':(0,-1.5,0),'bumper_rear':(0,1.5,0),
   'grille':(0,-1,.4),'lights_front':(0,-.8,.8),'lights_rear':(0,1,.8),
   'wheel_fl':(-1,-.3,0),'wheel_fr':(1,-.3,0),'wheel_rl':(-1,.3,0),'wheel_rr':(1,.3,0),
   'gun_left':(-.45,-1.2,.7),'gun_right':(.45,-1.2,.7)}
  for name,o in parts.items():o.location+=Vector(offsets[name])
  camera.data.ortho_scale=10.5;shot('exploded')
for lod in ('briefing','driving','distant'):render_lod(lod)
(OUT/'capture.json').write_text(json.dumps({'blender':bpy.app.version_string,'engine':'Cycles CPU','samples':40,'seed':17,'viewTransform':'AgX','resolution':[1000,700],
 'briefingCamera':{'position':[6,-8,4.2],'target':[0,.05,.3],'orthographicSpan':6.6},
 'drivingCamera':{'position':[6,-8,7],'target':[0,0,.2],'orthographicSpan':8.8},
 'steeringDegrees':28,'note':'Offline reimported GLB. No actual game camera, shader, physics or performance acceptance is claimed.'},indent=2)+'\n')
