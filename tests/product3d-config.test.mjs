import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultConfig, normalizeConfig, patchConfig, parseConfig, serializeConfig,
  getPrintBoundsWarnings, getConsultationSpecs, mmToScene, getCrossStrapLengthMin } from '../assets/product3d/config.mjs';
import { crc32, makeZip } from '../assets/product3d/zip.mjs';

test('photo dimensions and millimetre conversion are the sample defaults', () => {
  const c = createDefaultConfig();
  assert.deepEqual(c.dimensions, { width: 480, height: 340, depth: 150 });
  assert.equal(c.bottomPanel.height, 75); assert.equal(c.handle.drop, 290);
  assert.equal(mmToScene(480), 0.48);
});
test('body dimensions never scale print dimensions or webbing width', () => {
  const c = createDefaultConfig(); c.print.front.image = 'data:image/png;base64,AA==';
  for (const dimensions of [{width:320,height:250,depth:120}, {width:450,height:350,depth:150}, {width:250,height:300,depth:80}]) {
    const changed = normalizeConfig({ ...c, dimensions });
    assert.equal(changed.print.front.width, 100); assert.equal(changed.print.front.height, 100);
    assert.equal(changed.print.front.y, -10); assert.equal(changed.handle.width, 38);
    assert.equal(changed.bottomPanel.height, 75);
  }
});
test('extremes produce safe coupled dimensions without changing the input', () => {
  const raw = createDefaultConfig(); raw.dimensions = { width: -1, height: 150, depth: Infinity };
  raw.handle.gap = 450; raw.handle.width = 70; raw.bottomPanel.height = 250;
  const c = normalizeConfig(raw);
  assert.equal(c.dimensions.width, 200); assert.equal(c.dimensions.depth, 150);
  assert.ok(c.handle.gap + c.handle.width <= c.dimensions.width - 40);
  assert.equal(c.bottomPanel.height, 120); assert.ok(c.pocket.bottom + c.pocket.height < c.dimensions.height);
  assert.equal(raw.dimensions.width, -1);
});
test('portable config round trip retains artwork and consultation dimensions', () => {
  let c = createDefaultConfig(); c.print.front.image = 'data:image/png;base64,AA=='; c.print.front.imageName = 'logo.png';
  c = patchConfig(c, 'print.front.rotation', 45);
  const restored = parseConfig(serializeConfig(c));
  assert.deepEqual(restored, normalizeConfig(c));
  assert.equal(restored.print.front.image, c.print.front.image);
  const specs = getConsultationSpecs(restored);
  assert.ok(specs.some(s => s.value.includes('480 × 340 × 150 mm')));
  assert.ok(specs.some(s => s.value.includes('45°')));
  assert.ok(!specs.some(s => /\d+[,.]?\d*원/.test(s.value)));
});

test('embroidery choices survive saving on each side without altering artwork or placement', () => {
  let config = createDefaultConfig();
  config.options.doubleSided = true;
  config.options.innerPocketPrint = true;
  const sides = ['front', 'back', 'innerPocket'];
  for (const [index, side] of sides.entries()) {
    Object.assign(config.print[side], { image: `data:image/png;base64,${['AA==', 'AQ==', 'Ag=='][index]}`,
      imageName: `${side}.png`, width: 81 + index, height: 47 + index,
      x: 9 + index, y: -8 - index, rotation: 17 + index });
  }
  const original = normalizeConfig(config);
  for (const side of sides) config = patchConfig(config, `print.${side}.appearance`, 'embroidery');
  const restored = parseConfig(serializeConfig(config));
  const specs = getConsultationSpecs(restored);
  for (const side of sides) {
    assert.deepEqual(restored.print[side], { ...original.print[side], appearance: 'embroidery' });
    const sideLabel = {front:'앞면',back:'뒷면',innerPocket:'안주머니'}[side];
    assert.match(specs.find(spec => spec.label === `${sideLabel} 인쇄`).value, /^자수 미리보기 · /);
    config = patchConfig(config, `print.${side}.appearance`, 'print');
  }
  assert.deepEqual(config.print, original.print);
});

test('older and malformed preview choices fall back to print without losing the original artwork', () => {
  const config = createDefaultConfig();
  config.print.front.image = 'data:image/png;base64,AA==';
  delete config.print.front.appearance;
  config.print.back.appearance = 'unsupported';
  config.print.innerPocket.appearance = {mode:'embroidery'};
  const restored = parseConfig(JSON.stringify(config));
  assert.equal(restored.print.front.image, config.print.front.image);
  for (const side of ['front','back','innerPocket']) assert.equal(restored.print[side].appearance, 'print');
  assert.match(getConsultationSpecs(restored).find(spec => spec.label === '앞면 인쇄').value, /^인쇄 미리보기 · /);
});

