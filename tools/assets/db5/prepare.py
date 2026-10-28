"""Blender 5.2 authoring recipe. Third-party .blend is always opened with scripts disabled.
Run: blender -b --disable-autoexec --python-exit-code 1 --python tools/assets/db5/prepare.py
Runtime derivatives retain the supplied noncommercial fan-art restriction; they are not GPL assets.
"""
import bpy, bmesh, math, json, hashlib, zipfile
from pathlib import Path
from mathutils import Vector, Matrix

ROOT=Path(__file__).resolve().parents[3]
SOURCE=ROOT/'asset-source/db5'
OUT=ROOT/'packages/content/runtime/models/db5'
WORK=ROOT/'work/db5'
for p in (SOURCE,OUT,WORK):p.mkdir(parents=True,exist_ok=True)
ARCHIVE=SOURCE/'natman-db5-original.zip'
assert hashlib.sha256(ARCHIVE.read_bytes()).hexdigest()=='24cafbc2a778132a3d7645a0362bf39ebf075ddefe47157e984c506155327238'
with zipfile.ZipFile(ARCHIVE) as z:
    (WORK/'original.blend').write_bytes(z.read('db5 BS.blend'))
SCALE=.168
ORIGIN=Vector((0,-1.225,-1.815))
RIGHTS='natman; CC-BY-3.0 with supplied noncommercial fan-art restriction; see BLENDSWAP_LICENSE.txt'
GROUPS={
 'body':['bodyshell','windscreen','windscreen trim','Plane.018','Plane.019','Plane.020','Plane.021','Plane.016','Plane.017','inner wings','inner wings rear','WING MIRROR','WING MIRROR.001','wiper.000','wiper.001'],
 'bonnet':['BONNET'],
 'boot':['Plane.007','boot handle','boot lock'],
 'door_left':['Plane.014','Plane.015','door handle.001','Plane.027'],
 'door_right':['Plane.030','Plane.013','door handle','Plane.031'],
 'bumper_front':['Plane.008','number plate.jpg.000'],
 'bumper_rear':['rear bumper','Plane.022','Plane.023','rear plate','exhaust tailpipe','exhaust tailpipe.001'],
 'grille':['Cylinder','Plane.005'],
 'lights_front':['Sphere','Torus','Torus.001','rev light lens.001'],
 'lights_rear':['Circle','Circle.001','bezel','bezel.001','bezel.002','brake light lens','indicator rear','rev light lens'],
}
TIRE_NAMES={'wheel_fl':'Plane.011','wheel_fr':'Plane.012','wheel_rl':'Plane.024','wheel_rr':'Plane.025'}
MAIN_BUDGETS={'bodyshell':[22000,5400,1100],'BONNET':[3000,900,120],
 'Plane.007':[2500,500,100],'Plane.014':[2500,700,140],'Plane.030':[2500,700,140],
 'Plane.008':[600,160,18],'rear bumper':[600,140,18],'Torus':[600,100,18],'Torus.001':[600,100,18]}

