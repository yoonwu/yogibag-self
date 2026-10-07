import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three/three.module.js';
import {PRODUCT3D_PROFILES,createDefaultConfig,MM_TO_SCENE} from '../assets/product3d/config.mjs';
import {buildBagModel,disposeBagModel} from '../assets/product3d/model.mjs';

test('cotton totes have straight double mouth seams 30mm apart on front, back and both gussets',()=>{
  const material=new THREE.MeshBasicMaterial();
  try {
    for(const [id,profile] of Object.entries(PRODUCT3D_PROFILES)){
      const config=createDefaultConfig(id),bag=buildBagModel(config,{body:material});
      try {
        const cotton=profile.supportsHandles&&!['poly','pouch'].includes(profile.category);
        const rim=bag.getObjectByName('openTopRim').geometry.boundingBox;
        if(cotton){
          assert.ok((rim.max.y-rim.min.y)/MM_TO_SCENE<.01,id);
          for(const side of ['Front','Back','Left','Right']){
            const upper=bag.getObjectByName(`mouth${side}Stitches`).geometry.boundingBox;
            const lower=bag.getObjectByName(`mouthHem${side}Stitches`).geometry.boundingBox;
            const centre=b=>(b.min.y+b.max.y)/2/MM_TO_SCENE;
            assert.ok(Math.abs(centre(upper)-(config.dimensions.height-5))<.001,`${id}/${side} upper`);
            assert.ok(Math.abs(centre(upper)-centre(lower)-30)<.001,`${id}/${side} 3cm gap`);
            assert.ok((upper.max.y-upper.min.y)/MM_TO_SCENE<.81,`${id}/${side} has no height waves`);
            assert.ok((lower.max.y-lower.min.y)/MM_TO_SCENE<.81,`${id}/${side} lower seam stays straight`);
          }
          assert.ok(bag.userData.metrics.triangleCount<25000,id);
        }else assert.equal(bag.getObjectByName('mouthHemFrontStitches'),undefined,id);
      }finally{disposeBagModel(bag);}
    }
  }finally{material.dispose();}
});
