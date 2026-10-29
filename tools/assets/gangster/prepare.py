"""Original unbranded 1920s sedan, authored procedurally in Blender. GPL-3.0-or-later."""
import bpy, bmesh, json, math
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'packages/content/runtime/models/gangster'
SOURCE=ROOT/'asset-source/gangster'
RIGHTS='Original Fender Offenders asset; GPL-3.0-or-later; OpenAI Codex assistance directed by Stefan Andersson'
OUT.mkdir(parents=True,exist_ok=True);SOURCE.mkdir(parents=True,exist_ok=True)

def c(p):
    """Author in (X, height, forward); Blender uses Z-up and nose -Y."""
    return Vector((p[0],-p[2],p[1]))

def gltf(v):return [round(v.x,7),round(v.z,7),round(-v.y,7)]

def material(name,color,metal,rough,coat=0,emission=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal
    p.inputs['Roughness'].default_value=rough;p.inputs['Coat Weight'].default_value=coat
    p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
    m.diffuse_color=(*color,1)
    return m

def active(o):
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o

def finish(o,mat,smooth=False):
    o.data.materials.append(mat)
    for p in o.data.polygons:p.use_smooth=smooth
    return o

def box(pos,size,mat,bevel=0,segments=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=c(pos));o=bpy.context.object
    o.scale=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        m=o.modifiers.new('Rounded metal edge','BEVEL');m.width=bevel;m.segments=segments or BEVEL
        bpy.ops.object.modifier_apply(modifier=m.name)
        for p in o.data.polygons:p.use_smooth=True
        m=o.modifiers.new('Panel normals','WEIGHTED_NORMAL');m.keep_sharp=True;m.weight=50
        bpy.ops.object.modifier_apply(modifier=m.name)
    return finish(o,mat, bool(bevel))

def cylinder(a,b,r,mat,vertices=None):
    a,b=c(a),c(b);delta=b-a
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices or ROUND,radius=r,depth=delta.length,location=(a+b)/2)
    o=bpy.context.object;o.rotation_mode='QUATERNION';o.rotation_quaternion=delta.to_track_quat('Z','Y')
    for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
    o.data.materials.append(mat);return o

def ring(pos,major,minor,mat,axis='X',segments=None,tube=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=major,minor_radius=minor,major_segments=segments or ROUND,minor_segments=tube or TUBE,location=c(pos))
    o=bpy.context.object
    if axis=='X':o.rotation_euler.y=math.pi/2
    elif axis=='F':o.rotation_euler.x=math.pi/2
    return finish(o,mat,True)

def mesh(name,verts,faces,mat,smooth=False):
    data=bpy.data.meshes.new(name);data.from_pydata([c(v)for v in verts],[],faces);data.update()
    bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
    o=bpy.data.objects.new(name,data);bpy.context.scene.collection.objects.link(o)
    return finish(o,mat,smooth)

def frame_quad(points,width,mat):
    return [cylinder(points[i],points[(i+1)%4],width,mat,EDGE)for i in range(4)]

def glass_quad(points):return mesh('Glazing',points,[(0,1,2,3)],GLASS)

def fender(sign,forward):
    # Closed swept metal shell, gently crowned across its width, never a box over the wheel.
    verts=[];steps=ARCH
    for i in range(steps+1):
        theta=math.radians(-12+204*i/steps)
        for x,r in [(.59,.53),(.64,.56),(.91,.56),(.98,.525),(.98,.495),(.91,.525),(.64,.525),(.59,.495)]:
            verts.append((sign*x,r*math.sin(theta),forward+r*math.cos(theta)))
    faces=[]
    for i in range(steps):
        for j in range(8):faces.append((i*8+j,i*8+(j+1)%8,(i+1)*8+(j+1)%8,(i+1)*8+j))
    faces += [tuple(range(7,-1,-1)),tuple(steps*8+j for j in range(8))]
    return mesh('Swept fender',verts,faces,PAINT,True)

