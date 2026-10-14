import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../assets/vendor/three/three.module.js';
import {SUPPLIED_PHOTOS} from '../assets/product3d/custom-totes-2d.mjs';
import {createDefaultConfig,normalizeConfig,patchConfig,getProductProfile,getConsultationSpecs} from '../assets/product3d/config.mjs';
import {buildBagModel,disposeBagModel} from '../assets/product3d/model.mjs';

test('supplied photo parts retain matching pixel frames and real alpha for each product',async()=>{
  for(const files of Object.values(SUPPLIED_PHOTOS)){
    let frame;
    for(const name of Object.values(files)){
      const bytes=await readFile(new URL(`../assets/product3d/supplied/${name}.png`,import.meta.url));
      assert.equal(bytes.subarray(1,4).toString(),'PNG');
      assert.equal(bytes[25],6,'RGBA cutout, with transparency');
      const size=[bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
      if(frame)assert.deepEqual(size,frame);else frame=size;
    }
  }
});

test('new styles keep editable art and independent color policy while recording estimated sizing in consultation',()=>{
  for(const id of ['topline-tote','two-tone-square']){
    let c=createDefaultConfig(id);
    c.print.front.image='data:image/png;base64,AA==';c.print.front.width=81.2;c.print.front.rotation=17;
    const art=structuredClone(c.print.front);
    c=patchConfig(c,'handle.color','#123456');c=patchConfig(c,'bottomPanel.color','#abcdef');
    assert.deepEqual(c.print.front,art);
    assert.equal(c.bottomPanel.color,'#abcdef');
    assert.equal(c.handle.color,id==='topline-tote'?'#abcdef':'#123456');
    assert.equal(getProductProfile(c).consultationMode,'kakao');
    assert.match(getConsultationSpecs(c).find(x=>x.label==='규격 확인').value,/추정/);
    assert.equal(c.options.pocket,false);
  }
});

test('topline upper trim stays at the mouth and its print guide remains on plain cotton after resizing',()=>{
  for(const trimHeight of [20,40,80]){
    const c=patchConfig(createDefaultConfig('topline-tote'),'bottomPanel.height',trimHeight);
    const materials=Object.fromEntries(['body','bottom','handle','inside','seam','pocket'].map(k=>[k,new THREE.MeshBasicMaterial()]));
    const bag=buildBagModel(c,materials);
    try{
      const band=bag.getObjectByName('bottomFrontPanel').geometry.boundingBox,body=bag.getObjectByName('bodyFront').geometry.boundingBox;
      assert.ok(Math.abs(band.min.y*1000-(c.dimensions.height-trimHeight))<.01);
      assert.ok(Math.abs(band.max.y*1000-c.dimensions.height)<.01);
      assert.ok(Math.abs(body.max.y-band.min.y)<1e-7);
      assert.equal(bag.getObjectByName('bottom').material,materials.body);
      assert.ok(c.printArea.y+c.printArea.height/2<c.dimensions.height/2-trimHeight);
    }finally{disposeBagModel(bag);Object.values(materials).forEach(m=>m.dispose());}
  }
});

test('square side binding follows each cloth face and uses the chosen bottom trim material',()=>{
  const c=normalizeConfig(createDefaultConfig('two-tone-square'));
  const materials=Object.fromEntries(['body','bottom','handle','inside','seam','pocket'].map(k=>[k,new THREE.MeshBasicMaterial()]));
  const bag=buildBagModel(c,materials);
  try{
    for(const side of ['Front','Back'])for(const edge of ['Left','Right']){
      const mesh=bag.getObjectByName(`edgeBinding${side}${edge}`);
      assert.ok(mesh);assert.equal(mesh.material,materials.bottom);
      assert.ok(mesh.geometry.attributes.position.array.every(Number.isFinite));
      assert.ok(mesh.geometry.boundingBox.max.y*1000>c.dimensions.height-.01);
    }
  }finally{disposeBagModel(bag);Object.values(materials).forEach(m=>m.dispose());}
});
