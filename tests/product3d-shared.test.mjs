import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three/three.module.js';
import { createDefaultConfig, createDailyConfig, normalizeConfig, patchConfig, serializeConfig, parseConfig, DESIGN_OPTION_LABELS, PRINT_SIDES } from '../assets/product3d/config.mjs';
import { createPrintMesh, disposePrintMesh } from '../assets/product3d/print.mjs';
import { Product3DViewer } from '../assets/product3d/viewer.mjs';
import { Product3DEditor } from '../assets/product3d/editor.mjs';

const IMAGE = 'data:image/png;base64,AAAA';

test('legacy front-only drafts remain compatible and three independent prints round-trip', () => {
  const legacy = createDefaultConfig();
  delete legacy.print.back;
  delete legacy.print.innerPocket;
  const restored = normalizeConfig(legacy);
  assert.equal(restored.print.back.image, null);
  assert.equal(restored.options.doubleSided, false);
  for (const [index, side] of PRINT_SIDES.entries()) {
    restored.print[side] = { ...restored.print[side], image: IMAGE, imageName: `${side}.png`, width: 80 + index * 20,
      height: 40 + index * 10, x: index * 10, y: index ? -index * 10 : 0, rotation: index * 15 };
  }
  restored.options.doubleSided = true;
  restored.options.innerPocketPrint = true;
  const roundTrip = parseConfig(serializeConfig(restored));
  assert.deepEqual(roundTrip.print, restored.print);
  assert.equal(roundTrip.options.innerPocket, true);
  const single = patchConfig(roundTrip, 'options.doubleSided', false);
  assert.equal(single.print.back.image, IMAGE);
  assert.deepEqual(single.print.back, roundTrip.print.back);
});

test('switching into 3D preserves tiny, large and out-of-body artwork in millimetres', () => {
  const config = createDailyConfig();
  config.print.front = { ...config.print.front, image: IMAGE, width: 2, height: 0.5, x: 350, y: -480 };
  config.print.back = { ...config.print.back, image: IMAGE, width: 600, height: 720, x: -450, y: 380 };
  const restored = normalizeConfig(config);
  assert.deepEqual(restored.print.front, config.print.front);
  assert.deepEqual(restored.print.back, config.print.back);
});

test('all nine options persist while closures are exclusive and inner print requires a pocket', () => {
  const config = createDailyConfig();
  for (const key of Object.keys(DESIGN_OPTION_LABELS)) config.options[key] = true;
  const normalized = normalizeConfig(config);
  for (const key of Object.keys(DESIGN_OPTION_LABELS)) assert.equal(normalized.options[key], true);
  assert.equal(normalized.options.pocket, false);
  const magnet = patchConfig(normalized, 'options.magnet', true);
  assert.equal(magnet.options.magnet, true);
  assert.equal(magnet.options.snap, false);
  assert.equal(magnet.options.zipper, false);
  const zipper = patchConfig(magnet, 'options.zipper', true);
  assert.equal(zipper.options.zipper, true);
  assert.equal(zipper.options.magnet, false);
  const noInner = patchConfig(zipper, 'options.innerPocket', false);
  assert.equal(noInner.options.innerPocketPrint, false);
});

test('rear artwork is readable from the back with outward normals and independent millimetres', () => {
  const config = createDefaultConfig();
  config.options.doubleSided = true;
  config.print.back = { ...config.print.back, width: 120, height: 80, x: 30, y: 0 };
  const texture = new THREE.Texture();
  const mesh = createPrintMesh(config, texture, 'back');
  try {
    const position = mesh.geometry.attributes.position;
    const uv = mesh.geometry.attributes.uv;
    const normal = mesh.geometry.attributes.normal;
    const left = new THREE.Vector3().fromBufferAttribute(position, 0);
    const right = new THREE.Vector3().fromBufferAttribute(position, 12);
    assert.ok(left.x > right.x);
    assert.equal(uv.getX(0), 0);
    assert.equal(uv.getX(12), 1);
    assert.ok(normal.getZ(0) < -0.9);
    const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
    assert.ok(Math.abs(size.x * 1000 - 120) < 0.3);
    assert.ok(Math.abs(size.y * 1000 - 80) < 0.3);
    assert.equal(mesh.userData.printSide, 'back');
    assert.equal(mesh.material.map, texture);
    assert.equal(createPrintMesh({ ...config, options: { ...config.options, doubleSided: false } }, texture, 'back'), null);
  } finally { disposePrintMesh(mesh); texture.dispose(); }
});

