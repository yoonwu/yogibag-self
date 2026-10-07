import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three/three.module.js';
import { createDefaultConfig, createDailyConfig, normalizeConfig, PRODUCT3D_PROFILES } from '../assets/product3d/config.mjs';
import { createProductModel } from '../assets/product3d/registry.mjs';
import { disposeBagModel, frontSurfaceMM, innerPocketSurfaceMM } from '../assets/product3d/model.mjs';
import { createPrintMesh, disposePrintMesh } from '../assets/product3d/print.mjs';
import { createBagMaterials } from '../assets/product3d/materials.mjs';
import { Product3DViewer } from '../assets/product3d/viewer.mjs';
import { safeDetailDistance, clampDetailDistance, detailZoomMetrics } from '../assets/product3d/zoom.mjs';

let originalWindow;
before(() => {
  originalWindow = globalThis.window;
  globalThis.window = { devicePixelRatio: 3, matchMedia: () => ({ matches: false }) };
});
after(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

const vectorClose = (actual, expected) => assert.ok(actual.distanceTo(expected) < 1e-9);

// Use actual model geometry, camera projection and raycasting. The lightweight
// renderer/controls stand-ins only replace the browser's WebGL/DOM plumbing.
function viewerForTest(t, config = createDefaultConfig(), { configurable = false } = {}) {
  const originalDocument = globalThis.document;
  if (configurable) globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({
    createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }), putImageData() {},
  }) }) };
  const material = configurable ? null : new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const materials = configurable ? createBagMaterials(config) : { body: material, bottom: material, handle: material,
    inside: material, seam: material, pocket: material };
  const model = createProductModel(config, materials);
  const rect = { left: 0, top: 0, width: 600, height: 540 };
  const listeners = new Map();
  const canvas = {
    getBoundingClientRect: () => rect,
    toDataURL: () => 'data:image/png;base64,AA==',
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener() {}, remove() {},
  };
  const renderer = {
    domElement: canvas,
    info: { render: { triangles: 1 }, memory: { geometries: 30, textures: 2 } },
    setPixelRatio(value) { this.pixelRatio = value; },
    setSize() {},
    render() {},
    dispose() {}, forceContextLoss() {},
  };
  const viewer = Object.create(Product3DViewer.prototype);
  Object.assign(viewer, {
    config,
    model,
    scene: new THREE.Scene(),
    renderer,
    camera: new THREE.PerspectiveCamera(38, rect.width / rect.height, 0.01, 12),
    controls: { target: new THREE.Vector3(), enableDamping: true, enablePan: false, update() {}, removeEventListener() {}, dispose() {} },
    container: { getBoundingClientRect: () => rect },
    _bounds: new THREE.Box3().setFromObject(model),
    _magnifier: false,
    _activePointers: new Set(),
    _raycaster: new THREE.Raycaster(),
    _size: { width: rect.width, height: rect.height },
    _framed: true,
    requestRender() {},
  });
  viewer.scene.add(model);
  if (configurable) {
    viewer.materials = materials;
    viewer.contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
  }
  viewer.setView('front');
  t.after(() => {
    if (configurable) {
      viewer.dispose();
      if (originalDocument === undefined) delete globalThis.document;
      else globalThis.document = originalDocument;
    } else { disposeBagModel(model); material.dispose(); }
  });
  return { viewer, rect, listeners };
}

test('detail distance and metrics enforce the 100–600% range', () => {
  // Metrics must remain available when WebGL initialization has failed before
  // camera controls exist, so the editor can show its existing fallback.
  assert.equal(Object.create(Product3DViewer.prototype).getZoomMetrics().percent,100);
  assert.equal(clampDetailDistance(10, 1.2), 1.2);
  assert.equal(clampDetailDistance(0.001, 1.2), 0.2);
  assert.equal(clampDetailDistance(0.001, 1.2, 0.3), 0.3);
  assert.deepEqual(detailZoomMetrics(true, 1.2, 0.6), {
    enabled: true, percent: 200, minPercent: 100, maxPercent: 600, canZoomIn: true, canZoomOut: true,
  });
  assert.equal(detailZoomMetrics(true, 1.2, 0.2).canZoomIn, false);
  assert.equal(detailZoomMetrics(true, 1.2, 1.2).canZoomOut, false);
});

