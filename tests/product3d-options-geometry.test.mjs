import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from '../assets/vendor/three/three.module.js';
import { createDefaultConfig, createDailyConfig, normalizeConfig, MM_TO_SCENE } from '../assets/product3d/config.mjs';
import { buildBagModel, disposeBagModel, frontSurfaceMM, backSurfaceMM, innerPocketSurfaceMM } from '../assets/product3d/model.mjs';
import { getInnerPocketLayout } from '../assets/product3d/options-model.mjs';

function materials(){return Object.fromEntries(['body','bottom','handle','inside','seam','pocket','zipper','snap'].map(key=>[key,new THREE.MeshBasicMaterial()]));}
function model(config){const owned=materials();return {bag:buildBagModel(config,owned),owned};}
function clean({bag,owned}){disposeBagModel(bag);Object.values(owned).forEach(material=>material.dispose());}
function configured(base,options){return normalizeConfig({...base,options:{...base.options,...options}});}
function closestRow(geometry,stride,y){const p=geometry.getAttribute('position');let best=Infinity,row=0;for(let i=0;i<p.count;i+=stride){const d=Math.abs(p.getY(i)-y);if(d<best){row=i;best=d;}}return row;}
function normal(geometry,index){const n=geometry.getAttribute('normal');return new THREE.Vector3(n.getX(index),n.getY(index),n.getZ(index));}

test('daily sides turn through broad smooth curves and an inward gusset rather than a right-angle wall',()=>{
  const state=model(createDailyConfig()),g=state.bag.getObjectByName('sideLeft').geometry;
  const p=g.getAttribute('position'),uv=g.getAttribute('uv');
  for(const y of [.18,.30,.36]){
    const row=closestRow(g,23,y);let curved=0;
    for(let i=row;i<row+23;i++){
      const n=normal(g,i);
      if(Math.abs(n.x)>.15&&Math.abs(n.z)>.15)curved++;
      if(i<row+22){
        assert.ok(n.angleTo(normal(g,i+1))<THREE.MathUtils.degToRad(30),'adjacent cloth normals never create a right-angle seam');
        const distance=Math.hypot(p.getX(i+1)-p.getX(i),p.getZ(i+1)-p.getZ(i));
        assert.ok(Math.abs(uv.getX(i+1)-uv.getX(i)-distance)<1e-7,'weave UVs follow actual folded arc length');
      }
      assert.ok(Math.abs(uv.getY(i)-p.getY(i))<1e-7);
    }
    assert.ok(curved>=10,'the side has long, smoothly turning cloth shoulders');
    if(y===.36)assert.ok(curved>=16,'the mouth is broadly rounded rather than a rectangular side wall');
    const outer=Math.max(...Array.from({length:23},(_,i)=>Math.abs(p.getX(row+i))));
    assert.ok(outer-Math.abs(p.getX(row+11))>MM_TO_SCENE,'gusset centre is softly recessed');
  }
  const midRow=closestRow(g,23,.18);
  const front=state.bag.getObjectByName('bodyFront').geometry;
  const frontRow=closestRow(front,33,.18);
  assert.ok(normal(g,midRow).angleTo(normal(front,frontRow))<THREE.MathUtils.degToRad(15),'front-to-side join has continuous shading');
  const rim=state.bag.getObjectByName('openTopRim').geometry.getAttribute('position');
  let mouthDepth=0;for(let i=0;i<rim.count;i++)mouthDepth=Math.max(mouthDepth,Math.abs(rim.getZ(i))*2);
  assert.ok(mouthDepth<.075,'the open mouth softly pinches instead of forming a rectangular box opening');
  for(const name of ['bodyFront','bodyBack','sideLeft','sideRight','bottom']){
    const geometry=state.bag.getObjectByName(name).geometry;geometry.computeBoundingBox();
    const b=geometry.boundingBox;
    assert.ok(b.min.x>=-.180001&&b.max.x<=.180001);
    assert.ok(b.min.z>=-.050001&&b.max.z<=.050001);
    assert.ok(b.min.y>=-1e-7&&b.max.y<=.360001);
  }
  clean(state);
});

