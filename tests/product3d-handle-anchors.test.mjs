import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three/three.module.js';
import { createDailyConfig, normalizeConfig, MM_TO_SCENE } from '../assets/product3d/config.mjs';
import { buildBagModel, disposeBagModel } from '../assets/product3d/model.mjs';
import { ribbonSelfIntersections, ribbonRings, ribbonCenter } from './helpers/ribbon-safety.mjs';

function model(config) {
  const materials = Object.fromEntries(['body', 'bottom', 'handle', 'inside', 'seam', 'pocket']
    .map(key => [key, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })]));
  const bag = buildBagModel(config, materials);
  bag.updateMatrixWorld(true);
  return { bag, dispose() { disposeBagModel(bag); Object.values(materials).forEach(material => material.dispose()); } };
}

function ringCorners(geometry, ring) {
  const p = geometry.getAttribute('position');
  return [0, 1, 3, 5].map(offset => new THREE.Vector3().fromBufferAttribute(p, ring * 8 + offset))
    .sort((a, b) => a.x - b.x || a.z - b.z || a.y - b.y);
}

const cases = [
  {},
  { dimensions: { width: 320, height: 250, depth: 120 } },
  { dimensions: { width: 450, height: 350, depth: 150 } },
  { dimensions: { width: 250, height: 300, depth: 80 } },
  ...[{ width: 200, height: 150, depth: 30 }, { width: 600, height: 600, depth: 300 },
    { width: 200, height: 150, depth: 300 }].map(dimensions => ({ dimensions,
    handle: { width: 70, thickness: 5, gap: 450, drop: 80 } })),
  {dimensions:{width:200,height:150,depth:30},handle:{width:10,thickness:.5,gap:60,drop:80}},
  {dimensions:{width:600,height:600,depth:300},handle:{width:70,thickness:5,gap:450,drop:450}},
  {dimensions:{width:600,height:150,depth:30},handle:{width:70,thickness:5,gap:450,drop:80}},
  {dimensions:{width:600,height:600,depth:30},handle:{width:10,thickness:.5,gap:450,drop:450}},
  {dimensions:{width:200,height:600,depth:300},handle:{width:10,thickness:5,gap:60,drop:450}},
];

test('every daily attachment edge is inside the actual lining, including wide straps at maximum gap', () => {
  for (const changes of cases) {
    const base = createDailyConfig(), config = normalizeConfig({ ...base, ...changes,
      handle: { ...base.handle, ...changes.handle } }), state = model(config);
    const lining = ['liningFront', 'liningBack', 'liningLeft', 'liningRight'].map(name => state.bag.getObjectByName(name));
    for (const side of ['Front', 'Back']) for (const position of ['Left', 'Right']) {
      const sign = side === 'Front' ? 1 : -1;
      const p = state.bag.getObjectByName(`handle${side}${position}`).geometry.getAttribute('position');
      for (let ring = 0; ring < 25; ring++) for (const edge of [0, 1, 3, 5]) {
        const point = new THREE.Vector3().fromBufferAttribute(p, ring * 8 + edge);
        const ray = new THREE.Raycaster(point, new THREE.Vector3(0, 0, sign));
        const hit = ray.intersectObjects(lining)[0];
        assert.ok(hit, `attachment edge stays inside lining: ${JSON.stringify(config.dimensions)} ${side}${position} ring ${ring} edge ${edge} at ${point.toArray()}`);
        assert.ok(hit.face.normal.z * sign < 0, 'outward ray leaves the interior instead of entering from the outside');
        assert.ok(hit.distance > 0.2 * MM_TO_SCENE, 'the whole strap thickness has clearance from lining');
      }
    }
    state.dispose();
  }
});

test('daily inside attachments meet both loop roots exactly and preserve the full handle drop', () => {
  for (const changes of cases) {
    const base = createDailyConfig(), config = normalizeConfig({ ...base, ...changes,
      handle: { ...base.handle, ...changes.handle } }), state = model(config);
    for (const side of ['Front', 'Back']) {
      const loop = state.bag.getObjectByName(`handlesLoop${side}`).geometry;
      const lastRing = (loop.getAttribute('position').count - 8) / 8 - 1;
      for (const [position, loopRing] of [['Left', 0], ['Right', lastRing]]) {
        const leg = state.bag.getObjectByName(`handle${side}${position}`).geometry;
        const attached = ringCorners(leg, 24), root = ringCorners(loop, loopRing);
        for (let i = 0; i < attached.length; i++) {
          assert.ok(attached[i].distanceTo(root[i]) < 1e-7, 'all four ribbon corners join without a gap or twist');
          assert.ok(Math.abs(root[i].y / MM_TO_SCENE - config.dimensions.height) < 0.0001);
        }
      }
      assert.ok(Math.abs(loop.boundingBox.max.y / MM_TO_SCENE
        - config.dimensions.height - config.handle.drop) < 0.25, 'inside placement preserves handle drop');
    }
    state.dispose();
  }
});