def mat(name,color,metal,rough,coat=0,emission=0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    p.inputs['Coat Weight'].default_value=coat;p.inputs['Coat Roughness'].default_value=.15
    if emission:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
    return m

def material_index(name):
    name=(name or '').lower().strip()
    if name in ('body','body colour'):return 0
    if name in ('chrome','chrome.001','dull silver','steel','steel.001','mirror','exhaust'):return 1
    if name=='windows':return 3
    if name in ('light glass','light glass.001','rev light'):return 4
    if name in ('brakelight','indicator','brake ref','ind refl'):return 5
    return 2

def simplify(o,limit):
    reference=bpy.data.objects.new('normal_reference',o.data.copy())
    bpy.context.scene.collection.objects.link(reference)
    # Remove split duplicates before reduction, keeping the silhouette's original surface.
    bm=bmesh.new();bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
    o.data.calc_loop_triangles();count=len(o.data.loop_triangles)
    if count>limit:
        bpy.context.view_layer.objects.active=o
        m=o.modifiers.new('bounded_surface_reduction','DECIMATE');m.ratio=limit/count
        m.use_collapse_triangulate=True
        bpy.ops.object.modifier_apply(modifier=m.name)
    for p in o.data.polygons:p.use_smooth=True
    bpy.context.view_layer.objects.active=o
    triangulate=o.modifiers.new('runtime_triangles','TRIANGULATE')
    bpy.ops.object.modifier_apply(modifier=triangulate.name)
    # Legacy seams contain almost-collinear slivers whose winding becomes unstable
    # in float32 GLB positions. Remove faces below one micrometer of altitude.
    bm=bmesh.new();bm.from_mesh(o.data)
    slivers=[f for f in bm.faces if f.calc_area()/max((e.calc_length() for e in f.edges),default=1)<1e-6]
    if slivers:bmesh.ops.delete(bm,geom=slivers,context='FACES')
    loose=[v for v in bm.verts if not v.link_faces]
    if loose:bmesh.ops.delete(bm,geom=loose,context='VERTS')
    bm.to_mesh(o.data);bm.free()
    # Retain the source surface's shading rather than making the metallic body look dented.
    bpy.context.view_layer.objects.active=o
    transfer=o.modifiers.new('source_surface_normals','DATA_TRANSFER')
    transfer.object=reference;transfer.use_loop_data=True
    transfer.data_types_loops={'CUSTOM_NORMAL'};transfer.loop_mapping='POLYINTERP_NEAREST'
    bpy.ops.object.modifier_apply(modifier=transfer.name)
    # Thin source sheets can have an inward-facing shading side, and nearest-surface
    # transfer can select the opposite wall of a thin shell. Orient each transferred
    # normal into the final triangle's outward hemisphere before opaque PBR export.
    normals=[n.vector.copy() for n in o.data.corner_normals]
    for polygon in o.data.polygons:
        for index in polygon.loop_indices:
            if normals[index].dot(polygon.normal)<0:normals[index].negate()
    o.data.normals_split_custom_set(normals)
    bpy.data.objects.remove(reference,do_unlink=True)

def join(objects,name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join();o=objects[0];o.name=name
    return o

def cylinder(a,b,radius,material,segments=8):
    a,b=Vector(a),Vector(b)
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments,radius=radius,depth=(b-a).length,location=(a+b)/2)
    o=bpy.context.object;o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    o.data.materials.append(material)
    for p in o.data.polygons:p.use_smooth=True
    return o

def to_gltf(p):return [round(p.x,7),round(p.z,7),round(-p.y,7)]

all_reports={}
for lod_index,lod in enumerate(('briefing','driving','distant')):
    bpy.ops.wm.open_mainfile(filepath=str(WORK/'original.blend'),load_ui=False,use_scripts=False)
    scene=bpy.context.scene
    scene.world=None
    scene['assetRights']=RIGHTS
    scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
    originals=list(bpy.data.objects)
    materials=[mat('silver_clearcoat',(.52,.56,.60),.85,.31,.55),
      mat('chrome',(.62,.66,.70),1,.18),mat('rubber_and_recesses',(.018,.022,.026),0,.78),
      mat('tinted_glazing',(.028,.065,.085),.35,.12,.25),
      mat('warm_lamp',(.84,.82,.65),.15,.22, .12),mat('red_lamp',(.45,.015,.008),.1,.25,.16)]
    # Keep curved exterior subdivision; omit hidden engine/interior and original studio objects.
    for o in originals:
        for m in o.modifiers:
            if m.type=='SUBSURF':m.levels=min(m.levels,1);m.render_levels=m.levels
            if m.type=='DISPLACE':m.show_viewport=False;m.show_render=False
    bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get()
    prepared=[];source_counts={};wheel_centers={}
    def extract(name,limit):
        src=bpy.data.objects[name]
        mesh=bpy.data.meshes.new_from_object(src.evaluated_get(dg))
        normal_matrix=src.matrix_world.to_3x3().inverted().transposed()
        source_normals=[(normal_matrix@n.vector).normalized() for n in mesh.corner_normals]
        oldmats=[m.name if m else '' for m in mesh.materials]
        indices=[material_index(oldmats[p.material_index] if p.material_index<len(oldmats) else '') for p in mesh.polygons]
        mesh.materials.clear()
        for m in materials:mesh.materials.append(m)
        for p,index in zip(mesh.polygons,indices):p.material_index=index
        for v in mesh.vertices:v.co=(src.matrix_world@v.co-ORIGIN)*SCALE
        mesh.update()
        mesh.normals_split_custom_set(source_normals)
        for layer in list(mesh.uv_layers):mesh.uv_layers.remove(layer)
        o=bpy.data.objects.new('prepared_'+name,mesh);scene.collection.objects.link(o)
        mesh.calc_loop_triangles();source_counts[name]=len(mesh.loop_triangles)
        simplify(o,limit)
        return o
    for group,names in GROUPS.items():
        group_parts=[]
        for name in names:
            limit=MAIN_BUDGETS.get(name,[600,80,18])[lod_index]
            # Glazing retains its silhouette and light housings stay rounded at driving distance.
            if name=='windscreen':limit=[1000,180,24][lod_index]
            group_parts.append(extract(name,limit))
        prepared.append(join(group_parts,group))
    for wheel,srcname in TIRE_NAMES.items():
        tire=extract(srcname,[1300,320,96][lod_index])
        # Axle centers are established from the original full tyre, not decimated extrema.
        src=bpy.data.objects[srcname]
        corners=[(src.matrix_world@Vector(p)-ORIGIN)*SCALE for p in src.bound_box]
        center=(Vector(tuple(min(p[i]for p in corners)for i in range(3)))+Vector(tuple(max(p[i]for p in corners)for i in range(3))))/2
        wheel_centers[wheel]=center
        sign=-1 if 'l'==wheel[-1] else 1
        face=center+Vector((sign*.085,0,0))
        segments=[48,24,12][lod_index];minor=[8,4,4][lod_index]
        bpy.ops.mesh.primitive_torus_add(major_segments=segments,minor_segments=minor,major_radius=.201,minor_radius=.011,location=face,rotation=(0,math.pi/2,0))
        rim=bpy.context.object;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True);rim.data.materials.append(materials[1])
        pieces=[tire,rim]
        spokes=[32,16,8][lod_index]
        for i in range(spokes):
            angle=math.tau*i/spokes;angle2=angle+.23
            outer=face+Vector((0,.19*math.cos(angle),.19*math.sin(angle)))
            inner=center+Vector((sign*.10,.047*math.cos(angle2),.047*math.sin(angle2)))
            pieces.append(cylinder(inner,outer,[.004,.005,.007][lod_index],materials[1],[6,4,4][lod_index]))
        pieces.append(cylinder(center+Vector((sign*.07,0,0)),center+Vector((sign*.11,0,0)),.049,materials[1],[16,12,8][lod_index]))
        prepared.append(join(pieces,wheel))
    for o in originals:bpy.data.objects.remove(o,do_unlink=True)
    # A closed dark undertray prevents looking through an empty engine bay after exterior pruning.
    bpy.ops.mesh.primitive_cube_add(size=1,location=(0,.1,-.10))
    tray=bpy.context.object;tray.scale=(1.18,3.6,.10);bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    tray.data.materials.append(materials[2]);body=next(o for o in prepared if o.name=='body')
    join([body,tray],'body')
    # Concealed-grille optional barrels stay inside the normal car's outer bounds.
    guns=[]
    for side,sign in [('left',-1),('right',1)]:
        origin=Vector((sign*.43,-1.79,.27))
        parts=[cylinder(origin,origin+Vector((0,-.23,0)),.024,materials[2],[16,10,8][lod_index]),
          cylinder(origin+Vector((0,-.025,0)),origin+Vector((0,-.10,0)),.037,materials[1],[12,8,6][lod_index])]
        gun=join(parts,'gun_'+side);prepared.append(gun);guns.append((gun,origin,side))
    root=bpy.data.objects.new('car',None);scene.collection.objects.link(root)
    root['assetRights']=RIGHTS;root['runtimeGuns']='Hide gun_left/right on load until ordinary armed/equipment rules enable them.'
    components=[]
    for o in prepared:
        pts=[v.co.copy()for v in o.data.vertices]
        lo=Vector(tuple(min(v[i]for v in pts)for i in range(3)));hi=Vector(tuple(max(v[i]for v in pts)for i in range(3)))
        pivot=wheel_centers.get(o.name,(lo+hi)/2)
        if o.name.startswith('gun_'):pivot=next(p for g,p,s in guns if g==o)
        for v in o.data.vertices:v.co-=pivot
        o.location=pivot;o.parent=root
        o['part']=o.name
        if o.name.startswith('gun_'):o['optionalEquipment']=True
        shape={'shape':'box','localCenter':to_gltf((lo+hi)/2-pivot),'halfExtents':[round((hi.x-lo.x)/2,7),round((hi.z-lo.z)/2,7),round((hi.y-lo.y)/2,7)]}
        if o.name.startswith('wheel_'):shape={'shape':'cylinder','axis':[1,0,0],'radius':.311,'halfWidth':.095,'localCenter':[0,0,0]}
        components.append({'name':o.name,'pivot':to_gltf(pivot),'suggestedCosmeticCollider':shape})
    for gun,origin,side in guns:
        muzzle=bpy.data.objects.new('muzzle_'+side,None);scene.collection.objects.link(muzzle);muzzle.parent=gun;muzzle.location=(0,-.23,0)
    scene.frame_set(0);bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for o in prepared:o.select_set(True)
    for o in bpy.data.objects:
        if o.name.startswith('muzzle_'):o.select_set(True)
    bpy.data.orphans_purge(do_recursive=True)
    if lod=='briefing':
        bpy.context.preferences.filepaths.save_version=0
        bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'db5-prepared.blend'),compress=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/f'db5-{lod}.glb'),export_format='GLB',use_selection=True,
      export_yup=True,export_animations=False,export_extras=True,export_texcoords=False,export_normals=True,
      export_cameras=False,export_lights=False)
    points=[o.matrix_world@v.co for o in prepared if not o.name.startswith('gun_')for v in o.data.vertices]
    pts=[Vector((p.x,p.z,-p.y))for p in points]
    all_reports[lod]={'components':components,'unarmedBounds':{'min':[min(p[i]for p in pts)for i in range(3)],'max':[max(p[i]for p in pts)for i in range(3)]},'evaluatedSourceTrianglesBeforeReduction':source_counts}
metadata={'units':'meters','up':'+Y','nose':'+Z','handedness':'right-handed','root':'car',
 'sourceScale':SCALE,'sourceOrigin':list(ORIGIN),'rootMeaning':'mid-axle chassis plane; wheel centers near Y=0, tyres extend below root',
 'wheelAxes':{'steer':[0,1,0],'roll':[1,0,0]},'leftRightConvention':'left nodes have negative X; right nodes positive X',
 'optionalGuns':'GLB visibility is not portable; renderer MUST hide gun_left/right at import until equipment rules permit them. Muzzles face local +Z.',
 'assetRights':RIGHTS,'lods':all_reports}
(OUT/'components.json').write_text(json.dumps(metadata,indent=2)+'\n')
print('Prepared three DB5 LODs; source script execution disabled throughout.')
