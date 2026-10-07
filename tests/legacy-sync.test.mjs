import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLegacyDesignBridge, artworkTransform, multiplyAffine} from '../assets/product3d/legacy-sync.mjs';
import {createDefaultConfig, PRODUCT3D_PROFILES} from '../assets/product3d/config.mjs';
import {configFrom2D, snapshotFrom3D} from '../assets/product3d/sync.mjs';

const point=(m,x,y)=>({x:m[0]*x+m[2]*y+m[4],y:m[1]*x+m[3]*y+m[5]});
class Layer {
  constructor(name,width,height,matrix,props={}) { Object.assign(this,{name,width,height,matrix:[...matrix],visible:true,isUserObject:true,transformCalls:0},props); }
  set(values) { Object.assign(this,values);return this; }
  calcTransformMatrix() { return [...this.matrix]; }
  setCoords() {}
  getBoundingRect() {
    const p=[point(this.matrix,-this.width/2,-this.height/2),point(this.matrix,this.width/2,-this.height/2),point(this.matrix,-this.width/2,this.height/2),point(this.matrix,this.width/2,this.height/2)];
    const left=Math.min(...p.map(p=>p.x)),top=Math.min(...p.map(p=>p.y));
    return {left,top,width:Math.max(...p.map(p=>p.x))-left,height:Math.max(...p.map(p=>p.y))-top};
  }
  clone(callback) { callback(new Layer(this.name,this.width,this.height,this.matrix,{isUserObject:this.isUserObject,uploadId:this.uploadId,legacyPrintPart:this.legacyPrintPart})); }
  getElement() { return {naturalWidth:this.width,naturalHeight:this.height,width:this.width,height:this.height}; }
}
function fixture({currentSide='front',inner=true,productId='daily'}={}) {
  const rendered=[];
  const fabric={util:{applyTransformToObject(object,matrix){object.matrix=[...matrix];object.transformCalls++;}},
    StaticCanvas:class {
      constructor(_,options) {this.options=options;this.objects=[];}
      setViewportTransform(matrix){this.viewport=matrix;}
      add(object){this.objects.push(object);}
      renderAll(){}
      toDataURL(){const payload={background:this.options.backgroundColor,names:this.objects.map(o=>o.name),allUser:this.objects.every(o=>o.isUserObject),viewport:this.viewport};rendered.push(payload);return 'data:image/png;base64,'+Buffer.from(JSON.stringify(payload)).toString('base64');}
      dispose(){}
    },Image:{fromURL(url,callback){callback(new Layer('3D replacement',200,100,[1,0,0,1,0,0]));}}};
  const front=[new Layer('editable front text',50,20,[1,0,0,1,200,320]),new Layer('original front upload',40,30,[1,0,0,1,275,350],{uploadId:'front-original',isCustomerUpload:true})];
  const back=[new Layer('editable back text',70,25,[1,0,0,1,260,390],{uploadId:'back-original'})];
  const innerObjects=inner?[new Layer('inner pocket logo',30,20,[1,0,0,1,70,55],{legacyPrintPart:'innerPocket',uploadId:'inner-original'})]:[];
  const body=new Layer('BAG BODY',300,300,[1,0,0,1,250,350],{isUserObject:false,left:100,top:200,scaleX:1,scaleY:1});
  const ip=new Layer('INNER BAG BACKGROUND',120,100,[1,0,0,1,72,62],{isUserObject:false});
  let objects=[body,...(currentSide==='front'?front:back),...innerObjects];
  const state={currentBag:{id:productId},bagBodyRect:body,bagBodyColor:null,bagFabricId:'basic',webbingColor:null,bagTexture:null,polyBodyKey:'black',
    options:inner?['안주머니','안주머니인쇄']:[],twoSided:true,currentSide,sideDesigns:{front,back},
    optionVisuals:inner?{'안주머니인쇄':ip}:{},isRestoring:false,drawBagPending:false,
    printAppearances:{front:'print',back:'print',innerPocket:'print'}};
  state.canvas={getObjects:()=>objects,discardActiveObject(){}};
  let dimensions={...createDefaultConfig(productId).dimensions},crossStrap={length:800},saves=0,locked=0,restores=0;
  const originalUploads=new Map([['front-original',{dataURL:'original FRONT',name:'front.png'}],['back-original',{dataURL:'original BACK',name:'back.png'}],['inner-original',{dataURL:'original INNER',name:'inner.png'}]]);
  const env={fabric,rendered,originalUploads,validOptions:['안주머니','안주머니인쇄','똑딱이','지퍼','자석','크로스끈','이름표','OPP개별포장'],designProps:[],
    getState:()=>state,getOpaqueBBox:()=>({x:0,y:0,w:300,h:300}),boundsOf:o=>o.getBoundingRect(),isInnerPocketObj:o=>o.legacyPrintPart==='innerPocket',
    getDimensions:()=>({...dimensions}),setDimensions:value=>{dimensions={...value};},defaultBodyColor:()=> '#ece6d9',newUploadId:()=> 'new-original',
    getCrossStrap:()=>({...crossStrap}),setCrossStrap:value=>{crossStrap={...value};},
    getPrintAppearances:()=>({...state.printAppearances}),setPrintAppearances:value=>{state.printAppearances={...value};},
    getBodyColor:s=>s.currentBag.id.startsWith('poly_')&&!s.bagBodyColor?{black:'#1a1a1a',navy:'#1a2a4a',green:'#104727'}[s.polyBodyKey]:s.bagBodyColor,
    getHandleColor:s=>s.webbingColor||(s.currentBag.id.startsWith('poly_')?'#040000':'#ece6d9'),
    setRestoring:value=>{state.isRestoring=value;},
    captureState:()=>({appearance:{bagBodyColor:state.bagBodyColor,bagFabricId:state.bagFabricId,webbingColor:state.webbingColor,options:[...state.options],twoSided:state.twoSided,printAppearances:{...state.printAppearances}},objects:[...objects],front:[...state.sideDesigns.front],back:[...state.sideDesigns.back],matrices:objects.map(object=>[object,[...object.matrix]])}),
    restoreState:async before=>{Object.assign(state,before.appearance);objects=before.objects;state.sideDesigns={front:before.front,back:before.back};before.matrices.forEach(([object,matrix])=>{object.matrix=matrix;});state.isRestoring=false;restores++;},
    applyAppearance:async({body,handle,options,twoSided,originalAppearance,preserveBody,preserveHandle})=>{
      state.bagBodyColor=preserveBody?originalAppearance.bodyColor:body.color;state.bagFabricId=body.fabricId;
      state.webbingColor=preserveHandle?originalAppearance.handleColor:handle.color;state.options=options;state.twoSided=twoSided;
      state.drawBagPending=true;
      setTimeout(()=>{state.drawBagPending=false;state.optionVisuals=options.includes('안주머니인쇄')?{'안주머니인쇄':ip}:{};},1);
    },
    installArtwork:(parts,side)=>{state.sideDesigns.front=parts.front;state.sideDesigns.back=parts.back;state.currentSide=side;objects=[body,...parts[side],...parts.innerPocket];},
    refreshUI(){},saveState(){saves++;},lockUI(){locked++;return()=>{locked--;};},
  };
  return {api:createLegacyDesignBridge(env),env,state,front,back,innerObjects,body,ip,rendered,
    get objects(){return objects;},get saves(){return saves;},get locked(){return locked;},get restores(){return restores;}};
}

