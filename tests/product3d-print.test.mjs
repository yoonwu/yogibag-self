import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three/three.module.js';
import { createDefaultConfig, normalizeConfig, MM_TO_SCENE } from '../assets/product3d/config.mjs';
import { createPrintMesh, disposePrintMesh } from '../assets/product3d/print.mjs';

function configuration(dimensions, print = {}) {
  const config = createDefaultConfig();
  return normalizeConfig({ ...config, dimensions,
    print: { front: { ...config.print.front, width: 100, height: 60, ...print } } });
}

function sizeMm(mesh) {
  return new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3()).multiplyScalar(1 / MM_TO_SCENE);
}

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.25,
  `Expected ${expected} mm, received ${actual} mm (includes the 0.65 mm normal offset).`);

test('physical 100 × 60 mm artwork stays the same size across three bag dimensions', () => {
  const texture = new THREE.Texture();
  for (const dimensions of [
    { width: 320, height: 250, depth: 120 },
    { width: 450, height: 350, depth: 150 },
    { width: 250, height: 300, depth: 80 },
  ]) {
    const mesh = createPrintMesh(configuration(dimensions), texture);
    const actual = sizeMm(mesh);
    close(actual.x, 100);
    close(actual.y, 60);
    assert.equal(mesh.scale.x, 1);
    assert.equal(mesh.scale.y, 1);
    assert.ok(Array.from(mesh.geometry.attributes.position.array).every(Number.isFinite));
    assert.equal(mesh.material.map, texture);
    disposePrintMesh(mesh);
  }
  texture.dispose();
});

test('rotation changes the artwork orientation without changing its millimetre size', () => {
  const texture = new THREE.Texture();
  const mesh = createPrintMesh(configuration({ width: 480, height: 340, depth: 150 }, { rotation: 90 }), texture);
  const actual = sizeMm(mesh);
  close(actual.x, 60);
  close(actual.y, 100);
  disposePrintMesh(mesh);
  texture.dispose();
});

test('a print on the front pocket remains in front of that independent fabric surface', () => {
  const texture = new THREE.Texture();
  const config = configuration({ width: 480, height: 340, depth: 150 });
  const pocketPrint = createPrintMesh(config, texture);
  const barePrint = createPrintMesh({ ...config, options: { ...config.options, pocket: false } }, texture);
  const pocketPosition = pocketPrint.geometry.attributes.position;
  const barePosition = barePrint.geometry.attributes.position;
  const middle = Math.floor(pocketPosition.count / 2);
  assert.ok(pocketPosition.getZ(middle) > barePosition.getZ(middle) + 1 * MM_TO_SCENE);
  disposePrintMesh(pocketPrint);
  disposePrintMesh(barePrint);
  texture.dispose();
});

test('out-of-body artwork is clipped while its original requested width is retained', () => {
  const texture = new THREE.Texture();
  const dimensions = { width: 480, height: 340, depth: 150 };
  const centered = createPrintMesh(configuration(dimensions), texture);
  const partlyOutside = createPrintMesh(configuration(dimensions, { x: 220 }), texture);
  const outside = createPrintMesh(configuration(dimensions, { x: 300, width: 60 }), texture);
  assert.ok(partlyOutside.geometry.index.count > 0);
  assert.ok(partlyOutside.geometry.index.count < centered.geometry.index.count);
  assert.equal(partlyOutside.userData.printWidthMm, 100);
  assert.equal(outside.geometry.index.count, 0);
  for (const index of partlyOutside.geometry.index.array) {
    // Normal offset is less than 1 mm; no rendered vertex floats past an edge.
    assert.ok(Math.abs(partlyOutside.geometry.attributes.position.getX(index)) <= 241 * MM_TO_SCENE);
  }
  [centered, partlyOutside, outside].forEach(disposePrintMesh);
  texture.dispose();
});

test('disabled or missing artwork creates no print layer', () => {
  const config = createDefaultConfig();
  const texture = new THREE.Texture();
  assert.equal(createPrintMesh({ ...config, print: { front: { ...config.print.front, enabled: false } } }, texture), null);
  assert.equal(createPrintMesh(config, null), null);
  texture.dispose();
});

test('replacing print geometry disposes its own resources and retains the uploaded texture', () => {
  const texture = new THREE.Texture();
  const mesh = createPrintMesh(createDefaultConfig(), texture);
  const disposals = { geometry: 0, material: 0, texture: 0 };
  mesh.geometry.addEventListener('dispose', () => disposals.geometry += 1);
  mesh.material.addEventListener('dispose', () => disposals.material += 1);
  texture.addEventListener('dispose', () => disposals.texture += 1);
  disposePrintMesh(mesh);
  assert.deepEqual(disposals, { geometry: 1, material: 1, texture: 0 });
  texture.dispose();
  assert.equal(disposals.texture, 1);
});
