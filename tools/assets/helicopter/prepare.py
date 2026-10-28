"""Blender 5.2 visual authoring recipe for the bounded KumaSousa helicopter trial.

Run from the repository root: blender -b --python-exit-code 1 --python tools/assets/helicopter/prepare.py
No downloaded Python or blend-file scripts are executed. The pinned FBX is data.
"""
import bpy
import bmesh
import hashlib
import json
import math
import zipfile
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'asset-source/helicopter'
OUT = ROOT / 'packages/content/runtime/models/helicopter'
WORK = ROOT / 'work/helicopter'
SCALE = .72
ORIGIN = Vector((0, -.5, 1.3))
WORK.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)

archive = SOURCE / 'KumaSousa-Helicopter.zip'
with zipfile.ZipFile(archive) as z:
    # Explicit names keep source extraction bounded to the two art files.
    for name in ('helicopter.fbx', 'blend 32.png'):
        (WORK / name).write_bytes(z.read(name))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=str(WORK / 'helicopter.fbx'))
scene = bpy.context.scene
scene.frame_set(1)
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
scene.render.fps = 24

def material(name, color, metal, roughness):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = roughness
    return m

materials = [material('charcoal_paint', (.026, .035, .047), .35, .36),
             material('cockpit_glazing', (.095, .23, .30), .65, .17),
             material('graphite_hardware', (.075, .088, .105), .5, .42),
             material('rotor_tip_ochre', (.65, .30, .055), .15, .42)]
image = bpy.data.images.get('blend 32.png.001') or bpy.data.images.get('blend 32.png')
pixels = list(image.pixels)
width, height = image.size
dg = bpy.context.evaluated_depsgraph_get()
source_objects = {}
for o in list(scene.objects):
    if o.type != 'MESH':
        continue
    mesh = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    world = o.matrix_world.copy()
    o.modifiers.clear()
    o.parent = None
    o.animation_data_clear()
    o.data = mesh
    o.matrix_world = Matrix.Identity(4)
    for v in mesh.vertices:
        v.co = world @ v.co
    mesh.materials.clear()
    for m in materials:
        mesh.materials.append(m)
    for p in mesh.polygons:
        uv = mesh.uv_layers.active.data[p.loop_start].uv
        x, y = min(width-1, max(0, int(uv.x*width))), min(height-1, max(0, int(uv.y*height)))
        rgb = pixels[(y*width+x)*4:(y*width+x)*4+3]
        center = sum((mesh.vertices[i].co for i in p.vertices), Vector()) / len(p.vertices)
        if o.name == 'Base':
            p.material_index = 1 if max(rgb) < .05 and center.y < 1.2 and center.z > .8 else 0
        else:
            p.material_index = 3 if rgb[0] > .8 else 2
    source_objects[o.name] = o
for o in list(scene.objects):
    if o.type != 'MESH':
        bpy.data.objects.remove(o, do_unlink=True)

# Discard the four disconnected wheel islands; keep the authored connected airframe.
base = source_objects['Base']
bpy.ops.object.select_all(action='DESELECT')
base.select_set(True)
bpy.context.view_layer.objects.active = base
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.separate(type='LOOSE')
bpy.ops.object.mode_set(mode='OBJECT')
for o in list(scene.objects):
    if o.name.startswith('Base.'):
        bpy.data.objects.remove(o, do_unlink=True)

def cut(obj, axis, position, positive_name, negative_name):
    """Bisect both copies at the same plane; cap the actual cut edges."""
    result = []
    for positive, name in [(True, positive_name), (False, negative_name)]:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        co = Vector(); co[axis] = position
        normal = Vector(); normal[axis] = 1
        clipped = bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
            dist=0.00001, plane_co=co, plane_no=normal,
            clear_inner=positive, clear_outer=not positive)
        edges = [e for e in clipped['geom_cut'] if isinstance(e, bmesh.types.BMEdge) and e.is_boundary]
        if edges:
            filled = bmesh.ops.holes_fill(bm, edges=edges, sides=0)
            for face in filled['faces']:
                face.material_index = 2
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        mesh = bpy.data.meshes.new(name)
        bm.to_mesh(mesh); bm.free()
        for m in materials:
            mesh.materials.append(m)
        part = bpy.data.objects.new(name, mesh)
        scene.collection.objects.link(part)
        result.append(part)
    bpy.data.objects.remove(obj, do_unlink=True)
    return result

tail, body = cut(base, 1, 2.0, 'tail_boom', 'body')
fin, tail = cut(tail, 1, 5.6, 'tail_fin', 'tail_boom')
tail.name = 'tail_boom'
wing_r, body = cut(body, 0, 1.85, 'wing_right', 'body')
body, wing_l = cut(body, 0, -1.85, 'body', 'wing_left')
body, cockpit = cut(body, 1, -1.35, 'cabin', 'cockpit')
# Wing cuts can also intersect small fuselage trim islands. Keep those on the cabin,
# so a detached wing never carries a floating strip of unrelated bodywork.
for wing in (wing_l, wing_r):
    name = wing.name
    bpy.ops.object.select_all(action='DESELECT')
    wing.select_set(True); bpy.context.view_layer.objects.active = wing
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
    islands = list(bpy.context.selected_objects)
    largest = max(islands, key=lambda o:sum(p.area for p in o.data.polygons))
    others = [o for o in islands if o != largest]
    if others:
        bpy.ops.object.select_all(action='DESELECT')
        body.select_set(True)
        for o in others: o.select_set(True)
        bpy.context.view_layer.objects.active = body
        bpy.ops.object.join()
    largest.name = name