test('export includes every editable front/back layer and separates inner artwork without bag pixels',async()=>{
  const f=fixture({currentSide:'back'}),objects=[...f.objects],snapshot=await f.api.exportDesign();
  assert.equal(snapshot.currentSide,'back');assert.equal(snapshot.body.color,'#ece6d9');
  assert.equal(snapshot.dimensions.width,360);assert.ok(snapshot.options.includes('양면인쇄'));
  const names=side=>JSON.parse(Buffer.from(snapshot.print[side].image.split(',')[1],'base64')).names;
  assert.deepEqual(names('front'),['editable front text','original front upload']);
  assert.deepEqual(names('back'),['editable back text']);assert.deepEqual(names('innerPocket'),['inner pocket logo']);
  assert.ok(f.rendered.every(r=>r.background===''&&r.allUser));assert.deepEqual(f.objects,objects);
  assert.equal(f.env.originalUploads.get('front-original').dataURL,'original FRONT');
  assert.deepEqual(snapshot.print.innerPocket.partDimensions,{width:140,height:120});
});

test('all twelve products roundtrip editable originals with their exact dimensions and locked option policy',async()=>{
  for(const [id,profile] of Object.entries(PRODUCT3D_PROFILES).filter(([,profile])=>profile.category!=='sample')) {
    const f=fixture({productId:id,inner:profile.category!=='pouch'});
    const original=await f.api.exportDesign();
    const config=configFrom2D(original);
    const returned=snapshotFrom3D(config,original);
    await f.api.applyDesign(returned);
    const next=await f.api.exportDesign();
    assert.deepEqual(next.dimensions,profile.dimensions,id);
    assert.deepEqual(next.print,original.print,id);
    assert.equal(f.state.sideDesigns.front[0],f.front[0],id);
    assert.equal(f.state.sideDesigns.back[0],f.back[0],id);
    assert.equal(f.env.originalUploads.get('front-original').dataURL,'original FRONT');
    if(profile.category==='pouch') assert.deepEqual(f.state.options,['지퍼']);
    if(profile.category==='poly') {
      assert.ok(f.state.options.includes('이름표'));assert.ok(!f.state.options.includes('안주머니'));
      assert.equal(original.body.color,'#1a1a1a');assert.equal(original.handle.color,'#040000');
    }
  }
});