test('rear and inner artwork surfaces expose correct orientation, units and calibrated pocket dimensions',()=>{
  const config=configured(createDailyConfig(),{innerPocketPrint:true});
  config.print.innerPocket.partDimensions={width:140,height:120};
  const front=frontSurfaceMM(35,0,config),back=backSurfaceMM(35,0,config);
  assert.equal(front.x,.035);assert.equal(back.x,-.035);
  assert.ok(front.normal.z>.95);assert.ok(back.normal.z<-.95);
  assert.equal(back.y,.18);assert.ok(back.z<0);
  const layout=getInnerPocketLayout(config);
  assert.equal(layout.width,140);assert.equal(layout.height,120);
  const inner=innerPocketSurfaceMM(35,10,config);
  assert.equal(inner.x,.035);assert.equal(inner.y,(layout.centerY+10)*MM_TO_SCENE);
  assert.ok(inner.normal.z>.9);assert.equal(inner.visible,true);
  assert.equal(innerPocketSurfaceMM(80,0,config).visible,false);
  const state=model(config);
  assert.ok(state.bag.getObjectByName('innerPocket'));
  assert.deepEqual(state.bag.getObjectByName('innerPocket').userData.partDimensions,{width:140,height:120});
  assert.equal(state.bag.getObjectByName('frontPocket'),undefined);
  assert.equal(state.bag.getObjectByName('innerPocket').material,state.owned.inside);
  clean(state);
});

for(const [option,parts] of [
  ['snap',['snapFront','snapBack','snapFrontOuterCap','snapBackOuterCap']],['magnet',['magnetFront','magnetBack','magnetFrontOuterCap','magnetBackOuterCap']],
  ['zipper',['zipperTapeFront','zipperTapeBack','zipperTeeth','zipperSlider','zipperPull']],
  ['nameTag',['nameTag','nameTagBorder','nameTagStitches']],['innerPocket',['innerPocket','innerPocketHem']],
])test(`${option} produces real option geometry and disappears when deselected`,()=>{
  for(const base of [createDefaultConfig(),createDailyConfig()]){
    const state=model(configured(base,{[option]:true})),plain=model(base);
    for(const name of parts){assert.ok(state.bag.getObjectByName(name),name);assert.equal(plain.bag.getObjectByName(name),undefined);}
    if(['snap','magnet','zipper'].includes(option))assert.equal(state.bag.userData.metrics.closure,option);
    if(option==='zipper')assert.equal(state.bag.userData.metrics.openTop,false);
    clean(state);clean(plain);
  }
});

test('800 mm cross strap keeps daily handles and replaces sample handles without changing their saved size',()=>{
  for(const base of [createDefaultConfig(),createDailyConfig()]){
    const config=configured(base,{crossStrap:true}),state=model(config);
    for(const name of ['crossStrap','crossStrapLeftHook','crossStrapRightHook','crossStrapLeftRing','crossStrapRightRing','crossStrapAdjuster'])assert.ok(state.bag.getObjectByName(name),name);
    for(const name of ['handlesLoopFront','handlesLoopBack','handleFrontLeft','handleBackRight'])assert.equal(Boolean(state.bag.getObjectByName(name)),base.productId==='daily',name);
    const info=state.bag.userData.metrics.crossStrap;
    assert.equal(info.referenceLengthMm,800);assert.ok(Math.abs(info.centerlineLengthMm-800)<.001);
    assert.equal(config.handle.drop,base.handle.drop);assert.equal(config.handle.width,base.handle.width);
    assert.ok(info.anchors[0].x<0&&info.anchors[1].x>0);
    assert.equal(state.bag.userData.optionVisuals.crossStrap,true);
    clean(state);
  }
});

test('selected cross strap follows saved lengths exactly across products and physically narrow/wide bodies',()=>{
  for(const create of [createDefaultConfig,createDailyConfig])for(const dimensions of [
    {width:200,height:150,depth:30},{width:450,height:350,depth:150},{width:600,height:600,depth:300}]){
    let previousTop=-Infinity;
    for(const length of [Math.max(500,dimensions.width+12),800,1400]){
      const base=create(),config=normalizeConfig({...base,dimensions,crossStrap:{length},options:{...base.options,crossStrap:true}});
      const state=model(config),info=state.bag.userData.metrics.crossStrap;
      assert.equal(info.requestedLengthMm,length);
      assert.ok(Math.abs(info.centerlineLengthMm-length)<.001,'rendered length agrees with the saved consultation length');
      assert.ok(info.minimumGeometryLengthMm<length);
      const top=state.bag.getObjectByName('crossStrap').geometry.boundingBox.max.y;
      assert.ok(top>previousTop,'a longer strap increases the visible loop instead of scaling its width');previousTop=top;
      assert.equal(state.bag.userData.metrics.handleWidth,config.handle.width);
      clean(state);
    }
  }
});