test('a detail camera remains outside the product when orbiting around a surface focus', () => {
  const bounds = new THREE.Box3(new THREE.Vector3(-0.25, 0, -0.09), new THREE.Vector3(0.25, 0.65, 0.09));
  const target = new THREE.Vector3(0, 0.17, 0.08);
  for (const direction of [new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0.2, -0.3).normalize()]) {
    const minimum = safeDetailDistance(bounds, target, direction);
    const position = target.clone().addScaledVector(direction, minimum);
    assert.equal(bounds.clone().expandByScalar(0.01).containsPoint(position), false);
  }
});

test('magnifier uses the real 3D camera and leaves config and model resources untouched', t => {
  const { viewer } = viewerForTest(t);
  const configBefore = JSON.stringify(viewer.config);
  const modelBefore = viewer.model;
  const initialDistance = viewer.camera.position.distanceTo(viewer.controls.target);
  viewer.setMagnifier(true);
  assert.equal(viewer.getZoomMetrics().percent, 200);
  assert.ok(viewer.camera.position.distanceTo(viewer.controls.target) < initialDistance);
  assert.equal(viewer.controls.enablePan, true);
  assert.equal(viewer.renderer.pixelRatio, 2);
  viewer.zoomBy(1.25);
  assert.equal(viewer.getZoomMetrics().percent, 250);
  viewer.zoomBy(100);
  assert.equal(viewer.getZoomMetrics().percent, 600);
  assert.equal(viewer.getZoomMetrics().canZoomIn, false);
  viewer.zoomBy(0.001);
  assert.equal(viewer.getZoomMetrics().percent, 100);
  assert.equal(viewer.getZoomMetrics().canZoomOut, false);
  assert.equal(viewer.model, modelBefore);
  assert.equal(JSON.stringify(viewer.config), configBefore);
});

test('embroidery detail can resolve thread rows while every product stays outside the near plane and returns to normal print zoom', t => {
  for (const id of Object.keys(PRODUCT3D_PROFILES)) {
    const config=createDefaultConfig(id);
    Object.assign(config.print.front,{image:'data:image/png;base64,detail',appearance:'embroidery'});
    const {viewer}=viewerForTest(t,config);
    const before=JSON.stringify(config);
    viewer.setMagnifier(true);viewer.zoomBy(100);
    const metrics=viewer.getZoomMetrics();
    assert.ok(metrics.percent>600 && metrics.percent<=1600,id);
    assert.equal(metrics.canZoomIn,false,id);
    assert.ok(viewer.camera.position.distanceTo(viewer.controls.target)>=viewer.camera.near*1.5-1e-8,id);
    assert.equal(viewer._bounds.clone().expandByScalar(.01).containsPoint(viewer.camera.position),false,id);
    assert.equal(JSON.stringify(config),before,id);
    config.print.front.appearance='print';viewer._constrainDetailCamera();
    assert.equal(viewer.getZoomMetrics().percent,600,id);
    viewer.resetZoom();assert.equal(viewer.getZoomMetrics().percent,100,id);
  }
});

test('raycast focus selects a real bag surface and stays fixed across a layout resize', t => {
  const { viewer, rect } = viewerForTest(t);
  viewer.setMagnifier(true);
  viewer.camera.updateMatrixWorld();
  const surface = frontSurfaceMM(70, 40, viewer.config);
  const ndc = new THREE.Vector3(surface.x, surface.y, surface.z).project(viewer.camera);
  assert.equal(viewer._focusAt((ndc.x + 1) * rect.width / 2, (1 - ndc.y) * rect.height / 2), true);
  assert.ok(viewer.controls.target.x > 0.05);
  const focus = viewer.controls.target.clone();
  rect.width = 420;
  rect.height = 700;
  viewer.resize();
  vectorClose(viewer.controls.target, focus);
  assert.equal(viewer.getZoomMetrics().enabled, true);
  assert.equal(viewer.getZoomMetrics().percent, 200);
});

