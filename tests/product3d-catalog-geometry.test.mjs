import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three/three.module.js';
import { PRODUCT3D_PROFILES,createDefaultConfig,normalizeConfig,getProductLimits,MM_TO_SCENE } from '../assets/product3d/config.mjs';
import { buildBagModel,disposeBagModel,frontSurfaceMM,backSurfaceMM,innerPocketSurfaceMM } from '../assets/product3d/model.mjs';
import { getInnerPocketLayout } from '../assets/product3d/options-model.mjs';
import { createPrintMesh,disposePrintMesh } from '../assets/product3d/print.mjs';
import { ribbonSelfIntersections,ribbonCenter,ribbonRings } from './helpers/ribbon-safety.mjs';

const fabricKeys=['body','bottom','handle','inside','seam','pocket','snap','zipper'];
function model(config){const materials=Object.fromEntries(fabricKeys.map(k=>[k,new THREE.MeshBasicMaterial({side:THREE.FrontSide})]));return {bag:buildBagModel(config,materials),config,dispose(){disposeBagModel(this.bag);Object.values(materials).forEach(m=>m.dispose());}};}
function bodyMeshes(bag){return ['bodyFront','bodyBack','sideLeft','sideRight','bottom'].map(name=>bag.getObjectByName(name));}
function bounds(meshes){const box=new THREE.Box3();for(const mesh of meshes)box.union(mesh.geometry.boundingBox);return box;}
function projectedRibbonSpans(geometry,y){
  const p=geometry.attributes.position,index=geometry.index.array,spans=[];
  for(let triangle=0;triangle<index.length;triangle+=3){
    const vertices=Array.from(index.slice(triangle,triangle+3),i=>({x:p.getX(i),y:p.getY(i)})),xs=[];
    for(let edge=0;edge<3;edge++){
      const a=vertices[edge],b=vertices[(edge+1)%3];
      if(Math.abs(a.y-b.y)<1e-10||y<Math.min(a.y,b.y)||y>Math.max(a.y,b.y))continue;
      xs.push(THREE.MathUtils.lerp(a.x,b.x,(y-a.y)/(b.y-a.y)));
    }
    if(xs.length>=2)spans.push([Math.min(...xs),Math.max(...xs)]);
  }
  spans.sort((a,b)=>a[0]-b[0]);const merged=[];
  for(const span of spans){
    if(merged.length&&span[0]<=merged.at(-1)[1]+1e-7)merged.at(-1)[1]=Math.max(merged.at(-1)[1],span[1]);
    else merged.push(span);
  }
  return merged;
}
function cases(id){
  const base=createDefaultConfig(id),limits=getProductLimits(base);
  return [normalizeConfig(base),...['min','max'].map(bound=>normalizeConfig({...base,
    dimensions:Object.fromEntries(['width','height','depth'].map(k=>[k,limits[`dimensions.${k}`][bound]])),
    handle:{...base.handle,width:bound==='min'?70:20,thickness:5,gap:450,drop:bound==='min'?80:450}}))];
}
function roundedHandleCases(id){
  const states=cases(id);
  if(id==='small')for(const [width,handle] of [[200,{width:70,thickness:5,drop:80,gap:82}],
    [200,{width:70,thickness:5,drop:450,gap:82}],[600,{width:70,thickness:5,drop:80,gap:450}]]){
    const base=createDefaultConfig(id);
    states.push(normalizeConfig({...base,dimensions:{...base.dimensions,width},handle:{...base.handle,...handle}}));
  }
  return states;
}