test('embroidery metadata returns to editable layers while raw artwork remains reversible',async()=>{
  const f=fixture(),original=await f.api.exportDesign();
  original.print.front.appearance='embroidery';original.print.innerPocket.appearance='embroidery';
  await f.api.applyDesign(original);
  assert.equal(f.state.printAppearances.front,'embroidery');assert.equal(f.state.printAppearances.back,'print');
  assert.equal(f.state.printAppearances.innerPocket,'embroidery');
  const stitched=await f.api.exportDesign();
  assert.equal(stitched.print.front.image,original.print.front.image);
  assert.equal(stitched.print.front.appearance,'embroidery');
  assert.equal(f.state.sideDesigns.front[0],f.front[0]);
  assert.equal(f.env.originalUploads.get('front-original').dataURL,'original FRONT');
  f.state.printAppearances.front='print';
  const restored=await f.api.exportDesign();
  assert.equal(restored.print.front.appearance,'print');
  assert.equal(restored.print.front.image,original.print.front.image);
  assert.equal(restored.print.innerPocket.appearance,'embroidery');
});

test('canonical artwork and inner-pocket frames are isolated when switching product identities',async()=>{
  const f=fixture();let snapshot=await f.api.exportDesign();
  snapshot.print.front.rotation=45;snapshot.print.innerPocket.rotation=30;
  await f.api.applyDesign(snapshot);
  const canonical=await f.api.exportDesign();
  f.state.currentBag={id:'small'};f.env.setDimensions(PRODUCT3D_PROFILES.small.dimensions);
  const other=await f.api.exportDesign();
  assert.equal(other.print.front.rotation,0);assert.notDeepEqual(other.print.front,canonical.print.front);
  f.state.currentBag={id:'daily'};f.env.setDimensions(PRODUCT3D_PROFILES.daily.dimensions);
  const again=await f.api.exportDesign();
  assert.deepEqual(again.print,canonical.print,'another SKU must not evict this artwork coordinate basis');
  f.state.currentBag={id:'sgak_s'};f.env.setDimensions(PRODUCT3D_PROFILES.sgak_s.dimensions);
  f.state.options=[];f.state.optionVisuals={};
  await assert.rejects(f.api.exportDesign(),/안주머니 인쇄 영역/,'a new product cannot borrow another pocket frame');
  await assert.rejects(f.api.applyDesign(canonical),/현재 가방/);
});

test('unsupported current products and tokens from another product cannot be applied',async()=>{
  const f=fixture({inner:false}),snapshot=await f.api.exportDesign();
  f.state.currentBag={id:'small'};f.env.setDimensions(PRODUCT3D_PROFILES.small.dimensions);
  const other=await f.api.exportDesign();
  await assert.rejects(f.api.applyDesign({...other,legacyToken:snapshot.legacyToken}),/원본 가방/);
  f.state.currentBag={id:'unknown-sku'};
  await assert.rejects(f.api.exportDesign(),/준비 중/);
});

