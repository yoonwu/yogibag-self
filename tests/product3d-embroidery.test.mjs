import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three/three.module.js';
import { createDefaultConfig, MM_TO_SCENE } from '../assets/product3d/config.mjs';
import { createEmbroideryPixels } from '../assets/product3d/embroidery.mjs';
import { planEmbroidery, STITCH_SPACING_MM, TATAMI_LENGTH_MM } from '../assets/product3d/embroidery-plan.mjs';
import { createEmbroideryThreadMesh } from '../assets/product3d/embroidery-geometry.mjs';
import { frontSurfaceMM,backSurfaceMM,innerPocketSurfaceMM } from '../assets/product3d/model.mjs';
import { createPrintMesh, disposePrintMesh, disposeEmbroideryTextures } from '../assets/product3d/print.mjs';
import { Product3DViewer } from '../assets/product3d/viewer.mjs';
import { EMBROIDERY_CREST_MM, EMBROIDERY_CONTACT_MM } from '../assets/product3d/embroidery-relief.mjs';

function solid(width, height, rgba = [80, 125, 190, 255]) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set(rgba, i);
  return pixels;
}

function pixel(data, width, x, y) {
  const start = (y * width + x) * 4;
  return Array.from(data.slice(start, start + 4));
}

function syntheticThreads() {
  return { map: new THREE.Texture(), height: new THREE.Texture() };
}

function countDisposals(resource) {
  const counter = { count: 0 };
  resource.addEventListener('dispose', () => counter.count++);
  return counter;
}

test('embroidered preview keeps transparent holes and antialiased alpha without changing uploaded pixels', () => {
  const width = 48, height = 40;
  const original = solid(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (x < 5 || x > 42 || y < 4 || y > 35 || (x > 18 && x < 28 && y > 12 && y < 28)) original[i + 3] = 0;
    else if (x === 5 || x === 42) original[i + 3] = y * 7 % 255;
  }
  const untouched = original.slice();
  const result = createEmbroideryPixels(original, width, height, { widthMm: 6, heightMm: 5 });
  assert.deepEqual(original, untouched);
  assert.notEqual(result.color, original);
  assert.notEqual(result.height, original);
  let changedOpaquePixels = 0;
  for (let i = 0; i < original.length; i += 4) {
    assert.equal(result.color[i + 3], original[i + 3], `Silhouette alpha changed at pixel ${i / 4}`);
    if (!original[i + 3]) {
      assert.deepEqual(Array.from(result.color.slice(i, i + 4)), [0, 0, 0, 0]);
      assert.deepEqual(Array.from(result.height.slice(i, i + 3)), [0, 0, 0]);
    } else if (result.color[i] !== original[i]) changedOpaquePixels++;
  }
  assert.ok(changedOpaquePixels > 500, 'Opaque artwork should acquire visible thread shading');
  assert.deepEqual(createEmbroideryPixels(original, width, height, { widthMm: 6, heightMm: 5 }), result,
    'A reversible preview must be deterministic rather than accumulating edits');
});

test('thread pitch remains physically constant across image resolutions and artwork sizes', () => {
  const low=planEmbroidery(solid(64,64),64,64,{widthMm:20,heightMm:20});
  const high=planEmbroidery(solid(192,192),192,192,{widthMm:20,heightMm:20});
  const wide=planEmbroidery(solid(192,96),192,96,{widthMm:40,heightMm:20});
  assert.deepEqual(low.stitches,high.stitches,'Resampling source pixels must not change physical stitch positions');
  assert.equal(low.spacing,STITCH_SPACING_MM);assert.equal(wide.spacing,STITCH_SPACING_MM);
  assert.ok(wide.stitches.length>low.stitches.length*1.8,'Larger broad fills need more stitches, not stretched thread texture');
  for(const stitch of [...low.stitches,...wide.stitches]) {
    assert.equal(stitch.type,'tatami');
    assert.ok(Math.hypot(stitch.b[0]-stitch.a[0],stitch.b[1]-stitch.a[1])<=TATAMI_LENGTH_MM+.001);
  }
});

