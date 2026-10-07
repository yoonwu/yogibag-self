import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three/three.module.js';
import { createDefaultConfig, createDailyConfig, normalizeConfig, patchConfig, serializeConfig,
  parseConfig, getProductProfile, getPrintBoundsWarnings, getConsultationSpecs,
  DAILY_PRODUCT_ID, SAMPLE_PRODUCT_ID, PRODUCT3D_PROFILES, getProductPrintArea, MM_TO_SCENE } from '../assets/product3d/config.mjs';
import { configForProduct, createProductModel, Product3DCatalog } from '../assets/product3d/registry.mjs';
import { disposeBagModel } from '../assets/product3d/model.mjs';
import { createPrintMesh, disposePrintMesh } from '../assets/product3d/print.mjs';

const closeMm = (actual, expected, tolerance = 0.25) => assert.ok(Math.abs(actual / MM_TO_SCENE - expected) < tolerance,
  `Expected ${expected} mm, received ${actual / MM_TO_SCENE} mm.`);
function materials() {
  return Object.fromEntries(['body', 'bottom', 'handle', 'inside', 'seam', 'pocket']
    .map(key => [key, new THREE.MeshBasicMaterial()]));
}
function clean(bag, owned) {
  disposeBagModel(bag);
  Object.values(owned).forEach(material => material.dispose());
}

test('daily catalog defaults match the existing product and preserve the first template', () => {
  const daily = configForProduct(DAILY_PRODUCT_ID);
  assert.deepEqual(daily, createDailyConfig());
  assert.deepEqual(daily, createDefaultConfig('daily'));
  assert.deepEqual(daily.dimensions, { width: 360, height: 360, depth: 100 });
  assert.equal(daily.productType, 'daily-tote');
  assert.equal(daily.productName, '데일리 에코백');
  assert.equal(daily.bottomPanel.height, 0);
  assert.equal(daily.options.pocket, false);
  assert.equal(daily.handle.width, 34);
  assert.equal(daily.handle.gap, 146);
  assert.equal(daily.handle.drop, 269);
  assert.equal(daily.handle.color, daily.body.color);
  assert.deepEqual(daily.printArea, getProductPrintArea(daily));
  assert.equal(daily.print.front.y, 0);
  assert.equal(getProductProfile(daily).handleAttachment, 'mouth');
  assert.equal(getProductProfile(daily).handleAttachmentDepth, 25);
  assert.equal(getProductProfile(daily).referenceHandleLength, 570);
  const first = createDefaultConfig();
  assert.equal(first.productId, SAMPLE_PRODUCT_ID);
  assert.equal(first.productType, 'bottom-color-tote');
  assert.equal(first.bottomPanel.height, 75);
  assert.equal(first.options.pocket, true);
  assert.equal(first.handle.width, 38);
  assert.equal(getProductProfile(first).handleAttachment, 'full-height');
  assert.deepEqual([...Product3DCatalog.keys()], Object.keys(PRODUCT3D_PROFILES));
  assert.deepEqual([...Product3DCatalog.keys()].slice(0, 2), [SAMPLE_PRODUCT_ID, DAILY_PRODUCT_ID]);
  assert.throws(() => configForProduct('unknown'));
  assert.throws(() => createProductModel({ ...daily, productType: 'bottom-color-tote' }, {}));
});

test('daily JSON round trips retain customer data and enforce canonical product identity', () => {
  let daily = createDailyConfig();
  for (const [path, value] of [['body.fabricId', 'denim'], ['body.color', '#7d9070'],
    ['handle.color', '#171c28'], ['handle.drop', 280], ['dimensions.width', 410],
    ['print.front.width', 120], ['print.front.height', 75], ['print.front.x', 20],
    ['print.front.y', -25], ['print.front.rotation', 30], ['print.front.image', 'data:image/png;base64,AA=='],
    ['print.front.imageName', '고객 로고.png']]) daily = patchConfig(daily, path, value);
  const restored = parseConfig(serializeConfig(daily));
  assert.deepEqual(restored, daily);
  assert.equal(restored.productId, 'daily');
  assert.equal(restored.productType, 'daily-tote');
  assert.equal(restored.bottomPanel.color, restored.body.color);
  const spoofed = normalizeConfig({ ...daily, productName: '가짜 이름', productType: 'bottom-color-tote',
    bottomPanel: { height: 75, color: '#171c28' }, options: { ...daily.options, pocket: true } });
  assert.equal(spoofed.productName, '데일리 에코백');
  assert.equal(spoofed.productType, 'daily-tote');
  assert.equal(spoofed.bottomPanel.height, 0);
  assert.equal(spoofed.options.pocket, false);
  for (const productId of ['unknown', '__proto__', 'constructor']) {
    assert.throws(() => parseConfig(JSON.stringify({ ...daily, productId })));
  }
  assert.throws(() => parseConfig(JSON.stringify({ ...daily, productType: 'bottom-color-tote' })));
  assert.throws(() => parseConfig(JSON.stringify({ ...createDefaultConfig(), productType: 'daily-tote' })));
  const specs = getConsultationSpecs(restored);
  assert.equal(specs.find(item => item.label === '상품').value, '데일리 에코백');
  assert.ok(specs.some(item => item.value.includes('570 mm')));
  assert.ok(specs.some(item => item.value.includes('120 × 75 mm')));
  assert.ok(specs.some(item => item.value.includes('입구에서 25 mm')));
  assert.ok(!specs.some(item => /\d+[,.]?\d*원/.test(item.value)));
});