test('every catalog product builds finite physical geometry, its own handles and its locked closures',()=>{
  for(const [id,profile] of Object.entries(PRODUCT3D_PROFILES))for(const config of cases(id)){
    const state=model(config),{bag}=state,metrics=bag.userData.metrics,b= bounds(bodyMeshes(bag));
    assert.equal(metrics.construction,profile.construction);assert.equal(metrics.supportsHandles,profile.supportsHandles);
    for(const name of ['handlesLoopFront','handlesLoopBack','handleFrontLeft','handleBackRight'])assert.equal(Boolean(bag.getObjectByName(name)),profile.supportsHandles,`${id} ${name}`);
    if(profile.category==='pouch'){
      for(const name of ['zipperTapeFront','zipperTapeBack','zipperTeeth','zipperSlider','zipperHeaderFront','zipperHeaderBack'])assert.ok(bag.getObjectByName(name),`${id} ${name}`);
      assert.equal(metrics.closure,'zipper');assert.equal(metrics.openTop,false);
    }
    assert.ok(b.min.x>=-config.dimensions.width/2*MM_TO_SCENE-1e-6&&b.max.x<=config.dimensions.width/2*MM_TO_SCENE+1e-6,id);
    assert.ok(b.min.z>=-config.dimensions.depth/2*MM_TO_SCENE-1e-6&&b.max.z<=config.dimensions.depth/2*MM_TO_SCENE+1e-6,id);
    assert.ok(b.min.y>=-1e-7&&Math.abs(b.max.y-config.dimensions.height*MM_TO_SCENE)<1e-6,id);
    bag.traverse(mesh=>{if(!mesh.isMesh)return;for(const key of ['position','normal','uv'])assert.ok(mesh.geometry.attributes[key].array.every(Number.isFinite),`${id} ${key}`);
      if(mesh.geometry.index)assert.ok(mesh.geometry.index.array.every(i=>i<mesh.geometry.attributes.position.count),id);
      assert.deepEqual(mesh.scale.toArray(),[1,1,1]);});
    assert.ok(metrics.triangleCount<25_000,`${id}: ${metrics.triangleCount}`);
    state.dispose();
  }
});

test('flat products meet a narrow sewn bottom while gusset products have a draped floor and raised V folds',()=>{
  for(const [id,profile] of Object.entries(PRODUCT3D_PROFILES)){
    if(profile.construction==='sample'&&!profile.softCloth)continue;
    const config=normalizeConfig(createDefaultConfig(id)),state=model(config),floor=state.bag.getObjectByName('bottom').geometry;
    const p=floor.attributes.position,b=floor.boundingBox;
    assert.ok(b.max.y-b.min.y>3*MM_TO_SCENE,`${id} floor follows cloth folds instead of a horizontal plate`);
    const nominal=profile.nominalDepth;
    if(nominal===0){assert.ok(b.max.z-b.min.z<config.dimensions.depth*.35*MM_TO_SCENE,`${id} has no box bottom`);assert.equal(state.bag.userData.metrics.nominalDepth,0);}
    else assert.ok(b.max.z-b.min.z>config.dimensions.depth*.55*MM_TO_SCENE,`${id} has a real gusset footprint`);
    const side=state.bag.getObjectByName(profile.supportsBottomPanel?'bottomSideLeftPanel':'sideLeft').geometry.attributes.position;
    assert.ok(side.getY(11)>side.getY(0)+1*MM_TO_SCENE,`${id} lower side seam lifts into a V fold`);
    assert.ok(p.array.every(Number.isFinite));state.dispose();
  }
});