test('inner pocket artwork is a separate inside layer instead of an outer-body composite', () => {
  const config = normalizeConfig({ ...createDailyConfig(), options: { innerPocketPrint: true } });
  const texture = new THREE.Texture();
  const mesh = createPrintMesh(config, texture, 'innerPocket');
  try {
    assert.ok(mesh);
    assert.equal(mesh.userData.printSide, 'innerPocket');
    const normal = mesh.geometry.attributes.normal;
    assert.ok(normal.getZ(0) > 0.9);
    const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
    assert.ok(Math.abs(size.x * 1000 - 70) < 0.3);
    assert.ok(Math.abs(size.y * 1000 - 40) < 0.3);
  } finally { disposePrintMesh(mesh); texture.dispose(); }
});

function canvasDocument() {
  return { createElement() {
    const canvas = { width: 0, height: 0, getContext: () => ({
      createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }), putImageData() {},
    }) };
    return canvas;
  } };
}

function mockedViewer() {
  const viewer = Object.create(Product3DViewer.prototype);
  Object.assign(viewer, {
    renderer: { domElement: { removeEventListener() {}, remove() {} }, dispose() {}, forceContextLoss() {} },
    scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(38, 1, 0.01, 12),
    contact: new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial()),
    controls: { target: new THREE.Vector3(), enableDamping: true, update() {}, removeEventListener() {}, dispose() {} },
    requestRender() {}, disposed: false,
  });
  return viewer;
}

test('front/back texture loads have separate stale guards and dispose abandoned/replaced uploads', async () => {
  const previousDocument = globalThis.document, previousImage = globalThis.Image;
  globalThis.document = canvasDocument();
  const loading = [];
  globalThis.Image = class {
    naturalWidth = 10;
    naturalHeight = 10;
    set src(value) { this.source = value; loading.push(this); }
  };
  const originalDispose = THREE.Texture.prototype.dispose;
  let textureDisposals = 0;
  THREE.Texture.prototype.dispose = function () { textureDisposals += 1; return originalDispose.call(this); };
  const viewer = mockedViewer();
  try {
    const config = createDailyConfig();
    config.options.doubleSided = true;
    config.print.front.image = IMAGE;
    config.print.back.image = 'data:image/png;base64,BBBB';
    const first = viewer.setConfig(config);
    const replacement = structuredClone(config);
    replacement.print.back.image = 'data:image/png;base64,CCCC';
    const second = viewer.setConfig(replacement);
    assert.equal(loading.length, 3);
    loading[1].onload();
    await Promise.resolve();
    assert.equal(viewer._printStates.back.source, null);
    assert.equal(textureDisposals, 1);
    loading[0].onload();
    loading[2].onload();
    await Promise.all([first, second]);
    assert.equal(viewer._printStates.front.source, IMAGE);
    assert.equal(viewer._printStates.back.source, replacement.print.back.image);
    assert.ok(viewer._printStates.front.mesh);
    assert.ok(viewer._printStates.back.mesh);
    const frontMesh = viewer.printMesh;
    replacement.print.back.width = 180;
    await viewer.setConfig(replacement);
    assert.equal(viewer.printMesh, frontMesh);
    assert.equal(viewer._printStates.back.mesh.userData.printWidthMm, 180);
    viewer.dispose();
    assert.equal(textureDisposals, 6); // stale + two uploads + body, cotton tape and hardware webbing
  } finally {
    if (!viewer.disposed) viewer.dispose();
    THREE.Texture.prototype.dispose = originalDispose;
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousImage === undefined) delete globalThis.Image; else globalThis.Image = previousImage;
  }
});