test('satin crosses a straight letter stroke through both caps and turns around a hollow round letter',()=>{
  const column=planEmbroidery(solid(32,160),32,160,{widthMm:4,heightMm:20});
  const satin=column.stitches.filter(s=>s.type==='satin');
  assert.ok(satin.length>48);
  assert.equal(column.stitches.filter(s=>s.type==='tatami').length,0,'The flat caps of an I must retain the satin direction');
  assert.ok(Math.min(...satin.map(s=>s.a[1]))<.5&&Math.max(...satin.map(s=>s.a[1]))>19.5);
  for(const s of satin)assert.ok(Math.abs(s.a[1]-s.b[1])<.01,'A vertical stroke needs horizontal cross stitches');
  const ring=solid(150,150);for(let y=0;y<150;y++)for(let x=0;x<150;x++) {
    const radius=Math.hypot(x+.5-75,y+.5-75);if(radius<40||radius>60)ring[(y*150+x)*4+3]=0;
  }
  const round=planEmbroidery(ring,150,150,{widthMm:30,heightMm:30});
  const turns=round.stitches.filter(s=>s.type==='satin');assert.ok(turns.length>100);
  const radial=turns.filter(s=>{
    const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1],mx=(s.a[0]+s.b[0])/2-15,my=(s.a[1]+s.b[1])/2-15;
    return Math.abs(dx*mx+dy*my)/(Math.hypot(dx,dy)*Math.hypot(mx,my))>.85;
  });
  assert.ok(radial.length/turns.length>.9,'An O must turn the stitches around its contour instead of using a global diagonal');
  assert.ok(turns.every(s=>Math.min(Math.hypot(s.a[0]-15,s.a[1]-15),Math.hypot(s.b[0]-15,s.b[1]-15))>7.5),'Threads must not bridge the hollow centre');
});

test('real thread curves stay above all printable cloth faces and release their own geometry',()=>{
  const plan=planEmbroidery(solid(32,160),32,160,{widthMm:4,heightMm:20});
  const config=createDefaultConfig('daily');Object.assign(config.options,{doubleSided:true,innerPocket:true,innerPocketPrint:true});
  for(const side of ['front','back','innerPocket']) {
    Object.assign(config.print[side],{appearance:'embroidery',width:4,height:20,x:5,y:-35,rotation:13});
    const mesh=createEmbroideryThreadMesh(config,side,plan);assert.ok(mesh.geometry.index.count>1000);
    const positions=mesh.geometry.attributes.position,uv=mesh.geometry.attributes.uv;
    const surface={front:frontSurfaceMM,back:backSurfaceMM,innerPocket:innerPocketSurfaceMM}[side],a=13*Math.PI/180;
    for(let i=0;i<positions.count;i++) {
      const lx=(uv.getX(i)-.5)*4,ly=(uv.getY(i)-.5)*20;
      const x=5+lx*Math.cos(a)-ly*Math.sin(a),y=-35+lx*Math.sin(a)+ly*Math.cos(a),p=surface(x,y,config);
      const normal=side==='innerPocket'?new THREE.Vector3(0,0,1):new THREE.Vector3(p.normal.x,p.normal.y,p.normal.z);
      const offset=new THREE.Vector3().fromBufferAttribute(positions,i).sub(new THREE.Vector3(p.x,p.y,p.z)).dot(normal)/MM_TO_SCENE;
      assert.ok(Number.isFinite(offset)&&offset>.4&&offset<2.3,`A stitched thread must sit on the raised sewn body: ${offset} mm`);
    }
    const g=countDisposals(mesh.geometry),m=countDisposals(mesh.material);disposePrintMesh(mesh);
    assert.equal(g.count,1);assert.equal(m.count,1);
  }
});