test('a three-view consultation capture restores focused zoom and suppresses temporary UI state', async t => {
  const { viewer } = viewerForTest(t);
  viewer.setMagnifier(true);
  viewer.zoomBy(1.25);
  const originalPosition = viewer.camera.position.clone();
  const originalTarget = viewer.controls.target.clone();
  const originalZoom = viewer.getZoomMetrics();
  const originalRatio = viewer.renderer.pixelRatio;
  const originalProjection = [viewer.camera.fov, viewer.camera.near, viewer.camera.far];
  const uiMetrics = [];
  viewer.onMetrics = value => uiMetrics.push(value);
  const originalCapture = viewer.capture.bind(viewer);
  viewer.capture = () => { viewer._emitMetrics(true); return originalCapture(); };
  const captures = await viewer.captureViews();
  assert.deepEqual(captures.map(value => value.label), ['입체', '앞면', '뒷면']);
  assert.equal(uiMetrics.length, 0);
  vectorClose(viewer.camera.position, originalPosition);
  vectorClose(viewer.controls.target, originalTarget);
  assert.deepEqual(viewer.getZoomMetrics(), originalZoom);
  assert.equal(viewer.renderer.pixelRatio, originalRatio);
  assert.equal(viewer.controls.enablePan, true);
  assert.deepEqual([viewer.camera.fov, viewer.camera.near, viewer.camera.far], originalProjection);
  viewer._emitMetrics(true);
  assert.equal(uiMetrics[0].zoom.enabled, true);
  assert.equal(uiMetrics[0].zoom.percent, 250);
});

test('dragging and two-finger gestures do not trigger a click-focus operation', t => {
  const { viewer, listeners } = viewerForTest(t);
  viewer.setMagnifier(true);
  viewer._installDetailFocus();
  let focusCalls = 0;
  viewer._focusAt = () => { focusCalls += 1; return true; };
  const event = (id, x, type = 'mouse') => ({ pointerId: id, button: 0, clientX: x, clientY: 130, pointerType: type });
  listeners.get('pointerdown')(event(1, 120));
  listeners.get('pointermove')(event(1, 150));
  listeners.get('pointerup')(event(1, 150));
  assert.equal(focusCalls, 0);
  listeners.get('pointerdown')(event(1, 120));
  listeners.get('pointerup')(event(1, 120));
  assert.equal(focusCalls, 1);
  listeners.get('pointerdown')(event(1, 120, 'touch'));
  listeners.get('pointerdown')(event(2, 180, 'touch'));
  listeners.get('pointerup')(event(1, 120, 'touch'));
  listeners.get('pointerup')(event(2, 180, 'touch'));
  assert.equal(focusCalls, 1);
});

test('named views and 전체 보기 return to full framing and the normal resolution cap', t => {
  const { viewer } = viewerForTest(t);
  viewer.setMagnifier(true);
  viewer.zoomBy(1.25);
  viewer.setView('back');
  assert.equal(viewer.getZoomMetrics().enabled, false);
  assert.equal(viewer.getZoomMetrics().percent, 100);
  assert.equal(viewer.controls.enablePan, false);
  assert.equal(viewer.renderer.pixelRatio, 1.75);
  viewer.setMagnifier(true);
  viewer.resetZoom();
  assert.equal(viewer.getZoomMetrics().enabled, false);
  assert.equal(viewer.getZoomMetrics().percent, 100);
  vectorClose(viewer.controls.target, viewer._bounds.getCenter(new THREE.Vector3()));
});

test('print focus fits lower, rotated artwork on every bag and both faces without moving the design', t => {
  for (const id of Object.keys(PRODUCT3D_PROFILES)) for (const side of ['front', 'back']) {
    const config = createDefaultConfig(id);
    config.options.doubleSided = true;
    Object.assign(config.print[side], { image: 'data:image/png;base64,fixture', width: 95, height: 60,
      x: 10, y: -config.dimensions.height / 2 + 48, rotation: 18 });
    const { viewer, rect } = viewerForTest(t, normalizeConfig(config));
    const texture = new THREE.Texture(), mesh = createPrintMesh(viewer.config, texture, side);
    viewer._ensurePrintStates(); viewer._printStates[side].mesh = mesh;
    if (side === 'front') viewer.printMesh = mesh;
    t.after(() => { disposePrintMesh(mesh); texture.dispose(); });
    const before = JSON.stringify(viewer.config);
    assert.equal(viewer.focusPrint(side), true, `${id}/${side}`);
    for (const [width, height] of [[900, 460], [390, 220]]) {
      Object.assign(rect, { width, height }); viewer.resize(); viewer.camera.updateMatrixWorld();
      mesh.updateMatrixWorld(true);
      const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
      for (let i = 0; i < index.count; i++) {
        const point = new THREE.Vector3().fromBufferAttribute(position, index.getX(i))
          .applyMatrix4(mesh.matrixWorld).project(viewer.camera);
        assert.ok(Math.abs(point.x) <= 0.8 && Math.abs(point.y) <= 0.8 && Math.abs(point.z) < 1,
          `${id}/${side}/${width}×${height}: clipped artwork at ${point.toArray()}`);
      }
      assert.ok(viewer.controls.target.y < viewer.config.dimensions.height / 2000);
    }
    assert.equal(JSON.stringify(viewer.config), before);
  }
});