test('daily prints avoid false full-height webbing warnings and report actual top attachments', () => {
  const daily = createDailyConfig();
  daily.print.front = { ...daily.print.front, image: 'data:image/png;base64,AA==', x: 75, width: 30, height: 30, y: 0 };
  assert.equal(getPrintBoundsWarnings(daily).length, 0);
  const atAttachment = patchConfig(daily, 'print.front.y', 155);
  assert.ok(getPrintBoundsWarnings(atAttachment).some(message => message.includes('입구의 손잡이 부착부')));
  assert.ok(!getPrintBoundsWarnings(atAttachment).some(message => message.includes('세로 웨빙')));
  for (const dimensions of [{ width: 200, height: 150, depth: 30 }, { width: 600, height: 600, depth: 300 }]) {
    const changed = normalizeConfig({ ...daily, dimensions });
    assert.equal(changed.print.front.width, 30);
    assert.equal(changed.print.front.x, 75);
    assert.deepEqual(changed.printArea, getProductPrintArea(changed));
  }
});

test('daily has a plain body and short mouth attachments, while the sample keeps full-height webbing', () => {
  const daily = createDailyConfig(), owned = materials();
  const bag = createProductModel(daily, owned);
  assert.equal(bag.userData.metrics.productType, 'daily-tote');
  assert.equal(bag.userData.metrics.handleAttachment, 'mouth');
  assert.equal(bag.userData.metrics.handleLegStartHeight, 335);
  for (const name of ['bottomFrontPanel', 'bottomBackPanel', 'frontPocket', 'bottomPanelFrontStitches']) {
    assert.equal(bag.getObjectByName(name), undefined, `${name} must not appear on the plain daily tote`);
  }
  assert.equal(bag.getObjectByName('bottom').material, owned.body);
  assert.equal(bag.getObjectByName('bodyFront').material, owned.body);
  assert.ok(bag.getObjectByName('liningBottom'));
  for (const side of ['Front', 'Back']) for (const position of ['Left', 'Right']) {
    const leg = bag.getObjectByName(`handle${side}${position}`);
    closeMm(leg.geometry.boundingBox.min.y, 335);
    closeMm(leg.geometry.boundingBox.max.y, 360);
    closeMm(leg.geometry.boundingBox.getSize(new THREE.Vector3()).x, daily.handle.width);
  }
  const loop = bag.getObjectByName('handlesLoopFront');
  closeMm(loop.geometry.boundingBox.max.y, daily.dimensions.height+daily.handle.drop);
  closeMm(loop.geometry.boundingBox.min.y, 360);
  // The two long diagonal legs converge after a short rounded transition.
  const vertices = loop.geometry.getAttribute('position');
  const center = ring => new THREE.Vector3().fromBufferAttribute(vertices, ring*8)
    .add(new THREE.Vector3().fromBufferAttribute(vertices, ring*8+4)).multiplyScalar(.5);
  closeMm(center(0).x,-daily.handle.gap/2);
  const centres=Array.from({length:(vertices.count-8)/8},(_,i)=>center(i));
  const left=centres.filter(p=>p.x<0),atHeight=f=>left.reduce((best,p)=>
    Math.abs(p.y-(daily.dimensions.height+daily.handle.drop*f)*MM_TO_SCENE)
    <Math.abs(best.y-(daily.dimensions.height+daily.handle.drop*f)*MM_TO_SCENE)?p:best);
  const low=atHeight(.1),high=atHeight(.9),top=centres.reduce((best,p)=>p.y>best.y?p:best);
  assert.ok(high.x>low.x&&high.y-low.y>daily.handle.drop*.7*MM_TO_SCENE,'most of the photo-derived handle follows long converging cloth legs');
  assert.ok(Math.abs(top.x)<daily.handle.gap*.08*MM_TO_SCENE,'the photographic fold is close to the centre');
  assert.ok(Math.abs(top.y/MM_TO_SCENE-daily.dimensions.height-daily.handle.drop)<2,
    'the top folds on the thin tape edge, not on a width/2 rigid cap');
  assert.ok(bag.userData.metrics.triangleCount < 25_000);
  const sample = createProductModel(createDefaultConfig(), owned);
  assert.equal(sample.userData.metrics.handleLegStartHeight, 74);
  assert.ok(sample.getObjectByName('frontPocket'));
  assert.ok(sample.getObjectByName('bottomFrontPanel'));
  disposeBagModel(sample);
  clean(bag, owned);
});