test('the embroidered body has rounded physical thickness and real hollow contours even when individual threads are hidden',()=>{
  const rgba=solid(120,120);
  for(let y=0;y<120;y++)for(let x=0;x<120;x++) {
    const r=Math.hypot(x+.5-60,y+.5-60);if(r<25||r>51)rgba[(y*120+x)*4+3]=0;
  }
  const plan=planEmbroidery(rgba,120,120,{widthMm:30,heightMm:30});
  const config=createDefaultConfig('daily');Object.assign(config.options,{doubleSided:true,innerPocket:true,innerPocketPrint:true});
  const texture=new THREE.Texture(),resources={...syntheticThreads(),shadow:new THREE.Texture(),plan};
  resources.shadow.userData.marginMm=3;
  const shadowDisposals=countDisposals(resources.shadow);
  for(const side of ['front','back','innerPocket']) {
    Object.assign(config.print[side],{appearance:'embroidery',width:30,height:30,x:0,y:-35,rotation:17});
    const mesh=createPrintMesh(config,texture,side,resources);
    const contact=mesh.getObjectByName(`embroideryContactShadow-${side}`);
    assert.equal(contact.material.map,resources.shadow);
    const contactGeometryDisposals=countDisposals(contact.geometry),contactMaterialDisposals=countDisposals(contact.material);
    mesh.getObjectByName(`embroideryThreads-${side}`).visible=false;
    assert.equal(mesh.material.displacementMap,null,'The padded silhouette must be actual vertices, not only a shader displacement');
    const surface={front:frontSurfaceMM,back:backSurfaceMM,innerPocket:innerPocketSurfaceMM}[side];
    const p=mesh.geometry.attributes.position,u=mesh.geometry.attributes.uv,n=mesh.geometry.attributes.normal,angle=17*Math.PI/180;
    let min=Infinity,max=0,shoulders=0;
    for(let i=0;i<p.count;i++) {
      const lx=(u.getX(i)-.5)*30,ly=(u.getY(i)-.5)*30,x=lx*Math.cos(angle)-ly*Math.sin(angle),y=-35+lx*Math.sin(angle)+ly*Math.cos(angle),cloth=surface(x,y,config);
      const normal=side==='innerPocket'?new THREE.Vector3(0,0,1):new THREE.Vector3(cloth.normal.x,cloth.normal.y,cloth.normal.z);
      const z=new THREE.Vector3().fromBufferAttribute(p,i).sub(new THREE.Vector3(cloth.x,cloth.y,cloth.z)).dot(normal)/MM_TO_SCENE;
      min=Math.min(min,z);max=Math.max(max,z);
      if(new THREE.Vector3().fromBufferAttribute(n,i).dot(normal)<.8)shoulders++;
    }
    assert.ok(Math.abs(min-EMBROIDERY_CONTACT_MM)<.005,`${side} must sit against the cloth`);
    assert.ok(Math.abs(max-EMBROIDERY_CREST_MM)<.005,`${side} must retain its full sewn thickness without micro threads`);
    assert.ok(shoulders>200,`${side} needs curved edge normals, not a flat image normal`);
    const centre=surface(0,-35,config),normal=side==='innerPocket'?new THREE.Vector3(0,0,1):new THREE.Vector3(centre.normal.x,centre.normal.y,centre.normal.z);
    mesh.updateMatrixWorld(true);
    const ray=new THREE.Raycaster(new THREE.Vector3(centre.x,centre.y,centre.z).addScaledVector(normal,.008),normal.clone().negate());
    assert.equal(ray.intersectObject(mesh,false).length,0,`${side} must keep the O's hole open through the bulk geometry`);
    disposePrintMesh(mesh);
    assert.equal(contactGeometryDisposals.count,1);assert.equal(contactMaterialDisposals.count,1);
    assert.equal(shadowDisposals.count,0,'Moving/rebuilding embroidery must preserve its cached contact shadow');
  }
  texture.dispose();disposeEmbroideryTextures(resources);
  assert.equal(shadowDisposals.count,1);
});

test('subpixel threads use filtered relief, while close views reveal individual cylinders',()=>{
  const plan=planEmbroidery(solid(32,160),32,160,{widthMm:4,heightMm:20});
  const config=createDefaultConfig('daily');Object.assign(config.print.front,{appearance:'embroidery',width:4,height:20});
  const uploaded=new THREE.Texture(),textures={...syntheticThreads(),plan};
  const mesh=createPrintMesh(config,uploaded,'front',textures),threads=mesh.getObjectByName('embroideryThreads-front');
  assert.ok(threads);
  const viewer=Object.create(Product3DViewer.prototype),camera=new THREE.PerspectiveCamera(38,1.5,.001,10);
  const center=mesh.geometry.boundingSphere.center;
  Object.assign(viewer,{_size:{width:1200,height:800},camera,_printStates:{front:{mesh,embroidery:textures}}});
  camera.position.copy(center).add(new THREE.Vector3(0,0,1));camera.lookAt(center);viewer._updateEmbroideryLOD();
  assert.equal(threads.visible,false,'Subpixel cylinders must not create broad moire bars');
  camera.position.copy(center).add(new THREE.Vector3(0,0,.1));camera.lookAt(center);viewer._updateEmbroideryLOD();
  assert.equal(threads.visible,true,'Close views should expose physical thread cross-sections');
  disposePrintMesh(mesh);disposeEmbroideryTextures(textures);uploaded.dispose();
});