test('inner print focus keeps the complete pocket design in frame across responsive layouts and capture', async t => {
  const config = createDailyConfig(); config.options.innerPocketPrint = true;
  Object.assign(config.print.innerPocket, { image: 'data:image/png;base64,fixture', width: 100, height: 65, y: -15 });
  const { viewer, rect } = viewerForTest(t, normalizeConfig(config));
  const texture = new THREE.Texture(), mesh = createPrintMesh(viewer.config, texture, 'innerPocket');
  viewer._ensurePrintStates(); viewer._printStates.innerPocket.mesh = mesh;
  t.after(() => { disposePrintMesh(mesh); texture.dispose(); });
  assert.equal(viewer.focusPrint('innerPocket'), true);
  for (const [width, height] of [[900, 460], [390, 220]]) {
    Object.assign(rect, { width, height }); viewer.resize(); viewer.camera.updateMatrixWorld();
    const positions = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
    for (let i = 0; i < index.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(positions, index.getX(i)).project(viewer.camera);
      assert.ok(Math.abs(point.x) <= 0.8 && Math.abs(point.y) <= 0.8 && Math.abs(point.z) < 1);
    }
  }
  const camera = viewer.camera.position.clone(), target = viewer.controls.target.clone();
  await viewer.captureViews();
  assert.equal(viewer._printFocusSide, 'innerPocket');
  vectorClose(viewer.camera.position, camera); vectorClose(viewer.controls.target, target);
});

test('wheel and pinch activate detail controls without the old fixed-zoom camera jump', t => {
  const { viewer, listeners } = viewerForTest(t);
  viewer._installDetailFocus();
  const camera = viewer.camera.position.clone(), target = viewer.controls.target.clone();
  listeners.get('wheel')({ deltaY: -100 });
  assert.equal(viewer.getZoomMetrics().enabled, true);
  assert.equal(viewer.controls.enablePan, true);
  assert.equal(viewer.controls.zoomToCursor, true);
  vectorClose(viewer.camera.position, camera); vectorClose(viewer.controls.target, target);
  viewer.resetZoom();
  const down = id => listeners.get('pointerdown')({ pointerId: id, pointerType: 'touch', clientX: 200, clientY: 140 });
  down(1); assert.equal(viewer.getZoomMetrics().enabled, false);
  down(2); assert.equal(viewer.getZoomMetrics().enabled, true);
  vectorClose(viewer.camera.position, camera); vectorClose(viewer.controls.target, target);
});

test('screen move uses one-finger and left-drag pan, preserves zoom during capture, and never click-focuses', async t => {
  const { viewer, listeners } = viewerForTest(t);
  const before = JSON.stringify(viewer.config), camera = viewer.camera.position.clone();
  viewer.setPanMode(true);
  vectorClose(viewer.camera.position, camera);
  assert.equal(viewer.controls.mouseButtons.LEFT, THREE.MOUSE.PAN);
  assert.equal(viewer.controls.touches.ONE, THREE.TOUCH.PAN);
  viewer.zoomBy(2);
  viewer._installDetailFocus();
  let focusCalls = 0; viewer._focusAt = () => focusCalls++;
  const event = { pointerId: 1, button: 0, clientX: 120, clientY: 130, pointerType: 'mouse' };
  listeners.get('pointerdown')(event); listeners.get('pointerup')(event);
  assert.equal(focusCalls, 0);
  const zoom = viewer.getZoomMetrics(), panCamera = viewer.camera.position.clone();
  await viewer.captureViews();
  assert.equal(viewer.isPanMode(), true);
  assert.equal(viewer.controls.mouseButtons.LEFT, THREE.MOUSE.PAN);
  assert.deepEqual(viewer.getZoomMetrics(), zoom); vectorClose(viewer.camera.position, panCamera);
  viewer.setPanMode(false);
  assert.equal(viewer.controls.mouseButtons.LEFT, THREE.MOUSE.ROTATE);
  assert.equal(viewer.controls.touches.ONE, THREE.TOUCH.ROTATE);
  assert.deepEqual(viewer.getZoomMetrics(), zoom);
  viewer.setPanMode(true); viewer.resetZoom();
  assert.equal(viewer.isPanMode(), false);
  assert.equal(viewer.controls.mouseButtons.LEFT, THREE.MOUSE.ROTATE);
  assert.equal(JSON.stringify(viewer.config), before);
});