test('the bottom pouch tapers along its full side seam while its stated width remains the mouth width',()=>{
  const config=normalizeConfig(createDefaultConfig('mitdan')),state=model(config),side=state.bag.getObjectByName('sideRight').geometry.attributes.position;
  const halfWidthAt=y=>{
    let row=0,error=Infinity;
    for(let i=0;i<side.count;i+=23){const distance=Math.abs(side.getY(i)-y);if(distance<error){error=distance;row=i;}}
    let width=0;for(let i=0;i<23;i++)width=Math.max(width,Math.abs(side.getX(row+i)));return width;
  };
  assert.ok(halfWidthAt(config.dimensions.height*.75*MM_TO_SCENE)-halfWidthAt(config.dimensions.height*.25*MM_TO_SCENE)>8*MM_TO_SCENE,'body narrows well above the bottom corner');
  assert.equal(state.bag.userData.metrics.fullSideTaperMm,25);
  assert.equal(state.bag.userData.metrics.widthBasis,'mouth-width');
  assert.equal(state.bag.userData.metrics.dimensions.width,230);
  const floor=state.bag.getObjectByName('bottom').geometry.boundingBox;
  assert.ok(floor.max.y-floor.min.y>3*MM_TO_SCENE,'the original cloth floor fold remains');
  for(const id of ['minja','tumbler']){const other=model(normalizeConfig(createDefaultConfig(id)));assert.equal(other.bag.userData.metrics.fullSideTaperMm,0);other.dispose();}
  state.dispose();
});

test('all catalog loop roots remain inside real lining, preserve exact drop and join their vertical attachment ends',()=>{
  for(const [id,profile] of Object.entries(PRODUCT3D_PROFILES)){
    if(profile.handleAttachment!=='mouth')continue;
    for(const config of cases(id)){
      const state=model(config),lining=['liningFront','liningBack','liningLeft','liningRight'].map(n=>state.bag.getObjectByName(n));
      for(const front of [true,false]){
        const loop=state.bag.getObjectByName(front?'handlesLoopFront':'handlesLoopBack'),sign=front?1:-1;
        assert.ok(Math.abs(loop.geometry.boundingBox.max.y-(config.dimensions.height+config.handle.drop)*MM_TO_SCENE)<2e-7,id);
        for(const end of ['Left','Right']){
          const leg=state.bag.getObjectByName(`handle${front?'Front':'Back'}${end}`),p=leg.geometry.attributes.position;
          for(let i=0;i<p.count-8;i+=8)for(const offset of [0,1,3,5]){
            const point=new THREE.Vector3().fromBufferAttribute(p,i+offset);
            const hits=new THREE.Raycaster(point,new THREE.Vector3(0,0,sign)).intersectObjects(lining);
            assert.ok(hits[0],`${id} ${JSON.stringify(config.dimensions)} inside anchor`);
            assert.ok(hits[0].face.normal.z*sign<0,`${id} lining orientation`);
          }
          const legTop=new THREE.Vector3().fromBufferAttribute(p,p.count-16).add(new THREE.Vector3().fromBufferAttribute(p,p.count-12)).multiplyScalar(.5);
          const ring=end==='Left'?0:(loop.geometry.attributes.position.count-8)/8-1;
          const loopRoot=new THREE.Vector3().fromBufferAttribute(loop.geometry.attributes.position,ring*8)
            .add(new THREE.Vector3().fromBufferAttribute(loop.geometry.attributes.position,ring*8+4)).multiplyScalar(.5);
          assert.ok(legTop.distanceTo(loopRoot)<1e-7,`${id} loop joins anchor`);
        }
      }
      state.dispose();
    }
  }
});