test('view-only roundtrip preserves object identities, editable text matrices and original color nulls',async()=>{
  const f=fixture(),snapshot=await f.api.exportDesign(),matrices=[...f.front,...f.back,...f.innerObjects].map(o=>[...o.matrix]);
  await f.api.applyDesign(snapshot);
  [...f.front,...f.back,...f.innerObjects].forEach((object,i)=>{assert.deepEqual(object.matrix,matrices[i]);assert.equal(object.transformCalls,0);});
  assert.equal(f.state.sideDesigns.front[0],f.front[0]);assert.equal(f.state.sideDesigns.back[0],f.back[0]);
  assert.equal(f.state.bagBodyColor,null);assert.equal(f.state.webbingColor,null);
  assert.equal(f.env.originalUploads.size,3);assert.equal(f.saves,1);assert.equal(f.locked,0);assert.equal(f.api.isReady(),true);
});

test('same composite applies size, position and rotation to original layers as one reversible group',async()=>{
  const f=fixture({inner:false}),snapshot=await f.api.exportDesign(),baseline=snapshot.print.front;
  const source=[...f.front[0].matrix];snapshot.print.front={...baseline,width:baseline.width*2,height:baseline.height*2,x:20,y:-30,rotation:90};
  const boxes=f.front.map(o=>o.getBoundingRect()),left=Math.floor(Math.min(...boxes.map(b=>b.left)))-1,top=Math.floor(Math.min(...boxes.map(b=>b.top)))-1;
  const bounds={left,top,width:Math.ceil(Math.max(...boxes.map(b=>b.left+b.width)))-left+1,height:Math.ceil(Math.max(...boxes.map(b=>b.top+b.height)))-top+1};
  const expected=multiplyAffine(artworkTransform(bounds,snapshot.print.front,{cx:250,cy:350,mmX:1.2,mmY:1.2}),source);
  await f.api.applyDesign(snapshot);
  f.front[0].matrix.forEach((value,i)=>assert.ok(Math.abs(value-expected[i])<1e-9));
  assert.equal(f.state.sideDesigns.front[0],f.front[0]);assert.equal(f.front[0].name,'editable front text');assert.equal(f.env.originalUploads.size,3);
});

test('changed image replaces only the requested face and registers the full new original',async()=>{
  const f=fixture(),snapshot=await f.api.exportDesign(),body=f.body,back=f.back[0],inner=f.innerObjects[0];
  snapshot.print.front={...snapshot.print.front,image:'data:image/png;base64,ZmFrZQ==',imageName:'new-art.png',width:80,height:40,x:15,y:-10,rotation:0};
  await f.api.applyDesign(snapshot);
  assert.equal(f.state.sideDesigns.front.length,1);assert.equal(f.state.sideDesigns.front[0].name,'3D replacement');
  assert.equal(f.state.sideDesigns.back[0],back);assert.ok(f.objects.includes(inner));assert.ok(f.objects.includes(body));
  assert.equal(f.env.originalUploads.get('new-original').dataURL,snapshot.print.front.image);
  assert.equal(f.env.originalUploads.get('front-original').dataURL,'original FRONT');
  assert.deepEqual(f.state.sideDesigns.front[0].matrix,[80/200/1.2,0,0,40/100/1.2,262.5,350+10/1.2]);
});

test('custom dimensions and all shared options survive another export; disabled back and inner art stay editable',async()=>{
  const f=fixture(),snapshot=await f.api.exportDesign();
  snapshot.dimensions={width:420,height:320,depth:130};snapshot.body={color:'#ff0000',fabricId:'denim'};snapshot.handle={color:'#abcdef'};
  snapshot.twoSided=false;snapshot.options=['똑딱이','이름표','OPP개별포장','NOT AN OPTION'];snapshot.print.back.enabled=false;snapshot.print.innerPocket.enabled=false;
  await f.api.applyDesign(snapshot);
  assert.equal(f.state.sideDesigns.back[0],f.back[0]);assert.equal(f.back[0].visible,false);assert.equal(f.innerObjects[0].visible,false);
  const again=await f.api.exportDesign();
  assert.deepEqual(again.dimensions,snapshot.dimensions);assert.deepEqual(again.body,snapshot.body);assert.equal(again.handle.color,'#abcdef');
  assert.deepEqual(again.options,['똑딱이','이름표','OPP개별포장']);assert.ok(again.print.back.image);assert.equal(again.print.back.enabled,false);
  assert.ok(again.print.innerPocket.image);assert.equal(again.print.innerPocket.enabled,false);
});