test('inside pocket cameras show readable artwork across shallow and standard gussets', t => {
  for (const depth of [30, 60, 100]) {
    const config = createDailyConfig();
    config.dimensions.depth = depth;
    config.options.innerPocketPrint = true;
    config.print.innerPocket.width = 120;
    config.print.innerPocket.height = 100;
    const { viewer } = viewerForTest(t, normalizeConfig(config));
    const texture = new THREE.Texture();
    const print = createPrintMesh(viewer.config, texture, 'innerPocket');
    t.after(() => { disposePrintMesh(print); texture.dispose(); });
    viewer.setView('inside');
    viewer.camera.updateMatrixWorld();
    viewer.model.updateMatrixWorld(true);
    print.updateMatrixWorld(true);
    for (const x of [-54, 0, 54]) for (const y of [-45, 0, 45]) {
      const point = innerPocketSurfaceMM(x, y, viewer.config);
      const target = new THREE.Vector3(point.x, point.y, point.z)
        .addScaledVector(new THREE.Vector3(point.normal.x, point.normal.y, point.normal.z), 0.00065);
      const ray = new THREE.Raycaster(viewer.camera.position, target.clone().sub(viewer.camera.position).normalize());
      const hit = ray.intersectObjects([viewer.model, print], true)[0];
      assert.ok(['innerPocket', 'printArea-innerPocket'].includes(hit?.object.name),
        `${depth} mm gusset: pocket point (${x}, ${y}) was obscured by ${hit?.object.name}.`);
    }
    assert.ok(viewer.camera.fov >= 60);
    assert.equal(viewer.camera.near, 0.001);
    assert.equal(viewer.controls.minPolarAngle, Math.PI / 2 - 0.3);
    const top = innerPocketSurfaceMM(0, 45, viewer.config);
    const bottom = innerPocketSurfaceMM(0, -45, viewer.config);
    const projectedTop = new THREE.Vector3(top.x, top.y, top.z).project(viewer.camera);
    const projectedBottom = new THREE.Vector3(bottom.x, bottom.y, bottom.z).project(viewer.camera);
    assert.ok(Math.abs(projectedTop.y - projectedBottom.y) > 0.6,
      `${depth} mm gusset: a 90 mm tall print should retain a readable screen height.`);
    viewer.setView('front');
    assert.equal(viewer.controls.minPolarAngle, 0.18);
    assert.equal(viewer.camera.fov, 6);
    assert.equal(viewer.camera.near, 0.1);
    viewer.setView('initial');
    assert.equal(viewer.camera.fov, 38);
    assert.equal(viewer.camera.near, 0.01);
  }
});

test('an inside consultation capture restores its projection, focus and camera limits', async t => {
  const config = createDailyConfig();
  config.options.innerPocketPrint = true;
  config.print.innerPocket.width = 70;
  config.print.innerPocket.height = 39.375;
  const { viewer } = viewerForTest(t, normalizeConfig(config));
  const texture = new THREE.Texture();
  const print = createPrintMesh(viewer.config, texture, 'innerPocket');
  viewer._printStates = { innerPocket: { mesh: print } };
  t.after(() => { disposePrintMesh(print); texture.dispose(); });
  viewer.setView('inside');
  viewer.setMagnifier(true);
  viewer.camera.updateMatrixWorld();
  const top = innerPocketSurfaceMM(0, 15, viewer.config);
  const bottom = innerPocketSurfaceMM(0, -15, viewer.config);
  const height = Math.abs(new THREE.Vector3(top.x, top.y, top.z).project(viewer.camera).y
    - new THREE.Vector3(bottom.x, bottom.y, bottom.z).project(viewer.camera).y);
  assert.ok(height > 0.55, '30 mm of the inside artwork should be legible at 200%.');
  assert.equal(viewer.getZoomMetrics().percent, 200);
  assert.equal(viewer.getZoomMetrics().maxPercent, 600);
  const before = {
    fov: viewer.camera.fov, near: viewer.camera.near, far: viewer.camera.far, position: viewer.camera.position.clone(),
    target: viewer.controls.target.clone(), polar: [viewer.controls.minPolarAngle, viewer.controls.maxPolarAngle],
    azimuth: [viewer.controls.minAzimuthAngle, viewer.controls.maxAzimuthAngle],
    distances: [viewer.controls.minDistance, viewer.controls.maxDistance], metrics: viewer.getZoomMetrics(),
  };
  const captures = await viewer.captureViews();
  assert.deepEqual(captures.map(value => value.label), ['입체', '앞면', '뒷면', '안쪽']);
  assert.ok(Math.abs(viewer.camera.fov - before.fov) < 1e-9);
  assert.equal(viewer.camera.near, before.near);
  assert.equal(viewer.camera.far, before.far);
  vectorClose(viewer.camera.position, before.position);
  vectorClose(viewer.controls.target, before.target);
  assert.deepEqual([viewer.controls.minPolarAngle, viewer.controls.maxPolarAngle], before.polar);
  assert.deepEqual([viewer.controls.minAzimuthAngle, viewer.controls.maxAzimuthAngle], before.azimuth);
  assert.ok(Math.abs(viewer.controls.minDistance - before.distances[0]) < 1e-9);
  assert.ok(Math.abs(viewer.controls.maxDistance - before.distances[1]) < 1e-9);
  assert.deepEqual(viewer.getZoomMetrics(), before.metrics);
});