test('tall rounded handles gather inward smoothly while their ribbon edges remain separate at legal extremes',()=>{
  const center=(p,i)=>new THREE.Vector3().fromBufferAttribute(p,i*8).add(new THREE.Vector3().fromBufferAttribute(p,i*8+4)).multiplyScalar(.5);
  for(const id of ['small','sgak_s','kids','poly_v','poly_h'])for(const config of roundedHandleCases(id)){
    const state=model(config),p=state.bag.getObjectByName('handlesLoopFront').geometry.attributes.position,rings=(p.count-8)/8;
    const photo=PRODUCT3D_PROFILES[id].defaultHandle;
    if(config.dimensions.width===PRODUCT3D_PROFILES[id].dimensions.width
      &&config.handle.width===photo.width&&config.handle.drop===photo.drop&&config.handle.gap===photo.gap){
      const atHalf=left=>{
        let point,error=Infinity;
        for(let i=0;i<rings;i++){
          const c=center(p,i);if((c.x<0)!==left)continue;
          const e=Math.abs(c.y-(config.dimensions.height+config.handle.drop*.5)*MM_TO_SCENE);
          if(e<error){point=c;error=e;}
        }
        return point;
      };
      const width=atHalf(false).x-atHalf(true).x;
      if(['sgak_s','kids'].includes(id))assert.ok(width<config.handle.gap*.94*MM_TO_SCENE,`${id} long cloth sides gather inward through their lower half`);
      else assert.ok(width>config.handle.gap*.7*MM_TO_SCENE,`${id} retains its broad shoulder/bridge opening`);
    }
    assert.deepEqual(ribbonSelfIntersections(state.bag.getObjectByName('handlesLoopFront').geometry),[],`${id} real turned cloth triangles never pass through each other`);
    assert.ok(state.bag.getObjectByName('handlesLoopFront').geometry.boundingBox.min.z>0,`${id} front tape clears the rear tape`);
    const g=state.bag.getObjectByName('handlesLoopFront').geometry,uv=g.attributes.uv;let length=0;
    for(let i=0;i<rings;i++){
      const a=new THREE.Vector3().fromBufferAttribute(p,i*8),b=new THREE.Vector3().fromBufferAttribute(p,i*8+1),c=new THREE.Vector3().fromBufferAttribute(p,i*8+3);
      assert.ok(Math.abs(a.distanceTo(b)-config.handle.width*MM_TO_SCENE)<2e-7);
      assert.ok(Math.abs(b.distanceTo(c)-config.handle.thickness*MM_TO_SCENE)<2e-7);
      if(i)length+=ribbonCenter(g,i).distanceTo(ribbonCenter(g,i-1));
      assert.ok(Math.abs(uv.getX(i*8+1)-config.handle.width*MM_TO_SCENE)<1e-8,'the cloth selvedge spans the complete physical ribbon width');
      assert.ok(Math.abs(uv.getY(i*8)-length)<3e-7,'lengthwise texture coordinates remain continuous within Float32 precision through folded shoulders');
    }
    assert.ok(state.bag.userData.metrics.triangleCount<25_000);state.dispose();
  }
});

test('the Small actual cloth silhouette keeps a long flat bridge and almost square inner shoulder corners',()=>{
  const config=normalizeConfig(createDefaultConfig('small')),state=model(config);
  for(const side of ['Front','Back']){
    const g=state.bag.getObjectByName(`handlesLoop${side}`).geometry,h=config.dimensions.height;
    const at=y=>projectedRibbonSpans(g,(h+y)*MM_TO_SCENE);
    const lower=at(60),upper=at(75),nearLip=at(78),bridge=at(config.handle.drop-.1);
    assert.equal(lower.length,2);assert.equal(upper.length,2);assert.equal(nearLip.length,2);
    const gap=spans=>(spans[1][0]-spans[0][1])/MM_TO_SCENE;
    assert.ok(Math.abs(gap(lower)-80)<3,'the photographed opening remains about80mm wide');
    assert.ok(Math.abs(gap(upper)-gap(lower))<3,'the actual inner edges stay nearly vertical up to the small shoulder corner');
    assert.ok(gap(nearLip)>70,'the opening does not close through a large semicircular inner corner');
    assert.equal(bridge.length,1);
    const span=(bridge[0][1]-bridge[0][0])/MM_TO_SCENE;
    assert.ok(span>config.handle.gap*.5&&span<config.handle.gap*.75,'the complete outer ribbon has a long, nearly level bridge rather than a round U apex');
    assert.ok(Math.abs(g.boundingBox.max.y-(h+config.handle.drop)*MM_TO_SCENE)<2e-7);
  }
  state.dispose();
});

