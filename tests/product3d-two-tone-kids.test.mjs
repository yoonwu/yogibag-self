import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three/three.module.js';
import {createDefaultConfig,normalizeConfig,patchConfig,serializeConfig,parseConfig,getProductProfile,
  SAMPLE_PRODUCT_ID,TWO_TONE_SMALL_PRODUCT_ID,TWO_TONE_KIDS_PRODUCT_ID} from '../assets/product3d/config.mjs';
import {buildBagModel,disposeBagModel,frontSurfaceMM} from '../assets/product3d/model.mjs';
import {isSharedProduct} from '../assets/product3d/sync.mjs';

test('renaming the two-line bags preserves the old entry IDs and saved customer designs',()=>{
  for(const [id,size] of [[SAMPLE_PRODUCT_ID,'라지'],[TWO_TONE_SMALL_PRODUCT_ID,'스몰']]){
    const original=createDefaultConfig(id);
    original.productName=`투톤 에코백 · ${size}`;
    original.body.color='#5f82a8';original.options.innerPocket=true;
    Object.assign(original.print.front,{image:'data:image/png;base64,AA==',width:73,height:49,x:14,y:-22,appearance:'embroidery'});
    const renamed=normalizeConfig(original);
    assert.equal(renamed.productId,id);assert.equal(renamed.productName,`투라인 포켓 에코백 · ${size}`);
    assert.equal(renamed.body.color,original.body.color);assert.equal(renamed.options.innerPocket,true);
    assert.deepEqual(renamed.print.front,original.print.front);
    assert.deepEqual(renamed.dimensions,original.dimensions);
  }
});

test('the true two-tone kids bag uses 33 by 33 by 8 cm, short ivory cotton handles and a separate black band',()=>{
  const c=normalizeConfig(createDefaultConfig(TWO_TONE_KIDS_PRODUCT_ID)),profile=getProductProfile(c);
  assert.equal(c.productName,'투톤 에코백 · 키즈');assert.deepEqual(c.dimensions,{width:330,height:330,depth:80});
  assert.equal(profile.referenceHandleLength,480);assert.equal(profile.handleAttachment,'mouth');
  assert.equal(profile.handleFabric,'cotton-tape');assert.equal(c.handle.drop,215);
  assert.equal(c.handle.color,c.body.color);assert.equal(c.bottomPanel.color,'#171c28');assert.equal(c.bottomPanel.height,55);
  assert.equal(c.options.pocket,false);assert.equal(patchConfig(c,'options.pocket',true).options.pocket,false);
  assert.equal(isSharedProduct(TWO_TONE_KIDS_PRODUCT_ID),false);
  assert.ok(c.assumptions.some(text=>text.includes('55mm')&&text.includes('추정')));
  assert.ok(c.printArea.width>=230,'a plain body can print across the front, not just between handle strips');
  const lowerEdge=c.printArea.y+c.dimensions.height/2-c.printArea.height/2;
  assert.ok(lowerEdge>=c.bottomPanel.height+10);
});

test('two-tone kids geometry has folded gussets and mouth-mounted handles without vertical webbing or an outer pocket',()=>{
  const c=normalizeConfig(createDefaultConfig(TWO_TONE_KIDS_PRODUCT_ID));
  const materials=Object.fromEntries(['body','bottom','handle','inside','seam','pocket'].map(key=>[key,new THREE.MeshBasicMaterial()]));
  const bag=buildBagModel(c,materials);
  try{
    assert.equal(bag.userData.metrics.foldedBottom,true);assert.equal(bag.getObjectByName('frontPocket'),undefined);
    for(const part of ['bottomFrontPanel','bottomBackPanel','bottomSideLeftPanel','bottomSideRightPanel'])assert.ok(bag.getObjectByName(part),part);
    for(const part of ['handleFrontLeft','handleFrontRight','handleBackLeft','handleBackRight']){
      const bounds=bag.getObjectByName(part).geometry.boundingBox;
      assert.ok(bounds.min.y*1000>=300,'short attachment stops inside the mouth, not at the bottom band');
      assert.ok(bounds.max.y*1000<=330.1);
    }
    assert.ok(bag.userData.metrics.triangleCount<25000);
    const before=frontSurfaceMM(0,0,c),changed=patchConfig(c,'bottomPanel.color','#b52b43');
    assert.equal(changed.body.color,c.body.color);assert.equal(changed.handle.color,c.handle.color);
    assert.deepEqual(frontSurfaceMM(0,0,changed),before,'independent band color never displaces front artwork');
    const restored=parseConfig(serializeConfig(changed));assert.deepEqual(restored,changed);
  }finally{disposeBagModel(bag);Object.values(materials).forEach(m=>m.dispose());}
});