test('embroidery follows the same artwork coordinates, rotation and silhouette clipping on every printable side', () => {
  const config = createDefaultConfig('daily');
  Object.assign(config.options, { doubleSided: true, innerPocket: true, innerPocketPrint: true });
  const uploaded = new THREE.Texture(), threads = syntheticThreads();
  try {
    for (const side of ['front', 'back', 'innerPocket']) {
      Object.assign(config.print[side], { appearance: 'embroidery', width: 70, height: 40, x: 10, y: -15, rotation: 17 });
      const stitched = createPrintMesh(config, uploaded, side, threads);
      const flatConfig = structuredClone(config);
      flatConfig.print[side].appearance = 'print';
      const printed = createPrintMesh(flatConfig, uploaded, side);
      assert.ok(stitched.geometry.index.count > 0);
      assert.deepEqual(stitched.geometry.index.array, printed.geometry.index.array);
      assert.deepEqual(stitched.geometry.attributes.uv.array, printed.geometry.attributes.uv.array);
      const sewnPosition = stitched.geometry.attributes.position;
      const inkPosition = printed.geometry.attributes.position;
      const normals = stitched.geometry.attributes.normal;
      for (let i = 0; i < sewnPosition.count; i++) {
        const delta = new THREE.Vector3().fromBufferAttribute(sewnPosition, i)
          .sub(new THREE.Vector3().fromBufferAttribute(inkPosition, i));
        assert.ok(Math.abs(delta.length() / MM_TO_SCENE - 0.2) < 0.001,
          'Only the additional thread relief should offset the original artwork coordinates');
        if (normals.getZ(i)) assert.ok(delta.dot(new THREE.Vector3().fromBufferAttribute(normals, i)) > 0,
          `${side} thread relief must project toward the visible face`);
      }
      assert.equal(stitched.material.map, threads.map);
      assert.equal(stitched.material.bumpMap, threads.height);
      assert.equal(stitched.material.displacementMap, threads.height);
      assert.ok(stitched.material.isMeshPhysicalMaterial);
      assert.equal(printed.material.map, uploaded);
      disposePrintMesh(stitched);
      disposePrintMesh(printed);
    }
  } finally {
    uploaded.dispose();
    disposeEmbroideryTextures(threads);
  }
});

test('moving embroidery reuses its thread maps, returning to print releases only derived resources', () => {
  const config = createDefaultConfig('daily');
  Object.assign(config.print.front, { image: 'data:image/png;base64,artwork', appearance: 'embroidery' });
  const uploaded = new THREE.Texture(), threads = syntheticThreads();
  const uploadedDisposals = countDisposals(uploaded);
  const colorDisposals = countDisposals(threads.map), heightDisposals = countDisposals(threads.height);
  const viewer = Object.create(Product3DViewer.prototype);
  Object.assign(viewer, { scene: new THREE.Scene(), config, disposed: false, requestRender() {} });
  viewer._ensurePrintStates();
  Object.assign(viewer._printStates.front, {
    source: config.print.front.image, texture: uploaded, embroidery: threads,
    embroiderySource: uploaded, embroideryKey: `${config.print.front.width}:${config.print.front.height}`,
  });
  try {
    viewer._updatePrint('front');
    const first = viewer.printMesh;
    const geometryDisposals = countDisposals(first.geometry), materialDisposals = countDisposals(first.material);
    config.print.front.x = 40;
    config.print.front.rotation = 30;
    viewer._updatePrint('front');
    assert.notEqual(viewer.printMesh, first);
    assert.equal(viewer.printMesh.material.map, threads.map);
    assert.equal(geometryDisposals.count, 1);
    assert.equal(materialDisposals.count, 1);
    assert.equal(colorDisposals.count, 0);
    assert.equal(heightDisposals.count, 0);
    assert.equal(uploadedDisposals.count, 0);
    config.print.front.appearance = 'print';
    viewer._updatePrint('front');
    assert.equal(viewer.printMesh.material.map, uploaded);
    assert.equal(viewer._printStates.front.embroidery, null);
    assert.equal(colorDisposals.count, 1);
    assert.equal(heightDisposals.count, 1);
    assert.equal(uploadedDisposals.count, 0);
    viewer.dispose();
    assert.equal(uploadedDisposals.count, 1);
    assert.equal(colorDisposals.count, 1);
    assert.equal(heightDisposals.count, 1);
  } finally {
    if (!viewer.disposed) viewer.dispose();
  }
});