function ringCenter(geometry,ring){
  const p=geometry.getAttribute('position');
  return new THREE.Vector3().fromBufferAttribute(p,ring*8)
    .add(new THREE.Vector3().fromBufferAttribute(p,ring*8+4)).multiplyScalar(.5);
}
test('daily cloth turns from unequal broad legs into a narrow folded tent crown',()=>{
  const config=createDailyConfig(),state=model(config),g=state.bag.getObjectByName('handlesLoopFront').geometry;
  const leftCentres=Array.from({length:ribbonRings(g)},(_,i)=>ringCenter(g,i)).filter(p=>p.x<0);
  const atHeight=f=>leftCentres.reduce((best,p)=>Math.abs(p.y-(config.dimensions.height+config.handle.drop*f)*MM_TO_SCENE)
    <Math.abs(best.y-(config.dimensions.height+config.handle.drop*f)*MM_TO_SCENE)?p:best);
  const a=atHeight(.08),b=atHeight(.9);
  assert.ok((b.y-a.y)/MM_TO_SCENE>config.handle.drop*.75,'most of the reference pose climbs along long sloping cloth legs');
  assert.ok(b.x>a.x,'both upper legs converge toward the centre');
  for(let ring=0;ring<ribbonRings(g);ring++){
    const p=ringCenter(g,ring),height=p.y/MM_TO_SCENE-config.dimensions.height;
    if(height>=config.handle.drop*.95)assert.ok(Math.abs(p.x/MM_TO_SCENE)<config.handle.gap*.1,'the photographic upper fold is much narrower than the anchor spacing');
  }
  const p=g.attributes.position,rings=ribbonRings(g),nearest=(height,left)=>{
    let best=0,error=Infinity;
    for(let i=0;i<rings;i++){
      const c=ribbonCenter(g,i);
      if(left!==undefined&&(c.x<0)!==left)continue;
      const distance=Math.abs(c.y/MM_TO_SCENE-config.dimensions.height-height);
      if(distance<error){best=i;error=distance;}
    }
    return best;
  };
  const widthVector=i=>new THREE.Vector3().fromBufferAttribute(p,i*8+1).sub(new THREE.Vector3().fromBufferAttribute(p,i*8));
  const crown=widthVector(nearest(config.handle.drop));
  assert.ok(Math.hypot(crown.x,crown.y)<config.handle.width*MM_TO_SCENE*.08,'crown is turned edge-on instead of making a wide rigid cap');
  assert.ok(Math.abs(crown.z)>config.handle.width*MM_TO_SCENE*.98,'the full cloth width turns into depth');
  const left=widthVector(nearest(config.handle.drop*.5,true)),right=widthVector(nearest(config.handle.drop*.5,false));
  assert.ok(Math.hypot(right.x,right.y)>Math.hypot(left.x,left.y)*1.1,'photographic left and right legs have different projected face widths');
  assert.ok(b.x-a.x>config.handle.gap*.3*MM_TO_SCENE,'the photographic sides converge over most of the drop');
  state.dispose();
});

test('tent ribbons preserve width/thickness without intersecting themselves or the opposite handle across limits',()=>{
  for(const changes of cases){
    const base=createDailyConfig(),config=normalizeConfig({...base,...changes,handle:{...base.handle,...changes.handle}}),state=model(config);
    const lining=['liningFront','liningBack','liningLeft','liningRight'].map(name=>state.bag.getObjectByName(name));
    for(const side of ['Front','Back']){
      const sign=side==='Front'?1:-1,g=state.bag.getObjectByName(`handlesLoop${side}`).geometry,p=g.getAttribute('position');
      for(const key of ['position','normal','uv'])assert.ok(g.getAttribute(key).array.every(Number.isFinite));
      assert.ok(Math.abs(g.boundingBox.max.y/MM_TO_SCENE-config.dimensions.height-config.handle.drop)<.0002);
      assert.ok(side==='Front'?g.boundingBox.min.z>0:g.boundingBox.max.z<0,'front and rear handles stay separated in depth');
      const uv=g.attributes.uv,rings=ribbonRings(g);let length=0;
      for(let ring=0;ring<rings;ring++){
        const corners=ringCorners(g,ring);
        const a=new THREE.Vector3().fromBufferAttribute(p,ring*8),b=new THREE.Vector3().fromBufferAttribute(p,ring*8+1),c=new THREE.Vector3().fromBufferAttribute(p,ring*8+3);
        assert.ok(Math.abs(a.distanceTo(b)/MM_TO_SCENE-config.handle.width)<.0005);
        assert.ok(Math.abs(b.distanceTo(c)/MM_TO_SCENE-config.handle.thickness)<.0005);
        assert.ok(Math.abs(b.clone().sub(a).normalize().dot(c.clone().sub(b).normalize()))<1e-4,'width and thickness form an orthogonal cloth frame');
        if(ring)length+=ribbonCenter(g,ring).distanceTo(ribbonCenter(g,ring-1));
        assert.ok(Math.abs(uv.getX(ring*8))<1e-8&&Math.abs(uv.getX(ring*8+1)-config.handle.width*MM_TO_SCENE)<1e-8,'across-width UV spans the complete physical tape width');
        assert.ok(Math.abs(uv.getY(ring*8)-length)<1e-7,'lengthwise weave UV follows actual cumulative ribbon length');
        for(const point of corners)if(point.y<config.dimensions.height*MM_TO_SCENE-1e-7){
          const hit=new THREE.Raycaster(point,new THREE.Vector3(0,0,sign)).intersectObjects(lining)[0];
          assert.ok(hit&&hit.face.normal.z*sign<0,'any part of the rounded start below the mouth remains inside lining');
        }
      }
      assert.deepEqual(ribbonSelfIntersections(g),[],`${JSON.stringify(config.dimensions)} ${JSON.stringify(config.handle)} ${side}: actual 3D cloth shell never passes through itself`);
    }
    state.dispose();
  }
});