test('the reference pocket has a constant-width frontal projection with its mounting band and bag context visible', t => {
  for (const depth of [30, 100]) for (const size of [[888, 433], [390, 600]]) {
    const config = createDailyConfig();
    config.dimensions.depth = depth;
    config.options.innerPocket = true;
    const { viewer, rect } = viewerForTest(t, normalizeConfig(config));
    [rect.width, rect.height] = size;
    viewer.resize();
    const originalPosition = viewer.camera.position.clone();
    const originalTarget = viewer.controls.target.clone();
    const configBefore = JSON.stringify(viewer.config);
    viewer.setView('inside');
    viewer.camera.updateMatrixWorld();
    viewer.model.updateMatrixWorld(true);
    vectorClose(viewer.camera.position.clone().sub(viewer.controls.target).normalize(), new THREE.Vector3(0, 0, 1));
    const project = (x, y) => {
      const point = innerPocketSurfaceMM(x, y, viewer.config);
      assert.equal(point.visible, true);
      return new THREE.Vector3(point.x, point.y, point.z).project(viewer.camera);
    };
    const upperLeft = project(-70, 45), upperRight = project(70, 45);
    const lowerLeft = project(-70, -38), lowerRight = project(70, -38);
    assert.ok(Math.abs((upperRight.x - upperLeft.x) - (lowerRight.x - lowerLeft.x)) < 1e-9,
      `${depth} mm / ${size}: the pouch must not taper into a trapezoid.`);
    assert.ok(Math.abs(upperLeft.x - lowerLeft.x) < 1e-9);
    assert.ok(Math.abs(upperRight.x - lowerRight.x) < 1e-9);
    assert.ok(viewer.model.getObjectByName('innerPocketMountingBand'), 'the upper mounting band must be part of the view.');
    viewer.model.traverse(part => {
      if (!part.isMesh || !part.name.startsWith('innerPocket')) return;
      const position = part.geometry.attributes.position;
      for (let index = 0; index < position.count; index += 1) {
        const point = new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(part.matrixWorld).project(viewer.camera);
        assert.ok(Math.abs(point.x) < 0.9 && Math.abs(point.y) < 0.9,
          `${depth} mm / ${size}: ${part.name} should stay inside the frame with fabric context.`);
      }
    });
    const contextRay = new THREE.Raycaster();
    contextRay.setFromCamera(new THREE.Vector2(-0.9, 0), viewer.camera);
    const context = contextRay.intersectObject(viewer.model, true)[0];
    assert.ok(context && !context.object.name.startsWith('innerPocket'), 'surrounding bag fabric should remain visible.');
    assert.equal(JSON.stringify(viewer.config), configBefore);
    viewer.setView('front');
    vectorClose(viewer.camera.position, originalPosition);
    vectorClose(viewer.controls.target, originalTarget);
    assert.equal(viewer.camera.fov, 6);
    assert.equal(viewer.camera.near, 0.1);
  }
});

