import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../assets/vendor/three/three.module.js';
import {createDefaultConfig, patchConfig, normalizeConfig, getConsultationSpecs, getProductProfile, isPrintSideActive} from '../assets/product3d/config.mjs';
import {configFrom2D, snapshotFrom3D} from '../assets/product3d/sync.mjs';
import {createProductModel} from '../assets/product3d/registry.mjs';
import {disposeBagModel, backSurfaceMM, printSurfaceMM} from '../assets/product3d/model.mjs';
import {createPrintMesh,disposePrintMesh} from '../assets/product3d/print.mjs';

const front='data:image/png;base64,AA==',back='data:image/png;base64,AQ==';
for(const id of ['sample-two-line-large','sample-two-line-small']) {
  test(`${id}: front/back pocket originals stay independent across option toggles and repeated view switches`,()=>{
    let c=createDefaultConfig(id);
    c.print.front.image=front;c.print.front.imageName='front.png';
    c.print.back.image=back;c.print.back.imageName='back.png';
    c=patchConfig(c,'options.backPocketPrint',true);
    assert.equal(c.options.backPocket,true);
    for(let i=0;i<6;i++) {
      const snapshot=snapshotFrom3D(c,{productId:id,currentSide:'back'});
      assert.equal(snapshot.currentSide,'back');assert.equal(snapshot.twoSided,true);
      assert.ok(snapshot.options.includes('뒷면 주머니 인쇄'));
      assert.ok(snapshot.options.includes('앞주머니 인쇄'));
      c=configFrom2D(snapshot,c);
      assert.equal(c.print.front.image,front);assert.equal(c.print.back.image,back);
      assert.equal(c.options.backPocket,true);assert.equal(c.options.backPocketPrint,true);
    }
    const disabled=patchConfig(c,'options.backPocket',false);
    assert.equal(disabled.options.backPocketPrint,false);
    assert.equal(disabled.print.back.image,back);
    assert.equal(isPrintSideActive(disabled,'back'),false);
    const restored=patchConfig(disabled,'options.backPocketPrint',true);
    assert.equal(restored.print.back.image,back);
    assert.ok(getConsultationSpecs(restored).find(row=>row.label==='뒷면 주머니 인쇄'));
    assert.equal(isPrintSideActive(patchConfig(restored,'options.frontPocketPrint',false),'front'),false);
    assert.equal(restored.print.front.image,front);
  });
  test(`${id}: back pocket and print sit on the outward rear surface with pocket-edge clipping`,()=>{
    const c=patchConfig(createDefaultConfig(id),'options.backPocketPrint',true);
    c.print.back={...c.print.back,image:back,width:60,height:40,y:c.pocket.bottom+c.pocket.height/2-c.dimensions.height/2};
    const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
    const materials={body:material,bottom:material,handle:material,inside:material,seam:material,pocket:material};
    const model=createProductModel(c,materials),texture=new THREE.Texture(),print=createPrintMesh(c,texture,'back');
    assert.ok(model.getObjectByName('frontPocket'));
    assert.ok(model.getObjectByName('backPocket'));
    assert.ok(print.geometry.index.count>0);
    const p=backSurfaceMM(0,c.print.back.y,c),bare=backSurfaceMM(0,c.print.back.y,{...c,options:{...c.options,backPocket:false}});
    assert.ok(p.z<bare.z-.001);
    assert.equal(printSurfaceMM(c.pocket.width/2+1,c.print.back.y,c,'back').visible,false);
    for(const index of print.geometry.index.array)assert.ok(print.geometry.attributes.normal.getZ(index)<0);
    disposePrintMesh(print);texture.dispose();disposeBagModel(model);material.dispose();
  });
}

test('ordinary products reject outer pocket options and keep their original body print policy',()=>{
  for(const id of ['daily','two-tone-kids','minja','poly_v']){
    const c=normalizeConfig({...createDefaultConfig(id),options:{frontPocketPrint:true,backPocket:true,backPocketPrint:true}});
    for(const key of ['frontPocketPrint','backPocket','backPocketPrint'])assert.equal(c.options[key],false);
    assert.equal(isPrintSideActive(c,'front'),true);
    assert.equal(getProductProfile(c).supportsPocket,false);
  }
});

test('actual 2D pocket toggles retain dormant back artwork, enforce dependencies and leave front artwork untouched',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const a=html.indexOf('function isPocket2DBag()'),b=html.indexOf('function getCustom2DParts()',a);
  const frontObject={id:'front',isUserObject:true,set(key,value){this[key]=value;}};
  const backObject={id:'back',isUserObject:true,set(key,value){this[key]=value;}};
  let objects=[frontObject];
  const c={currentBag:{id:'sample-two-line-small'},currentSide:'front',twoSided:false,
    activeOptions:new Set(['앞주머니','앞주머니 인쇄']),sideTabs:{style:{}},
    sideDesigns:{front:[frontObject],back:[backObject]},
    canvas:{getObjects:()=>objects,requestRenderAll(){}},isInnerPocketObj:()=>false,
    drawBag(){},updateOptionsForBag(){},updateSideTabUI(){},saveState(){},
    switchSide(side){c.sideDesigns[c.currentSide]=objects;c.currentSide=side;objects=c.sideDesigns[side];},
  };
  vm.createContext(c);vm.runInContext(html.slice(a,b),c);
  vm.runInContext("setPocket2DOption('뒷면 주머니 인쇄',true)",c);
  assert.equal(c.twoSided,true);assert.ok(c.activeOptions.has('뒷면 주머니(양면)'));
  c.switchSide('back');vm.runInContext("setPocket2DOption('뒷면 주머니 인쇄',false)",c);
  assert.equal(backObject.visible,false);assert.equal(frontObject.visible,true);
  vm.runInContext("setPocket2DOption('뒷면 주머니 인쇄',true)",c);
  assert.equal(backObject.visible,true);
  vm.runInContext("setPocket2DOption('뒷면 주머니(양면)',false)",c);
  assert.equal(c.currentSide,'front');assert.equal(c.twoSided,false);
  assert.equal(c.sideDesigns.back[0],backObject);
  assert.equal(c.activeOptions.has('뒷면 주머니 인쇄'),false);
  assert.equal(c.activeOptions.has('앞주머니 인쇄'),true);
});