test('realistic cross webbing keeps its physical frame, folded layers and three-bar fittings across length limits',()=>{
  for(const create of [createDefaultConfig,createDailyConfig])for(const dimensions of [
    {width:200,height:150,depth:30},{width:600,height:600,depth:300}])for(const handle of [
    {width:20,thickness:1},{width:70,thickness:5}])for(const length of [Math.max(500,dimensions.width+12),1400]){
    const base=create(),config=normalizeConfig({...base,dimensions,handle:{...base.handle,...handle},crossStrap:{length},
      options:{...base.options,crossStrap:true,innerPocket:true,zipper:true,nameTag:true}}),state=model(config);
    const strap=state.bag.getObjectByName('crossStrap'),positions=strap.geometry.attributes.position;
    const points=strap.userData.centerlineMm,rings=(positions.count-8)/8;
    assert.equal(points.length,rings);
    const vertex=(geometry,index)=>new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,index).divideScalar(MM_TO_SCENE);
    for(let i=0;i<rings;i++){
      const a=vertex(strap.geometry,i*8),b=vertex(strap.geometry,i*8+1),c=vertex(strap.geometry,i*8+3);
      assert.ok(Math.abs(a.distanceTo(b)-config.handle.width)<.0002,'width never scales with length or the shoulder bend');
      assert.ok(Math.abs(b.distanceTo(c)-config.handle.thickness)<.0002,'thickness stays independent of width and length');
      assert.ok(Math.abs(b.clone().sub(a).normalize().dot(c.clone().sub(b).normalize()))<.0001,'ribbon frame is orthogonal');
      for(const index of [0,1,3,5])assert.ok(vertex(strap.geometry,i*8+index).y>dimensions.height+3,'webbing clears the mouth at its end fittings');
    }
    const returned=state.bag.getObjectByName('crossStrapReturn'),returnRings=(returned.geometry.attributes.position.count-8)/8;
    for(let i=0;i<returnRings;i++){
      const mainCenter=vertex(strap.geometry,i*8).add(vertex(strap.geometry,i*8+4)).multiplyScalar(.5);
      const returnCenter=vertex(returned.geometry,i*8).add(vertex(returned.geometry,i*8+4)).multiplyScalar(.5);
      assert.ok(Math.abs(mainCenter.distanceTo(returnCenter)-config.handle.thickness-.9)<.0002,'return layer has a visible physical clearance');
    }
    const adjuster=state.bag.getObjectByName('crossStrapAdjuster'),frame=adjuster.userData.frame;
    assert.equal(adjuster.userData.type,'three-bar-rectangular');
    assert.equal(adjuster.userData.widthMm,config.handle.width+6);
    const lateral=new THREE.Vector3(...frame.lateral),tangent=new THREE.Vector3(...frame.tangent),normal=new THREE.Vector3(...frame.normal);
    assert.ok(Math.abs(lateral.dot(tangent))<1e-10&&Math.abs(normal.dot(tangent))<1e-10&&Math.abs(normal.dot(lateral))<1e-10);
    const center=new THREE.Vector3(adjuster.userData.centerMm.x,adjuster.userData.centerMm.y,adjuster.userData.centerMm.z);
    for(let i=0;i<adjuster.geometry.attributes.position.count;i++)assert.ok(Math.abs(vertex(adjuster.geometry,i).sub(center).dot(normal))<1.3,'rectangular adjuster follows the broad face');
    for(const suffix of ['Left','Right'])for(const part of ['Hook','HookGate','Ring','Swivel','StrapEye','EndFold'])
      assert.ok(state.bag.getObjectByName(`crossStrap${suffix}${part}`),`${suffix} ${part}`);
    for(const part of ['crossStrapRightTail','crossStrapStitches','crossStrapEndStitches','crossStrapLowerEdge','crossStrapUpperEdge'])assert.ok(state.bag.getObjectByName(part),part);
    state.bag.traverse(mesh=>{if(mesh.isMesh&&mesh.name.startsWith('crossStrap'))for(const key of ['position','normal','uv'])assert.ok(mesh.geometry.attributes[key].array.every(Number.isFinite),`${mesh.name} ${key}`);});
    assert.ok(Math.abs(state.bag.userData.metrics.crossStrap.centerlineLengthMm-length)<.001);
    assert.ok(state.bag.userData.metrics.triangleCount<25_000);
    clean(state);
  }
  const config=configured(createDailyConfig(),{crossStrap:true}),state=model(config),points=state.bag.getObjectByName('crossStrap').userData.centerlineMm;
  const left=points[24],tip=points[38],last=points[points.length-1];
  assert.ok(left.y-points[0].y>250,'the default strap has a long sloping side');
  assert.ok(Math.abs(left.x)<20&&Math.abs(tip.x)<.001,'the shoulder fold is narrow and centered');
  assert.ok(Math.abs(last.y-points[0].y)<1e-8,'both physical hooks attach at the same height');
  clean(state);
});

