import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultConfig } from '../assets/product3d/config.mjs';
import { buildConsultationFiles } from '../assets/product3d/consultation.mjs';
import { dataURLBytes } from '../assets/product3d/zip.mjs';

// The export test only substitutes the spreadsheet writer; it exercises real file assembly.
class Workbook {
  constructor() { this.xlsx = { writeBuffer: async () => new Uint8Array([1, 2, 3]) }; }
  addWorksheet() {
    const cells = new Map();
    return { rowCount: 0, mergeCells() {}, addImage() {},
      getCell(key) { if (!cells.has(key)) cells.set(key, {}); return cells.get(key); },
      getRow() { return {}; },
      addRow() { this.rowCount++; return { eachCell() {}, getCell() { return {}; } }; },
    };
  }
  addImage() { return 1; }
}

test('embroidery consultation files record expression and export untouched source artwork on every selected side', async t => {
  const previousWindow = globalThis.window;
  globalThis.window = { ExcelJS: { Workbook } };
  t.after(() => { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; });
  const config = createDefaultConfig();
  config.options.doubleSided = true;
  config.options.innerPocketPrint = true;
  const sides = ['front', 'back', 'innerPocket'];
  for (const [index, side] of sides.entries()) Object.assign(config.print[side], {
    image: `data:image/png;base64,${['AA==', 'AQ==', 'Ag=='][index]}`, imageName: `${side}.png`,
    appearance: index === 1 ? 'print' : 'embroidery', width: 91 + index, height: 57 + index, x: 12, y: -19,
  });
  const originalImages = sides.map(side => config.print[side].image);
  const png = new Uint8Array(24);
  png.set([137, 80, 78, 71, 13, 10, 26, 10]);
  png.set(new TextEncoder().encode('IHDR'), 12);
  new DataView(png.buffer).setUint32(16, 10); new DataView(png.buffer).setUint32(20, 10);
  const views = [{ label: '앞면', dataURL: `data:image/png;base64,${Buffer.from(png).toString('base64')}` }];
  const bundle = await buildConsultationFiles(config, views, {}, 'YG3D-TEST');
  const decoder = new TextDecoder();
  const saved = JSON.parse(decoder.decode(bundle.files.find(file => file.name.endsWith('_시안설정.json')).data));
  const consultation = JSON.parse(decoder.decode(bundle.files.find(file => file.name.endsWith('_상담정보.json')).data));
  for (const [index, side] of sides.entries()) {
    const sideLabel = { front: '앞면', back: '뒷면', innerPocket: '안주머니' }[side];
    assert.equal(saved.print[side].appearance, config.print[side].appearance);
    assert.equal(saved.print[side].image, originalImages[index]);
    assert.equal(saved.print[side].width, config.print[side].width);
    assert.equal(saved.print[side].x, 12);
    const original = bundle.files.find(file => file.name.includes(`_${sideLabel}_인쇄원본_`));
    assert.deepEqual(original.data, dataURLBytes(originalImages[index]));
    const svg = decoder.decode(bundle.files.find(file => file.name.endsWith(`_평면인쇄_${sideLabel}.svg`)).data);
    assert.ok(svg.includes(`data-preview-appearance="${config.print[side].appearance}"`));
    assert.ok(svg.includes(`href="${originalImages[index]}"`));
    assert.ok(consultation.specs.find(spec => spec.label === `${sideLabel} 인쇄`).value.startsWith(`${index === 1 ? '인쇄' : '자수'} 미리보기 · `));
  }
  assert.deepEqual(sides.map(side => config.print[side].image), originalImages);
});
