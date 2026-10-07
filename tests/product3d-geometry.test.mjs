import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three/three.module.js';
import { createDefaultConfig, normalizeConfig, mmToScene } from '../assets/product3d/config.mjs';
import { buildBagModel, disposeBagModel, frontSurfaceMM } from '../assets/product3d/model.mjs';

function makeMaterials() {
  return Object.fromEntries(['body', 'bottom', 'handle', 'inside', 'seam', 'pocket']
    .map(key => [key, new THREE.MeshBasicMaterial()]));
}

function build(dimensions, extra = {}) {
  const config = normalizeConfig({ ...createDefaultConfig(), ...extra, dimensions });
  const materials = makeMaterials();
  return { config, materials, bag: buildBagModel(config, materials) };
}

function close(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should equal ${expected}`);
}

function bodyBounds(bag) {
  const box = new THREE.Box3();
  for (const name of ['bodyFront', 'bodyBack', 'sideLeft', 'sideRight', 'bottomFrontPanel',
    'bottomBackPanel', 'bottomSideLeftPanel', 'bottomSideRightPanel', 'bottom']) {
    const mesh = bag.getObjectByName(name);
    if (mesh) box.union(mesh.geometry.boundingBox);
  }
  return box;
}

for (const dimensions of [
  { width: 320, height: 250, depth: 120 },
  { width: 450, height: 350, depth: 150 },
  { width: 250, height: 300, depth: 80 },
  { width: 480, height: 340, depth: 150 },
]) {
  test(`complete finite cloth geometry at ${dimensions.width}×${dimensions.height}×${dimensions.depth} mm`, () => {
    const { config, materials, bag } = build(dimensions);
    for (const name of ['bodyFront', 'bodyBack', 'sideLeft', 'sideRight', 'bottom',
      'bottomFrontPanel', 'bottomBackPanel', 'handleFrontLeft', 'handleFrontRight',
      'handleBackLeft', 'handleBackRight', 'handlesLoopFront', 'handlesLoopBack', 'seams',
      'liningFront', 'liningBack', 'liningBottom', 'openTopRim']) {
      assert.ok(bag.getObjectByName(name), `${name} exists`);
    }
    assert.ok(bag.userData.metrics.triangleCount < 25_000);
    assert.equal(bag.userData.metrics.openTop, true);
    bag.traverse(object => {
      if (!object.isMesh) return;
      assert.equal(object.scale.x, 1);
      assert.equal(object.scale.y, 1);
      assert.equal(object.scale.z, 1);
      const g = object.geometry;
      for (const key of ['position', 'normal', 'uv']) {
        assert.ok(g.getAttribute(key), `${object.name} has ${key}`);
        assert.ok(g.getAttribute(key).array.every(Number.isFinite), `${object.name} ${key} is finite`);
      }
      assert.ok([...g.index.array].every(index => index < g.getAttribute('position').count));
    });
    const box = bodyBounds(bag);
    close(box.min.y, 0);
    close(box.max.y, mmToScene(dimensions.height));
    assert.ok(box.max.x-box.min.x<=mmToScene(dimensions.width)+1e-6);
    assert.ok(box.max.x-box.min.x>mmToScene(dimensions.width*.90),'relaxed sides retain the stated maximum-width envelope');
    assert.ok(box.max.z <= mmToScene(dimensions.depth / 2) + 1e-6);
    assert.ok(box.min.z >= -mmToScene(dimensions.depth / 2) - 1e-6);
    for (const side of ['Front', 'Back']) {
      for (const position of ['Left', 'Right']) {
        const mesh = bag.getObjectByName(`handle${side}${position}`);
        const x = position === 'Left' ? -config.handle.gap / 2 : config.handle.gap / 2;
        const box = mesh.geometry.boundingBox;
        close(box.getCenter(new THREE.Vector3()).x, mmToScene(x), 1e-6);
        close(box.max.y, mmToScene(config.dimensions.height), 0.0002);
        close(box.min.y, mmToScene(config.bottomPanel.height - 1), 0.0002);
        const body = frontSurfaceMM(x, 0, { ...config, options: { pocket: false } });
        const vertex = mesh.geometry.getAttribute('position');
        const middle = 12 * 8;
        const stripZ = (vertex.getZ(middle) + vertex.getZ(middle + 4)) / 2;
        // Attachment follows the actual cloth surface, including at narrow bags.
        assert.ok(Math.abs(Math.abs(stripZ) - body.z) < 0.007);
      }
    }
    disposeBagModel(bag);
    Object.values(materials).forEach(material => material.dispose());
  });
}

test('outer panels face out, inner panels face in and floor seals the open bag', () => {
  const { bag } = build({ width: 480, height: 340, depth: 150 });
  function average(name, axis) {
    const normals = bag.getObjectByName(name).geometry.getAttribute('normal');
    let sum = 0;
    for (let i = 0; i < normals.count; i++) sum += axis === 'x' ? normals.getX(i) : axis === 'y' ? normals.getY(i) : normals.getZ(i);
    return sum / normals.count;
  }
  assert.ok(average('bodyFront', 'z') > 0.95);
  assert.ok(average('bodyBack', 'z') < -0.95);
  assert.ok(average('sideLeft', 'x') < -0.6);
  assert.ok(average('sideRight', 'x') > 0.6);
  assert.ok(average('liningFront', 'z') < -0.95);
  assert.ok(average('liningBack', 'z') > 0.95);
  assert.ok(average('bottom','y')<-.95,'curved cloth floor faces down');
  assert.ok(average('liningBottom','y')>.95,'curved lining floor faces up');
  disposeBagModel(bag);
});

test('width, height and depth changes preserve physical webbing dimensions and artwork coordinates', () => {
  const a = build({ width: 320, height: 250, depth: 120 });
  const b = build({ width: 450, height: 350, depth: 150 });
  const c = build({ width: 450, height: 350, depth: 230 });
  for (const sample of [a, b, c]) {
    const { bag, config } = sample;
    const metrics = bag.userData.metrics;
    assert.equal(metrics.handleWidth, 38);
    assert.equal(metrics.handleThickness, 2);
    assert.equal(metrics.handleDrop, 290);
    assert.equal(metrics.bottomPanelHeight, 75);
    const leg = bag.getObjectByName('handleFrontLeft');
    close(leg.geometry.boundingBox.getSize(new THREE.Vector3()).x, mmToScene(38));
    const loop = bag.getObjectByName('handlesLoopFront');
    close(loop.geometry.boundingBox.max.y, mmToScene(config.dimensions.height + config.handle.drop), 0.0002);
    const p0 = frontSurfaceMM(-50, -30, config), p1 = frontSurfaceMM(50, -30, config);
    close(p1.x - p0.x, mmToScene(100));
    close(p1.y - mmToScene(config.dimensions.height / 2), mmToScene(-30));
    assert.ok(p1.normal.z > 0.9);
  }
  assert.ok(bodyBounds(b.bag).getSize(new THREE.Vector3()).x > bodyBounds(a.bag).getSize(new THREE.Vector3()).x);
  assert.ok(bodyBounds(c.bag).getSize(new THREE.Vector3()).z > bodyBounds(b.bag).getSize(new THREE.Vector3()).z);
  [a, b, c].forEach(({ bag }) => disposeBagModel(bag));
});

test('an enabled external pocket has a distinct mesh and artwork conforms above its surface', () => {
  const { bag, config } = build({ width: 480, height: 340, depth: 150 });
  assert.ok(bag.getObjectByName('frontPocket'));
  const plain = frontSurfaceMM(0, 0, { ...config, options: { ...config.options, pocket: false } });
  const pocket = frontSurfaceMM(0, 0, config);
  assert.ok(pocket.z > plain.z + mmToScene(3));
  const noPocket = buildBagModel({ ...config, options: { ...config.options, pocket: false } }, makeMaterials());
  assert.equal(noPocket.getObjectByName('frontPocket'), undefined);
  disposeBagModel(bag);
  disposeBagModel(noPocket);
});

test('all allowed dimension extremes remain finite, including no bottom color panel', () => {
  for (const dimensions of [
    { width: 200, height: 150, depth: 30 },
    { width: 600, height: 600, depth: 300 },
    { width: 200, height: 600, depth: 300 },
    { width: 600, height: 150, depth: 30 },
  ]) {
    for (const panel of [0, 250]) {
      const { bag } = build(dimensions, { bottomPanel: { height: panel, color: '#171c28' } });
      bag.traverse(object => {
        if (object.geometry) assert.ok(object.geometry.getAttribute('position').array.every(Number.isFinite));
      });
      assert.ok(bag.userData.metrics.triangleCount < 25_000);
      disposeBagModel(bag);
    }
  }
});

test('short broad straps remain attached on the smallest body and never become tubes', () => {
  for (const dimensions of [
    { width: 200, height: 150, depth: 30 },
    { width: 200, height: 600, depth: 300 },
  ]) {
    for (const height of [0, 120]) {
      const { bag, config } = build(dimensions, {
        bottomPanel: { height, color: '#171c28' },
        handle: { width: 70, thickness: 5, drop: 80, gap: 60, color: '#171c28' },
      });
      assert.ok(config.handle.gap >= config.handle.width + 12);
      bag.updateMatrixWorld(true);
      const x = mmToScene(config.handle.gap / 2 + config.handle.width / 2 - 0.5);
      const y = bag.getObjectByName('handleFrontLeft').geometry.boundingBox.min.y+mmToScene(1.5);
      const raycaster = new THREE.Raycaster(new THREE.Vector3(x, y, 1), new THREE.Vector3(0, 0, -1));
      const hits = raycaster.intersectObjects(['bodyFront','sideRight','bottomFrontPanel','bottomSideRightPanel']
        .map(name=>bag.getObjectByName(name)).filter(Boolean));
      assert.ok(hits.length > 0, 'outer webbing edge still lies over the body, including its bottom fold');
      const loop = bag.getObjectByName('handlesLoopFront');
      close(loop.geometry.boundingBox.max.y, mmToScene(config.dimensions.height + 80), 0.0002);
      const leg = bag.getObjectByName('handleFrontLeft');
      close(leg.geometry.boundingBox.getSize(new THREE.Vector3()).x, mmToScene(config.handle.width));
      assert.ok(bag.userData.metrics.triangleCount < 25_000);
      disposeBagModel(bag);
    }
  }
});

test('model cleanup disposes each geometry while retaining viewer-owned shared materials', () => {
  const { bag, materials } = build({ width: 320, height: 250, depth: 120 });
  let geometryCount = 0, disposalCount = 0, materialDisposals = 0;
  bag.traverse(object => {
    if (!object.geometry) return;
    geometryCount++;
    object.geometry.addEventListener('dispose', () => disposalCount++);
  });
  for (const material of Object.values(materials)) material.addEventListener('dispose', () => materialDisposals++);
  disposeBagModel(bag);
  assert.equal(disposalCount, geometryCount);
  assert.equal(materialDisposals, 0);
  Object.values(materials).forEach(material => material.dispose());
});
