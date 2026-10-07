import { createDefaultConfig, normalizeConfig, patchConfig, getPrintBoundsWarnings, getProductProfile, getProductLimits, getCrossStrapLengthMin, PRINT_SIDES, DESIGN_OPTION_LABELS } from './config.mjs?v=1.2.8';
import { POLY_BODY_COLOR_PRESETS } from './catalog.mjs?v=1.2.8';
import { configForProduct, Product3DCatalog } from './registry.mjs?v=1.2.8';
import { Product3DViewer } from './viewer.mjs?v=1.2.8';
import { FABRICS3D, FABRIC_COLOR_PRESETS } from './fabrics.mjs?v=1.2.8';
import { openProductPicker } from './product-picker.mjs?v=1.2.8';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
let instanceCount = 0;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text, className = 'p3d-button') {
  const node = element('button', className, text);
  node.type = 'button';
  return node;
}

function readPath(config, path) {
  return path.split('.').reduce((value, key) => value?.[key], config);
}

function clone(config) {
  return structuredClone(config);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function imageDataURL(file, mime) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했어요.'));
    reader.readAsDataURL(new Blob([file], { type: mime }));
  });
}

async function decodeImage(source) {
  const image = new Image();
  const ready = new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('이미지를 열지 못했어요. 다른 PNG 또는 JPG 파일을 선택해 주세요.'));
  });
  image.src = source;
  await ready;
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('이미지의 크기를 확인할 수 없어요.');
  return image;
}

async function validateImageFile(file) {
  if (!file || !file.size) throw new Error('빈 이미지 파일은 사용할 수 없어요.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('10MB 이하의 PNG 또는 JPG 이미지를 선택해 주세요.');
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!png && !jpeg) throw new Error('PNG 또는 JPG 이미지만 사용할 수 있어요.');
  const dataURL = await imageDataURL(file, png ? 'image/png' : 'image/jpeg');
  const decoded = await decodeImage(dataURL);
  return { dataURL, ratio: decoded.naturalWidth / decoded.naturalHeight };
}

function warningText(warning) {
  return typeof warning === 'string' ? warning : warning?.message || warning?.text || String(warning);
}

export function createProduct3DEditor(options = {}) {
  return new Product3DEditor(options);
}

export class Product3DEditor {
  constructor({ onConsult, onClose, initialConfig, onReturnTo2D, onDesignChange, onChange, onSelectProduct, productChoices } = {}) {
    this.config = normalizeConfig(initialConfig || createDefaultConfig());
    this.onConsult = onConsult;
    this.onClose = onClose;
    this.onReturnTo2D = onReturnTo2D;
    this.onDesignChange = onDesignChange || onChange;
    this.onSelectProduct = onSelectProduct;
    this.productChoices = productChoices;
    this.linked = typeof onReturnTo2D === 'function';
    this.printSide = 'front';
    this.cameraView = 'initial';
    this.printControls = new Map();
    this.imageRatios = {};
    this.id = `p3d-${++instanceCount}`;
    this.fields = new Map();
    this.viewer = null;
    this.disposed = false;
    this.visible = false;
    this.uploadGeneration = 0;
    this.productGeneration = 0;
    this.productDrafts = new Map([[this.config.productId, this.config]]);
    this.imageRatio = null;
    this.imageRatios = {};
    this.busy = false;
    this.controller = new AbortController();
    this.build();
    this.sync();
    this.readImageRatio();
  }

  listen(node, eventName, callback) {
    node.addEventListener(eventName, callback, { signal: this.controller.signal });
  }

