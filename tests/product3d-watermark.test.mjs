import test from 'node:test';
import assert from 'node:assert/strict';
import { captureWithWatermark } from '../assets/product3d/watermark.mjs';
import { Product3DViewer } from '../assets/product3d/viewer.mjs';

test('3D capture burns the visible watermark into full-resolution image pixels', () => {
  const previousDocument = globalThis.document;
  const source = { width: 1800, height: 1080 };
  const watermark = { width: 900, height: 540 };
  const layers = [];
  const output = { getContext: () => ({ drawImage: (...args) => layers.push(args) }),
    toDataURL: type => { assert.equal(type, 'image/png'); return 'watermarked-png'; } };
  globalThis.document = { createElement: type => { assert.equal(type, 'canvas'); return output; } };
  try {
    assert.equal(captureWithWatermark(source, watermark), 'watermarked-png');
    assert.equal(output.width, 1800);
    assert.equal(output.height, 1080);
    assert.deepEqual(layers, [[source, 0, 0], [watermark, 0, 0, 1800, 1080]]);
    const viewer = Object.assign(Object.create(Product3DViewer.prototype), {
      renderer: { domElement: source, render() {} }, controls: { update() {} },
      watermarkCanvas: watermark, _updateEmbroideryLOD() {},
    });
    assert.equal(viewer.capture(), 'watermarked-png');
    assert.equal(layers.length, 4);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
