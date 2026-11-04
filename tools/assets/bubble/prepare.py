"""Original tiny bubble car, authored procedurally in Blender. GPL-3.0-or-later."""
import bpy, bmesh, json, math
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'packages/content/runtime/models/bubble'
SOURCE=ROOT/'asset-source/bubble'
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

def ellipsoid_patch(name,center,radii,theta_range,phi_range,rows,cols,mat):
    # Analytic normals keep adjacent detachable curved panels visually continuous.
    verts=[];normals=[]
    for j in range(rows+1):
        t=math.radians(theta_range[0]+(theta_range[1]-theta_range[0])*j/rows)
        for i in range(cols+1):
            p=math.radians(phi_range[0]+(phi_range[1]-phi_range[0])*i/cols)
            unit=(math.sin(t)*math.sin(p),math.cos(t),math.sin(t)*math.cos(p))
            verts.append(tuple(center[k]+radii[k]*unit[k] for k in range(3)))
            normals.append(c(tuple(unit[k]/radii[k] for k in range(3))).normalized())
    faces=[]
    for j in range(rows):
        for i in range(cols):
            a=j*(cols+1)+i;faces.append((a,a+1,a+cols+2,a+cols+1))
    o=mesh(name,verts,faces,mat,True)
    # Eliminate pole degenerates while retaining analytic normals through position lookup.
    normal_by_pos={tuple(round(v,6)for v in c(p)):n for p,n in zip(verts,normals)}
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free();o.data.update()
    custom=[normal_by_pos[tuple(round(v,6)for v in o.data.vertices[l.vertex_index].co)] for l in o.data.loops]
    o.data.normals_split_custom_set(custom)
    return o

def oval_trim(height,rx,rz,forward,mat,radius=.012):
    average=(rx+rz)/2
    bpy.ops.mesh.primitive_torus_add(major_radius=1,minor_radius=radius/average,major_segments=COL*4,minor_segments=6,location=c((0,height,forward)))
    o=bpy.context.object;o.scale=(rx,rz,average)
    return [finish(o,mat,True)]

def arch(sign,forward):
    verts=[]
    for j in range(ARCH+1):
        a=math.radians(-12+204*j/ARCH)
        for x,r in [(.54,.30),(.58,.33),(.77,.33),(.81,.30),(.81,.275),(.77,.305),(.58,.305),(.54,.275)]:
            verts.append((sign*x,r*math.sin(a),forward+r*math.cos(a)))
    faces=[]
    for j in range(ARCH):
        for i in range(8):faces.append((j*8+i,j*8+(i+1)%8,(j+1)*8+(i+1)%8,(j+1)*8+i))
    faces.extend([tuple(range(7,-1,-1)),tuple(ARCH*8+i for i in range(8))])
    return mesh('Small wheel arch',verts,faces,PAINT,True)

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
    if name.startswith('wheel_'):collider={'shape':'cylinder','axis':[1,0,0],'radius':.265,'halfWidth':.09,'localCenter':[0,0,0]}
    report.append({'name':name,'pivot':gltf(center),'suggestedCosmeticCollider':collider})
    return o