  build() {
    this.root = element('div', 'p3d-overlay');
    this.root.hidden = true;
    this.dialog = element('section', 'p3d-dialog');
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.setAttribute('aria-labelledby', `${this.id}-title`);
    this.dialog.setAttribute('aria-describedby', `${this.id}-purpose`);
    this.root.append(this.dialog);

    const header = element('header', 'p3d-header');
    const heading = element('div', 'p3d-heading');
    heading.append(element('div', 'p3d-eyebrow', '3D 셀프 시안'));
    this.title = element('h2', 'p3d-title', this.config.productName);
    this.title.id = `${this.id}-title`;
    const purpose = element('p', 'p3d-purpose', '원하는 모습으로 꾸미고 이 시안으로 상담해 주세요');
    purpose.id = `${this.id}-purpose`;
    heading.append(this.title, purpose);
    this.closeButton = button(this.linked ? '2D로 보기' : '닫기', 'p3d-button p3d-close');
    this.closeButton.setAttribute('aria-label', this.linked ? '현재 시안을 유지하고 2D로 보기' : '3D 셀프 시안 닫기');
    this.listen(this.closeButton, 'click', () => this.close());
    const headerActions = element('div', 'p3d-header-actions');
    this.productPickerButton = button('가방 선택', 'p3d-button p3d-pick-product');
    this.productPickerButton.hidden = this.linked && !this.onSelectProduct;
    this.productPickerButton.setAttribute('aria-haspopup', 'dialog');
    this.listen(this.productPickerButton, 'click', () => this.openProductPicker());
    headerActions.append(this.productPickerButton, this.closeButton);
    header.append(heading, headerActions);

    const main = element('div', 'p3d-main');
    this.controls = element('aside', 'p3d-controls');
    this.controls.setAttribute('aria-label', '가방과 인쇄 설정');
    this.buildControls();

    this.preview = element('section', 'p3d-preview');
    this.preview.setAttribute('aria-label', '입체 가방 미리보기');
    const viewActions = element('div', 'p3d-view-actions');
    for (const [view, label] of [['front', '앞면 보기'], ['back', '뒷면 보기'], ['initial', '처음 각도'], ['inside', '안쪽 보기']]) {
      const control = button(label, 'p3d-button p3d-view-button');
      control.dataset.p3dView = view;
      if (view === 'inside') this.insideViewButton = control;
      this.listen(control, 'click', () => {
        try { this.setCameraView(view); } catch (error) { this.setStatus(error.message, true); }
      });
      viewActions.append(control);
    }
    this.magnifierButton = button('돋보기', 'p3d-button p3d-view-button p3d-magnifier-button');
    this.magnifierButton.setAttribute('aria-label', '돋보기');
    this.magnifierButton.setAttribute('aria-pressed', 'false');
    this.listen(this.magnifierButton, 'click', () => this.changeZoom(() => {
      const enabled = this.viewer.getZoomMetrics().enabled;
      this.viewer.setMagnifier(!enabled);
    }));
    viewActions.append(this.magnifierButton);
    this.focusPrintButton = button('인쇄 크게 보기', 'p3d-button p3d-view-button');
    this.listen(this.focusPrintButton, 'click', () => this.changeZoom(() => {
      const side = this.focusPrintSide();
      if (this.viewer.focusPrint(side)) this.cameraView = side === 'back' ? 'back' : side === 'innerPocket' ? 'inside' : 'front';
    }));
    this.panButton = button('화면 이동', 'p3d-button p3d-view-button p3d-pan-button');
    this.panButton.setAttribute('aria-pressed', 'false');
    this.listen(this.panButton, 'click', () => this.changeZoom(() => this.viewer.setPanMode(!this.viewer.isPanMode())));
    viewActions.append(this.focusPrintButton, this.panButton);
    const zoomActions = element('div', 'p3d-zoom-actions');
    zoomActions.setAttribute('role', 'group');
    zoomActions.setAttribute('aria-label', '3D 확대 조정');
    this.zoomOutButton = button('−', 'p3d-button p3d-zoom-step');
    this.zoomOutButton.setAttribute('aria-label', '3D 축소');
    this.zoomInButton = button('+', 'p3d-button p3d-zoom-step');
    this.zoomInButton.setAttribute('aria-label', '3D 확대');
    this.zoomPercent = element('output', 'p3d-zoom-percent', '100%');
    this.zoomPercent.setAttribute('aria-label', '3D 확대 비율');
    this.zoomPercent.dataset.p3dZoomPercent = '';
    this.resetZoomButton = button('전체보기', 'p3d-button p3d-view-button');
    this.resetZoomButton.setAttribute('aria-label', '전체 보기');
    this.listen(this.zoomOutButton, 'click', () => this.changeZoom(() => this.viewer.zoomBy(0.8)));
    this.listen(this.zoomInButton, 'click', () => this.changeZoom(() => this.viewer.zoomBy(1.25)));
    this.listen(this.resetZoomButton, 'click', () => this.changeZoom(() => this.viewer.resetZoom()));
    zoomActions.append(this.zoomOutButton, this.zoomPercent, this.zoomInButton, this.resetZoomButton);
    viewActions.append(zoomActions);
    this.viewerContainer = element('div', 'p3d-viewer');
    this.viewerContainer.setAttribute('aria-label', '마우스나 손가락으로 회전할 수 있는 3D 가방');
    this.embroideryPreparation=element('p','p3d-preparation-note','자수 질감을 준비하고 있어요. 화면은 계속 움직일 수 있어요.');
    this.embroideryPreparation.setAttribute('role','status');
    this.embroideryPreparation.hidden=true;
    this.viewerContainer.append(this.embroideryPreparation);
    this.viewerError = element('div', 'p3d-viewer-error');
    this.viewerError.hidden = true;
    this.viewerError.setAttribute('role', 'status');
    this.previewHint = element('p', 'p3d-preview-hint', '드래그해서 회전 · 휠이나 두 손가락으로 확대');
    this.dimensionSummary = element('p', 'p3d-dimension-summary');
    this.dimensionSummary.dataset.p3dDimensions = '';
    this.preview.append(viewActions, this.viewerContainer, this.viewerError, this.previewHint, this.dimensionSummary);

    if (new URLSearchParams(location.search).get('debug3d') === '1') {
      this.diagnostics = element('output', 'p3d-diagnostics');
      this.diagnostics.dataset.p3dDiagnostics = '';
      this.diagnostics.setAttribute('aria-label', '3D 진단 정보');
      this.preview.append(this.diagnostics);
    }
    main.append(this.controls, this.preview);

    const footer = element('footer', 'p3d-footer');
    const note = element('div', 'p3d-footer-copy');
    note.append(element('p', 'p3d-footer-note', '색상과 모양은 제작 상담을 위한 시안이에요.'));
    this.status = element('p', 'p3d-status');
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    note.append(this.status);
    this.consultButton = button('이 시안으로 상담하기', 'p3d-button p3d-primary');
    this.listen(this.consultButton, 'click', () => this.consult());
    footer.append(note, this.consultButton);
    this.dialog.append(header, main, footer);
    document.body.append(this.root);
    this.listen(this.root, 'click', event => { if (event.target === this.root) this.close(); });
    this.listen(this.root, 'keydown', event => this.onKeyDown(event));
  }

  panel(title, description) {
    const panel = element('section', 'p3d-panel');
    panel.append(element('h3', 'p3d-panel-title', title));
    if (description) panel.append(element('p', 'p3d-panel-description', description));
    this.controls.append(panel);
    return panel;
  }

  numeric(panel, path, label, fallback) {
    const limits = getProductLimits(this.config)[path] || fallback;
    const row = element('div', 'p3d-field');
    const labelNode = element('label', 'p3d-field-label', label);
    const id = `${this.id}-${path.replaceAll('.', '-')}`;
    labelNode.htmlFor = `${id}-number`;
    const numberWrap = element('div', 'p3d-number-wrap');
    const number = element('input', 'p3d-number');
    number.type = 'number';
    number.id = `${id}-number`;
    number.min = String(limits.min);
    number.max = String(limits.max);
    number.step = String(limits.step || 1);
    number.inputMode = 'decimal';
    number.setAttribute('aria-label', `${label} ${path.endsWith('rotation') ? '도' : '밀리미터'} 입력`);
    number.dataset.p3dField = path;
    const unit = element('span', 'p3d-unit', path.endsWith('rotation') ? '°' : 'mm');
    numberWrap.append(number, unit);
    const range = element('input', 'p3d-range');
    range.type = 'range';
    range.id = `${id}-range`;
    range.min = String(limits.min);
    range.max = String(limits.max);
    range.step = ['crossStrap.length', 'handle.width', 'handle.gap'].includes(path) ? 'any' : String(limits.step || 1);
    range.setAttribute('aria-label', `${label} 슬라이더`);
    range.dataset.p3dRange = path;
    const change = event => {
      const value = event.target.valueAsNumber;
      const currentLimits = getProductLimits(this.config)[path] || limits;
      const minimum = path === 'crossStrap.length' ? getCrossStrapLengthMin(this.config) : currentLimits.min;
      if (Number.isFinite(value)) this.change(path, clamp(value, minimum, currentLimits.max));
    };
    const commit = () => {
      const currentLimits = getProductLimits(this.config)[path] || limits;
      const value = number.valueAsNumber;
      const minimum = path === 'crossStrap.length' ? getCrossStrapLengthMin(this.config) : currentLimits.min;
      const normalized = clamp(value, minimum, currentLimits.max);
      if (Number.isFinite(value) && normalized !== readPath(this.config, path)) this.change(path, normalized);
      number.value = String(readPath(this.config, path));
      this.sync({ forceNumbers: true });
    };
    this.listen(number, 'input', change);
    this.listen(number, 'change', commit);
    this.listen(number, 'blur', commit);
    this.listen(range, 'input', change);
    row.append(labelNode, numberWrap, range);
    panel.append(row);
    this.fields.set(path, { type: 'number', number, range, limits, row, labelNode });
  }