test('invalid or stale payload leaves artwork untouched; a redraw failure restores prior state and releases UI',async()=>{
  const f=fixture(),snapshot=await f.api.exportDesign(),objects=[...f.objects];
  await assert.rejects(f.api.applyDesign({...snapshot,dimensions:{width:0,height:360,depth:100}}),/가방 크기/);
  assert.deepEqual(f.objects,objects);assert.equal(f.locked,0);
  f.env.applyAppearance=async()=>{throw Error('draw failed');};
  await assert.rejects(f.api.applyDesign(snapshot),/draw failed/);assert.equal(f.restores,1);assert.deepEqual(f.objects,objects);assert.equal(f.state.isRestoring,false);assert.equal(f.locked,0);
  f.state.sideDesigns.back=[];
  await assert.rejects(f.api.applyDesign(snapshot),/2D 디자인이 변경/);assert.equal(f.locked,0);
});

test('product draft restoration reinstalls editable layers only into an empty product view',async()=>{
  const f=fixture(),snapshot=await f.api.exportDesign();
  f.front[0].name='customer changed text';
  await assert.rejects(f.api.applyDesign(snapshot,{restoreProductDraft:true}),/2D 디자인이 변경/);
  f.front[0].name='editable front text';
  f.env.installArtwork({front:[],back:[],innerPocket:[]},'front');
  await assert.rejects(f.api.applyDesign(snapshot),/2D 디자인이 변경/);
  await f.api.applyDesign(snapshot,{restoreProductDraft:true});
  assert.equal(f.state.sideDesigns.front[0],f.front[0]);
  assert.equal(f.state.sideDesigns.front[1],f.front[1]);
  assert.equal(f.state.sideDesigns.back[0],f.back[0]);
  assert.ok(f.objects.includes(f.innerObjects[0]));
  assert.equal(f.env.originalUploads.get('front-original').dataURL,'original FRONT');
});

test('the latest draft for an untouched product retains original layers beyond the global token limit',async()=>{
  const f=fixture({inner:false}),daily=await f.api.exportDesign();
  f.env.installArtwork({front:[],back:[],innerPocket:[]},'front');
  f.state.currentBag={id:'minja'};f.env.setDimensions(PRODUCT3D_PROFILES.minja.dimensions);
  f.state.options=['지퍼'];f.state.optionVisuals={};
  for(let i=0;i<70;i++)await f.api.exportDesign();
  f.state.currentBag={id:'daily'};f.env.setDimensions(PRODUCT3D_PROFILES.daily.dimensions);
  await f.api.applyDesign(daily,{restoreProductDraft:true});
  assert.equal(f.state.sideDesigns.front[0],f.front[0]);
  assert.equal(f.state.sideDesigns.back[0],f.back[0]);
  assert.equal(f.env.originalUploads.get('front-original').dataURL,'original FRONT');
});

