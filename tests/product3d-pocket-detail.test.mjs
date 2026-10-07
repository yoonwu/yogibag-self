import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three/three.module.js';
import { createDefaultConfig, createDailyConfig, normalizeConfig, MM_TO_SCENE } from '../assets/product3d/config.mjs';
import { buildBagModel, disposeBagModel, innerPocketSurfaceMM } from '../assets/product3d/model.mjs';
import { getInnerPocketLayout, innerPocketHalfWidth } from '../assets/product3d/options-model.mjs';
import { createPrintMesh, disposePrintMesh } from '../assets/product3d/print.mjs';

const names=['innerPocket','innerPocketMountingBand','innerPocketBack','innerPocketHem',
  'innerPocketBinding','innerPocketBindingWrap','innerPocketMouthShadow','innerPocketStitches'];
const sizes=[{width:320,height:250,depth:120},{width:450,height:350,depth:150},{width:250,height:300,depth:80},
  {width:200,height:150,depth:30},{width:600,height:600,depth:300},{width:200,height:150,depth:300}];
const mm=value=>value/MM_TO_SCENE;
const close=(a,b,tolerance=.0001)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
function configured(create,dimensions,partDimensions={width:140,height:120}){
  const base=create();
  return normalizeConfig({...base,dimensions,options:{...base.options,innerPocketPrint:true},
    print:{...base.print,innerPocket:{...base.print.innerPocket,partDimensions}}});
}
function model(config){
  const materials=Object.fromEntries(['body','bottom','handle','inside','seam','pocket',
    'innerPocket','pocketEdge','pocketStitch','pocketShadow'].map(key=>[key,new THREE.MeshBasicMaterial({side:THREE.DoubleSide})]));
  const bag=buildBagModel(config,materials);bag.updateMatrixWorld(true);
  return {bag,materials,dispose(){disposeBagModel(bag);Object.values(materials).forEach(material=>material.dispose());}};
}

test('actual 2D pocket proportions produce a broad upper band, constant-width pouch and rounded U binding',()=>{
  const config=configured(createDailyConfig,{width:360,height:360,depth:100}),state=model(config);
  const layout=getInnerPocketLayout(config),metrics=state.bag.userData.innerPocketLayout;
  close(layout.width,140);close(layout.height,120);close(layout.bandHeight,24);close(layout.mouthY,36);
  close(layout.bindingWidth,5.6);close(layout.cornerRadius,11.2);
  close((-layout.height/2+layout.mouthY)/2,-12);
  assert.equal(metrics.wholePieceOrigin,true);
  const pocket=state.bag.getObjectByName('innerPocket'),band=state.bag.getObjectByName('innerPocketMountingBand');
  assert.deepEqual(pocket.userData.partDimensions,{width:140,height:120});
  assert.equal(band.userData.heightFraction,.2);close(band.userData.nominalHeightMm,24);
  close(mm(band.geometry.boundingBox.max.y),layout.top);
  close(mm(band.geometry.boundingBox.min.y),layout.centerY+layout.mouthY+.4);
  close(mm(band.geometry.boundingBox.getSize(new THREE.Vector3()).x),140-2*5.6);
  const p=pocket.geometry.getAttribute('position');
  for(let row=8;row<=20;row++){
    close(mm(p.getX(row*17)),-64.4);close(mm(p.getX(row*17+16)),64.4);
  }
  assert.ok(mm(pocket.geometry.boundingBox.max.z-pocket.geometry.boundingBox.min.z)<.2,'front cloth stays essentially planar instead of following the gusset');
  close(innerPocketSurfaceMM(0,45,config).z,metrics.planeZ*MM_TO_SCENE);
  close(innerPocketSurfaceMM(0,0,config).y,layout.centerY*MM_TO_SCENE);
  assert.equal(innerPocketSurfaceMM(0,36,config).visible,false,'the opening lies below the broad mounting band');
  assert.equal(innerPocketSurfaceMM(0,35.6,config).visible,true);
  assert.equal(innerPocketSurfaceMM(0,36.4,config).visible,true);
  assert.equal(innerPocketSurfaceMM(70,-60,config).visible,false,'square lower corners are excluded');
  const binding=state.bag.getObjectByName('innerPocketBinding'),edge=binding.geometry.getAttribute('position');
  assert.equal(binding.material,state.materials.pocketEdge);
  close(binding.userData.widthMm,5.6);close(binding.userData.cornerRadiusMm,11.2);
  // Ten targeted quarter-circle segments remove the previously visible bevel.
  for(let row=14;row<=24;row++){
    const x=mm(edge.getX(row*5+4)),y=mm(edge.getY(row*5+4))-layout.centerY;
    close(Math.hypot(x-(-70+11.2),y-(-60+11.2)),11.2,.0001);
  }
  assert.equal(state.bag.getObjectByName('innerPocketContactShadow'),undefined,'hanging pouch does not pretend to be sewn onto three body edges');
  state.dispose();
});