test('the tumbler photograph gap fits complete inside anchors close to the opened mouth corners',()=>{
  const config=normalizeConfig(createDefaultConfig('tumbler')),state=model(config);
  assert.equal(config.handle.gap,158);assert.equal(config.handle.width,20);
  const lining=['liningFront','liningBack','liningLeft','liningRight'].map(name=>state.bag.getObjectByName(name));
  for(const side of ['Front','Back'])for(const end of ['Left','Right']){
    const sign=side==='Front'?1:-1,p=state.bag.getObjectByName(`handle${side}${end}`).geometry.attributes.position;
    for(let ring=0;ring<25;ring++)for(const offset of [0,1,3,5]){
      const point=new THREE.Vector3().fromBufferAttribute(p,ring*8+offset);
      const hit=new THREE.Raycaster(point,new THREE.Vector3(0,0,sign)).intersectObjects(lining)[0];
      assert.ok(hit&&hit.face.normal.z*sign<0&&hit.distance>.2*MM_TO_SCENE,
        'the full edge attachment is safely behind actual lining rather than an exterior corner');
    }
  }
  const sides=state.bag.getObjectByName('sideRight').geometry.attributes.position,upperWidths=[];
  for(let row=0;row<sides.count;row+=23){
    if(sides.getY(row)<(config.dimensions.height-85)*MM_TO_SCENE)continue;
    let width=0;for(let i=0;i<23;i++)width=Math.max(width,sides.getX(row+i));upperWidths.push(width);
  }
  for(let i=1;i<upperWidths.length;i++)assert.ok(Math.abs(upperWidths[i]-upperWidths[i-1])<2*MM_TO_SCENE,
    'upper mouth corners open gradually instead of making a sudden isolated shoulder bulge');
  state.dispose();
});

test('all ten photographed handle centreline paths retain a safe folded cloth shell and their distinct crowns',()=>{
  for(const [id,profile] of Object.entries(PRODUCT3D_PROFILES)){
    if(!profile.handleDrape?.centerlineKnots)continue;
    const config=normalizeConfig(createDefaultConfig(id)),state=model(config);
    for(const side of ['Front','Back']){
      const g=state.bag.getObjectByName(`handlesLoop${side}`).geometry;
      assert.deepEqual(ribbonSelfIntersections(g),[],`${id} ${side}: photographed folds have no cloth penetration`);
      assert.ok(Math.abs(g.boundingBox.max.y-(config.dimensions.height+config.handle.drop)*MM_TO_SCENE)<2e-7);
      assert.ok(side==='Front'?g.boundingBox.min.z>0:g.boundingBox.max.z<0,`${id} two full-width loops remain separated`);
      assert.ok(g.boundingBox.min.y>=config.dimensions.height*MM_TO_SCENE-1e-7,`${id} loop emerges through its inside mouth anchor`);
      if(id==='small'){
        const centres=Array.from({length:ribbonRings(g)},(_,i)=>ribbonCenter(g,i));
        const rise=Math.max(...centres.map(p=>p.y))-config.dimensions.height*MM_TO_SCENE;
        const bridge=centres.filter(p=>p.y>=config.dimensions.height*MM_TO_SCENE+rise*.95);
        const span=Math.max(...bridge.map(p=>p.x))-Math.min(...bridge.map(p=>p.x));
        assert.ok(span>config.handle.gap*.35*MM_TO_SCENE,'the Small photograph keeps a broad flat bridge instead of a half-gap semicircle');
      }
    }
    state.dispose();
  }
});