test('shorter cross straps restore old drafts and retain custom lengths while deselected', () => {
  const original = createDefaultConfig(), oldDraft = structuredClone(original);
  assert.equal(original.crossStrap.length, 800);
  delete oldDraft.crossStrap;
  assert.equal(parseConfig(JSON.stringify(oldDraft)).crossStrap.length, 800);
  let config = patchConfig(original, 'crossStrap.length', 907.5);
  config = patchConfig(config, 'options.crossStrap', true);
  assert.equal(getConsultationSpecs(config).find(spec => spec.label === '크로스끈 길이').value, '907.5 mm');
  config = patchConfig(config, 'options.crossStrap', false);
  assert.equal(config.crossStrap.length, 907.5);
  assert.ok(!getConsultationSpecs(config).some(spec => spec.label === '크로스끈 길이'));
  assert.equal(parseConfig(serializeConfig(config)).crossStrap.length, 907.5);
  assert.deepEqual(config.handle, original.handle);
});

test('cross strap length stays physically feasible as the body width changes', () => {
  let config = patchConfig(createDefaultConfig(), 'crossStrap.length', 500);
  assert.equal(config.crossStrap.length, 500);
  config = patchConfig(config, 'dimensions.width', 600);
  assert.equal(getCrossStrapLengthMin(config), 612);
  assert.equal(config.crossStrap.length, 612);
  assert.equal(patchConfig(config, 'crossStrap.length', 500).crossStrap.length, 612);
  assert.equal(patchConfig(config, 'crossStrap.length', 2000).crossStrap.length, 1400);
});

test('legacy samples keep their inherited pocket color and receive the canvas fabric', () => {
  const legacy = createDefaultConfig();
  legacy.body.color = '#7a5c43';
  delete legacy.body.fabricId;
  delete legacy.pocket.color;
  const restored = parseConfig(JSON.stringify(legacy));
  assert.equal(restored.pocket.color, legacy.body.color);
  assert.equal(restored.body.fabricId, 'basic');
  const changed = patchConfig(restored, 'body.color', '#5f82a8');
  assert.equal(changed.pocket.color, '#7a5c43');
  assert.equal(changed.body.color, '#5f82a8');
});

test('independent part colors and fabric survive saving and appear in consultation specs', () => {
  let c = createDefaultConfig();
  for (const [path,value] of [['body.fabricId','linen'],['body.color','#5f82a8'],
    ['pocket.color','#f0c3cd'],['handle.color','#f3f1ec'],['bottomPanel.color','#171c28']]) {
    c = patchConfig(c, path, value);
  }
  const restored = parseConfig(serializeConfig(c));
  assert.deepEqual(restored, c);
  const specs = getConsultationSpecs(restored);
  assert.ok(specs.find(s => s.label === '원단 종류').value.startsWith('리넨'));
  assert.equal(specs.find(s => s.label === '주머니 색상').value, '핑크 (#f0c3cd)');
  assert.equal(specs.find(s => s.label === '몸통 색상').value, '블루 (#5f82a8)');
  assert.equal(restored.handle.color, '#f3f1ec');
  assert.equal(restored.bottomPanel.color, '#171c28');
  assert.deepEqual(restored.dimensions, createDefaultConfig().dimensions);
  assert.deepEqual(restored.print, createDefaultConfig().print);
  const noPocket = patchConfig(restored, 'options.pocket', false);
  assert.equal(noPocket.pocket.color, '#f0c3cd');
  assert.equal(getConsultationSpecs(noPocket).find(s => s.label === '주머니 색상').value, '주머니 없음');
  assert.equal(normalizeConfig({...c, body:{...c.body,fabricId:'unknown'}}).body.fabricId, 'basic');
});
test('rotated print bounds warn while retaining the exact request', () => {
  let c = createDefaultConfig(); c.print.front.image = 'data:image/png;base64,AA==';
  assert.equal(getPrintBoundsWarnings(c).length, 0);
  c = patchConfig(c, 'print.front.width', 170);
  c = patchConfig(c, 'print.front.height', 170);
  c = patchConfig(c, 'print.front.rotation', 45);
  assert.ok(getPrintBoundsWarnings(c).length > 0);
  assert.equal(c.print.front.width, 170);
  assert.throws(() => patchConfig(c, '__proto__.polluted', true));
  assert.throws(() => parseConfig('{"schemaVersion":99}'));
});
test('ZIP uses UTF8 filenames and a correct CRC with aligned central records', () => {
  const bytes = new TextEncoder().encode('123456789'); assert.equal(crc32(bytes), 0xcbf43926);
  const zip = makeZip([{name:'시안.json',data:'{"mm":480}'},{name:'image.png',data:bytes}]);
  const end = new DataView(zip.buffer, zip.length - 22);
  assert.equal(end.getUint32(0,true), 0x06054b50); assert.equal(end.getUint16(10,true), 2);
  const central = end.getUint32(16,true); const view = new DataView(zip.buffer);
  assert.equal(view.getUint32(central,true), 0x02014b50);
  assert.equal(view.getUint16(6,true), 0x0800);
  assert.equal(view.getUint32(18,true), new TextEncoder().encode('{"mm":480}').length);
});
