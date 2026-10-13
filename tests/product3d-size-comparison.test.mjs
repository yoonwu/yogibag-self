import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three/three.module.js';
import { createDefaultConfig, PRODUCT3D_PROFILES } from '../assets/product3d/config.mjs';
import { createProductModel } from '../assets/product3d/registry.mjs';
import { disposeBagModel } from '../assets/product3d/model.mjs';
import { Product3DViewer } from '../assets/product3d/viewer.mjs';
import { COMPARISON_HEIGHTS, comparisonHeight, holdingPose, createComparisonPerson, disposeComparisonPerson } from '../assets/product3d/size-comparison.mjs';

function modelFor(config) {
  const material=new THREE.MeshBasicMaterial();
  return { material, model:createProductModel(config,{body:material,inside:material,handle:material,bottom:material,seam:material,pocket:material}) };
}

test('every preset person has the selected real height, bounded geometry and a hand on the unchanged bag',()=>{
  assert.deepEqual(COMPARISON_HEIGHTS,[130,140,150,160,170,180]);
  assert.throws(()=>comparisonHeight(165));
  for(const profile of Object.values(PRODUCT3D_PROFILES)) {
    const config=createDefaultConfig(profile.id), before=JSON.stringify(config);
    const {model,material}=modelFor(config),originalBounds=new THREE.Box3().setFromObject(model);
    for(const height of COMPARISON_HEIGHTS) {
      const pose=holdingPose(height,model,config),person=createComparisonPerson(pose);
      const bounds=new THREE.Box3().setFromObject(person);
      assert.ok(Math.abs(bounds.max.y-height/100)<1e-6,`${profile.id} ${height}: crown`);
      assert.ok(Math.abs(bounds.min.y)<1e-6,`${profile.id}: feet grounded`);
      assert.ok(pose.anchor.clone().add(pose.bagPosition).distanceTo(pose.hand)<1e-10);
      assert.ok(pose.bagPosition.y+originalBounds.min.y>=.05-1e-6,`${profile.id}: bag clears floor`);
      assert.ok(pose.hand.distanceTo(pose.shoulder)<pose.height*.40,`${profile.id}: reachable hand`);
      assert.deepEqual(model.scale.toArray(),[1,1,1]);
      let triangles=0;
      person.traverse(part=>{if(part.isMesh)triangles+=(part.geometry.index?.count||0)/3;});
      assert.ok(triangles<30000);
      disposeComparisonPerson(person);
    }
    assert.equal(JSON.stringify(config),before);
    disposeBagModel(model);material.dispose();
  }
});

function viewerFor(t) {
  const config=createDefaultConfig('daily'),{model,material}=modelFor(config);
  const root=new THREE.Group(),scene=new THREE.Scene(); root.add(model);scene.add(root);
  const viewer=Object.create(Product3DViewer.prototype);
  Object.assign(viewer,{config,model,bagRoot:root,scene,
    camera:new THREE.PerspectiveCamera(38,1.2,.01,12),
    renderer:{setPixelRatio(){},setSize(){},render(){},domElement:{toDataURL(){return 'data:image/png;base64,AA==';}}},
    container:{getBoundingClientRect(){return {width:600,height:500};}},
    controls:{target:new THREE.Vector3(),update(){},enableDamping:true,enablePan:false},
    _bounds:new THREE.Box3().setFromObject(model),_activePointers:new Set(),requestRender(){},_framed:true});
  t.after(()=>{disposeComparisonPerson(viewer.comparisonPerson);disposeBagModel(model);material.dispose();});
  return viewer;
}

test('comparison keeps bag and print under one transform and fits the whole person on mobile and desktop',t=>{
  const viewer=viewerFor(t),before=JSON.stringify(viewer.config),model=viewer.model;
  const print=new THREE.Mesh(new THREE.PlaneGeometry(.1,.1),new THREE.MeshBasicMaterial());
  viewer.bagRoot.add(print);t.after(()=>{print.geometry.dispose();print.material.dispose();});
  for(const height of COMPARISON_HEIGHTS)for(const aspect of [.7,1.8]) {
    viewer.camera.aspect=aspect;viewer.setSizeComparison(true,height);
    viewer.camera.updateMatrixWorld();
    const box=new THREE.Box3().setFromObject(viewer.bagRoot).union(new THREE.Box3().setFromObject(viewer.comparisonPerson));
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]) {
      const ndc=new THREE.Vector3(x,y,z).project(viewer.camera);
      assert.ok(Math.abs(ndc.x)<=.85 && Math.abs(ndc.y)<=.85 && Math.abs(ndc.z)<1);
    }
    assert.ok(print.getWorldPosition(new THREE.Vector3()).distanceTo(viewer.bagRoot.position)<1e-8);
  }
  viewer.setSizeComparison(false);
  assert.deepEqual(viewer.bagRoot.position.toArray(),[0,0,0]);
  assert.equal(viewer.comparisonPerson,null); assert.equal(viewer.model,model);
  assert.equal(JSON.stringify(viewer.config),before);
});

test('inside detail removes the comparison without changing the chosen height or customer design',t=>{
  const viewer=viewerFor(t);viewer.config.options.innerPocket=true;
  const before=JSON.stringify(viewer.config);
  viewer.setSizeComparison(true,140);viewer.setView('inside');
  assert.deepEqual(viewer.getSizeComparison(),{enabled:false,heightCm:140});
  assert.deepEqual(viewer.bagRoot.position.toArray(),[0,0,0]);
  assert.equal(JSON.stringify(viewer.config),before);
});

test('comparison resources are all disposed once per replacement',()=>{
  const {model,material}=modelFor(createDefaultConfig());
  const person=createComparisonPerson(holdingPose(160,model,createDefaultConfig()));
  const geometry=new Set(),materials=new Set();let count=0;
  person.traverse(part=>{if(part.geometry)geometry.add(part.geometry);if(part.material)materials.add(part.material);});
  for(const resource of [...geometry,...materials])resource.addEventListener('dispose',()=>count++);
  disposeComparisonPerson(person);assert.equal(count,geometry.size+materials.size);
  disposeBagModel(model);material.dispose();
});

test('consultation captures comparison plus bag detail and restores the exact person, pose and camera',async t=>{
  const previousWindow=globalThis.window;
  globalThis.window={devicePixelRatio:1,matchMedia:()=>({matches:false})};
  t.after(()=>{if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;});
  const viewer=viewerFor(t);viewer.config.options.innerPocket=true;
  viewer.setSizeComparison(true,180);viewer.setView('back');
  const position=viewer.camera.position.clone(),target=viewer.controls.target.clone(),bagPosition=viewer.bagRoot.position.clone();
  const captures=await viewer.captureViews();
  assert.equal(captures[0].label,'키 180cm 크기 비교');
  assert.deepEqual(captures.map(c=>c.label),['키 180cm 크기 비교','입체','앞면','뒷면','안쪽']);
  assert.deepEqual(viewer.getSizeComparison(),{enabled:true,heightCm:180});
  assert.ok(viewer.bagRoot.position.distanceTo(bagPosition)<1e-9);
  assert.ok(viewer.camera.position.distanceTo(position)<1e-9);
  assert.ok(viewer.controls.target.distanceTo(target)<1e-9);
  assert.equal(viewer._view,'back');
});