test('all hanging-pocket geometry is finite and stays inside real lining at representative and extreme depths',()=>{
  for(const create of [createDefaultConfig,createDailyConfig])for(const dimensions of sizes){
    const config=configured(create,dimensions),state=model(config),layout=getInnerPocketLayout(config);
    const lining=['liningFront','liningBack','liningLeft','liningRight'].map(name=>state.bag.getObjectByName(name));
    for(const name of names){
      const mesh=state.bag.getObjectByName(name),p=mesh.geometry.getAttribute('position');
      assert.ok(mesh,name);
      for(const key of ['position','normal','uv'])assert.ok(mesh.geometry.getAttribute(key).array.every(Number.isFinite));
      assert.ok(mesh.geometry.index.array.every(index=>index<p.count));
      assert.ok(mesh.geometry.boundingBox.min.y>=layout.bottom*MM_TO_SCENE-1e-7);
      assert.ok(mesh.geometry.boundingBox.max.y<=layout.top*MM_TO_SCENE+1e-7);
      for(let i=0;i<p.count;i+=Math.max(1,Math.floor(p.count/16))){
        const point=new THREE.Vector3().fromBufferAttribute(p,i);
        for(const sign of [-1,1]){
          const hit=new THREE.Raycaster(point,new THREE.Vector3(0,0,sign)).intersectObjects(lining)[0];
          assert.ok(hit,`${config.productId} ${JSON.stringify(dimensions)} ${name} must remain inside lining`);
          assert.ok(hit.face.normal.z*sign<0,'ray exits the interior instead of entering from outside');
          assert.ok(hit.distance>.15*MM_TO_SCENE,'cloth and binding have clearance to the lining');
        }
      }
    }
    assert.equal(state.bag.getObjectByName('innerPocketStitches').material,state.materials.pocketStitch);
    assert.equal(state.bag.getObjectByName('innerPocketStitches').castShadow,false);
    state.dispose();
  }
});

function clip(polygon,axis,boundary,greater){
  const output=[],side=p=>(p[axis]-boundary)*(greater?1:-1);
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i],b=polygon[(i+1)%polygon.length],sa=side(a),sb=side(b);
    if(sa>=0)output.push(a);
    if((sa<0&&sb>0)||(sa>0&&sb<0)){
      const t=sa/(sa-sb);output.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
    }
  }
  return output;
}
function openingArea(triangle,layout){
  let polygon=triangle;
  for(const [axis,boundary,greater] of [['x',-layout.width/2+layout.bindingWidth,true],
    ['x',layout.width/2-layout.bindingWidth,false],['y',layout.mouthY-.4,true],['y',layout.mouthY+.4,false]]){
    polygon=clip(polygon,axis,boundary,greater);if(polygon.length<3)return 0;
  }
  let area=0;for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length];area+=a.x*b.y-b.x*a.y;}
  return Math.abs(area)/2;
}