def join(parts,name,pivot=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:o.select_set(True)
    bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();o=parts[0];o.name=name
    # Bake all authoring transforms; only semantic part translations remain in the GLB.
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    lo=Vector(tuple(min(v.co[i]for v in o.data.vertices)for i in range(3)))
    hi=Vector(tuple(max(v.co[i]for v in o.data.vertices)for i in range(3)))
    center=c(pivot)if pivot is not None else (lo+hi)/2
    for v in o.data.vertices:v.co-=center
    o.location=center;o.parent=car;o['part']=name
    tri=o.modifiers.new('Export triangles','TRIANGULATE');tri.keep_custom_normals=True
    bpy.ops.object.modifier_apply(modifier=tri.name)
    collider={'shape':'box','localCenter':gltf((lo+hi)/2-center),'halfExtents':[round((hi.x-lo.x)/2,7),round((hi.z-lo.z)/2,7),round((hi.y-lo.y)/2,7)]}
    if name.startswith('wheel_'):collider={'shape':'cylinder','axis':[1,0,0],'radius':.425,'halfWidth':.105,'localCenter':[0,0,0]}
    report.append({'name':name,'pivot':gltf(center),'suggestedCosmeticCollider':collider})
    return o

reports={}
for level,lod in enumerate(['briefing','driving','distant']):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
    scene['assetRights']=RIGHTS
    ROUND=[48,20,12][level];TUBE=[10,6,4][level];BEVEL=[3,2,1][level];ARCH=[28,16,7][level];EDGE=[8,6,4][level]
    PAINT=material('midnight_black',(.012,.018,.023),.50,.26,.65)
    NICKEL=material('brushed_nickel',(.48,.53,.56),.92,.24)
    RUBBER=material('rubber_and_recesses',(.009,.012,.014),0,.83)
    GLASS=material('blue_smoke_glass',(.035,.075,.095),.25,.16,.35)
    LAMP=material('warm_headlamp',(.8,.68,.43),.15,.22,0,.35)
    RED=material('ruby_tail_lamp',(.38,.012,.008),.2,.22,0,.18)
    car=bpy.data.objects.new('car',None);scene.collection.objects.link(car);car['assetRights']=RIGHTS
    car['runtimeGuns']='Hide both optional guns until ordinary equipment rules permit them.'
    report=[]

    # Tall enclosed cabin: original two-door proportions, split side glazing, no badges or logos.
    body=[box((0,.36,-.66),(1.31,.51,2.26),PAINT,.10),box((0,.08,0),(1.16,.16,3.65),RUBBER,.04),
          box((0,1.47,-.67),(1.40,.20,2.24),PAINT,.12)]
    for f in [.40,-1.74]:
        body.append(box((0,.88,f),(1.30,.18,.13),PAINT,.045))
        for sign in [-1,1]:body.append(box((sign*.632,1.12,f),( .09,.70,.10),PAINT,.035))
    front=[(-.58,.91,.425),(.58,.91,.425),(.58,1.39,.425),(-.58,1.39,.425)]
    rear=[(-.55,.86,-1.80),(-.55,1.36,-1.80),(.55,1.36,-1.80),(.55,.86,-1.80)]
    for points in [front,rear]:body.append(glass_quad(points));body.extend(frame_quad(points,.014,NICKEL))
    body.append(cylinder((0,.91,.44),(0,1.39,.44),.014,NICKEL,EDGE))
    body.append(cylinder((-.45,1.0,.45),(-.11,1.08,.45),.01,RUBBER,EDGE))
    join(body,'body')

    bonnet=[box((0,.63,1.10),(1.07,.43,1.39),PAINT,.09)]
    bonnet.append(cylinder((0,.855,.47),(0,.855,1.70),.009,NICKEL,EDGE))
    if level<2:
        for sign in [-1,1]:
            for j in range([10,6][level]):
                f=.65+j*.085*([1,1.5][level])
                bonnet.append(box((sign*.538,.63,f),(.009,.19,.018),RUBBER,.005,1))
    join(bonnet,'bonnet')
    join([box((0,.37,-1.99),(1.18,.43,.51),PAINT,.08),box((0,.50,-2.25),(.19,.026,.025),NICKEL,.01)],'boot')

    for sign,side in [(-1,'left'),(1,'right')]:
        door=[box((sign*.665,.57,-.62),(.075,.51,1.96),PAINT,.045)]
        for near,far in [(.32,-.53),(-.64,-1.61)]:
            points=[(sign*.682,.86,near),(sign*.682,.86,far),(sign*.682,1.385,far),(sign*.682,1.385,near)]
            door.append(glass_quad(points));door.extend(frame_quad(points,.013,NICKEL))
        door.append(box((sign*.68,1.13,-.585),(.075,.59,.07),PAINT,.025))
        door.append(box((sign*.72,.76,-1.36),(.035,.025,.15),NICKEL,.011))
        door.append(box((sign*.718,.80,-.64),(.019,.022,1.91),NICKEL,.008))
        join(door,'door_'+side)
        join([fender(sign,1.32),fender(sign,-1.32)],'fender_'+side)
        boards=[box((sign*.78,-.08,0),(.42,.075,1.65),PAINT,.035)]
        if level<2:
            for x in [.65,.75,.85,.94]:boards.append(box((sign*x,-.036,0),(.018,.009,1.48),PAINT,.004,1))
        join(boards,'running_board_'+side)

    grille=[box((0,.51,1.855),(.91,.82,.12),NICKEL,.09),box((0,.51,1.925),(.78,.67,.023),RUBBER,.065)]
    for i in range([19,13,7][level]):
        x=-.33+i*.66/([19,13,7][level]-1)
        grille.append(cylinder((x,.22,1.945),(x,.80,1.945),.007 if level<2 else .010,NICKEL,EDGE))
    grille.append(cylinder((0,.92,1.84),(0,.97,1.84),.032,NICKEL,ROUND))
    join(grille,'grille')
    for f,name in [(2.16,'bumper_front'),(-2.34,'bumper_rear')]:
        parts=[box((0,.06,f),(1.78,.07,.09),NICKEL,.035)]
        for sign in [-1,1]:parts.append(box((sign*.66,.10,f),(.055,.22,.12),NICKEL,.026))
        join(parts,name)

    headlights=[];tails=[]
    for sign in [-1,1]:
        x=sign*.65
        headlights += [cylinder((x,.63,1.62),(x,.63,1.80),.148,NICKEL,ROUND),cylinder((x,.63,1.805),(x,.63,1.815),.124,LAMP,ROUND)]
        headlights.append(cylinder((x,.48,1.65),(x,.63,1.65),.022,NICKEL,EDGE))
        tails += [cylinder((sign*.52,.49,-2.23),(sign*.52,.49,-2.27),.061,NICKEL,ROUND),cylinder((sign*.52,.49,-2.274),(sign*.52,.49,-2.28),.047,RED,ROUND)]
    join(headlights,'lights_front');join(tails,'lights_rear')

    for f,axle in [(1.32,'f'),(-1.32,'r')]:
        for sign,side in [(-1,'l'),(1,'r')]:
            x=sign*.80
            parts=[ring((x,0,f),.33,.095,RUBBER),ring((x+sign*.075,0,f),.285,.018,NICKEL)]
            parts.append(cylinder((x-sign*.055,0,f),(x+sign*.09,0,f),.095,NICKEL,ROUND))
            for i in range([20,10,6][level]):
                angle=math.tau*i/[20,10,6][level]
                a=(x+sign*.08,.09*math.sin(angle),f+.09*math.cos(angle))
                b=(x+sign*.07,.282*math.sin(angle+.16),f+.282*math.cos(angle+.16))
                parts.append(cylinder(a,b,.012,NICKEL,EDGE))
            join(parts,'wheel_'+axle+side,(x,0,f))

    for side,sign in [('left',-1),('right',1)]:
        origin=(sign*.43,.36,1.72)
        gun=join([cylinder(origin,(sign*.43,.36,1.96),.026,RUBBER,ROUND)],'gun_'+side,origin)
        gun['optionalEquipment']=True
        muzzle=bpy.data.objects.new('muzzle_'+side,None);scene.collection.objects.link(muzzle);muzzle.parent=gun;muzzle.location=c((0,0,.24))
    bpy.context.view_layer.update()
    points=[o.matrix_world@v.co for o in scene.objects if o.type=='MESH' and not o.name.startswith('gun_')for v in o.data.vertices]
    pts=[Vector((p.x,p.z,-p.y))for p in points]
    reports[lod]={'components':report,'unarmedBounds':{'min':[min(p[i]for p in pts)for i in range(3)],'max':[max(p[i]for p in pts)for i in range(3)]}}
    bpy.ops.object.select_all(action='SELECT')
    bpy.data.orphans_purge(do_recursive=True)
    if level==0:
        bpy.context.preferences.filepaths.save_version=0
        bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'gangster-prepared.blend'),compress=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/f'gangster-{lod}.glb'),export_format='GLB',use_selection=True,export_yup=True,
      export_animations=False,export_extras=True,export_texcoords=False,export_normals=True,export_cameras=False,export_lights=False)

metadata={'units':'meters','up':'+Y','nose':'+Z','handedness':'right-handed','root':'car','rootMeaning':'mid-axle plane; tyre bottoms at Y=-0.425',
 'wheelAxes':{'steer':[0,1,0],'roll':[1,0,0]},'leftRightConvention':'left is negative X',
 'optionalGuns':'Hide gun_left and gun_right on import until normal equipment rules permit them. Muzzles face local +Z.',
 'assetRights':RIGHTS,'lods':reports}
(OUT/'components.json').write_text(json.dumps(metadata,indent=2)+'\n')
print('Original gangster sedan exported in three LODs.')
