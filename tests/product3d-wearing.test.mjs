import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three/three.module.js';
import { createDefaultConfig, normalizeConfig, PRODUCT3D_PROFILES } from '../assets/product3d/config.mjs';
import { createProductModel } from '../assets/product3d/registry.mjs';
import { disposeBagModel } from '../assets/product3d/model.mjs';
import { holdingPose,createComparisonPerson,disposeComparisonPerson } from '../assets/product3d/size-comparison.mjs';
import { availableCarryModes,wearingPose,applyWearingDrape,restoreWearingDrape,wornCrossPath } from '../assets/product3d/wearing.mjs';

function modelFor(c){const material=new THREE.MeshBasicMaterial();return {material,bag:createProductModel(c,Object.fromEntries(['body','handle','inside','bottom','pocket','seam'].map(k=>[k,material])))};}
const distance=(a,b)=>assert.ok(a.distanceTo(b)<1e-8);

test('smooth arms are continuous tapered surfaces with a forwards-bending wrist, without elbow balls',()=>{
  for(const height of [130,165,180]){
    const c=createDefaultConfig(),{bag,material}=modelFor(c),pose=holdingPose(height,bag,c),person=createComparisonPerson(pose);
    assert.ok(pose.elbow.z<pose.hand.z);
    assert.equal(person.getObjectByName('comparisonElbowRight'),undefined);
    for(const side of ['Right','Left']){
      const arm=person.getObjectByName(`comparisonArm${side}`),positions=arm.geometry.getAttribute('position'),normals=arm.geometry.getAttribute('normal');
      assert.ok(arm && arm.geometry.index.count>3000);
      for(const data of [positions.array,normals.array])assert.ok([...data].every(Number.isFinite));
      for(let i=1;i<36;i++) {
        const a=new THREE.Vector3().fromBufferAttribute(normals,i*16),b=new THREE.Vector3().fromBufferAttribute(normals,(i+1)*16);
        assert.ok(a.dot(b)>.70,`${side} successive arm rings ${i}: ${a.dot(b)}`);
      }
    }
    disposeComparisonPerson(person);disposeBagModel(bag);material.dispose();
  }
});

test('shoulder contact, bag dimensions and reversible handles remain correct for all handle bags and heights',()=>{
  for(const profile of Object.values(PRODUCT3D_PROFILES)) {
    const c=createDefaultConfig(profile.id),{bag,material}=modelFor(c),originals=new Map();
    bag.traverse(part=>{if(part.isMesh)originals.set(part,part.geometry);});
    if(availableCarryModes(bag).includes('shoulder'))for(const height of [130,165,180]) {
      const before=JSON.stringify(c),pose=wearingPose(height,bag,c,'shoulder');
      distance(pose.anchor.clone().applyQuaternion(pose.bagRotation).add(pose.bagPosition),pose.shoulderContact);
      applyWearingDrape(bag,c,pose);
      assert.equal(bag.getObjectByName('bodyFront').geometry,originals.get(bag.getObjectByName('bodyFront')));
      assert.notEqual(bag.getObjectByName('handlesLoopFront').geometry,originals.get(bag.getObjectByName('handlesLoopFront')));
      restoreWearingDrape(bag);
      for(const [part,geometry]of originals)assert.equal(part.geometry,geometry);
      assert.equal(JSON.stringify(c),before);assert.deepEqual(bag.scale.toArray(),[1,1,1]);
    }
    disposeBagModel(bag);material.dispose();
  }
});

test('cross strap shoulder route preserves actual strap length, fittings, print surfaces and originals',()=>{
  for(const id of ['daily','sample-two-line-large','sample-two-line-small','poly_v'])for(const height of [130,165,180]){
    const c=normalizeConfig({...createDefaultConfig(id),options:{crossStrap:true}}),before=JSON.stringify(c),{bag,material}=modelFor(c);
    assert.ok(availableCarryModes(bag).includes('cross'));
    const strap=bag.getObjectByName('crossStrap'),original=strap.geometry,body=bag.getObjectByName('bodyFront').geometry;
    const leftRing=bag.getObjectByName('crossStrapLeftRing').geometry;
    const pose=wearingPose(height,bag,c,'cross');
    assert.ok(Math.abs(pose.route.lengthMm-c.crossStrap.length)<1,'actual webbing length stays fixed');
    distance(pose.anchor.clone().applyQuaternion(pose.bagRotation).add(pose.bagPosition),pose.shoulderContact);
    applyWearingDrape(bag,c,pose);
    assert.notEqual(strap.geometry,original);assert.equal(bag.getObjectByName('bodyFront').geometry,body);
    assert.equal(bag.getObjectByName('crossStrapLeftRing').geometry,leftRing);
    assert.deepEqual([...strap.geometry.getAttribute('uv').array],[...original.getAttribute('uv').array]);
    assert.ok([...strap.geometry.getAttribute('position').array].every(Number.isFinite));
    restoreWearingDrape(bag);assert.equal(strap.geometry,original);
    assert.equal(JSON.stringify(c),before);disposeBagModel(bag);material.dispose();
  }
});

test('too-short cross straps explain the fit constraint rather than stretching the strap',()=>{
  const c=normalizeConfig({...createDefaultConfig(),options:{crossStrap:true},crossStrap:{length:500}}),{bag,material}=modelFor(c);
  assert.throws(()=>wornCrossPath(bag.getObjectByName('crossStrap'),c,1.8),/길이/);
  disposeBagModel(bag);material.dispose();
});