reports={}
for level,lod in enumerate(['briefing','driving','distant']):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
    scene['assetRights']=RIGHTS
    ROUND=[36,18,10][level];TUBE=[8,6,4][level];BEVEL=[3,2,1][level];ARCH=[20,10,5][level];EDGE=[6,5,4][level]
    ROW=[12,6,4][level];COL=[16,8,4][level]
    PAINT=material('mint_enamel',(.12,.52,.40),.30,.28,.55)
    CREAM=material('warm_cream',(.85,.79,.61),.12,.33,.35)
    NICKEL=material('nickel',(.48,.54,.56),.93,.24)
    RUBBER=material('rubber_and_gunmetal',(.014,.020,.025),.30,.53)
    GLASS=material('blue_smoke_canopy',(.024,.085,.12),.25,.14,.5)
    LAMP=material('warm_headlamp',(.82,.73,.49),.1,.22,0,.30)
    RED=material('ruby_tail_lamp',(.40,.014,.008),.2,.25,0,.18)
    car=bpy.data.objects.new('car',None);scene.collection.objects.link(car);car['assetRights']=RIGHTS
    car['runtimeGuns']='Hide both optional guns until ordinary equipment rules permit them.'
    report=[]
    center=(0,.19,0);radii=(.67,.40,1.22)
    body=[ellipsoid_patch('Lower egg',center,radii,(90,180),(0,360),ROW,COL*4,PAINT),box((0,-.05,0),(1.02,.12,1.87),RUBBER,.055)]
    # Shared edge sampling closes four separately detachable upper body patches.
    join(body,'body')
    for name,phi in [('bonnet',(-45,45)),('door_right',(45,135)),('boot',(135,225)),('door_left',(225,315))]:
        pieces=[ellipsoid_patch(name,center,radii,(0,90),phi,ROW,COL,PAINT)]
        if name.startswith('door_'):
            sign=-1 if name=='door_left' else 1
            pieces.append(box((sign*.642,.33,-.13),(.034,.025,.12),NICKEL,.011))
        if name=='boot' and level<2:
            for j in range(5):pieces.append(box((0,.40,-.83-j*.035),(.30,.008,.014),RUBBER,.003,1))
        join(pieces,name)
    canopy_center=(0,.39,-.13);canopy_radii=(.60,.78,.84)
    canopy=[ellipsoid_patch('Curved glass',canopy_center,canopy_radii,(35,75),(0,360),ROW,COL*4,GLASS),
            ellipsoid_patch('Canopy skirt',canopy_center,canopy_radii,(75,112),(0,360),max(3,ROW//2),COL*4,PAINT)]
    for t in ([35,75] if level<2 else []):
        angle=math.radians(t);canopy+=oval_trim(.39+.78*math.cos(angle),.60*math.sin(angle),.84*math.sin(angle),-.13,NICKEL,.012)
    # Thin original canopy pillars leave the rounded glazing readable from all directions.
    for phi in [45,135,225,315]:
        p=math.radians(phi)
        steps=[8,5,3][level]
        for j in range(steps):
            t1=math.radians(35+40*j/steps);t2=math.radians(35+40*(j+1)/steps)
            a=(.602*math.sin(t1)*math.sin(p),.39+.782*math.cos(t1),-.13+.842*math.sin(t1)*math.cos(p))
            b=(.602*math.sin(t2)*math.sin(p),.39+.782*math.cos(t2),-.13+.842*math.sin(t2)*math.cos(p))
            canopy.append(cylinder(a,b,.015,CREAM,EDGE))
    join(canopy,'canopy')
    roof=[ellipsoid_patch('Cream roof cap',canopy_center,canopy_radii,(0,35),(0,360),max(3,ROW//2),COL*4,CREAM)]
    join(roof,'roof')
    for sign,side in [(-1,'left'),(1,'right')]:join([arch(sign,.74),arch(sign,-.74)],'fender_'+side)
    for forward,name in [(1.31,'bumper_front'),(-1.31,'bumper_rear')]:
        bumper=[box((0,.10,forward),(1.08,.09,.13),CREAM,.045)]
        if level<2:bumper.append(box((0,.10,forward+( .068 if forward>0 else -.068)),(.83,.022,.017),NICKEL,.007))
        join(bumper,name)
    front=[];rear=[]
    for sign in [-1,1]:
        front += [cylinder((sign*.37,.39,.84),(sign*.37,.39,1.11),.13,NICKEL,ROUND),cylinder((sign*.37,.39,1.115),(sign*.37,.39,1.125),.108,LAMP,ROUND)]
        rear += [cylinder((sign*.36,.35,-.92),(sign*.36,.35,-1.06),.069,NICKEL,ROUND),cylinder((sign*.36,.35,-1.063),(sign*.36,.35,-1.07),.054,RED,ROUND)]
    join(front,'lights_front');join(rear,'lights_rear')
    for forward,axle in [(.74,'f'),(-.74,'r')]:
        for sign,side in [(-1,'l'),(1,'r')]:
            x=sign*.67
            parts=[ring((x,0,forward),.195,.070,RUBBER),cylinder((x-sign*.04,0,forward),(x+sign*.077,0,forward),.163,CREAM,ROUND),
                   cylinder((x+sign*.079,0,forward),(x+sign*.091,0,forward),.070,NICKEL,ROUND)]
            if level==0:
                for j in range(6):
                    a=math.tau*j/6;parts.append(cylinder((x+sign*.078,.113*math.sin(a),forward+.113*math.cos(a)),(x+sign*.081,.113*math.sin(a),forward+.113*math.cos(a)),.016,RUBBER,EDGE))
            join(parts,'wheel_'+axle+side,(x,0,forward))
    for side,sign in [('left',-1),('right',1)]:
        x=sign*.49;origin=(x,.68,.20)
        parts=[box((x,.68,.26),(.25,.24,.32),RUBBER,.045),box((x,.49,.26),(.13,.23,.24),NICKEL,.025),
               cylinder((x,.68,.36),(x,.68,1.25),.085,RUBBER,ROUND),
               cylinder((x,.68,1.20),(x,.68,1.29),.125,NICKEL,ROUND),cylinder((x,.68,1.292),(x,.68,1.298),.089,RUBBER,ROUND)]
        for j in range([5,3,1][level]):
            f=.46+j*.59/max(1,[5,3,1][level]-1)
            parts.append(cylinder((x,.68,f),(x,.68,f+.035),.104,RUBBER,ROUND))
        gun=join(parts,'gun_'+side,origin);gun['optionalEquipment']=True
        muzzle=bpy.data.objects.new('muzzle_'+side,None);scene.collection.objects.link(muzzle);muzzle.parent=gun;muzzle.location=c((0,0,1.10))
    bpy.context.view_layer.update()
    points=[o.matrix_world@v.co for o in scene.objects if o.type=='MESH' and not o.name.startswith('gun_')for v in o.data.vertices]
    pts=[Vector((p.x,p.z,-p.y))for p in points]
    reports[lod]={'components':report,'unarmedBounds':{'min':[min(p[i]for p in pts)for i in range(3)],'max':[max(p[i]for p in pts)for i in range(3)]}}
    bpy.ops.object.select_all(action='SELECT');bpy.data.orphans_purge(do_recursive=True)
    if level==0:
        bpy.context.preferences.filepaths.save_version=0
        bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'bubble-prepared.blend'),compress=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/f'bubble-{lod}.glb'),export_format='GLB',use_selection=True,export_yup=True,
      export_animations=False,export_extras=True,export_texcoords=False,export_normals=True,export_cameras=False,export_lights=False)
metadata={'units':'meters','up':'+Y','nose':'+Z','handedness':'right-handed','root':'car','rootMeaning':'mid-axle plane; tyre bottoms at Y=-0.265',
 'wheelAxes':{'steer':[0,1,0],'roll':[1,0,0]},'leftRightConvention':'left is negative X',
 'optionalGuns':'Hide gun_left and gun_right on import until normal equipment rules permit them. Muzzles face local +Z.',
 'assetRights':RIGHTS,'lods':reports}
(OUT/'components.json').write_text(json.dumps(metadata,indent=2)+'\n')
print('Original bubble car exported in three LODs.')