test('returning to 2D awaits one hook and keeps the editor open when applying the shared design fails', async () => {
  const editor = Object.create(Product3DEditor.prototype);
  let release, calls = 0;
  const gate = new Promise(resolve => { release = resolve; });
  Object.assign(editor, {
    visible: true, disposed: false, busy: false, config: createDailyConfig(), printSide: 'back',
    closeButton: { disabled: false }, dialog: { inert: false },
    async onReturnTo2D(config, metadata) { calls += 1; assert.equal(metadata.printSide, 'back'); await gate; },
    hide() { this.visible = false; }, setStatus(value) { this.lastStatus = value; },
  });
  const close = editor.close();
  assert.equal(editor.visible, true);
  assert.equal(editor.dialog.inert, true);
  assert.equal(await editor.close(), false);
  release();
  assert.equal(await close, true);
  assert.equal(calls, 1);
  assert.equal(editor.visible, false);
  editor.visible = true;
  editor.onReturnTo2D = async () => { throw new Error('shared apply failed'); };
  assert.equal(await editor.close(), false);
  assert.equal(editor.visible, true);
  assert.equal(editor.dialog.inert, false);
  assert.equal(editor.closeButton.disabled, false);
  assert.equal(editor.lastStatus, 'shared apply failed');
});

test('external config application is silent and linked editors reject a different product', async () => {
  const editor = Object.create(Product3DEditor.prototype);
  Object.assign(editor, {
    config: createDailyConfig(), productGeneration: 0, uploadGeneration: 0, linked: true,
    activateConfig(config, options) { this.config = config; this.lastNotify = options.notify; },
  });
  await editor.replaceConfig(createDailyConfig());
  assert.equal(editor.lastNotify, false);
  await editor.replaceConfig(createDailyConfig(), { notify: true });
  assert.equal(editor.lastNotify, true);
  await assert.rejects(editor.replaceConfig(createDefaultConfig()), /같은 상품/);
});

test('the inside camera remains available for an inside name tag after the pocket is removed', () => {
  const editor=Object.create(Product3DEditor.prototype), views=[];
  Object.assign(editor,{config:createDailyConfig(),cameraView:'initial',productDrafts:new Map(),productGeneration:0,
    viewer:{setView:view=>views.push(view),setConfig(){}},sync(){},syncZoomToolbar(){},setStatus(){}});
  editor.config.options.nameTag=true;
  editor.setCameraView('inside');
  assert.equal(editor.cameraView,'inside');
  assert.deepEqual(views,['inside']);
  editor.config.options.innerPocket=false;
  editor.apply();
  assert.equal(editor.cameraView,'inside');
  assert.deepEqual(views,['inside']);
  editor.config.options.nameTag=false;
  editor.apply();
  assert.equal(editor.cameraView,'initial');
  assert.deepEqual(views,['inside','initial']);
  editor.setCameraView('inside');
  assert.equal(editor.cameraView,'initial');
});

test('enabling the pocket immediately shows its detail while unrelated edits retain the chosen camera',()=>{
  const editor=Object.create(Product3DEditor.prototype),views=[];
  Object.assign(editor,{config:createDailyConfig(),imageRatios:{},fields:new Map(),apply(){},
    setCameraView(view){views.push(view);}});
  editor.change('options.innerPocket',true);
  assert.deepEqual(views,['inside']);
  editor.change('body.color','#171c28');
  editor.change('options.innerPocket',false);
  assert.deepEqual(views,['inside']);
  editor.change('options.innerPocketPrint',true);
  assert.equal(editor.config.options.innerPocket,true);
  assert.deepEqual(views,['inside','inside']);
});

