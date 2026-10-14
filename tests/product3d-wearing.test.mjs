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
      const before=JSON.stringify(c);let pose;
      try {pose=wearingPose(height,bag,c,'shoulder');}
      catch(error){assert.match(error.message,/손잡이.*짧아요/);continue;}
      distance(pose.anchor.clone().applyQuaternion(pose.bagRotation).add(pose.bagPosition),pose.shoulderContact);
      applyWearingDrape(bag,c,pose);
      assert.equal(bag.getObjectByName('bodyFront').geometry,originals.get(bag.getObjectByName('bodyFront')));
      assert.notEqual(bag.getObjectByName('handlesLoopFront').geometry,originals.get(bag.getObjectByName('handlesLoopFront')));
      assert.ok(pose.bagPosition.y+c.dimensions.height/1000<pose.height*.745,'mouth clears the armpit');
      for(const name of ['handlesLoopFront','handlesLoopBack']) {
        const centerline=geometry=>{
          const p=geometry.getAttribute('position'),n=(p.count-8)/8,points=[];
          for(let i=0;i<n;i++){const q=new THREE.Vector3();for(let j=0;j<8;j++)q.add(new THREE.Vector3().fromBufferAttribute(p,i*8+j));points.push(q.divideScalar(8));}
          return points;
        };
        const old=centerline(originals.get(bag.getObjectByName(name))),next=centerline(bag.getObjectByName(name).geometry);
        const pathLength=points=>points.slice(1).reduce((total,p,i)=>total+p.distanceTo(points[i]),0);
        assert.ok(Math.abs(pathLength(old)-pathLength(next))<.002,'wearing preserves actual tape length');
        distance(old[0],next[0]);distance(old.at(-1),next.at(-1));
        const source=originals.get(bag.getObjectByName(name)).getAttribute('position'),worn=bag.getObjectByName(name).geometry.getAttribute('position');
        for(let i=0;i<old.length;i++) {
          const width=p=>new THREE.Vector3().fromBufferAttribute(p,i*8).distanceTo(new THREE.Vector3().fromBufferAttribute(p,i*8+1));
          assert.ok(Math.abs(width(source)-width(worn))<1e-6,'tape width does not stretch');
        }
      }
      restoreWearingDrape(bag);
      for(const [part,geometry]of originals)assert.equal(part.geometry,geometry);
      assert.equal(JSON.stringify(c),before);assert.deepEqual(bag.scale.toArray(),[1,1,1]);
    }
    disposeBagModel(bag);material.dispose();
  }
});

test('short tote handles cannot put the bag on the upper arm or stretch to fit a shoulder',()=>{
  for(const id of ['topline-tote','two-tone-square','small','poly_h','poly_v']) {
    const c=createDefaultConfig(id),{bag,material}=modelFor(c),before=JSON.stringify(c);
    assert.throws(()=>wearingPose(160,bag,c,'shoulder'),/손잡이.*짧아요/);
    assert.equal(JSON.stringify(c),before);
    c.handle.drop=350;
    const longer=modelFor(c);
    assert.equal(wearingPose(160,longer.bag,c,'shoulder').carryMode,'shoulder','longer customer handles can be worn');
    disposeBagModel(longer.bag);longer.material.dispose();
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