main, tailrotor = source_objects['Heli'], source_objects['Tail']
main.name = 'rotor_main'; tailrotor.name = 'rotor_tail'

def tube(a, b, radius, name):
    a, b = Vector(a), Vector(b)
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=radius, depth=(b-a).length, location=(a+b)/2)
    o = bpy.context.object; o.name = name
    o.rotation_euler = (b-a).to_track_quat('Z', 'Y').to_euler()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.data.materials.append(materials[2])
    return o

for side, name in [(1, 'skid_right'), (-1, 'skid_left')]:
    x = side*1.4
    parts = [tube((x,-2.6,-.25),(x,1.5,-.25),.095,name),
             tube((x,-2.6,-.25),(x,-3.0,0),.095,name),
             tube((x,-1.55,-.25),(side*.85,-1.55,.7),.075,name),
             tube((x,.85,-.25),(side*.8,.85,.7),.075,name)]
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts: o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join(); parts[0].name = name

parts = sorted([o for o in scene.objects if o.type == 'MESH'], key=lambda o:o.name)
root = bpy.data.objects.new('helicopter', None)
scene.collection.objects.link(root)
inventory = []
for o in parts:
    coords = [v.co.copy() for v in o.data.vertices]
    lo = Vector(tuple(min(p[i] for p in coords) for i in range(3)))
    hi = Vector(tuple(max(p[i] for p in coords) for i in range(3)))
    pivot = (lo+hi)/2
    if o == main:
        pivot.z = 2.49  # shaft axis; centered on the fourfold-symmetric rotor mesh
    for v in o.data.vertices:
        v.co = (v.co-pivot)*SCALE
    o.location = (pivot-ORIGIN)*SCALE
    o.parent = root
    o['component'] = o.name
    o['collider_hint'] = 'box; use recorded local center and half extents; presentation debris only'
    # Export conversion is x,y,z -> x,z,-y, a proper rotation (determinant +1).
    def gltf(v): return [round(v.x,6),round(v.z,6),round(-v.y,6)]
    center = ((lo+hi)/2-pivot)*SCALE
    extent = (hi-lo)*SCALE/2
    inventory.append({'name':o.name, 'pivot':gltf(o.location),
      'collider':{'shape':'box','localCenter':gltf(center),'halfExtents':[round(extent.x,6),round(extent.z,6),round(extent.y,6)]},
      'rotationAxis':[0,1,0] if o==main else [1,0,0] if o==tailrotor else None})
    # Keep deliberate facets; hard cut caps must not interpolate normals into the outer skin.
    for polygon in o.data.polygons: polygon.use_smooth = False
    for uv in list(o.data.uv_layers): o.data.uv_layers.remove(uv)

# Independent 1-second rotor clips; quarter-turn keys prevent quaternion full-turn collapse.
scene.frame_start=0; scene.frame_end=24
for o, axis in [(main,2),(tailrotor,0)]:
    o.rotation_mode='XYZ'
    for f, angle in [(0,0),(6,math.pi/2),(12,math.pi),(18,math.pi*1.5),(24,math.tau)]:
        o.rotation_euler[axis]=angle
        o.keyframe_insert(data_path='rotation_euler',frame=f)
    o.animation_data.action.name=o.name+'_spin'
    for layer in o.animation_data.action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:
                        key.interpolation='LINEAR'
scene.frame_set(0)
bpy.ops.object.select_all(action='SELECT')
bpy.data.orphans_purge(do_recursive=True)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'helicopter.blend'), compress=True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'helicopter.glb'), export_format='GLB',
    use_selection=True, export_yup=True, export_animations=True,
    export_animation_mode='SCENE', export_nla_strips_merged_animation_name='rotors_spin',
    export_frame_range=True, export_force_sampling=True, export_extras=True,
    export_texcoords=False, export_normals=True, export_cameras=False, export_lights=False)
points=[o.matrix_world@v.co for o in parts for v in o.data.vertices]
converted=[Vector((v.x,v.z,-v.y)) for v in points]
metadata={'units':'meters','up':'+Y','nose':'+Z','handedness':'right-handed',
  'rootOrigin':'source (0,-0.5,1.3), centered in cabin; not ground contact',
  'sourceUniformScale':SCALE,'blenderVersion':bpy.app.version_string,
  'sourceArchiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),
  'bounds':{'min':[min(p[i] for p in converted) for i in range(3)],'max':[max(p[i] for p in converted) for i in range(3)]},
  'components':inventory,'animations':'rotor_main and rotor_tail: separate 1-second clips, one revolution each; choose runtime speeds independently',
  'limitations':['Simple boxes are suggestions for local cosmetic debris only, not gameplay hit shapes.',
    'Skid boxes include empty space; use compounds of rails/struts if visual settling requires it.',
    'Body seams are capped. Coplanar internal caps can touch until fragments separate.',
    'Preview rendering is offline; Babylon camera, materials, disposal and performance remain unverified.']}
(OUT/'components.json').write_text(json.dumps(metadata,indent=2)+'\n')
print('Prepared',len(parts),'components')
