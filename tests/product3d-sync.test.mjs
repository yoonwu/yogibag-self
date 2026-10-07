import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDailyConfig, createDefaultConfig, PRODUCT3D_PROFILES } from '../assets/product3d/config.mjs';
import { configFrom2D, snapshotFrom3D, SHARED_OPTIONS } from '../assets/product3d/sync.mjs';

const image = 'data:image/png;base64,AA==';
function snapshot() {
  return { schemaVersion: 1, productId: 'daily', legacyToken: 'editable-42',
    dimensions: {width:360,height:360,depth:100}, body: {color:'#5f82a8',fabricId:'linen'},
    handle: {color:'#f3f1ec'}, options: ['안주머니','안주머니인쇄','지퍼','크로스끈','이름표','OPP개별포장','양면인쇄'],
    twoSided:true,currentSide:'back',print:{
      front:{image,imageName:'front.png',width:153.75,height:47.125,x:21.3,y:-33.7,rotation:0,enabled:true,lockAspect:true,appearance:'print'},
      back:{image,imageName:'back.png',width:0.8,height:2.6,x:-250,y:300,rotation:0,enabled:true,lockAspect:true,appearance:'print'},
      innerPocket:{image,imageName:'inner.png',width:42.5,height:21.25,x:4,y:-5,rotation:0,enabled:true,lockAspect:true,appearance:'print',partDimensions:{width:140,height:120}},
    }};
}

test('all faces, physical placement, colors, fabric and selected 2D options enter one 3D config', () => {
  const original = snapshot(), before=structuredClone(original), c=configFrom2D(original);
  assert.deepEqual(original,before);
  assert.deepEqual(c.dimensions, original.dimensions);
  assert.deepEqual(c.body, original.body); assert.equal(c.handle.color, original.handle.color);
  for (const side of ['front','back','innerPocket']) assert.deepEqual(c.print[side],original.print[side]);
  for (const [key,label] of Object.entries(SHARED_OPTIONS)) assert.equal(c.options[key],original.options.includes(label));
});

test('returning to 2D retains the original editable token and independent side artwork', () => {
  const previous=snapshot(), before=structuredClone(previous), config=configFrom2D(previous);
  config.dimensions.width=420; config.body.fabricId='denim'; config.handle.color='#171c28';
  config.print.front.width=201.5; config.print.front.rotation=25;
  config.print.back.x=12; config.options.crossStrap=false;
  const next=snapshotFrom3D(config,previous);
  assert.equal(next.legacyToken,previous.legacyToken); assert.equal(next.currentSide,'back');
  assert.equal(next.dimensions.width,420); assert.equal(next.body.fabricId,'denim');
  assert.equal(next.handle.color,'#171c28'); assert.equal(next.print.front.width,201.5);
  assert.equal(next.print.front.rotation,25); assert.equal(next.print.back.x,12);
  assert.ok(!next.options.includes('크로스끈')); assert.ok(next.options.includes('양면인쇄'));
  assert.deepEqual(previous,before);
});

test('single-sided view hides rather than deletes the back artwork', () => {
  const previous=snapshot(), config=configFrom2D(previous);
  config.options.doubleSided=false;
  const next=snapshotFrom3D(config,previous);
  assert.equal(next.currentSide,'front'); assert.equal(next.twoSided,false);
  assert.equal(next.print.back.image,image); assert.equal(next.print.back.imageName,'back.png');
  const restored=configFrom2D(next,config);
  assert.deepEqual(restored.print.back,next.print.back);
});

test('embroidery appearance roundtrips independently without replacing original images or poses',()=>{
  const original=snapshot();original.print.front.appearance='embroidery';original.print.innerPocket.appearance='embroidery';
  let config=configFrom2D(original);
  for(let i=0;i<4;i++) {
    const next=snapshotFrom3D(config,original);
    assert.deepEqual(next.print,original.print);
    config=configFrom2D(next,config);
  }
  config.print.front.appearance='print';
  const returned=snapshotFrom3D(config,original);
  assert.equal(returned.print.front.appearance,'print');
  assert.equal(returned.print.innerPocket.appearance,'embroidery');
  assert.equal(returned.print.front.image,original.print.front.image);
  const old=snapshot();delete old.print.front.appearance;
  assert.equal(configFrom2D(old).print.front.appearance,'print');
});

test('reopening uses 2D edits while preserving 3D-only strap dimensions', () => {
  const previous=createDailyConfig();previous.handle.drop=310;previous.handle.width=35;
  previous.print.front.image=image;previous.print.front.imageName='old.png';
  const s=snapshot();s.print.front.image=null;s.print.front.imageName='';s.options=['자석'];s.twoSided=false;
  const c=configFrom2D(s,previous);
  assert.equal(c.handle.drop,310);assert.equal(c.handle.width,35);
  assert.equal(c.print.front.image,null);assert.equal(c.options.zipper,false);
  assert.equal(c.options.magnet,true);assert.equal(c.options.innerPocketPrint,false);
});