test('cross strap controls use the current body minimum when typed or dragged', () => {
  const previousDocument=globalThis.document;
  const node=()=>({dataset:{},events:{},children:[],setAttribute(){},append(...children){this.children.push(...children);}});
  globalThis.document={createElement:node};
  try {
    const editor=Object.create(Product3DEditor.prototype);
    Object.assign(editor,{id:'test',fields:new Map(),config:normalizeConfig({...createDailyConfig(),dimensions:{width:600,height:360,depth:100}}),
      listen(target,event,handler){target.events[event]=handler;},
      change(path,value){this.config=patchConfig(this.config,path,value);}});
    editor.numeric(node(),'crossStrap.length','크로스끈 길이');
    const field=editor.fields.get('crossStrap.length');
    field.number.events.input({target:{valueAsNumber:500}});
    assert.equal(editor.config.crossStrap.length,612,'typing respects the wide body anchor separation');
    editor.config=patchConfig(editor.config,'dimensions.width',360);
    field.range.events.input({target:{valueAsNumber:550.5}});
    assert.equal(editor.config.crossStrap.length,550.5,'a narrower body releases the coupled minimum without rounding');
    assert.equal(field.range.step,'any','the slider retains exact custom lengths even when its minimum is not a multiple of five');
  } finally {
    if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
  }
});

test('a focused cross length keeps typing intact and normalizes its displayed value on blur without change', () => {
  const previousDocument=globalThis.document;
  const documentMock={activeElement:null};
  const node=()=>({dataset:{},events:new Map(),children:[],value:'',
    get valueAsNumber(){return this.value===''?NaN:Number(this.value);},
    setAttribute(){},append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},
    addEventListener(type,handler){this.events.set(type,handler);},
    dispatchEvent(event){this.events.get(event.type)?.({target:this,type:event.type});},
    focus(){documentMock.activeElement=this;},
    blur(){documentMock.activeElement=null;this.dispatchEvent(new Event('blur'));},
  });
  documentMock.createElement=node;
  globalThis.document=documentMock;
  try {
    const editor=Object.create(Product3DEditor.prototype);
    const config=createDailyConfig();config.dimensions.width=600;config.options.crossStrap=true;
    Object.assign(editor,{id:'focused',fields:new Map(),config:normalizeConfig(config),printSide:'front',printControls:new Map(),
      insideViewButton:node(),productSelect:node(),pocketPanel:node(),fabricDescription:node(),sizeDescription:node(),
      estimateNote:node(),title:node(),printSideSelect:node(),dimensionSummary:node(),
      listen(target,event,handler){target.addEventListener(event,handler);},syncZoomToolbar(){},
      change(path,value){this.config=patchConfig(this.config,path,value);this.sync();}});
    for(const path of ['pocket.color','bottomPanel.color','bottomPanel.height'])editor.fields.set(path,{type:'select',input:node(),group:node(),row:node()});
    editor.numeric(node(),'crossStrap.length','크로스끈 길이');
    editor.sync();
    const {number,range}=editor.fields.get('crossStrap.length');
    number.focus();number.value='500';number.dispatchEvent(new Event('input'));
    assert.equal(editor.config.crossStrap.length,612);
    assert.equal(range.value,'612');assert.equal(range.min,'612');
    assert.equal(number.value,'500','the actual editor sync preserves the focused partial input');
    number.blur();
    assert.equal(number.value,'612','blur commits the clamped value even when native change never fired');
    assert.equal(range.value,'612');assert.equal(number.min,'612');
    number.focus();number.value='9';number.dispatchEvent(new Event('input'));
    assert.equal(number.value,'9','typing a longer length is not interrupted by intermediate clamping');
    number.value='925.5';number.dispatchEvent(new Event('change'));
    assert.equal(number.value,'925.5');assert.equal(range.value,'925.5');
    assert.equal(editor.config.crossStrap.length,925.5);
  } finally {
    if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;
  }
});
