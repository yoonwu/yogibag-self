import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProductBridge } from '../assets/product3d/bridge.mjs';
import { createDefaultConfig, PRODUCT3D_PROFILES } from '../assets/product3d/config.mjs';
import { SHARED_OPTIONS } from '../assets/product3d/sync.mjs';

const clone = value => structuredClone(value);
function fixture() {
  const ids = Object.keys(PRODUCT3D_PROFILES).filter(id => PRODUCT3D_PROFILES[id].category !== 'sample');
  const snapshots = new Map(Object.keys(PRODUCT3D_PROFILES).map(id => {
    const c = createDefaultConfig(id);
    c.print.front.image = `data:image/png;base64,${Buffer.from(id).toString('base64')}`;
    return [id, { productId:id, dimensions:c.dimensions, body:c.body, handle:{color:c.handle.color},
      crossStrap:c.crossStrap,bottomPanel:c.bottomPanel,pocket:c.pocket,pocketEnabled:c.options.pocket, options:Object.entries(SHARED_OPTIONS).filter(([key])=>c.options[key]).map(([,label])=>label),
      print:c.print, currentSide:'front', twoSided:false, legacyToken:`token-${id}` }];
  }));
  const editors = [], messages = [], returnedURLs = [], applied = [];
  let current = 'daily', alive = 0, maxAlive = 0;
  const env = {
    currentProductId:()=>current, ready:async()=>{}, toast:message=>messages.push(message),
    selectProduct:async id=>{assert.ok(snapshots.has(id));current=id;},
    show2DURL:id=>returnedURLs.push(id),
    legacy:()=>({ exportDesign:async()=>clone(snapshots.get(current)), applyDesign:async value=>{
      assert.equal(value.productId,current);applied.push(clone(value));snapshots.set(current,clone(value));
    }}),
    load:async()=>[
      {createProduct3DEditor:hooks=>{
        alive++;maxAlive=Math.max(maxAlive,alive);
        const editor={hooks,config:clone(hooks.initialConfig),side:'front',disposed:false,
          async replaceConfig(config){assert.equal(config.productId,this.config.productId);this.config=clone(config);},
          open(){},openProduct(id){assert.equal(id,this.config.productId);},
          getPrintSide(){return this.side;},selectPrintSide(side){this.side=side;},getConfig(){return clone(this.config);},
          dispose(){assert.equal(this.disposed,false);this.disposed=true;alive--;}};
        editors.push(editor);return editor;
      }},
      {openConsultation(){}},
      {Product3DCatalog:new Map(Object.keys(PRODUCT3D_PROFILES).map(id=>[id,{}])),configForProduct:createDefaultConfig},
    ],
  };
  return {env,bridge:createProductBridge(env),ids,snapshots,editors,messages,returnedURLs,applied,
    setCurrent:id=>{current=id;},get alive(){return alive;},get maxAlive(){return maxAlive;}};
}

test('all twelve linked products preserve separate sessions while keeping only one live 3D editor',async()=>{
  const f=fixture();
  for(const id of f.ids) {
    f.setCurrent(id);assert.equal(await f.bridge.openProduct(id,{from2D:true}),true);
    const editor=f.editors.at(-1),image=editor.config.print.front.image;
    editor.config.print.front.width=123.75;editor.config.handle.width+=1;
    editor.hooks.onDesignChange(editor.config);
    await editor.hooks.onReturnTo2D(editor.config);
    assert.equal(f.snapshots.get(id).legacyToken,`token-${id}`);
    assert.equal(f.snapshots.get(id).print.front.image,image);
    assert.equal(f.snapshots.get(id).print.front.width,123.75);
    assert.equal(f.alive,1);
  }
  assert.equal(f.maxAlive,1);assert.equal(f.applied.length,12);
  f.setCurrent('small');await f.bridge.openProduct('small',{from2D:true});
  const reopened=f.editors.at(-1),initial=createDefaultConfig('small');
  assert.equal(reopened.config.handle.width,initial.handle.width+1,'3D-only dimensions survive disposal and reopening');
  assert.equal(reopened.config.print.front.width,123.75);
  assert.equal(reopened.config.print.front.image,f.snapshots.get('small').print.front.image);
  assert.equal(f.messages.length,0);
});

