import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createDefaultConfig, normalizeConfig, patchConfig, parseConfig, serializeConfig,
  getProductProfile, getProductLimits, getProductPrintArea, isSupportedProduct, PRODUCT3D_PROFILES,
  DESIGN_OPTION_LABELS, getConsultationSpecs, getPrintBoundsWarnings, SAMPLE_PRODUCT_ID, TWO_TONE_SMALL_PRODUCT_ID, TWO_TONE_KIDS_PRODUCT_ID } from '../assets/product3d/config.mjs';
import { Product3DCatalog, Product3DRegistry, configForProduct } from '../assets/product3d/registry.mjs';
import { Product3DEditor } from '../assets/product3d/editor.mjs';
import { FABRIC_COLOR_PRESETS } from '../assets/product3d/fabrics.mjs';

const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const literal = name => JSON.parse(JSON.stringify(runInNewContext(`(${source.match(new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n\\});`))[1]})`, { OPTIONS: Object.values(DESIGN_OPTION_LABELS).filter(label => label !== '양면 인쇄').map(label => label.replaceAll(' ', '')) })));
const bags2D = literal('BAG_MODELS'), options2D = literal('BAG_OPT_CONF'), guides2D = literal('PRINT_AREAS');
const labels = Object.fromEntries(Object.entries(DESIGN_OPTION_LABELS).map(([key, name]) => [name.replaceAll(' ', ''), key]));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('every actual 2D product has one registered 3D profile with matching names, dimensions and options', () => {
  const ids = Object.values(bags2D).flat().map(bag => bag.id);
  assert.equal(ids.length, 12);
  assert.deepEqual([...Product3DCatalog.keys()].sort(), [SAMPLE_PRODUCT_ID, TWO_TONE_SMALL_PRODUCT_ID, TWO_TONE_KIDS_PRODUCT_ID, ...ids].sort());
  for (const [category, bags] of Object.entries(bags2D)) for (const bag of bags) {
    const config = configForProduct(bag.id), profile = getProductProfile(config), optionConfig = options2D[category];
    assert.equal(profile.category, category);
    assert.equal(config.productName, bag.name);
    assert.deepEqual(config.dimensions, bag.dimensions, bag.id);
    assert.ok(Product3DRegistry.has(profile.type), bag.id);
    assert.deepEqual([...profile.allowedOptions].sort(), [...optionConfig.available.map(name => labels[name]), 'doubleSided'].sort(), bag.id);
    assert.deepEqual([...profile.lockedOptions].sort(), optionConfig.locked.map(name => labels[name]).sort(), bag.id);
    for (const key of profile.lockedOptions) assert.equal(config.options[key], true, `${bag.id}: ${key}`);
  }
});

test('all product JSONs preserve independent exact artwork, selected options and feasible custom cross lengths', () => {
  for (const id of Product3DCatalog.keys()) {
    let config = createDefaultConfig(id), profile = getProductProfile(id);
    for (const key of profile.allowedOptions) config = patchConfig(config, `options.${key}`, true);
    config = patchConfig(config, 'crossStrap.length', 925.5);
    for (const [index, side] of ['front', 'back', 'innerPocket'].entries()) {
      config.print[side] = { ...config.print[side], image: 'data:image/png;base64,AA==', imageName: `${id}-${side}.png`,
        width: 31.25 + index * 2, height: 22.5 + index, x: -15.5 + index * 8, y: 27.25 - index * 4, rotation: 17.5 + index * 11 };
    }
    config = normalizeConfig(config);
    const restored = parseConfig(serializeConfig(config));
    assert.deepEqual(restored, config, id);
    assert.equal(restored.crossStrap.length, 925.5, id);
    for (const side of ['front', 'back', 'innerPocket']) assert.deepEqual(restored.print[side], config.print[side], `${id}: ${side}`);
    assert.equal(getConsultationSpecs(restored).some(spec => spec.label === '크로스끈 길이'), profile.allowedOptions.includes('crossStrap'), id);
  }
});

test('pouch and poly normalize enforce actual 2D prohibitions and locked defaults', () => {
  const allTrue = Object.fromEntries(Object.keys(DESIGN_OPTION_LABELS).map(key => [key, true]));
  for (const id of ['minja', 'mitdan', 'tumbler', 'poly_v', 'poly_h']) {
    const profile = getProductProfile(id);
    const config = normalizeConfig({ ...createDefaultConfig(id), body: { fabricId: 'denim' }, options: allTrue });
    for (const key of Object.keys(DESIGN_OPTION_LABELS)) {
      assert.equal(config.options[key], profile.allowedOptions.includes(key) || (key === 'innerPocket' && profile.category === 'poly'), `${id}: ${key}`);
    }
    for (const key of profile.lockedOptions) assert.equal(patchConfig(config, `options.${key}`, false).options[key], true);
    if (profile.category === 'poly') {
      assert.equal(config.body.fabricId, 'basic');
      assert.equal(config.options.innerPocket, true, 'inner printing has a real inside pocket');
      const off = patchConfig(config, 'options.innerPocketPrint', false);
      assert.equal(off.options.innerPocket, false, 'a poly pocket disappears when its print option is removed');
      assert.ok(getConsultationSpecs(config).find(spec => spec.label === '원단 종류').value.startsWith('폴리 / 합성'));
    }
  }
});

test('flat preview opening is separated from sewn bottom dimensions in saved configs and consultation specs', () => {
  for (const id of ['small', 'sgak_s', 'sgak_m', 'sgak_l', 'minja', 'poly_v', 'poly_h']) {
    const config = patchConfig(createDefaultConfig(id), 'dimensions.depth', 55);
    assert.equal(config.nominalDepth, 0); assert.equal(config.depthBasis, 'opening-estimate');
    const specs = getConsultationSpecs(config);
    assert.equal(specs.find(spec => spec.label === '봉제 바닥 깊이').value, '0 mm · 평면 봉합형');
    assert.ok(specs.find(spec => spec.label === '3D 입구 벌림 참고값').value.startsWith('55 mm'));
    assert.ok(!specs.some(spec => spec.label === '몸통 가로 × 높이 × 바닥 깊이'));
  }
  assert.deepEqual(createDefaultConfig('poly_v').dimensions, { width: 330, height: 360, depth: 30 });
  assert.deepEqual(createDefaultConfig('poly_h').dimensions, { width: 380, height: 310, depth: 30 });
  assert.equal(getProductProfile('poly_v').dimensionsSource, 'user-measured');
  assert.deepEqual(normalizeConfig(createDefaultConfig('tumbler')).dimensions, { width: 190, height: 200, depth: 90 });
});

test('handle-free pouches have no handle consultation rows or false webbing warnings', () => {
  for (const id of ['minja', 'mitdan']) {
    const config = createDefaultConfig(id);
    config.print.front = { ...config.print.front, image: 'data:image/png;base64,AA==', width: 20, height: 20, x: 45, y: 0 };
    assert.equal(getProductProfile(config).supportsHandles, false);
    assert.ok(!getConsultationSpecs(config).some(spec => spec.label.startsWith('손잡이') || spec.label.includes('참고 손잡이')));
    assert.ok(!getPrintBoundsWarnings(config).some(message => /웨빙|손잡이/.test(message)));
  }
  assert.equal(getProductProfile('tumbler').supportsHandles, true, 'the original tumbler photo has a real handle');
});

test('2D PNG guide positions map to body millimetres on both print faces without moving artwork', () => {
  for (const id of Object.values(bags2D).flat().map(bag => bag.id)) {
    const config = createDefaultConfig(id), profile = getProductProfile(config), { image, body, print } = profile.referenceLayout;
    const guide = guides2D[id] || { cx: .5, cy: .72, w: .58, h: .42 };
    assert.deepEqual(print, { cx: guide.cx, cy: guide.cy, width: guide.w, height: guide.h }, id);
    const area = getProductPrintArea(config);
    close(area.width / config.dimensions.width * body.width, guide.w * image.width);
    close(area.height / config.dimensions.height * body.height, guide.h * image.height);
    close(area.x / config.dimensions.width * body.width + body.x + body.width / 2, guide.cx * image.width);
    close(body.y + body.height / 2 - area.y / config.dimensions.height * body.height, guide.cy * image.height);
    config.print.front = { ...config.print.front, image: 'data:image/png;base64,AA==', width: 10, height: 10, x: area.x + area.width / 2, y: area.y };
    config.print.back = { ...config.print.front };
    assert.deepEqual(getPrintBoundsWarnings(config, 'back').map(message => message.replace(/^뒷면: /, '')), getPrintBoundsWarnings(config, 'front'), id);
    const moved = patchConfig(config, 'dimensions.width', config.dimensions.width + 10);
    assert.deepEqual(moved.print.front, config.print.front, id);
  }
});

test('narrow body limits stay ordered and width/gap respect real attachment space', () => {
  for (const id of Object.keys(PRODUCT3D_PROFILES)) for (const width of [100, 190, 200, 600]) {
    const config = normalizeConfig({ ...createDefaultConfig(id), dimensions: { width, height: 100, depth: 300 }, handle: { width: 70, gap: 450 } });
    const limits = getProductLimits(config);
    for (const path of ['dimensions.width', 'dimensions.height', 'dimensions.depth', 'handle.width', 'handle.gap']) {
      const [part, key] = path.split('.');
      assert.ok(limits[path].min <= limits[path].max, `${id}: ${path}`);
      assert.ok(config[part][key] >= limits[path].min - 1e-9 && config[part][key] <= limits[path].max + 1e-9, `${id}: ${path}`);
    }
    if (getProductProfile(config).supportsHandles) {
      const margin = getProductProfile(config).handleEdgeMarginMm ?? Math.max(20, config.dimensions.width * .06 + Math.min(17, config.dimensions.depth * .1));
      assert.ok(config.handle.gap >= config.handle.width + 12 - 1e-9, id);
      assert.ok(config.handle.gap + config.handle.width <= config.dimensions.width - 2 * margin + 1e-9, id);
    }
  }
});

test('unknown explicit products are rejected while omitted legacy sample identity remains supported', () => {
  assert.equal(normalizeConfig({}).productId, SAMPLE_PRODUCT_ID);
  for (const id of ['unknown', '__proto__', 'constructor', '']) {
    assert.equal(isSupportedProduct(id), false);
    assert.throws(() => createDefaultConfig(id));
    assert.throws(() => getProductProfile(id));
    assert.throws(() => normalizeConfig({ productId: id }));
  }
  assert.throws(() => normalizeConfig({ productType: 'unknown-type' }));
});

test('new handle defaults follow the original PNG scale and retain measured torsion as product metadata', () => {
  const expected = { small: [38,111,120], sgak_s: [38,237,140], kids: [38,215,146], sgak_m: [38,266,145],
    daily: [34,269,146], market: [38,253,165], sgak_l: [38,313,145], tumbler: [20,105,158], poly_v: [38,101,135], poly_h: [30,100,134] };
  for (const [id, values] of Object.entries(expected)) {
    const profile = getProductProfile(id), config = normalizeConfig(createDefaultConfig(id)), reference = profile.handleReference;
    assert.deepEqual([config.handle.width, config.handle.drop, config.handle.gap], values, id);
    assert.equal(reference.source, 'original-2d-handle-png');
    assert.equal(reference.basis, 'visible-body-opaque-bounds-mm');
    const photoDrop = (reference.bodyBoundsPx.y - reference.handleBoundsPx.y) / reference.bodyBoundsPx.height * reference.bodySizeMm[1];
    assert.equal(config.handle.drop, Math.round(photoDrop), id);
    assert.ok(Math.abs(config.handle.gap - reference.anchorGapMm) < 3.1, id);
    assert.equal(reference.physicalLoopCountVerified, false, 'a single visible loop does not prove physical handle count');
    for (const key of ['leftRollKnots', 'rightRollKnots']) {
      const knots = profile.handleDrape[key];
      assert.deepEqual(knots[0], [0,0]);
      assert.equal(knots.at(-1)[0], 1);
      assert.equal(knots.at(-1)[1], profile.handleDrape.crownRollDeg);
      for (let index=1; index<knots.length; index++) {
        assert.ok(knots[index][0] > knots[index-1][0], `${id}: ${key} is ordered`);
        assert.ok(knots[index][1] >= 0 && knots[index][1] <= 90, id);
      }
    }
    assert.equal(profile.handleFabric, id.startsWith('poly') ? 'double-weave' : 'cotton-tape');
    assert.equal(getConsultationSpecs(config).find(spec => spec.label === '손잡이 원단').value, profile.handleFabricLabel);
  }
  assert.equal(getProductProfile(SAMPLE_PRODUCT_ID).handleFabric, 'webbing');
  assert.equal(getProductProfile('tumbler').handleEdgeMarginMm, 6, 'the photographed handle roots sit closer to the top corners');
  assert.ok(getProductProfile('small').handleDrape.crownRollDeg < 40, 'the short U keeps its broad cotton face');
  assert.ok(getProductProfile('daily').handleDrape.crownRollDeg > 80, 'the tall folded peak shows its narrow edge');
});

test('photo corrections affect new defaults without overwriting an existing customer handle, artwork or selected options', () => {
  const existing = createDefaultConfig('daily');
  existing.handle = { width:30, thickness:2, drop:240, gap:150, color:'#ffffff' };
  existing.body = { color:'#2f6041', fabricId:'linen' };
  existing.crossStrap.length = 925.5;
  Object.assign(existing.options, { innerPocket:true, innerPocketPrint:true, doubleSided:true, crossStrap:true, nameTag:true });
  for (const side of ['front','back','innerPocket']) Object.assign(existing.print[side], {
    image:'data:image/png;base64,AA==', imageName:`saved-${side}.png`, width:47.25, height:19.5, x:-20.75, y:32.5, rotation:63.5,
  });
  const before = structuredClone(existing), restored = parseConfig(serializeConfig(existing));
  assert.deepEqual(restored.handle, before.handle);
  assert.deepEqual(restored.body, before.body);
  assert.deepEqual(restored.print, before.print);
  assert.deepEqual(restored.options, before.options);
  assert.equal(restored.crossStrap.length, 925.5);
  assert.deepEqual(existing, before, 'normalizing or saving does not mutate the original editor state');
  assert.deepEqual([createDefaultConfig('daily').handle.width,createDefaultConfig('daily').handle.drop,createDefaultConfig('daily').handle.gap], [34,269,146]);
});

test('complete photo paths preserve the small flat bridge, distinct rounded crowns and smooth mouth roots', () => {
  const ids = ['small','sgak_s','kids','sgak_m','daily','market','sgak_l','tumbler','poly_v','poly_h'];
  for (const id of ids) {
    const profile = getProductProfile(id), path = profile.handleDrape.centerlineKnots;
    assert.deepEqual(path[0], [-1,0], id); assert.deepEqual(path.at(-1), [1,0], id);
    assert.ok(Object.isFrozen(path) && path.every(Object.isFrozen), `${id}: shared photo facts cannot be edited by a session`);
    const peak = Math.max(...path.map(point => point[1])), apex = path.findIndex(point => point[1] === peak);
    assert.ok(peak > .8 && peak < 1, `${id}: centerline leaves room for the actual top tape width`);
    for (let index=1; index<path.length; index++) {
      assert.ok(path[index].every(Number.isFinite), id);
      assert.ok(Math.abs(path[index][0]) <= 1.02, `${id}: no thinning corner spur extends outside the mouth roots`);
      assert.ok(index <= apex ? path[index][1] >= path[index-1][1] : path[index][1] <= path[index-1][1], `${id}: the ribbon never folds back through its crown`);
    }
    assert.ok(Math.abs(path[1][0]+1) < .08 && Math.abs(path.at(-2)[0]-1) < .08, `${id}: smooth root tangent`);
  }
  const xAtHeight = (id, height, side) => {
    const path = getProductProfile(id).handleDrape.centerlineKnots;
    const apex = path.findIndex(point => point[1] === Math.max(...path.map(point => point[1])));
    const leg = side === 'left' ? path.slice(0,apex+1) : path.slice(apex).reverse();
    const index = leg.findIndex(point => point[1] >= height), a = leg[index-1], b = leg[index];
    return a[0]+(b[0]-a[0])*(height-a[1])/(b[1]-a[1]);
  };
  assert.ok(xAtHeight('small', .5, 'left') < -.93 && xAtHeight('small', .5, 'right') > .89, 'the short small handle keeps straight legs before diagonal shoulders');
  assert.ok(Math.abs(xAtHeight('sgak_s', .5, 'left')) < .78, 'the S photo tapers continuously to its narrow arch');
  assert.ok(xAtHeight('kids', .8, 'right') > Math.abs(xAtHeight('kids', .8, 'left'))+.1, 'the kids crown retains the photographed asymmetric shoulder');
  const topSpan = id => {
    const path = getProductProfile(id).handleDrape.centerlineKnots, peak = Math.max(...path.map(point=>point[1]));
    const xs = path.filter(point=>point[1]>=peak*.98).map(point=>point[0]);
    return Math.max(...xs)-Math.min(...xs);
  };
  assert.ok(topSpan('small') > .5 && topSpan('small') > 2*topSpan('sgak_s'), 'the wide upper bridge must not regress to a generic narrow round cap');
  const capHeight = id => {
    const profile = getProductProfile(id), center = profile.handleReference.crownSilhouetteSamples.find(point=>point[0]===0);
    return (center[1]-center[2])*profile.handleReference.outerDropMm;
  };
  assert.ok(capHeight('small') > 30 && capHeight('small') < 33, 'actual small upper band is about 32 mm deep');
  assert.ok(capHeight('sgak_s') > 5 && capHeight('sgak_s') < 8, 'S tape turns to a thin folded crown');
  assert.ok(capHeight('kids') > 13 && capHeight('kids') < 15, 'kids has a broader arched fold than S');
  assert.ok(capHeight('poly_v') > 20 && capHeight('poly_v') < 23, 'vertical poly retains its broad webbing bridge');
  assert.ok(capHeight('poly_h') > 12 && capHeight('poly_h') < 15, 'horizontal poly bridge reflects its narrower webbing');
  for (const id of ['small','sgak_s','kids','poly_v','poly_h']) {
    const profile = getProductProfile(id), angle = profile.handleDrape.crownRollDeg*Math.PI/180;
    const projected = profile.defaultHandle.width*Math.cos(angle)+profile.defaultHandle.thickness*Math.sin(angle);
    assert.ok(Math.abs(projected-profile.handleReference.crownProjectedWidthMm) < .1, `${id}: the crown angle matches the measured apex tape width`);
  }
});

function editorFixture() {
  const documentMock = { activeElement: null };
  const node = () => ({ dataset: {}, events: {}, children: [], value: '', attributes: {}, style: {}, classList: { toggle() {} },
    get valueAsNumber() { return this.value === '' ? NaN : Number(this.value); },
    setAttribute(name, value) { this.attributes[name] = value; }, append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; },
    focus() { documentMock.activeElement = this; },
  });
  documentMock.createElement = node;
  const editor = Object.create(Product3DEditor.prototype);
  Object.assign(editor, { id: 'catalog-test', config: createDefaultConfig(), fields: new Map(), printSide: 'front', printControls: new Map(),
    insideViewButton: node(), productSelect: node(), pocketPanel: node(), handlePanel: node(), handleFabricNote: node(), fabricDescription: node(), sizeDescription: node(),
    estimateNote: node(), title: node(), printSideSelect: node(), dimensionSummary: node(),
    listen(target, event, handler) { target.events[event] = handler; }, syncZoomToolbar() {},
    change(path, value) { this.config = patchConfig(this.config, path, value); this.sync(); },
  });
  for (const path of ['pocket.color', 'bottomPanel.color', 'bottomPanel.height', 'handle.color', 'body.fabricId']) {
    editor.fields.set(path, { type: 'select', input: node(), row: node(), group: node() });
  }
  return { editor, node, documentMock };
}

test('actual editor sync shows per-product controls and locks defaults across all product switches', () => {
  const previousDocument = globalThis.document, { editor, node, documentMock } = editorFixture();
  globalThis.document = documentMock;
  try {
    for (const [key, label] of Object.entries(DESIGN_OPTION_LABELS)) editor.checkbox(node(), `options.${key}`, label);
    for (const path of ['dimensions.width', 'dimensions.depth', 'handle.width', 'handle.gap', 'crossStrap.length']) editor.numeric(node(), path, path);
    for (const id of Product3DCatalog.keys()) {
      editor.config = normalizeConfig(createDefaultConfig(id)); editor.sync();
      const profile = getProductProfile(id);
      assert.equal(editor.handlePanel.hidden, !profile.supportsHandles, id);
      assert.equal(editor.handleFabricNote.textContent, `손잡이 원단: ${profile.handleFabricLabel}`, id);
      assert.equal(editor.fields.get('handle.color').group.hidden, !profile.supportsHandles, id);
      assert.equal(editor.fields.get('body.fabricId').row.hidden, profile.clothKind === 'poly', id);
      for (const key of Object.keys(DESIGN_OPTION_LABELS)) {
        const field = editor.fields.get(`options.${key}`), allowed = profile.allowedOptions.includes(key), locked = profile.lockedOptions.includes(key);
        assert.equal(field.row.hidden, !allowed, `${id}: ${key}`);
        assert.equal(field.input.disabled, !allowed || locked, `${id}: ${key}`);
        if (locked) { assert.equal(field.input.checked, true); assert.match(field.labelNode.textContent, /기본 포함/); }
      }
      if (profile.depthBasis === 'opening-estimate') {
        assert.match(editor.fields.get('dimensions.depth').labelNode.textContent, /입구 벌림/);
        assert.match(editor.dimensionSummary.textContent, /참고/);
      }
      if (!profile.supportsHandles) assert.ok(!editor.dimensionSummary.textContent.includes('손잡이'));
      if (profile.category === 'poly') {
        assert.equal(editor.insideViewButton.hidden, false, 'the locked name tag is visible inside');
        assert.match(editor.fabricDescription.textContent, /폴리/);
      }
    }
    editor.config = normalizeConfig(createDefaultConfig('tumbler')); editor.sync();
    const width = editor.fields.get('dimensions.width');
    assert.equal(width.number.value, '190'); assert.equal(width.range.value, '190');
    editor.config = normalizeConfig({ ...createDefaultConfig('small'), dimensions: { width: 100, height: 100, depth: 30 } }); editor.sync();
    assert.equal(editor.fields.get('handle.width').number.max, '24');
    assert.equal(editor.fields.get('handle.gap').number.min, '36');
    assert.equal(editor.fields.get('handle.gap').number.max, '36');
  } finally { if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; }
});

test('poly body colors match the three original 2D chips while custom colors and ordinary presets stay editable', () => {
  const previousDocument = globalThis.document, previousStyle = globalThis.getComputedStyle;
  const { editor, node, documentMock } = editorFixture();
  globalThis.document = documentMock;
  globalThis.getComputedStyle = () => ({ gridTemplateColumns: '1fr 1fr 1fr' });
  try {
    editor.numeric(node(), 'crossStrap.length', '크로스끈 길이');
    editor.color(node(), 'body.color', '몸통 색상');
    const field = editor.fields.get('body.color');
    for (const id of ['poly_v', 'poly_h']) {
      editor.config = normalizeConfig(createDefaultConfig(id)); editor.sync();
      assert.equal(editor.config.body.color, '#1a1a1a');
      assert.equal(editor.config.handle.color, '#040000');
      assert.deepEqual(field.activePresetButtons.map(control => control.dataset.p3dColorValue), ['#1a1a1a', '#1a2a4a', '#104727']);
      assert.equal(field.presetButtons.filter(control => !control.hidden).length, 3);
      assert.equal(field.activePresetButtons[0].attributes['aria-pressed'], 'true');
      assert.equal(field.input.disabled, false, 'free choice remains available');
      field.presets.events.keydown({ target: field.activePresetButtons[0], key: 'End', preventDefault() {}, stopPropagation() {} });
      assert.equal(documentMock.activeElement, field.activePresetButtons[2], 'keyboard skips the hidden canvas colors');
      field.activePresetButtons[2].events.click();
      assert.equal(editor.config.body.color, '#104727');
      assert.equal(field.activePresetButtons[2].attributes['aria-pressed'], 'true');
      field.input.events.input({ target: { value: '#ab1234' } });
      assert.equal(editor.config.body.color, '#ab1234');
      assert.equal(parseConfig(serializeConfig(editor.config)).body.color, '#ab1234');
      assert.ok(field.activePresetButtons.every(control => control.attributes['aria-pressed'] === 'false'));
    }
    editor.config = createDefaultConfig('daily'); editor.sync();
    assert.deepEqual(field.activePresetButtons.map(control => control.dataset.p3dColorValue), FABRIC_COLOR_PRESETS.map(preset => preset.hex));
    assert.equal(field.presetButtons.filter(control => !control.hidden).length, 12, 'the ordinary canvas palette is restored');
  } finally {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousStyle === undefined) delete globalThis.getComputedStyle; else globalThis.getComputedStyle = previousStyle;
  }
});
