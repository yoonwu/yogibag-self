import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createDefaultConfig,normalizeConfig,patchConfig,serializeConfig,parseConfig,
  getConsultationSpecs,SAMPLE_PRODUCT_ID,TWO_TONE_SMALL_PRODUCT_ID} from '../assets/product3d/config.mjs';
import {isSharedProduct} from '../assets/product3d/sync.mjs';
import {buildBagModel,disposeBagModel} from '../assets/product3d/model.mjs';
import * as THREE from '../assets/vendor/three/three.module.js';

test('two-tone small uses the provided body, bottom, handle and print-guide dimensions',()=>{
  const c=normalizeConfig(createDefaultConfig(TWO_TONE_SMALL_PRODUCT_ID));
  assert.deepEqual(c.dimensions,{width:340,height:240,depth:100});
  assert.equal(c.bottomPanel.height,60);assert.equal(c.handle.drop,190);
  assert.equal(c.handle.color,c.bottomPanel.color);assert.equal(c.options.pocket,true);
  assert.deepEqual(c.printArea,{width:120,height:120,x:0,y:0});
  assert.ok(c.pocket.width>120&&c.pocket.height>120);
  assert.equal(isSharedProduct(TWO_TONE_SMALL_PRODUCT_ID),false);
  const specs=getConsultationSpecs(c);
  assert.ok(specs.some(spec=>spec.value.includes('340 × 240 × 100')));
  assert.ok(specs.some(spec=>spec.value.includes('사진 비율로 추정')));
});

test('small guide follows custom seams without resizing or losing the original print and embroidery choice',()=>{
  let c=createDefaultConfig(TWO_TONE_SMALL_PRODUCT_ID);
  Object.assign(c.print.front,{image:'data:image/png;base64,AA==',appearance:'embroidery',width:80,height:40,x:3,y:-4});
  const original=structuredClone(c.print.front);
  c=patchConfig(c,'bottomPanel.height',80);
  assert.equal(c.printArea.width,120);assert.equal(c.printArea.height,120);assert.equal(c.printArea.y,20);
  c=patchConfig(c,'dimensions.width',380);
  const restored=parseConfig(serializeConfig(c));
  assert.equal(restored.productId,TWO_TONE_SMALL_PRODUCT_ID);assert.deepEqual(restored.print.front,original);
  assert.equal(createDefaultConfig(SAMPLE_PRODUCT_ID).bottomPanel.height,75);
});

test('small webbing folds to a narrow cloth crown, joins the outside strips and keeps the measured 190mm length',()=>{
  const config=normalizeConfig(createDefaultConfig(TWO_TONE_SMALL_PRODUCT_ID));
  const materials=Object.fromEntries(['body','bottom','handle','inside','seam','pocket'].map(key=>[key,new THREE.MeshBasicMaterial()]));
  const bag=buildBagModel(config,materials);
  try {
    for(const side of ['Front','Back']) {
      const loop=bag.getObjectByName(`handlesLoop${side}`).geometry,p=loop.attributes.position;
      assert.ok(Math.abs(loop.boundingBox.max.y*1000-430)<.25);
      const crown=[];for(let i=0;i<p.count;i++)if(p.getY(i)>loop.boundingBox.max.y-.006)crown.push(p.getX(i));
      assert.ok((Math.max(...crown)-Math.min(...crown))*1000<config.handle.width*.6,'the crown must not look like a broad rigid arch');
      const lastRing=(p.count-8)/8-1;
      for(const [position,ring] of [['Left',0],['Right',lastRing]]){
        const leg=bag.getObjectByName(`handle${side}${position}`).geometry.attributes.position;
        const corners=(attribute,start)=>[0,1,3,5].map(offset=>new THREE.Vector3().fromBufferAttribute(attribute,start+offset))
          .sort((a,b)=>a.x-b.x||a.z-b.z||a.y-b.y);
        const attached=corners(leg,24*8),root=corners(p,ring*8);
        for(let i=0;i<4;i++)assert.ok(attached[i].distanceTo(root[i])<1e-7);
      }
    }
  } finally {disposeBagModel(bag);Object.values(materials).forEach(material=>material.dispose());}
});

test('the real bag picker exposes both two-tone sizes with separate 3D entry targets and packaged preview assets',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  const bags=runInNewContext(`(${html.match(/const EXTRA_3D_BAGS = (\[[\s\S]*?\n\]);/)[1]})`);
  assert.deepEqual(Array.from(bags,bag=>bag.id),[SAMPLE_PRODUCT_ID,TWO_TONE_SMALL_PRODUCT_ID]);
  const small=bags.find(bag=>bag.id===TWO_TONE_SMALL_PRODUCT_ID);
  assert.equal(small.size,'스몰 · 34×24×10cm');assert.equal(small.editorMode,'3d');
  for(const bag of bags)assert.ok((await readFile(new URL(`../${bag.preview}`,import.meta.url))).length>0);
  const nodes=[],document={getElementById:()=>({innerHTML:'',appendChild(node){nodes.push(node);}}),
    createElement:()=>({style:{},dataset:{},setAttribute(){},addEventListener(){}})};
  const context={document,BAG_MODELS:{ecobag:[]},EXTRA_3D_BAGS:bags,BAG_IMAGES:{},currentBag:{id:'daily'}};
  runInNewContext(html.slice(html.indexOf('function renderBagGrid(cat)'),html.indexOf('function selectBag(bag, silent)')),context);
  runInNewContext("renderBagGrid('ecobag')",context);
  assert.deepEqual(nodes.map(node=>node.dataset.p3dSelectProduct),[SAMPLE_PRODUCT_ID,TWO_TONE_SMALL_PRODUCT_ID]);
  assert.ok(nodes[1].innerHTML.includes(small.size));
});