test('sample drafts remain separate from linked designs and other product tokens cannot be returned',async()=>{
  const f=fixture();await f.bridge.openProduct('daily',{from2D:true});
  const daily=f.editors.at(-1);
  f.setCurrent('small');
  await assert.rejects(daily.hooks.onReturnTo2D(daily.config),/현재 가방/);
  await f.bridge.openProduct('sample-two-line-large');
  const sample=f.editors.at(-1);sample.config.print.front.width=185;
  await f.bridge.openProduct('small',{from2D:true});
  assert.equal(sample.disposed,true);assert.equal(f.alive,1);
  await f.bridge.openProduct('sample-two-line-large');
  assert.equal(f.editors.at(-1).config.print.front.width,185);
  assert.equal(f.maxAlive,1);assert.equal(f.snapshots.get('daily').productId,'daily');
});

test('unsupported SKUs and mismatched 2D requests fail safely before editor creation',async()=>{
  const f=fixture();
  assert.equal(await f.bridge.openProduct('unsupported'),false);
  assert.equal(await f.bridge.openProduct('minja',{from2D:true}),false);
  assert.equal(f.editors.length,0);assert.equal(f.applied.length,0);
  assert.match(f.messages[0],/준비 중/);assert.match(f.messages[1],/현재 선택한/);
});

test('small and large two-tone drafts keep separate artwork and sizes while returning to the existing 2D bag',async()=>{
  const f=fixture();await f.bridge.openProduct('daily',{from2D:true});
  const original=clone(f.snapshots.get('daily'));
  await f.bridge.openProduct('sample-two-line-small');
  const small=f.editors.at(-1);
  assert.equal(small.hooks.onReturnTo2D,undefined);
  small.config.print.front.width=83.25;small.config.handle.color='#111111';
  await f.bridge.openProduct('sample-two-line-large');
  assert.equal(f.editors.at(-1).config.dimensions.width,480);
  assert.equal(f.editors.at(-1).config.print.front.width,100);
  await f.bridge.openProduct('sample-two-line-small');
  const reopened=f.editors.at(-1);
  assert.equal(reopened.config.dimensions.width,340);
  assert.equal(reopened.config.print.front.width,83.25);
  assert.equal(reopened.config.handle.color,'#111111');
  reopened.hooks.onClose();assert.deepEqual(f.returnedURLs,['daily']);
  assert.deepEqual(f.snapshots.get('daily'),original);assert.equal(f.maxAlive,1);
});

test('URL opening waits for the 2D startup selection before deciding which design to link',async()=>{
  const f=fixture();f.env.ready=async()=>f.setCurrent('tumbler');
  assert.equal(await f.bridge.openProduct('tumbler'),true);
  const editor=f.editors.at(-1);
  assert.equal(typeof editor.hooks.onReturnTo2D,'function');
  assert.equal(editor.config.productId,'tumbler');assert.equal(editor.config.options.zipper,true);
  await editor.hooks.onReturnTo2D(editor.config);
  assert.deepEqual(f.returnedURLs,['tumbler']);
});

test('3D picker visits every ordinary bag and restores its own artwork, options and 3D handle dimensions',async()=>{
  const f=fixture();await f.bridge.openProduct('daily',{from2D:true});
  const expected=new Map();
  for(const id of f.ids) {
    if(f.editors.at(-1).config.productId!==id) assert.equal(await f.editors.at(-1).hooks.onSelectProduct(id),true);
    const editor=f.editors.at(-1);
    assert.equal(typeof editor.hooks.onReturnTo2D,'function',id);
    const c=editor.config;
    c.print.front.width+=11.25;c.body.color='#6789ab';c.handle.width+=1;
    if(PRODUCT3D_PROFILES[id].allowedOptions.includes('innerPocket')) c.options.innerPocket=true;
    expected.set(id,clone(c));
  }
  for(const id of f.ids) {
    assert.equal(await f.editors.at(-1).hooks.onSelectProduct(id),true);
    const actual=f.editors.at(-1).config,wanted=expected.get(id);
    assert.equal(actual.print.front.image,wanted.print.front.image,id);
    assert.equal(actual.print.front.width,wanted.print.front.width,id);
    assert.equal(actual.handle.width,wanted.handle.width,id);
    assert.equal(actual.body.color,wanted.body.color,id);
    assert.equal(actual.options.innerPocket,wanted.options.innerPocket,id);
    assert.equal(f.snapshots.get(id).legacyToken,`token-${id}`);
  }
  const last=f.editors.at(-1);await last.hooks.onReturnTo2D(last.config);
  assert.deepEqual(f.returnedURLs,[last.config.productId],'internal 3D switches do not return to the 2D URL');
  assert.equal(f.maxAlive,1);assert.equal(f.messages.length,0);
});