test('ten view roundtrips preserve exact canonical PNG, millimetres and rotations through body and print resizing',async()=>{
  const f=fixture(),originals={front:[...f.front],back:[...f.back],inner:[...f.innerObjects]};
  const backSource=[...f.back[0].matrix],backSourceBounds={left:224,top:376,width:72,height:28};
  let snapshot=await f.api.exportDesign();
  for(let round=0;round<10;round++) {
    snapshot.dimensions={width:round%2?360:420,height:round%3?340:360,depth:100+round};
    snapshot.print.front={...snapshot.print.front,width:150+round*.1,height:40+round*.2,x:round*.25,y:-round*.5,rotation:round%2?45:-30};
    snapshot.print.back={...snapshot.print.back,width:150,height:43.82,x:-.06,y:.61,rotation:45};
    snapshot.print.innerPocket={...snapshot.print.innerPocket,width:70,height:44.5,x:2,y:-3,rotation:round%2?45:0};
    const expected=structuredClone(snapshot);
    await f.api.applyDesign(snapshot);
    snapshot=await f.api.exportDesign();
    assert.deepEqual(snapshot.print,expected.print,`exact physical pose and PNG at round ${round+1}`);
    assert.deepEqual(snapshot.dimensions,expected.dimensions);
    assert.equal(f.state.sideDesigns.front[0],originals.front[0]);assert.equal(f.state.sideDesigns.back[0],originals.back[0]);assert.ok(f.objects.includes(originals.inner[0]));
    const backExpected=multiplyAffine(artworkTransform(backSourceBounds,expected.print.back,
      {cx:250,cy:350,mmX:expected.dimensions.width/300,mmY:expected.dimensions.height/300}),backSource);
    f.back[0].matrix.forEach((value,i)=>assert.ok(Math.abs(value-backExpected[i])<1e-9,`source basis applies once at round ${round+1}`));
    assert.equal(f.rendered.length,3,'view switches do not rerasterize unchanged originals');
  }
});

test('a new PNG keeps its full transparent canvas size and pose for ten roundtrips; a later 2D edit recomposites it',async()=>{
  const f=fixture();let snapshot=await f.api.exportDesign();
  snapshot.print.innerPocket={...snapshot.print.innerPocket,image:'data:image/png;base64,dHJhbnNwYXJlbnQgbWFyZ2lucw==',imageName:'full-canvas.png',width:70,height:35,x:4,y:-2,rotation:45};
  await f.api.applyDesign(snapshot);
  const expected=structuredClone(snapshot.print.innerPocket),replacement=f.objects.find(o=>o.name==='3D replacement');
  for(let round=0;round<10;round++) {
    snapshot=await f.api.exportDesign();assert.deepEqual(snapshot.print.innerPocket,expected);
    await f.api.applyDesign(snapshot);
  }
  assert.equal(f.rendered.length,3);assert.ok(replacement);
  const cos=Math.SQRT1_2,sin=Math.SQRT1_2;
  const expectedMatrix=[cos*70/200/(140/120),-sin*70/200/(120/100),sin*35/100/(140/120),cos*35/100/(120/100),72+4/(140/120),62+2/(120/100)];
  replacement.matrix.forEach((value,i)=>assert.ok(Math.abs(value-expectedMatrix[i])<1e-9,'new image has one 45-degree rotation after ten roundtrips'));
  replacement.name='real 2D edit';replacement.width=80;
  const changed=await f.api.exportDesign();
  assert.notEqual(changed.print.innerPocket.image,expected.image);assert.equal(changed.print.innerPocket.rotation,0);
  assert.equal(f.rendered.length,4,'only the edited part is rerasterized');
});

test('a text-only 2D content edit invalidates canonical data even when position and object identity are unchanged',async()=>{
  const f=fixture(),snapshot=await f.api.exportDesign();snapshot.print.back.rotation=45;snapshot.print.back.width=150;
  await f.api.applyDesign(snapshot);const retained=await f.api.exportDesign();assert.equal(retained.print.back.rotation,45);
  f.back[0].text='edited independently in 2D';
  const fresh=await f.api.exportDesign();assert.equal(fresh.print.back.rotation,0);assert.equal(f.rendered.length,4);
});

test('editable legacy snapshots retain cross length while off and roll it back after a failed apply',async()=>{
  const f=fixture();let snapshot=await f.api.exportDesign();
  assert.equal(snapshot.crossStrap.length,800);
  snapshot.crossStrap.length=937.5;
  snapshot.options=snapshot.options.filter(option=>option!=='크로스끈');
  for(let round=0;round<3;round++) {
    await f.api.applyDesign(snapshot);
    snapshot=await f.api.exportDesign();
    assert.equal(snapshot.crossStrap.length,937.5);
  }
  f.env.applyAppearance=async()=>{throw Error('draw failed');};
  await assert.rejects(f.api.applyDesign({...snapshot,crossStrap:{length:700}}),/draw failed/);
  assert.equal(f.env.getCrossStrap().length,937.5);
});