test('cross-strap length changes rebuild its real geometry and keep the full product framed', async t => {
  const config = createDailyConfig();
  config.options.crossStrap = true;
  config.crossStrap.length = 500;
  const { viewer } = viewerForTest(t, normalizeConfig(config), { configurable: true });
  await viewer.setConfig(config, { frame: true });
  const heights = [];
  for (const length of [500, 800, 1400]) {
    const before = viewer.model;
    const oldStrap = before.getObjectByName('crossStrap');
    let oldGeometryDisposals = 0;
    oldStrap.geometry.addEventListener('dispose', () => { oldGeometryDisposals += 1; });
    const changed = structuredClone(viewer.config);
    changed.crossStrap.length = length;
    await viewer.setConfig(changed);
    if (length !== 500) {
      assert.notEqual(viewer.model, before);
      assert.equal(oldGeometryDisposals, 1);
    } else assert.equal(viewer.model, before);
    assert.ok(Math.abs(viewer.model.userData.metrics.crossStrap.centerlineLengthMm - length) < 0.1);
    const strap = viewer.model.getObjectByName('crossStrap');
    heights.push(new THREE.Box3().setFromObject(strap).getSize(new THREE.Vector3()).y);
    viewer.camera.updateMatrixWorld();
    const box = new THREE.Box3().setFromObject(viewer.model);
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const point = new THREE.Vector3(x, y, z).project(viewer.camera);
      assert.ok(Math.abs(point.x) < 0.9 && Math.abs(point.y) < 0.9,
        `${length} mm strap: the full bag and strap should stay in view.`);
    }
  }
  assert.ok(heights[0] < heights[1] && heights[1] < heights[2], 'the rendered strap must visibly lengthen.');
});

test('inside views include the right-hand sewn label with or without a pocket on desktop and mobile', async t => {
  for (const depth of [30, 100]) for (const pocket of [false, true]) for (const size of [[888, 433], [390, 600]]) {
    const config = createDailyConfig();
    config.dimensions.depth = depth;
    config.options.innerPocket = pocket;
    config.options.nameTag = true;
    const { viewer, rect } = viewerForTest(t, normalizeConfig(config));
    [rect.width, rect.height] = size;
    viewer.resize();
    viewer.setView('inside');
    viewer.camera.updateMatrixWorld();
    viewer.model.updateMatrixWorld(true);
    const tag = viewer.model.getObjectByName('nameTag');
    assert.ok(tag);
    viewer.model.traverse(part => {
      if (!part.isMesh || !part.name.startsWith('nameTag')) return;
      const position = part.geometry.attributes.position;
      for (let index = 0; index < position.count; index += 1) {
        const point = new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(part.matrixWorld).project(viewer.camera);
        assert.ok(Math.abs(point.x) < 0.9 && Math.abs(point.y) < 0.9,
          `${depth} mm / ${pocket ? 'pocket' : 'label only'} / ${size}: ${part.name} must be fully visible.`);
      }
    });
    const center = new THREE.Box3().setFromObject(tag).getCenter(new THREE.Vector3());
    const ray = new THREE.Raycaster(viewer.camera.position, center.clone().sub(viewer.camera.position).normalize());
    const hit = ray.intersectObject(viewer.model, true)[0];
    assert.ok(hit?.object.name.startsWith('nameTag'), `${size}: the label should be in front of the lining.`);
    if (!pocket) {
      viewer.setMagnifier(true);
      vectorClose(viewer.controls.target, center);
      assert.equal(viewer.getZoomMetrics().percent, 200);
      const position = viewer.camera.position.clone();
      const captures = await viewer.captureViews();
      assert.deepEqual(captures.map(view => view.label), ['입체', '앞면', '뒷면', '안쪽']);
      vectorClose(viewer.camera.position, position);
      vectorClose(viewer.controls.target, center);
      assert.equal(viewer.getZoomMetrics().percent, 200);
    }
  }
});