test('snap and magnet keep their inner parts and expose every outer cap vertex beyond the exterior cloth',()=>{
  for(const create of [createDefaultConfig,createDailyConfig])for(const dimensions of [
    {width:200,height:150,depth:30},{width:480,height:340,depth:150},{width:200,height:150,depth:300}])for(const kind of ['snap','magnet']){
    const base=create(),config=normalizeConfig({...base,dimensions,options:{...base.options,[kind]:true}}),state=model(config);
    for(const front of [true,false]){
      const side=front?'Front':'Back',sign=front?1:-1,cap=state.bag.getObjectByName(`${kind}${side}OuterCap`);
      assert.ok(state.bag.getObjectByName(`${kind}${side}`));
      assert.equal(cap.userData.location,'outside');
      state.bag.updateMatrixWorld(true);
      const p=cap.geometry.getAttribute('position');
      for(let i=0;i<p.count;i++){
        const point=cap.localToWorld(new THREE.Vector3().fromBufferAttribute(p,i));
        const exterior=(front?frontSurfaceMM:backSurfaceMM)(sign*point.x/MM_TO_SCENE,point.y/MM_TO_SCENE-dimensions.height/2,config);
        assert.ok(sign*(point.z-exterior.z)>.1*MM_TO_SCENE,`${config.productId} ${JSON.stringify(dimensions)} ${kind}${side} cap remains outside cloth`);
      }
    }
    clean(state);
  }
});

test('reference-shaped white name label sits inside 30 mm right of the planned pocket, even with pocket off',()=>{
  for(const create of [createDefaultConfig,createDailyConfig]){
    const base=create(),a=model(configured(base,{nameTag:true})),b=model(configured(base,{nameTag:true,innerPocket:true}));
    const layout=a.bag.userData.nameTagLayout,pocket=getInnerPocketLayout(base);
    assert.equal(layout.gapMm,30);assert.equal(layout.width,50);assert.equal(layout.height,22);
    assert.equal(layout.left,pocket.width/2+30);
    assert.equal(layout.centerY,pocket.top-pocket.bandHeight/2);
    assert.deepEqual(layout,b.bag.userData.nameTagLayout);
    assert.equal(a.bag.getObjectByName('nameTag').userData.location,'inside-back-right');
    assert.equal(a.bag.getObjectByName('nameTagCord'),undefined);
    clean(a);clean(b);
  }
  for(const create of [createDefaultConfig,createDailyConfig])for(const dimensions of [
    {width:200,height:150,depth:30},{width:200,height:150,depth:300},{width:320,height:250,depth:120}]){
    const base=create(),config=normalizeConfig({...base,dimensions,options:{...base.options,nameTag:true,innerPocket:true}}),state=model(config);
    const layout=state.bag.userData.nameTagLayout;
    assert.ok(layout.gapMm>=4&&layout.gapMm<=30);
    assert.ok(layout.left>=getInnerPocketLayout(config).width/2+4);
    assert.ok(Math.abs(layout.width/layout.height-50/22)<1e-9,'narrow-bag fitting preserves the horizontal label shape');
    const lining=['liningFront','liningBack','liningLeft','liningRight'].map(name=>state.bag.getObjectByName(name));
    Object.values(state.owned).forEach(material=>material.side=THREE.DoubleSide);
    state.bag.updateMatrixWorld(true);
    for(const name of ['nameTag','nameTagBorder','nameTagStitches']){
      const p=state.bag.getObjectByName(name).geometry.getAttribute('position');
      for(let i=0;i<p.count;i++)for(const sign of [-1,1]){
        const hit=new THREE.Raycaster(new THREE.Vector3().fromBufferAttribute(p,i),new THREE.Vector3(0,0,sign)).intersectObjects(lining)[0];
        assert.ok(hit,`${config.productId} ${JSON.stringify(dimensions)} ${name} remains inside`);
        assert.ok(hit.face.normal.z*sign<0);
        assert.ok(hit.distance>.1*MM_TO_SCENE,`${config.productId} ${JSON.stringify(dimensions)} ${name} vertex${i} direction${sign} clearance${hit.distance/MM_TO_SCENE}mm`);
      }
    }
    clean(state);
  }
});