test('daily geometry stays finite across the working sizes and all dimension extremes', () => {
  for (const dimensions of [
    { width: 320, height: 250, depth: 120 }, { width: 450, height: 350, depth: 150 },
    { width: 250, height: 300, depth: 80 }, { width: 200, height: 150, depth: 30 },
    { width: 600, height: 600, depth: 300 }, { width: 200, height: 600, depth: 300 },
  ]) {
    const config = normalizeConfig({ ...createDailyConfig(), dimensions }), owned = materials();
    const bag = createProductModel(config, owned);
    bag.traverse(object => {
      if (!object.isMesh) return;
      assert.equal(object.scale.x, 1); assert.equal(object.scale.y, 1); assert.equal(object.scale.z, 1);
      for (const key of ['position', 'normal', 'uv']) assert.ok(object.geometry.getAttribute(key).array.every(Number.isFinite));
      assert.ok([...object.geometry.index.array].every(index => index < object.geometry.getAttribute('position').count));
    });
    assert.equal(bag.userData.metrics.bottomPanelHeight, 0);
    assert.equal(bag.userData.metrics.handleWidth, config.handle.width);
    assert.equal(bag.userData.metrics.handleDrop, config.handle.drop);
    closeMm(bag.getObjectByName('handleFrontLeft').geometry.boundingBox.min.y, dimensions.height - 25, config.handle.thickness/2+0.1);
    closeMm(bag.getObjectByName('handlesLoopFront').geometry.boundingBox.max.y, dimensions.height+config.handle.drop);
    assert.ok(bag.userData.metrics.triangleCount < 25_000);
    clean(bag, owned);
  }
});

test('daily artwork remains independent in millimetres as the bag changes', () => {
  const texture = new THREE.Texture();
  for (const dimensions of [
    { width: 320, height: 250, depth: 120 }, { width: 450, height: 350, depth: 150 },
    { width: 250, height: 300, depth: 80 },
  ]) {
    let config = normalizeConfig({ ...createDailyConfig(), dimensions });
    config.print.front = { ...config.print.front, width: 100, height: 60, x: 0, y: 0 };
    const mesh = createPrintMesh(config, texture);
    const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
    closeMm(size.x, 100); closeMm(size.y, 60);
    assert.equal(mesh.userData.printWidthMm, 100); assert.equal(mesh.userData.printHeightMm, 60);
    assert.equal(mesh.scale.x, 1); assert.equal(mesh.scale.y, 1);
    const colored = patchConfig(patchConfig(config, 'body.color', '#7d9070'), 'body.fabricId', 'linen');
    const same = createPrintMesh(colored, texture);
    assert.deepEqual(mesh.geometry.getAttribute('position').array, same.geometry.getAttribute('position').array);
    disposePrintMesh(mesh); disposePrintMesh(same);
  }
  texture.dispose();
});

test('large daily artwork is clipped at its folded bottom silhouette without changing the request', () => {
  const texture = new THREE.Texture(), config = createDailyConfig();
  config.print.front = { ...config.print.front, width: 340, height: 340, x: 0, y: 0, image: 'data:image/png;base64,AA==' };
  assert.ok(getPrintBoundsWarnings(config).some(message => message.includes('하단의 접힌 모서리')));
  const mesh = createPrintMesh(config, texture);
  assert.equal(mesh.userData.printWidthMm, 340);
  assert.equal(mesh.userData.printHeightMm, 340);
  const expectedFullTriangles = 34 * 34 * 2;
  assert.ok(mesh.geometry.index.count / 3 < expectedFullTriangles);
  assert.ok(mesh.geometry.index.count > 0);
  const owned = materials(), bag = createProductModel(config, owned);
  bag.updateMatrixWorld(true);
  const cloth = ['bodyFront', 'sideLeft', 'sideRight'].map(name => bag.getObjectByName(name));
  const uv = mesh.geometry.getAttribute('uv');
  for (const index of new Set(mesh.geometry.index.array)) {
    const x = (uv.getX(index) - 0.5) * 340 * MM_TO_SCENE;
    const y = (config.dimensions.height / 2 + (uv.getY(index) - 0.5) * 340) * MM_TO_SCENE;
    const ray = new THREE.Raycaster(new THREE.Vector3(x, y, 1), new THREE.Vector3(0, 0, -1));
    assert.ok(ray.intersectObjects(cloth).length > 0, 'each rendered print vertex has real cloth beneath it');
  }
  clean(bag, owned);
  disposePrintMesh(mesh); texture.dispose();
});