test('front and rear artwork retain their millimetres, follow every product cloth and clip the folded silhouette',()=>{
  const texture=new THREE.Texture();
  for(const id of Object.keys(PRODUCT3D_PROFILES)){
    const config=normalizeConfig({...createDefaultConfig(id),options:{...createDefaultConfig(id).options,doubleSided:true}}),state=model(config);
    for(const front of [true,false]){
      const surface=front?frontSurfaceMM:backSurfaceMM,side=front?'front':'back',sign=front?1:-1;
      for(const [x,y] of [[0,0],[config.dimensions.width*.2,config.dimensions.height*.1]]){
        const point=surface(x,y,config);
        assert.equal(point.x,sign*x*MM_TO_SCENE);assert.equal(point.y,(config.dimensions.height/2+y)*MM_TO_SCENE);
        assert.ok(point.normal.z*sign>0);assert.notEqual(point.visible,false);
        const target=bodyMeshes(state.bag).slice(0,4),pocket=front&&state.bag.getObjectByName('frontPocket');
        if(pocket)target.push(pocket);state.bag.updateMatrixWorld(true);
        const hit=new THREE.Raycaster(new THREE.Vector3(point.x,point.y,sign),new THREE.Vector3(0,0,-sign)).intersectObjects(target)[0];
        assert.ok(hit,`${id} ${side} printable cloth exists`);
        assert.ok(Math.abs(hit.point.z-point.z)<1*MM_TO_SCENE,`${id} ${side} artwork conforms to actual cloth`);
      }
      config.print[side]={...config.print[side],width:config.dimensions.width+40,height:config.dimensions.height+40,x:0,y:0};
      const ink=createPrintMesh(config,texture,side);assert.ok(ink);
      const p=ink.geometry.attributes.position,uv=ink.geometry.attributes.uv;
      for(const i of ink.geometry.index.array){const x=sign*(p.getX(i)/MM_TO_SCENE),y=p.getY(i)/MM_TO_SCENE-config.dimensions.height/2;
        const rawX=(uv.getX(i)-.5)*config.print[side].width,rawY=(uv.getY(i)-.5)*config.print[side].height;
        const inside=surface(rawX,rawY,config).visible!==false||[-1e-4,1e-4].some(dx=>[-1e-4,1e-4].some(dy=>surface(rawX+dx,rawY+dy,config).visible!==false));
        assert.ok(inside,`${id} artwork mask ${rawX},${rawY}`);
        assert.ok(Math.abs(x-rawX)<.66&&Math.abs(y-rawY)<.66,'only the fixed ink surface offset moves projected coordinates');}
      disposePrintMesh(ink);
    }
    state.dispose();
  }
  texture.dispose();
});

test('allowed option combinations keep pockets, labels and real cross hardware inside the catalog geometry budget',()=>{
  for(const [id,profile] of Object.entries(PRODUCT3D_PROFILES)){
    const base=createDefaultConfig(id),config=normalizeConfig({...base,options:{...base.options,...Object.fromEntries(profile.allowedOptions.map(k=>[k,true]))}}),state=model(config);
    assert.ok(state.bag.userData.metrics.triangleCount<25_000,`${id}: ${state.bag.userData.metrics.triangleCount}`);
    if(config.options.crossStrap){assert.ok(state.bag.getObjectByName('crossStrapAdjuster'));assert.ok(Math.abs(state.bag.userData.metrics.crossStrap.centerlineLengthMm-config.crossStrap.length)<.001);}
    if(config.options.innerPocketPrint){
      const layout=getInnerPocketLayout(config),lining=['liningFront','liningBack','liningLeft','liningRight'].map(n=>state.bag.getObjectByName(n));
      for(const [x,y] of [[0,0],[layout.width*.35,-layout.height*.35],[0,layout.height*.4]]){
        const p=innerPocketSurfaceMM(x,y,config);assert.notEqual(p.visible,false,id);
        for(const sign of [-1,1])assert.ok(new THREE.Raycaster(new THREE.Vector3(p.x,p.y,p.z),new THREE.Vector3(0,0,sign)).intersectObjects(lining)[0],`${id} hanging pocket clears lining`);
      }
    }
    if(profile.category==='poly')assert.equal(state.bag.getObjectByName('nameTag').userData.location,'inside-back-right');
    state.dispose();
  }
});