test('combined options remain finite and affordable at representative and extreme bag dimensions',()=>{
  for(const create of [createDefaultConfig,createDailyConfig])for(const dimensions of [
    {width:320,height:250,depth:120},{width:450,height:350,depth:150},{width:250,height:300,depth:80},
    {width:200,height:150,depth:30},{width:600,height:600,depth:300},
  ]){
    const config=normalizeConfig({...create(),dimensions,options:{...create().options,innerPocket:true,innerPocketPrint:true,
      zipper:true,crossStrap:true,nameTag:true,individualPackaging:true,doubleSided:true}}),state=model(config);
    state.bag.traverse(object=>{
      if(!object.isMesh)return;
      for(const key of ['position','normal','uv'])assert.ok(object.geometry.getAttribute(key).array.every(Number.isFinite),`${object.name} ${key}`);
      if(object.geometry.index)assert.ok(object.geometry.index.array.every(index=>index<object.geometry.getAttribute('position').count));
      assert.equal(object.scale.x,1);assert.equal(object.scale.y,1);assert.equal(object.scale.z,1);
    });
    assert.ok(state.bag.userData.metrics.triangleCount<25_000, `${config.productId} ${JSON.stringify(dimensions)}: ${state.bag.userData.metrics.triangleCount} triangles`);
    assert.equal(state.bag.getObjectByName('individualPackaging'),undefined);
    assert.equal(state.bag.userData.optionVisuals.individualPackaging,false);
    assert.equal(config.options.individualPackaging,true);
    clean(state);
  }
});

test('sewing improvements preserve delivered cloth, handles and print-bearing pocket buffers at four dimensions',()=>{
  const expected=[
    [{width:480,height:340,depth:150},'fd85541910ef781118a5e91b47c60afd45249b5a93e163a452c2ce37709f8ea9'],
    [{width:320,height:250,depth:120},'00c8a8e6f1b80d4fa5a05e57145da378fc4fbf29dd9c04173db713a59a683648'],
    [{width:450,height:350,depth:150},'73bb4dbc1f1c7d7a1268da9c8e4dcf5afb7398d8cc2ba6369c4ef2662cb689dd'],
    [{width:250,height:300,depth:80},'a2eaf050c2633af905c4ff76c50a354c9eb8ef399ca6f91e5e52abe6caef2b0c'],
  ];
  for(const [dimensions,digest] of expected){
    const state=model(normalizeConfig({...createDefaultConfig(),dimensions})),sha=createHash('sha256'),meshes=[];
    state.bag.traverse(object=>{if(object.isMesh&&object.userData.materialKey!=='seam')meshes.push(object);});
    for(const mesh of meshes.sort((a,b)=>a.name.localeCompare(b.name))){
      sha.update(mesh.name);
      for(const key of ['position','normal','uv']){const a=mesh.geometry.getAttribute(key).array;sha.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}
      const a=mesh.geometry.index.array;sha.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));
    }
    assert.equal(sha.digest('hex'),digest);
    clean(state);
  }
});