test('telephoto front/back frames fit every product and extreme straps within control and clipping limits on desktop and mobile', t => {
  const extreme=createDailyConfig();
  extreme.dimensions={width:600,height:600,depth:300};
  extreme.handle.drop=450;extreme.handle.width=70;
  extreme.options.crossStrap=true;extreme.crossStrap.length=1400;
  const configs=[...Object.keys(PRODUCT3D_PROFILES).map(id=>createDefaultConfig(id)),normalizeConfig(extreme)];
  for(const config of configs)for(const size of [[888,433],[390,600]]) {
    const {viewer,rect}=viewerForTest(t,config);
    [rect.width,rect.height]=size;viewer.resize();
    for(const view of ['front','back']) {
      viewer.setView(view);viewer.camera.updateMatrixWorld();
      assert.equal(viewer.camera.fov,6);
      assert.ok(viewer.controls.maxDistance>=viewer._fitDistance*1.19,'OrbitControls must not pull a telephoto fit closer');
      const box=viewer._bounds;
      const checkFrame=()=>{
        for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]) {
          const point=new THREE.Vector3(x,y,z).project(viewer.camera);
          assert.ok(Math.abs(point.x)<.9&&Math.abs(point.y)<.9&&point.z>-1&&point.z<1,
            `${config.productId} ${size} ${view}: full product must fit inside the frame and clipping planes`);
        }
      };
      checkFrame();
      const direction=viewer.camera.position.clone().sub(viewer.controls.target).normalize();
      viewer._placeCamera(viewer.controls.target.clone(),direction,viewer.controls.maxDistance);
      viewer.camera.updateMatrixWorld();checkFrame();
      viewer.setView(view);viewer.setMagnifier(true);viewer.zoomBy(100);
      assert.equal(viewer.getZoomMetrics().percent,600);
      assert.ok(!box.clone().expandByScalar(.01).containsPoint(viewer.camera.position),'detail camera must remain outside the bag');
      viewer.camera.updateMatrixWorld();
      const focus=viewer.controls.target.clone().project(viewer.camera);
      assert.ok(focus.z>-1&&focus.z<1,'the detail focus must stay past the near plane at maximum zoom');
    }
    viewer.setView('initial');
    assert.equal(viewer.camera.fov,38);assert.equal(viewer.camera.near,.01);
  }
});

test('frontal telephoto projection preserves photographed thin handle crowns instead of expanding their depth into height',t=>{
  for(const id of ['small','sgak_s','kids'])for(const size of [[888,433],[390,600]]) {
    const {viewer,rect}=viewerForTest(t,createDefaultConfig(id));
    [rect.width,rect.height]=size;viewer.resize();viewer.setView('front');
    const projectedBand=()=>{
      viewer.camera.updateMatrixWorld();
      const config=viewer.config,H=config.dimensions.height,Z=config.dimensions.depth/2000;
      const top=new THREE.Vector3(0,H/1000,Z).project(viewer.camera).y;
      const bottom=new THREE.Vector3(0,0,Z).project(viewer.camera).y;
      const bodyMmPerNdc=H/(top-bottom),ranges=[];
      for(const side of ['Front','Back']) {
        const mesh=viewer.model.getObjectByName(`handlesLoop${side}`),positions=mesh.geometry.attributes.position;
        let highest=-Infinity,apex=null;
        for(let ring=0;ring<(positions.count-8)/8;ring++) {
          const vertices=Array.from({length:8},(_,index)=>new THREE.Vector3().fromBufferAttribute(positions,ring*8+index));
          const centerY=vertices.reduce((sum,vertex)=>sum+vertex.y,0)/8;
          if(centerY>highest){highest=centerY;apex=vertices;}
        }
        const physical=apex.map(point=>point.y*1000),screen=apex.map(point=>point.clone().project(viewer.camera).y);
        ranges.push({low:Math.min(...screen),high:Math.max(...screen),physical:Math.max(...physical)-Math.min(...physical)});
      }
      return {single:(ranges[0].high-ranges[0].low)*bodyMmPerNdc,
        union:(Math.max(...ranges.map(range=>range.high))-Math.min(...ranges.map(range=>range.low)))*bodyMmPerNdc,
        physical:ranges[0].physical};
    };
    const telephoto=projectedBand();
    assert.ok(Math.abs(telephoto.single-telephoto.physical)<2,
      `${id} ${size}: the frontal crown should retain its measured strip height`);
    assert.ok(telephoto.union<telephoto.physical+3,
      `${id} ${size}: the paired loops should not make a thick upper bar`);
    const direction=viewer.camera.position.clone().sub(viewer.controls.target).normalize();
    viewer.camera.fov=38;viewer.camera.near=.01;viewer.camera.updateProjectionMatrix();
    const former=viewer._frameMeasurements(direction);
    viewer._placeCamera(former.center,direction,former.distance);
    const shortLens=projectedBand();
    assert.ok(Math.abs(telephoto.union-telephoto.physical)<Math.abs(shortLens.union-shortLens.physical),
      'the actual camera projection must improve on the former short lens');
  }
});