test('3D picker preserves two-tone and linked bag drafts across sample/ordinary transitions',async()=>{
  const f=fixture();await f.bridge.openProduct('daily',{from2D:true});
  const daily=f.editors.at(-1);daily.config.print.front.width=127.5;daily.config.options.innerPocket=true;
  await daily.hooks.onSelectProduct('sample-two-line-small');
  const small=f.editors.at(-1);small.config.print.front.width=83.25;small.config.handle.color='#111111';
  await small.hooks.onSelectProduct('sample-two-line-large');
  const large=f.editors.at(-1);large.config.dimensions.width=500;
  await large.hooks.onSelectProduct('minja');
  const pouch=f.editors.at(-1);assert.equal(typeof pouch.hooks.onReturnTo2D,'function');
  await pouch.hooks.onSelectProduct('sample-two-line-small');
  assert.equal(f.editors.at(-1).config.print.front.width,83.25);
  assert.equal(f.editors.at(-1).config.handle.color,'#111111');
  await f.editors.at(-1).hooks.onSelectProduct('sample-two-line-large');
  assert.equal(f.editors.at(-1).config.dimensions.width,500);
  await f.editors.at(-1).hooks.onSelectProduct('daily');
  assert.equal(f.editors.at(-1).config.print.front.width,127.5);
  assert.equal(f.editors.at(-1).config.options.innerPocket,true);
  assert.equal(f.maxAlive,1);assert.equal(f.messages.length,0);
});

test('failed picker selection restores the original 2D product and leaves its 3D editor alive',async()=>{
  const f=fixture();await f.bridge.openProduct('daily',{from2D:true});
  const daily=f.editors.at(-1);daily.config.body.color='#123456';
  f.env.selectProduct=async id=>{f.setCurrent(id);if(id==='minja')throw new Error('image load failed');};
  await assert.rejects(daily.hooks.onSelectProduct('minja'),/image load failed/);
  assert.equal(f.env.currentProductId(),'daily');assert.equal(daily.disposed,false);
  assert.equal(f.snapshots.get('daily').body.color,'#123456');
  await daily.hooks.onReturnTo2D(daily.config);
  assert.equal(f.alive,1);
});

test('2D photo picker saves separate original artwork and resumes each custom bag as a linked 3D editor',async()=>{
  const f=fixture(),ids=['sample-two-line-large','sample-two-line-small','two-tone-kids','daily'];
  for(const id of ids){
    assert.equal(await f.bridge.select2DProduct(id),true);
    f.snapshots.get(id).print.front.width=63+ids.indexOf(id);
    assert.equal(await f.bridge.openProduct(id,{from2D:true}),true);
    const editor=f.editors.at(-1);
    assert.equal(typeof editor.hooks.onReturnTo2D,'function');
    editor.config.bottomPanel.height=52;
    await editor.hooks.onReturnTo2D(editor.config);
  }
  for(const id of ids){
    await f.bridge.select2DProduct(id);
    assert.equal(f.snapshots.get(id).print.front.width,63+ids.indexOf(id));
    assert.equal(f.snapshots.get(id).legacyToken,`token-${id}`);
    if(id!=='daily')assert.equal(f.snapshots.get(id).bottomPanel.height,52);
  }
  assert.equal(f.maxAlive,1);assert.equal(f.messages.length,0);
});

test('failed 2D photo picker rolls back the product and its original editable snapshot',async()=>{
  const f=fixture(),original=clone(f.snapshots.get('daily'));
  f.env.selectProduct=async id=>{f.setCurrent(id);if(id==='two-tone-kids')throw new Error('photo failed');};
  await assert.rejects(f.bridge.select2DProduct('two-tone-kids'),/photo failed/);
  assert.equal(f.env.currentProductId(),'daily');assert.deepEqual(f.snapshots.get('daily'),original);
  assert.equal(await f.bridge.select2DProduct('sample-two-line-small'),true,'failure releases the switching guard');
});