test('whole-piece artwork keeps exact mm mapping and never bridges the mouth after moving or rotating',()=>{
  const texture=new THREE.Texture(),config=configured(createDailyConfig,{width:360,height:360,depth:100});
  const state=model(config),layout=getInnerPocketLayout(config);
  for(const pose of [{width:70,height:40,x:0,y:0,rotation:0},
    {width:140,height:120,x:0,y:0,rotation:0},{width:140,height:120,x:0,y:0,rotation:45},
    {width:140,height:120,x:0,y:0,rotation:90},{width:100,height:75,x:12,y:22,rotation:37}]){
    config.print.innerPocket={...config.print.innerPocket,...pose};
    const print=createPrintMesh(config,texture,'innerPocket'),p=print.geometry.getAttribute('position'),uv=print.geometry.getAttribute('uv');
    assert.equal(print.userData.printWidthMm,pose.width);assert.equal(print.userData.printHeightMm,pose.height);
    const angle=pose.rotation*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
    for(const index of new Set(print.geometry.index.array)){
      const x=(uv.getX(index)-.5)*pose.width,y=(uv.getY(index)-.5)*pose.height;
      const actualX=mm(p.getX(index)),actualY=mm(p.getY(index))-layout.centerY;
      close(actualX,pose.x+x*cos-y*sin,.0001);close(actualY,pose.y+x*sin+y*cos,.0001);
      assert.ok(Math.abs(actualY)<=layout.height/2+.0001);
      assert.ok(Math.abs(actualX)<=innerPocketHalfWidth(THREE.MathUtils.clamp(actualY,-layout.height/2,layout.height/2),layout)+.0001,'rounded lower corners clip the print');
      let surfaceX=actualX,surfaceY=actualY;
      for(const boundary of [layout.mouthY-.4,layout.mouthY+.4])if(Math.abs(surfaceY-boundary)<.0001)surfaceY=boundary;
      for(const boundary of [-layout.width/2+layout.bindingWidth,layout.width/2-layout.bindingWidth])if(Math.abs(surfaceX-boundary)<.0001)surfaceX=boundary;
      const point=innerPocketSurfaceMM(surfaceX,surfaceY,config);
      close(p.getZ(index),point.z+.65*MM_TO_SCENE,1e-7);
    }
    const indices=print.geometry.index.array;
    for(let i=0;i<indices.length;i+=3){
      const triangle=[indices[i],indices[i+1],indices[i+2]].map(index=>({x:mm(p.getX(index)),y:mm(p.getY(index))-layout.centerY}));
      assert.ok(openingArea(triangle,layout)<.001,'no rendered triangle spans the horizontal open slot');
    }
    if(pose.width===70){
      const box=new THREE.Box3().setFromObject(print);close(mm(box.max.x-box.min.x),70);close(mm(box.max.y-box.min.y),40);
      const details=names.filter(name=>name!=='innerPocket').map(name=>state.bag.getObjectByName(name));
      for(const index of new Set(indices))assert.equal(new THREE.Raycaster(new THREE.Vector3().fromBufferAttribute(p,index),new THREE.Vector3(0,0,1)).intersectObjects(details).length,0);
    }
    disposePrintMesh(print);
  }
  state.dispose();texture.dispose();
});

test('reference-shaped pocket scales in its whole-piece frame and disappears when deselected',()=>{
  const config=configured(createDailyConfig,{width:360,height:360,depth:100},{width:80,height:60});
  const state=model(config),plain=model(createDailyConfig()),layout=getInnerPocketLayout(config);
  assert.deepEqual(state.bag.getObjectByName('innerPocket').userData.partDimensions,{width:80,height:60});
  close(layout.bandHeight,12);close(layout.bindingWidth,3.2);close(layout.cornerRadius,6.4);
  close(innerPocketSurfaceMM(0,0,config).y,layout.centerY*MM_TO_SCENE);
  for(const name of names)assert.equal(plain.bag.getObjectByName(name),undefined);
  state.dispose();plain.dispose();
});