test('custom cross strap length survives repeated 2D view switches and deselection', () => {
  let config=configFrom2D(snapshot());
  config.crossStrap.length=925.5;
  config.options.crossStrap=false;
  for (let i=0;i<10;i++) {
    const returned=snapshotFrom3D(config,snapshot());
    assert.equal(returned.crossStrap.length,925.5);
    assert.ok(!returned.options.includes('크로스끈'));
    config=configFrom2D(returned);
    assert.equal(config.crossStrap.length,925.5);
  }
  const old=snapshot();
  assert.equal(configFrom2D(old).crossStrap.length,800);
});

test('view switching preserves very small and large 2D designs without resizing', () => {
  for (const size of [0.5,2,600,1900]) {
    const s=snapshot();Object.assign(s.print.front,{width:size,height:size/2,x:700,y:-900});
    const c=configFrom2D(s), returned=snapshotFrom3D(c,s);
    assert.equal(returned.print.front.width,size);assert.equal(returned.print.front.height,size/2);
    assert.equal(returned.print.front.x,700);assert.equal(returned.print.front.y,-900);
  }
});

test('unsupported products cannot be silently converted into a daily design', () => {
  assert.throws(()=>configFrom2D({...snapshot(),productId:'other'}),/함께 편집/);
  assert.throws(()=>snapshotFrom3D({...createDefaultConfig(),productId:'other'}),/함께 편집/);
});

test('all twelve live 2D products retain their own dimensions, artwork, fabric and option policy through repeated roundtrips',()=>{
  for(const [id,profile] of Object.entries(PRODUCT3D_PROFILES).filter(([,profile])=>profile.category!=='sample')) {
    const original=snapshot();original.productId=id;original.legacyToken=`editable-${id}`;
    original.dimensions={...profile.dimensions};original.dimensions.width+=5;
    original.body={color:profile.category==='poly'?'#104727':'#5f82a8',fabricId:profile.category==='poly'?'basic':'linen'};
    original.handle.color=profile.category==='poly'?'#040000':'#c2141c';
    original.options=Object.values(SHARED_OPTIONS);
    let config=configFrom2D(original);
    for(let round=0;round<4;round++) {
      const returned=snapshotFrom3D(config,original);
      assert.equal(returned.productId,id);assert.equal(returned.legacyToken,original.legacyToken);
      assert.deepEqual(returned.dimensions,original.dimensions,id);
      assert.deepEqual(returned.body,original.body,id);assert.equal(returned.handle.color,original.handle.color);
      assert.deepEqual(returned.print,original.print,id);
      for(const [key,label] of Object.entries(SHARED_OPTIONS)) {
        assert.equal(returned.options.includes(label),profile.allowedOptions.includes(key),`${id}/${key}`);
      }
      for(const locked of profile.lockedOptions) assert.equal(config.options[locked],true);
      config=configFrom2D(returned,config);
    }
  }
});

test('switching product defaults never inherits another product structure or editable token',()=>{
  const previous=createDailyConfig();previous.handle.drop=310;previous.crossStrap.length=1200;
  const next=snapshot();next.productId='small';next.dimensions={...PRODUCT3D_PROFILES.small.dimensions};
  const changed=configFrom2D(next,previous),expected=createDefaultConfig('small');
  assert.equal(changed.handle.drop,expected.handle.drop);assert.equal(changed.crossStrap.length,800);
  assert.throws(()=>snapshotFrom3D(changed,snapshot()),/이전 가방/);
});

test('all three photo totes retain per-face artwork, removable pocket and linked or independent trim colors',()=>{
  for(const id of ['sample-two-line-large','sample-two-line-small','two-tone-kids']){
    const c=createDefaultConfig(id),s={...snapshot(),productId:id,dimensions:c.dimensions,
      body:{color:'#6789ab',fabricId:'linen'},handle:{color:'#112233'},bottomPanel:{...c.bottomPanel,color:'#445566',height:55},
      pocket:{...c.pocket,color:'#bc7788'},pocketEnabled:false};
    s.print.back.appearance='embroidery';
    let actual=configFrom2D(s);
    for(let i=0;i<5;i++){
      const next=snapshotFrom3D(actual,s);
      assert.equal(next.bottomPanel.height,55,id);
      assert.equal(next.body.color,id==='two-tone-kids'?'#ece6d9':'#6789ab',id);
      assert.equal(next.bottomPanel.color,id==='two-tone-kids'?'#445566':'#112233',id);
      assert.equal(next.handle.color,'#112233',id);
      assert.deepEqual(next.print,s.print,id);assert.equal(next.currentSide,'back');
      assert.equal(next.legacyToken,s.legacyToken);
      if(id!=='two-tone-kids'){assert.equal(next.pocketEnabled,false);assert.equal(next.pocket.color,'#bc7788');}
      actual=configFrom2D(next,actual);
    }
  }
});