  color(panel, path, label) {
    const group = element('div', 'p3d-color-group');
    group.dataset.p3dColorGroup = path;
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', `${label} 설정`);
    const row = element('div', 'p3d-color-field');
    const input = element('input', 'p3d-color');
    input.type = 'color';
    input.id = `${this.id}-${path.replaceAll('.', '-')}`;
    input.dataset.p3dField = path;
    input.setAttribute('aria-label', `${label} 선택`);
    input.title = '직접 색상 고르기';
    const labelNode = element('label', 'p3d-field-label', label);
    labelNode.htmlFor = input.id;
    const value = element('span', 'p3d-color-value');
    this.listen(input, 'input', event => this.change(path, event.target.value));
    row.append(labelNode, value, input);
    const presets = element('div', 'p3d-color-presets');
    presets.setAttribute('role', 'group');
    presets.setAttribute('aria-label', `${label} 추천 색상`);
    const availablePresets = path === 'body.color' ? [...FABRIC_COLOR_PRESETS,
      ...POLY_BODY_COLOR_PRESETS.filter(preset => !FABRIC_COLOR_PRESETS.some(existing => existing.hex === preset.hex))] : FABRIC_COLOR_PRESETS;
    const presetButtons = availablePresets.map(preset => {
      const control = button('', 'p3d-color-preset');
      control.setAttribute('aria-label', `${label} ${preset.name}`);
      control.setAttribute('aria-pressed', 'false');
      control.title = `${preset.name} (${preset.hex})`;
      control.dataset.p3dColor = path;
      control.dataset.p3dColorValue = preset.hex;
      control.dataset.p3dColorName = preset.name;
      control.tabIndex = -1;
      const swatch = element('span', 'p3d-preset-swatch');
      swatch.style.backgroundColor = preset.hex;
      swatch.setAttribute('aria-hidden', 'true');
      control.append(swatch, element('span', 'p3d-preset-name', preset.name));
      this.listen(control, 'click', () => this.change(path, preset.hex));
      presets.append(control);
      return control;
    });
    this.listen(presets, 'keydown', event => {
      const currentButtons = this.fields.get(path)?.activePresetButtons || presetButtons;
      const position = currentButtons.indexOf(event.target);
      if (position < 0 || event.target.disabled) return;
      const columns = Math.max(1, getComputedStyle(presets).gridTemplateColumns.split(' ').filter(Boolean).length);
      const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns };
      let next;
      if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = currentButtons.length - 1;
      else if (event.key in offsets) next = (position + offsets[event.key] + currentButtons.length) % currentButtons.length;
      else return;
      event.preventDefault();
      event.stopPropagation();
      presetButtons.forEach(control => { control.tabIndex = -1; });
      currentButtons[next].tabIndex = 0;
      currentButtons[next]?.focus();
    });
    const disabledNote = element('p', 'p3d-color-disabled-note', '주머니를 추가하면 색상을 고를 수 있어요.');
    disabledNote.hidden = true;
    group.append(row, presets, disabledNote);
    panel.append(group);
    this.fields.set(path, { type: 'color', input, value, group, presets, presetButtons, disabledNote, labelNode, label });
  }

  fabricSelect(panel) {
    const path = 'body.fabricId';
    const row = element('div', 'p3d-select-field');
    const id = `${this.id}-body-fabricId`;
    const label = element('label', 'p3d-field-label', '원단 종류');
    label.htmlFor = id;
    const input = element('select', 'p3d-select');
    input.id = id;
    input.dataset.p3dField = path;
    input.setAttribute('aria-label', '원단 종류');
    for (const fabric of FABRICS3D) {
      const option = element('option', '', fabric.name);
      option.value = fabric.id;
      input.append(option);
    }
    this.listen(input, 'change', event => this.change(path, event.target.value));
    row.append(label, input);
    panel.append(row);
    this.fields.set(path, { type: 'select', input, row });
  }

  checkbox(panel, path, label) {
    const row = element('label', 'p3d-check');
    const input = element('input');
    input.type = 'checkbox';
    input.id = `${this.id}-${path.replaceAll('.', '-')}`;
    input.dataset.p3dField = path;
    input.setAttribute('aria-label', label);
    row.htmlFor = input.id;
    const labelNode = element('span', '', label);
    row.append(input, labelNode);
    this.listen(input, 'change', event => this.change(path, event.target.checked));
    panel.append(row);
    this.fields.set(path, { type: 'checkbox', input, row, labelNode });
    return row;
  }

  buildControls() {
    const product = this.panel('가방 선택');
    product.hidden = this.linked && !this.onSelectProduct;
    const productRow = element('div', 'p3d-select-field');
    const productLabel = element('label', 'p3d-field-label', '3D 가방 선택');
    this.productSelect = element('select', 'p3d-select');
    this.productSelect.id = `${this.id}-product`;
    productLabel.htmlFor = this.productSelect.id;
    this.productSelect.setAttribute('aria-label', '3D 가방 선택');
    this.productSelect.dataset.p3dProduct = '';
    for (const productId of Product3DCatalog.keys()) {
      const option = element('option', '', configForProduct(productId).productName);
      option.value = productId;
      this.productSelect.append(option);
    }
    this.listen(this.productSelect, 'change', event => this.selectProduct(event.target.value));
    productRow.append(productLabel, this.productSelect);
    product.append(productRow);

    const colors = this.panel('원단 · 색상', '몸통·주머니·밑단에 같은 원단을 적용해요.');
    this.fabricDescription = colors.querySelector('.p3d-panel-description');
    this.fabricSelect(colors);
    this.color(colors, 'body.color', '몸통 색상');
    this.color(colors, 'pocket.color', '주머니 색상');
    this.color(colors, 'handle.color', '손잡이 색상');
    this.color(colors, 'bottomPanel.color', '밑단 색상');
    colors.append(element('p', 'p3d-fabric-note', '몸통 원단을 바꿔도 손잡이 원단은 유지돼요. 화면의 질감과 색상은 참고용이며 실제 원단은 상담에서 확인해 주세요.'));

    const bag = this.panel('가방 크기', '높이는 하단 배색을 포함한 전체 몸통 높이예요.');
    this.sizeDescription = bag.querySelector('.p3d-panel-description');
    this.numeric(bag, 'dimensions.width', '가방 너비', { min: 200, max: 700, step: 1 });
    this.numeric(bag, 'dimensions.height', '가방 높이', { min: 180, max: 600, step: 1 });
    this.numeric(bag, 'dimensions.depth', '가방 폭', { min: 30, max: 250, step: 1 });
    this.numeric(bag, 'bottomPanel.height', '하단 배색 높이', { min: 20, max: 200, step: 1 });

    const handle = this.panel('손잡이', '손잡이 간격은 두 끈 중심 사이의 거리예요.');
    this.handlePanel = handle;
    this.handleFabricNote = element('p', 'p3d-fabric-note');
    handle.append(this.handleFabricNote);
    const estimate = element('p', 'p3d-estimate-note', '손잡이 폭·간격·포켓은 샘플 추정값입니다.');
    this.estimateNote = estimate;
    estimate.title = '제품 사진을 바탕으로 잡은 샘플 치수예요. 원하는 치수로 바꾸고 상담에서 확인해 주세요.';
    handle.append(estimate);
    this.numeric(handle, 'handle.width', '손잡이 너비', { min: 15, max: 60, step: 1 });
    this.numeric(handle, 'handle.drop', '손잡이 길이', { min: 80, max: 400, step: 1 });
    this.numeric(handle, 'handle.gap', '손잡이 간격', { min: 80, max: 400, step: 1 });
    const details = element('details', 'p3d-details');
    details.append(element('summary', '', '손잡이 두께 조정'));
    this.numeric(details, 'handle.thickness', '손잡이 두께', { min: 1, max: 6, step: 0.5 });
    handle.append(details);

    const pocket = this.panel('앞면 포켓', '포켓 위치는 몸통 바닥부터 포켓 아래까지의 거리예요.');
    this.pocketPanel = pocket;
    this.checkbox(pocket, 'options.pocket', '앞면 포켓 추가');
    this.numeric(pocket, 'pocket.width', '포켓 너비', { min: 60, max: 400, step: 5 });
    this.numeric(pocket, 'pocket.height', '포켓 높이', { min: 40, max: 400, step: 5 });
    this.numeric(pocket, 'pocket.bottom', '포켓 아래 위치', { min: 0, max: 450, step: 5 });

    const options = this.panel('추가 옵션', '선택한 옵션을 2D와 3D에서 함께 유지해요.');
    for (const [key, label] of Object.entries(DESIGN_OPTION_LABELS)) {
      this.checkbox(options, `options.${key}`, label);
      if (key === 'crossStrap') this.numeric(options, 'crossStrap.length', '크로스끈 길이');
    }

    const print = this.panel('인쇄', 'PNG 또는 JPG · 각 이미지 최대 10MB');
    this.printSideSelect = element('select', 'p3d-select p3d-print-side-select');
    this.printSideSelect.setAttribute('aria-label', '인쇄 편집 면 선택');
    this.printSideSelect.dataset.p3dPrintSide = '';
    this.listen(this.printSideSelect, 'change', event => this.selectPrintSide(event.target.value));
    print.append(this.printSideSelect);
    for (const side of PRINT_SIDES) this.buildPrintSide(print, side);
    /* Existing front controls are built by the shared per-side helper. */
  }

  buildPrintSide(parent, side) {
    const label = { front: '앞면', back: '뒷면', innerPocket: '안주머니' }[side];
    const print = element('section', 'p3d-print-side');
    print.dataset.p3dSidePanel = side;
    parent.append(print);
    const path = key => `print.${side}.${key}`;
    const controls = { panel: print };
    this.printControls.set(side, controls);
    this.checkbox(print, path('enabled'), `${label} 인쇄 사용`);
    this.uploadInput = element('input', 'p3d-file-input');
    this.uploadInput.type = 'file';
    this.uploadInput.accept = 'image/png,image/jpeg,.png,.jpg,.jpeg';
    this.uploadInput.setAttribute('aria-label', `${label} 인쇄 PNG 또는 JPG 이미지 업로드`);
    this.uploadInput.id = `${this.id}-${side}-image-upload`;
    const uploadActions = element('div', 'p3d-action-row');
    this.uploadButton = button('이미지 올리기');
    this.uploadButton.setAttribute('aria-label', `${label} 인쇄 이미지 올리기 또는 교체`);
    this.deleteImageButton = button('삭제', 'p3d-button p3d-button-muted');
    this.deleteImageButton.setAttribute('aria-label', `${label} 인쇄 이미지 삭제`);
    Object.assign(controls, { uploadInput: this.uploadInput, uploadButton: this.uploadButton, deleteImageButton: this.deleteImageButton });
    this.listen(controls.uploadButton, 'click', () => controls.uploadInput.click());
    this.listen(controls.uploadInput, 'change', () => { this.pendingUpload = this.uploadImage(controls.uploadInput.files?.[0], side); });
    this.listen(this.deleteImageButton, 'click', () => {
      this.uploadGeneration++;
      this.imageRatios[side] = null;
      this.config = patchConfig(this.config, path('image'), null);
      this.config = patchConfig(this.config, path('imageName'), '');
      this.config = patchConfig(this.config, path('appearance'), 'print');
      this.apply();
      this.setStatus('인쇄 이미지를 삭제했어요.');
    });
    uploadActions.append(this.uploadButton, this.deleteImageButton);
    this.imagePreview = element('div', 'p3d-image-preview');
    this.imageThumbnail = element('img', 'p3d-image-thumbnail');
    this.imageThumbnail.alt = `${label}에 적용한 인쇄 이미지 미리보기`;
    this.imageName = element('span', 'p3d-image-name');
    this.imagePreview.append(this.imageThumbnail, this.imageName);
    const sample = button('샘플 로고 넣기', 'p3d-button p3d-sample-button');
    this.listen(sample, 'click', () => this.addSampleLogo(side));
    const appearanceButton = button('자수 모양으로 변경', 'p3d-button p3d-appearance-button');
    appearanceButton.dataset.p3dPrintAppearance = side;
    appearanceButton.setAttribute('aria-pressed', 'false');
    const appearanceStatus = element('p', 'p3d-appearance-status');
    appearanceStatus.setAttribute('role', 'status');
    this.listen(appearanceButton, 'click', () => {
      const p = this.config.print[side];
      if (!p.image) return;
      const appearance = p.appearance === 'embroidery' ? 'print' : 'embroidery';
      this.change(path('appearance'), appearance);
      this.setStatus(appearance === 'embroidery' ? '자수 모양으로 미리보고 있어요.' : '인쇄 모양으로 돌아왔어요.');
    });
    Object.assign(controls, { appearanceButton, appearanceStatus });
    print.append(this.uploadInput, uploadActions, this.imagePreview, sample, appearanceButton, appearanceStatus);
    this.checkbox(print, path('lockAspect'), `${label} 인쇄 이미지 비율 유지`);
    this.numeric(print, path('width'), `${label} 인쇄 너비`);
    this.numeric(print, path('height'), `${label} 인쇄 높이`);
    this.numeric(print, path('x'), `${label} 인쇄 좌우 위치`);
    this.numeric(print, path('y'), `${label} 인쇄 상하 위치`);
    this.numeric(print, path('rotation'), `${label} 인쇄 회전`);
    const center = button('권장 영역 가운데 맞추기', 'p3d-button p3d-center-button');
    this.listen(center, 'click', () => {
      this.config = patchConfig(this.config, path('x'), side === 'front' ? this.config.printArea.x : 0);
      this.config = patchConfig(this.config, path('y'), side === 'front' ? this.config.printArea.y : 0);
      this.apply();
    });
    print.append(element('p', 'p3d-panel-description p3d-coordinate-hint', `${side === 'innerPocket' ? '안주머니' : '해당 면의 몸통'} 중심 기준이에요. 그 면을 바라봤을 때 좌우 +는 오른쪽, 상하 +는 위쪽입니다.`));
    print.append(center);
    this.warnings = element('div', 'p3d-print-warnings');
    this.warnings.setAttribute('role', 'status');
    this.warnings.setAttribute('aria-live', 'polite');
    print.append(this.warnings);
    Object.assign(controls, { imagePreview: this.imagePreview, imageThumbnail: this.imageThumbnail, imageName: this.imageName, warnings: this.warnings });
    // Preserve public front-control references used by existing callers.
    for (const key of ['uploadInput', 'uploadButton', 'deleteImageButton', 'imagePreview', 'imageThumbnail', 'imageName', 'warnings']) {
      this[key] = this.printControls.get('front')[key];
    }
  }

  change(path, value) {
    if (this.disposed) return;
    const oldRatios = Object.fromEntries(PRINT_SIDES.map(side => [side, this.config.print[side].width / this.config.print[side].height]));
    this.config = patchConfig(this.config, path, value);
    const match = path.match(/^print\.(front|back|innerPocket)\.(width|height)$/);
    const side = match?.[1], front = this.config.print[side];
    if (match && front.lockAspect) {
      const ratio = this.imageRatios[side] || oldRatios[side] || 1;
      const otherPath = `print.${side}.${match[2] === 'width' ? 'height' : 'width'}`;
      const other = this.fields.get(otherPath);
      const next = match[2] === 'width' ? front.width / ratio : front.height * ratio;
      this.config = patchConfig(this.config, otherPath, clamp(next, other.limits.min, other.limits.max));
    }
    this.apply();
    if ((path === 'options.innerPocket' || path === 'options.innerPocketPrint') && value && this.config.options.innerPocket) {
      this.setCameraView('inside');
    }
  }

  apply({ frame = false, notify = true } = {}) {
    if (this.disposed) return;
    this.config = normalizeConfig(this.config);
    this.productDrafts.set(this.config.productId, this.config);
    this.sync();
    const generation = this.productGeneration;
    try {
      const result = this.viewer?.setConfig(this.config, { frame });
      if (frame) this.cameraView = 'initial';
      else if (!this.config.options.innerPocket && !this.config.options.nameTag && this.cameraView === 'inside') this.setCameraView('initial');
      result?.catch?.(error => { if (generation === this.productGeneration) this.setStatus(error.message, true); });
    } catch (error) { this.setStatus(error.message, true); }
    if (notify && this.onDesignChange) {
      try { this.onDesignChange(this.getConfig(), { printSide: this.printSide })?.catch?.(error => this.setStatus(error.message, true)); }
      catch (error) { this.setStatus(error.message, true); }
    }
  }

  sync({ forceNumbers = false } = {}) {
    const front = this.config.print.front;
    const profile = getProductProfile(this.config);
    this.insideViewButton.hidden = !this.config.options.innerPocket && !this.config.options.nameTag;
    this.insideViewButton.textContent = this.config.options.innerPocket ? '안주머니 보기' : '안쪽 보기';
    const crossStrapLength = this.fields.get('crossStrap.length');
    crossStrapLength.row.hidden = !this.config.options.crossStrap;
    crossStrapLength.number.min = crossStrapLength.range.min = String(getCrossStrapLengthMin(this.config));
    this.productSelect.value = this.config.productId;
    this.productSelect.disabled = this.busy || (this.linked && !this.onSelectProduct);
    if (this.productPickerButton) this.productPickerButton.disabled = this.busy;
    this.pocketPanel.hidden = !profile.supportsPocket;
    if (this.handlePanel) this.handlePanel.hidden = !profile.supportsHandles;
    if (this.handleFabricNote) this.handleFabricNote.textContent = `손잡이 원단: ${profile.handleFabricLabel}`;
    const handleColor = this.fields.get('handle.color');
    if (handleColor?.group) handleColor.group.hidden = !profile.supportsHandles;
    const fabricField = this.fields.get('body.fabricId');
    if (fabricField?.row) fabricField.row.hidden = profile.clothKind === 'poly';
    this.fields.get('pocket.color').group.hidden = !profile.supportsPocket;
    this.fields.get('bottomPanel.color').group.hidden = !profile.supportsBottomPanel || Boolean(profile.linkedHandleBottomColor);
    this.fields.get('bottomPanel.height').row.hidden = !profile.supportsBottomPanel;
    this.fabricDescription.textContent = profile.clothKind === 'poly' ? '폴리 / 합성 원단의 색상을 적용해요.' : profile.supportsPocket && profile.supportsBottomPanel
      ? '몸통·주머니·밑단에 같은 원단을 적용해요.' : profile.supportsBottomPanel ? '몸통·밑단에 같은 원단을 적용해요.' : '몸통에 선택한 원단을 적용해요.';
    const flat = profile.depthBasis === 'opening-estimate';
    this.sizeDescription.textContent = flat ? '평면 봉합형이에요. 입구 벌림은 3D 형태를 보기 위한 참고값이에요.' : profile.supportsBottomPanel
      ? '높이는 하단 배색을 포함한 전체 몸통 높이예요.' : '높이는 손잡이를 제외한 전체 몸통 높이예요.';
    const depthField = this.fields.get('dimensions.depth');
    if (depthField?.labelNode) {
      const label = flat ? '3D 입구 벌림 (참고)' : '가방 바닥 깊이';
      depthField.labelNode.textContent = label;
      depthField.number.setAttribute('aria-label', `${label} 밀리미터 입력`);
      depthField.range.setAttribute('aria-label', `${label} 슬라이더`);
    }
    this.estimateNote.textContent = profile.supportsPocket
      ? '손잡이 폭·간격·포켓은 샘플 추정값입니다.' : '손잡이 폭·길이·간격은 샘플 추정값입니다.';
    const limits = getProductLimits(this.config);
    for (const [path, field] of this.fields) {
      const value = readPath(this.config, path);
      if (field.type === 'number') {
        if (limits[path]) {
          field.limits = limits[path];
          field.number.min = field.range.min = String(path === 'crossStrap.length' ? getCrossStrapLengthMin(this.config) : limits[path].min);
          field.number.max = field.range.max = String(limits[path].max);
        }
        if (forceNumbers || document.activeElement !== field.number) field.number.value = String(Math.round(Number(value) * 100) / 100);
        field.range.value = String(value);
        field.range.setAttribute('aria-valuetext', `${Math.round(Number(value) * 100) / 100} ${path.endsWith('rotation') ? '도' : '밀리미터'}`);
      } else if (field.type === 'checkbox') {
        field.input.checked = Boolean(value);
        const option = path.startsWith('options.') ? path.slice(8) : null;
        if (option && Object.hasOwn(DESIGN_OPTION_LABELS, option)) {
          const allowed = profile.allowedOptions.includes(option), locked = profile.lockedOptions.includes(option);
          if (field.row) field.row.hidden = !allowed;
          field.input.disabled = locked || !allowed;
          field.input.setAttribute('aria-label', `${DESIGN_OPTION_LABELS[option]}${locked ? ' · 기본 포함' : ''}`);
          if (field.labelNode) field.labelNode.textContent = `${DESIGN_OPTION_LABELS[option]}${locked ? ' · 기본 포함' : ''}`;
          field.row?.classList?.toggle('p3d-check-locked', locked);
        }
      } else if (field.type === 'select') {
        field.input.value = value;
      } else {
        const label = path === 'handle.color' && profile.linkedHandleBottomColor ? '손잡이·밑단 색상' : field.label;
        if (field.labelNode) {
          field.labelNode.textContent = label;
          field.input.setAttribute('aria-label', `${label} 선택`);
          field.group.setAttribute('aria-label', `${label} 설정`);
          field.presets.setAttribute('aria-label', `${label} 추천 색상`);
          for (const control of field.presetButtons) control.setAttribute('aria-label', `${label} ${control.dataset.p3dColorName}`);
        }
        const hex = String(value || '#ece6d9').toLowerCase();
        const polyBody = path === 'body.color' && profile.clothKind === 'poly';
        const currentPresets = polyBody ? POLY_BODY_COLOR_PRESETS : FABRIC_COLOR_PRESETS;
        const selected = currentPresets.find(preset => preset.hex.toLowerCase() === hex);
        const fixed = path === 'body.color' && Boolean(profile.fixedBodyColor);
        const disabled = fixed || (path === 'pocket.color' && !this.config.options.pocket);
        field.input.value = hex;
        field.input.disabled = disabled;
        field.value.textContent = `${selected?.name || '직접 선택'} · ${hex.toUpperCase()}${fixed ? ' · 고정' : ''}`;
        field.group.classList.toggle('p3d-color-disabled', disabled);
        field.group.classList.toggle('p3d-color-fixed', fixed);
        field.group.setAttribute('aria-disabled', String(disabled));
        field.disabledNote.hidden = !disabled;
        field.disabledNote.textContent = fixed ? '몸통은 아이보리로 고정되어 있어요.' : '주머니를 추가하면 색상을 고를 수 있어요.';
        field.presets.hidden = fixed;
        const currentButtons = currentPresets.map(preset => field.presetButtons.find(control => control.dataset.p3dColorValue === preset.hex)).filter(Boolean);
        field.activePresetButtons = currentButtons;
        const mode = polyBody ? 'poly' : 'canvas';
        if (field.presets && field.presetMode !== mode) {
          field.presets.append(...currentButtons, ...field.presetButtons.filter(control => !currentButtons.includes(control)));
          field.presets.classList.toggle('p3d-color-presets-poly', polyBody);
          field.presetMode = mode;
        }
        const selectedIndex = currentButtons.findIndex(control => control.dataset.p3dColorValue.toLowerCase() === hex);
        field.presetButtons.forEach(control => {
          const index = currentButtons.indexOf(control);
          control.hidden = index < 0;
          control.disabled = disabled;
          control.setAttribute('aria-pressed', String(index >= 0 && index === selectedIndex));
          control.tabIndex = !disabled && index >= 0 && index === (selectedIndex < 0 ? 0 : selectedIndex) ? 0 : -1;
        });
      }
    }
    this.lastAspectRatio = front.width / front.height;
    this.title.textContent = this.config.productName;
    const availableSides = ['front', ...(this.config.options.doubleSided ? ['back'] : []), ...(this.config.options.innerPocketPrint ? ['innerPocket'] : [])];
    if (!availableSides.includes(this.printSide)) this.printSide = 'front';
    this.printSideSelect.replaceChildren(...availableSides.map(side => {
      const option = element('option', '', { front: '앞면 인쇄', back: '뒷면 인쇄', innerPocket: '안주머니 인쇄' }[side]);
      option.value = side; return option;
    }));
    this.printSideSelect.value = this.printSide;
    for (const [side, controls] of this.printControls) {
      const p = this.config.print[side];
      controls.panel.hidden = side !== this.printSide;
      controls.imagePreview.hidden = !p.image;
      if (p.image) controls.imageThumbnail.src = p.image;
      else controls.imageThumbnail.removeAttribute('src');
      controls.imageName.textContent = p.imageName || '인쇄 이미지';
      controls.uploadButton.textContent = p.image ? '이미지 교체' : '이미지 올리기';
      controls.deleteImageButton.disabled = !p.image;
      const embroidery = p.appearance === 'embroidery';
      controls.appearanceButton.disabled = !p.image;
      controls.appearanceButton.textContent = embroidery ? '인쇄 모양으로 변경' : '자수 모양으로 변경';
      controls.appearanceButton.setAttribute('aria-pressed', String(embroidery));
      controls.appearanceStatus.textContent = p.image ? `현재 모양: ${embroidery ? '자수' : '인쇄'}` : '이미지를 올린 뒤 자수 모양으로 바꿀 수 있어요.';
      const warnings = getPrintBoundsWarnings(this.config, side) || [];
      controls.warnings.replaceChildren(...warnings.map(warning => element('p', '', warningText(warning))));
      controls.warnings.hidden = !warnings.length;
    }
    const { width, height, depth } = this.config.dimensions;
    const h = this.config.handle;
    const p = this.config.pocket;
    const fabricName = profile.clothKind === 'poly' ? '폴리 / 합성' : FABRICS3D.find(fabric => fabric.id === this.config.body.fabricId)?.name || '기본';
    this.dimensionSummary.textContent = `${fabricName} 원단 · ${flat ? `몸통 ${width} × ${height} mm · 입구 벌림 ${depth} mm (참고)` : `가방 ${width} × ${height} × ${depth} mm`}${profile.supportsBottomPanel ? ` · 배색 높이 ${this.config.bottomPanel.height} mm` : ''}${profile.supportsHandles ? ` · 손잡이 너비 ${h.width} / 길이 ${h.drop} / 간격 ${h.gap} mm` : ''}${profile.supportsPocket && this.config.options.pocket ? ` · 포켓 ${p.width} × ${p.height} mm` : ''}`;
    if (this.consultButton) this.consultButton.title = profile.consultationMode === 'kakao'
      ? '현재 시안을 캡쳐하고 카카오톡에서 상담합니다' : '시안과 상담 정보를 메일로 접수합니다';
    this.syncZoomToolbar();
  }

  syncZoomToolbar(metrics) {
    const available = Boolean(this.viewer?.getZoomMetrics);
    const zoom = metrics || this.viewer?.getZoomMetrics?.() || { enabled: false, percent: 100, canZoomIn: false, canZoomOut: false };
    this.magnifierButton.disabled = !available;
    this.magnifierButton.setAttribute('aria-pressed', String(Boolean(zoom.enabled)));
    this.zoomInButton.disabled = !available || !zoom.canZoomIn;
    this.zoomOutButton.disabled = !available || !zoom.canZoomOut;
    this.resetZoomButton.disabled = !available;
    const pan = Boolean(this.viewer?.isPanMode?.());
    if (this.panButton) {
      this.panButton.disabled = !available;
      this.panButton.setAttribute('aria-pressed', String(pan));
    }
    if (this.focusPrintButton) this.focusPrintButton.disabled = !this.viewer?.canFocusPrint?.(this.focusPrintSide());
    const percent = `${Math.round(zoom.percent || 100)}%`;
    if (this.zoomPercent.textContent !== percent) this.zoomPercent.textContent = percent;
    this.previewHint.textContent = pan
      ? '드래그로 화면 이동 · 화면 이동을 끄면 회전'
      : zoom.enabled
      ? '드래그로 회전 · 화면 이동으로 위치 조절'
      : '드래그해서 회전 · 휠이나 두 손가락으로 확대';
  }

  focusPrintSide() {
    return this.cameraView === 'inside' ? 'innerPocket' : this.cameraView === 'back' ? 'back'
      : this.cameraView === 'front' ? 'front' : this.printSide || 'front';
  }

  changeZoom(action) {
    if (!this.viewer || this.disposed) return;
    try { action(); this.syncZoomToolbar(); }
    catch (error) { this.setStatus(error.message, true); }
  }

  updateProductURL() {
    const url = new URL(location.href);
    url.searchParams.set('mode', '3d');
    url.searchParams.set('product', this.config.productId);
    if (this.linked) url.searchParams.set('bag', this.config.productId);
    history.replaceState(history.state, '', url);
  }

  activateConfig(config, { notify = true } = {}) {
    this.productDrafts.set(this.config.productId, this.config);
    this.uploadGeneration++;
    this.productGeneration++;
    this.config = normalizeConfig(config);
    this.imageRatio = null;
    this.imageRatios = {};
    for (const controls of this.printControls.values()) controls.uploadInput.value = '';
    this.viewer?.resetZoom?.();
    this.updateProductURL();
    this.apply({ frame: true, notify });
  }

  switchProduct(productId) {
    if (this.disposed) throw new Error('종료한 3D 에디터입니다.');
    if (this.busy) throw new Error('시안 작업을 완료한 뒤 가방을 바꿔 주세요.');
    if (this.linked && productId !== this.config.productId) throw new Error('가방은 2D 화면에서 선택해 주세요.');
    if (productId === this.config.productId) return;
    const next = this.productDrafts.get(productId) || configForProduct(productId);
    this.activateConfig(next);
    this.readImageRatio();
    this.setStatus('가방을 바꿨어요. 작업 중인 시안은 가방별로 유지됩니다.');
  }

  openProductPicker() {
    if (this.disposed || this.busy || this.picker) return;
    const choices = this.productChoices || [...Product3DCatalog.keys()].map(id => {
      const profile = getProductProfile(id), dimensions = profile.dimensions;
      return { id, name: profile.name, category: ['pouch', 'poly'].includes(profile.category) ? profile.category : 'ecobag',
        size: `${dimensions.width / 10}×${dimensions.height / 10}cm` };
    });
    this.picker = openProductPicker({ host: this.root, editorDialog: this.dialog, choices,
      selected: this.config.productId, onSelect: id => this.selectProduct(id), onClose: () => { this.picker = null; } });
  }

  async selectProduct(productId) {
    if (productId === this.config.productId || this.disposed || this.busy) { this.sync(); return; }
    if (!this.onSelectProduct) {
      try { this.switchProduct(productId); } catch (error) { this.sync(); this.setStatus(error.message, true); }
      return;
    }
    await this.run(async () => {
      if (this.pendingUpload) await this.pendingUpload;
      if (!await this.onSelectProduct(productId)) throw new Error('가방을 바꾸지 못했어요. 다시 선택해 주세요.');
    });
  }

  openProduct(productId) {
    this.switchProduct(productId);
    return this.open();
  }

  setStatus(message, error = false) {
    if (this.disposed) return;
    this.status.textContent = message || '';
    this.status.classList.toggle('p3d-status-error', error);
  }

  async run(callback) {
    if (this.busy || this.disposed) return;
    this.busy = true;
    this.productSelect.disabled = true;
    if (this.productPickerButton) this.productPickerButton.disabled = true;
    this.dialog.setAttribute('aria-busy', 'true');
    try { await callback(); } catch (error) { this.setStatus(error.message || '작업을 완료하지 못했어요.', true); }
    finally {
      this.busy = false;
      if (!this.disposed) this.sync();
      if (!this.disposed) this.dialog.removeAttribute('aria-busy');
    }
  }

  async uploadImage(file, side = this.printSide) {
    if (!file || this.disposed) return;
    const generation = ++this.uploadGeneration;
    this.setStatus('이미지를 확인하고 있어요…');
    this.printControls.get(side).uploadInput.value = '';
    try {
      const { dataURL, ratio } = await validateImageFile(file);
      if (generation !== this.uploadGeneration || this.disposed) return;
      this.imageRatios[side] = ratio;
      this.config = patchConfig(this.config, `print.${side}.image`, dataURL);
      this.config = patchConfig(this.config, `print.${side}.imageName`, file.name);
      this.config = patchConfig(this.config, `print.${side}.enabled`, true);
      if (this.config.print[side].lockAspect) {
        const limits = this.fields.get(`print.${side}.height`).limits;
        this.config = patchConfig(this.config, `print.${side}.height`, clamp(this.config.print[side].width / ratio, limits.min, limits.max));
      }
      this.apply();
      this.setStatus('이미지를 올렸어요. 크기와 위치를 조정해 주세요.');
    } catch (error) {
      if (generation === this.uploadGeneration) this.setStatus(error.message, true);
    }
  }

  async readImageRatio(side = this.printSide) {
    const source = this.config.print[side].image;
    const generation = this.productGeneration;
    this.imageRatios[side] = null;
    if (!source) return;
    try {
      const image = await decodeImage(source);
      if (generation === this.productGeneration && source === this.config.print[side].image && !this.disposed) this.imageRatios[side] = image.naturalWidth / image.naturalHeight;
    } catch (error) { if (generation === this.productGeneration) this.setStatus(error.message, true); }
  }

  addSampleLogo(side = this.printSide) {
    this.uploadGeneration++;
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext('2d');
    context.strokeStyle = '#254e48';
    context.lineWidth = 8;
    context.beginPath();
    context.arc(320, 96, 40, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(304, 99); context.lineTo(317, 111); context.lineTo(339, 81);
    context.stroke();
    context.textAlign = 'center';
    context.fillStyle = '#254e48';
    context.font = '600 60px sans-serif';
    context.fillText('YOUR LOGO', 320, 221);
    context.font = '24px sans-serif';
    context.fillText('MADE FOR YOU', 320, 266);
    this.imageRatios[side] = canvas.width / canvas.height;
    this.config = patchConfig(this.config, `print.${side}.image`, canvas.toDataURL('image/png'));
    this.config = patchConfig(this.config, `print.${side}.imageName`, '샘플 로고.png');
    this.config = patchConfig(this.config, `print.${side}.enabled`, true);
    const limits = this.fields.get(`print.${side}.height`).limits;
    this.config = patchConfig(this.config, `print.${side}.height`, clamp(this.config.print[side].width / this.imageRatios[side], limits.min, limits.max));
    this.apply();
    this.setStatus('샘플 로고를 넣었어요. 원하는 이미지로 교체할 수 있어요.');
  }

  setCameraView(view) {
    if (view === 'inside' && !this.config.options.innerPocket && !this.config.options.nameTag) return;
    this.viewer?.setView(view);
    this.cameraView = view;
    this.syncZoomToolbar();
  }

  selectPrintSide(side) {
    if (!PRINT_SIDES.includes(side)) return;
    if (side === 'back' && !this.config.options.doubleSided || side === 'innerPocket' && !this.config.options.innerPocketPrint) return;
    this.printSide = side;
    this.sync();
    this.readImageRatio(side);
    this.setCameraView(side === 'back' ? 'back' : side === 'innerPocket' ? 'inside' : 'front');
  }

  async replaceConfig(config, { notify = false } = {}) {
    this.uploadGeneration++;
    const generation = this.productGeneration;
    const next = normalizeConfig(config);
    if (this.linked && next.productId !== this.config.productId) throw new Error('현재 2D 가방과 같은 상품의 시안만 불러올 수 있어요.');
    const ratios = {};
    await Promise.all(PRINT_SIDES.map(async side => {
      if (next.print[side].image) { const image = await decodeImage(next.print[side].image); ratios[side] = image.naturalWidth / image.naturalHeight; }
    }));
    if (this.disposed || generation !== this.productGeneration) return;
    this.activateConfig(next, { notify });
    this.imageRatios = ratios;
  }

  async consult() {
    if (this.busy || this.disposed) return;
    if (!this.viewer) { this.setStatus('3D 미리보기를 연 뒤 다시 시도해 주세요.', true); return; }
    this.consultButton.disabled = true;
    await this.run(async () => {
      if (this.onConsult) await this.onConsult({ config: this.getConfig(), viewer: this.viewer });
      else this.setStatus('상담 연결을 확인해 주세요.');
    });
    if (!this.disposed) this.consultButton.disabled = false;
  }

  open(config) {
    if (this.disposed) throw new Error('종료한 3D 에디터는 다시 열 수 없어요.');
    if (config) {
      if (this.busy) throw new Error('시안 작업을 완료한 뒤 다른 시안을 열어 주세요.');
      if (this.linked && normalizeConfig(config).productId !== this.config.productId) throw new Error('현재 2D 가방과 같은 상품의 시안만 열 수 있어요.');
      this.activateConfig(config, { notify: false });
      this.readImageRatio();
    }
    if (!this.visible) {
      this.previousFocus = document.activeElement;
      this.previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      this.backgroundInert = new Map();
      for (const sibling of document.body.children) {
        if (sibling === this.root || ['SCRIPT', 'STYLE', 'LINK'].includes(sibling.tagName)) continue;
        this.backgroundInert.set(sibling, sibling.inert);
        sibling.inert = true;
      }
    }
    this.visible = true;
    this.root.hidden = false;
    if (!this.viewer) {
      try {
        this.viewer = new Product3DViewer(this.viewerContainer, {
          onError: error => {
            const message = error?.message || String(error);
            this.viewerError.textContent = message;
            this.viewerError.hidden = false;
            this.setStatus('3D 미리보기를 표시하지 못했어요. 잠시 후 다시 열어 주세요.', true);
          },
          onMetrics: metrics => {
            if (this.diagnostics) this.diagnostics.textContent = JSON.stringify(metrics);
            this.embroideryPreparation.hidden=!metrics.embroideryPreparing;
            if (metrics.zoom) this.syncZoomToolbar(metrics.zoom);
          },
        });
      } catch (error) {
        this.viewerError.textContent = error.message || '3D 미리보기를 표시하지 못했어요.';
        this.viewerError.hidden = false;
        this.setStatus('3D 미리보기를 표시하지 못했어요. 잠시 후 다시 열어 주세요.', true);
      }
    }
    this.updateProductURL();
    this.apply({ frame: true, notify: false });
    requestAnimationFrame(() => {
      if (!this.visible || this.disposed) return;
      this.viewer?.resize();
      this.closeButton.focus();
    });
    return this;
  }

  async close() {
    if (!this.visible || this.disposed || this.busy || this.closing) return false;
    this.closing = true;
    this.closeButton.disabled = true;
    this.dialog.inert = true;
    try {
      if (this.pendingUpload) await this.pendingUpload;
      if (this.onReturnTo2D) await this.onReturnTo2D(this.getConfig(), { printSide: this.getPrintSide() });
      this.hide();
      return true;
    } catch (error) { this.setStatus(error.message || '2D 화면으로 시안을 옮기지 못했어요.', true); return false; }
    finally { this.closing = false; this.closeButton.disabled = false; this.dialog.inert = false; }
  }

  hide() {
    if (!this.visible) return;
    this.picker?.close();
    this.visible = false;
    this.root.hidden = true;
    document.body.style.overflow = this.previousBodyOverflow;
    for (const [sibling, previous] of this.backgroundInert || []) sibling.inert = previous;
    this.backgroundInert?.clear();
    if (this.previousFocus?.isConnected) this.previousFocus.focus();
    this.onClose?.();
  }

  onKeyDown(event) {
    // Keep the existing Fabric editor's document shortcuts inside its own view.
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...this.dialog.querySelectorAll('button, input, a[href], select, textarea, summary, [tabindex="0"]')]
      .filter(node => !node.disabled && !node.closest('[hidden]') && node.getClientRects().length);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }

  getConfig() { return clone(this.config); }
  getPrintSide() { return this.printSide; }
  getViewer() { return this.viewer; }

  dispose() {
    if (this.disposed) return;
    this.hide();
    this.disposed = true;
    this.uploadGeneration++;
    this.controller.abort();
    this.viewer?.dispose();
    this.viewer = null;
    this.root.remove();
  }
}
