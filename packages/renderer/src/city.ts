import { Color3 } from '@babylonjs/core/Maths/math.color';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import type { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from './primitives';
import { buildings, districtMap, roadCenters, ROAD_BUMPS } from '@fender/content';

/** Groups authored primitives into material batches; temporary primitives are disposed. */
export function buildCity(scene: Scene): Mesh[] {
  const groups = new Map<Material, Mesh[]>();
  const materials = new Map<string, StandardMaterial>();
  const material = (color: string, glow = false) => {
    const key = color + glow;
    let m = materials.get(key);
    if (!m) { m = new StandardMaterial(key, scene); m.diffuseColor = Color3.FromHexString(color); m.specularColor.set(.03, .03, .03); if (glow) m.emissiveColor = m.diffuseColor.scale(.55); materials.set(key, m); }
    if(color==='#4d6268'){m.specularColor.set(.09,.09,.09);m.specularPower=48;}
    else if(color==='#bd9b6f'){m.specularColor.set(.018,.018,.018);m.specularPower=10;}
    else if(color==='#c8c6ac'){m.specularColor.set(.04,.04,.04);m.specularPower=24;}
    return m;
  };
  const add = (mesh: Mesh, color: string) => {
    const m = material(color); mesh.material = m;
    const list = groups.get(m) ?? []; list.push(mesh); groups.set(m, list);
    return mesh;
  };
  const box = (name: string, x: number, y: number, z: number, w: number, h: number, d: number, color: string, yaw = 0) => {
    const mesh = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    mesh.position.set(x, y, z); mesh.rotation.y = yaw; return add(mesh, color);
  };
  const cylinder = (name: string, x: number, y: number, z: number, diameter: number, height: number, color: string, top = diameter, sides = 10) => {
    const mesh = MeshBuilder.CreateCylinder(name, { diameterBottom: diameter, diameterTop: top, height, tessellation: sides }, scene);
    mesh.position.set(x, y, z); return add(mesh, color);
  };

  box('harbor-water', 0, -1.3, 0, 1200, .1, 1200, '#7fa7a8');
  box('district-foundation', 0, -.8, 0, 270, 1, 270, '#7e9385');
  box('ground', 0, -.21, 0, 270, .3, 270, '#6f987f');
  for(let i=0;i<70;i++){
    const side=i%4,along=Math.sin(i*19.57)*240,away=145+(i%9)*12;
    box('water-glint',side<2?along:(side===2?away:-away),-1.235,side>=2?along:(side===0?away:-away),5+i%7,.008,.14,'#98b8b5');
  }
  box('city-pad', 0, -.06, 0, 250, .06, 250, '#52666b');
  for (const x of [-40, 40]) for (const z of [-40, 40]) {
    box('sidewalk-block', x, .05, z, 64, .18, 64, '#c8c6ac');
    box('garden-block', x, .16, z, 56, .12, 56, '#8ba079');
    // Footpaths around the central block gardens.
    for (const side of [-1, 1]) {
      box('walk', x + side * 27, .23, z, 2, .05, 54, '#c8c6ac');
      box('walk', x, .23, z + side * 27, 54, .05, 2, '#c8c6ac');
    }
  }
  for (const side of [-1, 1]) {
    // Leave the authored 16m road corridors open through the outer dressing.
    for(const [start,end] of [[-125,-88],[-72,-8],[8,72],[88,125]]){
      const center=(start!+end!)/2,length=end!-start!;
      box('outer-walk', side * 94, .06, center, 10, .2, length, '#c8c6ac');
      box('outer-walk', center, .06, side * 94, length, .2, 10, '#c8c6ac');
      box('outer-grass', side * 112, .1, center, 25, .1, length, '#91a47c');
      box('outer-grass', center, .1, side * 112, length, .1, 25, '#91a47c');
    }
  }
  for (const p of roadCenters) {
    box('asphalt', p, .004, 0, 16, .02, 250, '#4d6268');
    box('asphalt', 0, .006, p, 250, .02, 16, '#4d6268');
    for (let i = -120; i <= 120; i += 9) if (roadCenters.every((r) => Math.abs(i - r) > 11)) {
      box('center-dash', p, .026, i, .16, .014, 4, '#e9c979');
      box('center-dash', i, .028, p, 4, .014, .16, '#e9c979');
      for (const s of [-1, 1]) {
        box('edge-line', p + s * 7.5, .026, i, .12, .014, 8.5, '#c1ccbd');
        box('edge-line', i, .027, p + s * 7.5, 8.5, .014, .12, '#c1ccbd');
      }
    }
    for (const q of roadCenters) for (const s of [-1, 1]) {
      for (let j = -5.8; j < 6; j += 1.65) {
        box('crossing', p + j, .03, q + s * 10.2, .8, .015, 2.3, '#dce0ca');
        box('crossing', p + s * 10.2, .03, q + j, 2.3, .015, .8, '#dce0ca');
      }
      box('stop-line', p + s * 4, .033, q + s * 13, 6.4, .015, .3, '#e0d8b5');
    }
  }
  // Rounded amber/charcoal humps are cosmetic; planar authority remains unchanged.
  for(const bump of ROAD_BUMPS){
    for(let i=0;i<12;i++){
      const offset=-bump.width/2+(i+.5)*bump.width/12;
      const hump=MeshBuilder.CreateCylinder(`speed-hump-${bump.id}`,{diameter:bump.length,height:bump.width/12,tessellation:16},scene);
      hump.position.set(bump.x+Math.cos(bump.yaw)*offset,.025,bump.z-Math.sin(bump.yaw)*offset);hump.rotation.set(0,bump.yaw,Math.PI/2);hump.scaling.x=bump.height/(bump.length/2);
      add(hump,i%2?'#d6b86f':'#3e5156');
    }
  }
  // Two real driveable shortcuts, also represented in the shared surface polygons.
  for(const surface of districtMap.surfaces.filter((s)=>s.surface==='dirt')){
    const polygon=surface.polygonXZ,positions:number[]=[],indices:number[]=[];let area=0;
    for(let i=0;i<polygon.length;i+=2){positions.push(polygon[i]!,.25,polygon[i+1]!);const j=(i+2)%polygon.length;area+=polygon[i]!*polygon[j+1]!-polygon[j]!*polygon[i+1]!;}
    for(let i=1;i<polygon.length/2-1;i++)indices.push(...(area>0?[0,i+1,i]:[0,i,i+1]));
    for(let i=0;i<indices.length;i+=3){const a=indices[i]!;indices[i]=indices[i+2]!;indices[i+2]=a;}
    const mesh=new Mesh(surface.id,scene),v=new VertexData();v.positions=positions;v.indices=indices;v.normals=[];v.uvs=Array(positions.length/3*2).fill(0);VertexData.ComputeNormals(positions,indices,v.normals);v.applyToMesh(mesh);add(mesh,'#bd9b6f');
  }
  for (let i = 0; i < 90; i++) {
    const x = Math.sin(i * 38.31) * 122, z = Math.cos(i * 22.47) * 122;
    if (roadCenters.every((r) => Math.abs(x - r) > 15 && Math.abs(z - r) > 15)) box('grass-detail', x, .221, z, 1.7, .015, 1, i % 2 ? '#94a77f' : '#849b74');
  }
  // A parking apron next to the precinct, with painted bays and wheel stops.
  box('bureau-parking', 37, .25, -52, 44, .06, 13, '#687879');
  for (let x = 18; x <= 58; x += 5) { box('parking-stripe', x, .292, -53, .12, .02, 7, '#d5cfad'); box('parking-stop', x + 2, .38, -56, 3.2, .18, .35, '#ded5b9'); }

  for (const b of buildings) {
    const { x, z, width: w, depth: d, height: h } = b;
    box(b.id, x, h / 2 + .2, z, w, h, d, b.color);
    box('foundation', x, .65, z, w + .3, .7, d + .3, '#82908b');
    if (b.kind === 'house') {
      // Ridge roof built explicitly, giving the houses a clean gabled silhouette.
      const mesh = new Mesh('gable', scene);
      const v = new VertexData();
      v.positions = [-w/2-.5,h,-d/2-.5,w/2+.5,h,-d/2-.5,0,h+3,-d/2-.5,-w/2-.5,h,d/2+.5,w/2+.5,h,d/2+.5,0,h+3,d/2+.5];
      v.indices = [0,2,1,3,4,5,0,3,5,0,5,2,1,2,5,1,5,4];
      for(let i=0;i<v.indices.length;i+=3){const a=v.indices[i]!;v.indices[i]=v.indices[i+2]!;v.indices[i+2]=a;}
      v.normals = [];v.uvs=Array(v.positions.length/3*2).fill(0); VertexData.ComputeNormals(v.positions, v.indices, v.normals); v.applyToMesh(mesh); mesh.position.set(x,.2,z); add(mesh, '#576970');
      box('chimney', x + w*.25, h+2.6, z+1, 1.2, 2.7, 1.3, '#a06f5c');
      box('porch', x, .4, z-d/2-1.6, 5, .5, 3, '#b9b4a1');
      box('door', x, 1.6, z-d/2-.03, 1.5, 2.7, .12, '#475e62');
      for (const side of [-1,1]) {
        box('house-window-trim', x+side*w*.29, 3.1, z-d/2-.06, 2.3, 2.3, .15, '#e8d9b4');
        box('house-glass', x+side*w*.29, 3.1, z-d/2-.15, 1.9, 1.9, .1, '#517e87');
        box('house-mullion', x+side*w*.29, 3.1, z-d/2-.23, .12, 1.9, .1, '#d6ceb5');
      }
    } else {
      box('roof-cap', x, h+.3, z, w+.5, .5, d+.5, '#d8d3ba');
      box('roof', x, h+.58, z, w-1, .15, d-1, '#637479');
      for (const side of [-1,1]) {
        box('parapet', x+side*(w/2-.2), h+.8, z, .4,.6,d,'#c8c8af');
        box('parapet', x,h+.8,z+side*(d/2-.2),w,.6,.4,'#c8c8af');
      }
      box('roof-ac', x+w*.2,h+1,z+1,3,1.2,2,'#96a7a2');
      cylinder('roof-vent',x-w*.25,h+1,z+2,1.2,1.5,'#a7b0a5');
      if (b.kind === 'warehouse') {
        for (let j=-w/2+2;j<w/2;j+=4) box('corrugated-rib',x+j,h/2+.5,z-d/2-.06,.15,h-1,.12,'#b9aa8c');
        box('loading-door',x,2.4,z-d/2-.12,Math.min(w-4,9),4.4,.15,'#596d71');
        for (let y=1;y<4.5;y+=.65) box('door-slats',x,y,z-d/2-.23,Math.min(w-4,9),.08,.12,'#8b9b98');
      } else {
        for (let floor=2.7;floor<h-1;floor+=3.2) for (let j=-w/2+2.5;j<w/2-1;j+=3.7) {
          box('window-frame',x+j,floor,z-d/2-.07,2.4,2.2,.16,'#d5d4ba');
          box('glass',x+j,floor,z-d/2-.17,2,1.8,.12,'#4f7e87');
          box('glass-highlight',x+j-.7,floor,z-d/2-.24,.14,1.6,.05,'#91b8bc');
          box('side-window',x+w/2+.07,floor,z+j*d/w, .15,1.8,2,'#517e87');
        }
        box('shop-door',x,1.6,z-d/2-.18,1.5,2.8,.17,'#354f59');
        if (b.kind === 'shop') for (let j=0;j<Math.floor(w/1.2);j++) box('striped-awning',x-w/2+.6+j*1.2,3.9,z-d/2-1.1,1.2,.25,2.4,j%2?'#e9dab9':'#bf7054');
      }
      if (b.label) {
        const tex = new DynamicTexture(`sign-${b.id}`, {width:1024,height:128}, scene, false);
        tex.drawText(b.label, null, 82, 'bold 57px sans-serif', '#f7e6b8', '#264b55', false, true);
        const m = new StandardMaterial(`sign-${b.id}`, scene); m.diffuseTexture=tex; m.emissiveColor.set(.12,.12,.1);m.specularColor.set(0,0,0); m.backFaceCulling=false;
        const sign = MeshBuilder.CreatePlane(`sign-${b.id}`, {width:Math.min(w-1,19),height:2},scene);
        sign.position.set(x,Math.min(h-1,5.5),z-d/2-.35);sign.rotation.z=Math.PI;sign.scaling.x=-1;sign.material=m;
      }
    }
  }
  // Trees and street furniture are drawn from authoritative rigid-prop state.
  for (const side of [-1,1]) {
    box('district-wall',side*125,1,0,1.5,2,252,'#849b8c');
    box('district-wall',0,1,side*125,252,2,1.5,'#849b8c');
  }
  const merged: Mesh[]=[];
  for (const [m,meshes] of groups) {
    const batch=Mesh.MergeMeshes(meshes,true,true,undefined,false,false);
    if (batch) { batch.name=`city-${m.name}`;batch.material=m;batch.receiveShadows=true;batch.freezeWorldMatrix();merged.push(batch); }
  }
  return merged;
}
