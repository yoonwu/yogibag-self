import { getFabricOption, getColorName } from './fabrics.mjs?v=1.2.4';
import { SAMPLE_PRODUCT_ID, DAILY_PRODUCT_ID, PRODUCT3D_PROFILES, getProductProfile, isSupportedProduct } from './catalog.mjs?v=1.2.4';
export { SAMPLE_PRODUCT_ID, TWO_TONE_SMALL_PRODUCT_ID, TWO_TONE_KIDS_PRODUCT_ID, DAILY_PRODUCT_ID, PRODUCT3D_PROFILES, getProductProfile, isSupportedProduct } from './catalog.mjs?v=1.2.4';

// Customer dimensions are millimetres. Only this boundary converts to scene units.
export const MM_TO_SCENE = 0.001;
export const mmToScene = value => Number(value) * MM_TO_SCENE;
export const SCHEMA_VERSION = 1;
export const DESIGN_OPTION_LABELS = Object.freeze({
  innerPocket: '안주머니', innerPocketPrint: '안주머니 인쇄', snap: '똑딱이', magnet: '자석',
  zipper: '지퍼', crossStrap: '크로스끈', nameTag: '이름표', individualPackaging: 'OPP 개별포장', doubleSided: '양면 인쇄',
});
export const PRINT_SIDES = Object.freeze(['front', 'back', 'innerPocket']);
export const PRINT_APPEARANCES = Object.freeze(['print', 'embroidery']);

export const LIMITS = Object.freeze({
  'dimensions.width': { min: 200, max: 600, step: 5 },
  'dimensions.height': { min: 150, max: 600, step: 5 },
  'dimensions.depth': { min: 30, max: 300, step: 5 },
  'bottomPanel.height': { min: 0, max: 250, step: 5 },
  'handle.width': { min: 20, max: 70, step: 1 },
  'handle.thickness': { min: 1, max: 5, step: 0.5 },
  'handle.drop': { min: 80, max: 450, step: 5 },
  'handle.gap': { min: 60, max: 450, step: 5 },
  'crossStrap.length': { min: 500, max: 1400, step: 5 },
  'pocket.width': { min: 60, max: 400, step: 5 },
  'pocket.height': { min: 40, max: 400, step: 5 },
  'pocket.bottom': { min: 0, max: 450, step: 5 },
  'print.front.width': { min: 0.1, max: 2000, step: 0.1 },
  'print.front.height': { min: 0.1, max: 2000, step: 0.1 },
  'print.front.x': { min: -2000, max: 2000, step: 1 },
  'print.front.y': { min: -2000, max: 2000, step: 1 },
  'print.front.rotation': { min: -180, max: 180, step: 1 },
  ...Object.fromEntries(['back', 'innerPocket'].flatMap(side => [
    [`print.${side}.width`, { min: 0.1, max: 2000, step: 0.1 }],
    [`print.${side}.height`, { min: 0.1, max: 2000, step: 0.1 }],
    [`print.${side}.x`, { min: -2000, max: 2000, step: 1 }],
    [`print.${side}.y`, { min: -2000, max: 2000, step: 1 }],
    [`print.${side}.rotation`, { min: -180, max: 180, step: 1 }],
  ])),
});

export function getProductLimits(product = SAMPLE_PRODUCT_ID) {
  const profile = getProductProfile(product), limits = { ...LIMITS, ...profile.dimensionLimits };
  if (typeof product === 'object' && profile.supportsHandles) {
    const wLimit = limits['dimensions.width'], dLimit = limits['dimensions.depth'];
    const width = clamp(number(product.dimensions?.width, profile.dimensions.width), wLimit.min, wLimit.max);
    const depth = clamp(number(product.dimensions?.depth, profile.dimensions.depth), dLimit.min, dLimit.max);
    const margin = profile.handleEdgeMarginMm ?? Math.max(20, width * .06 + Math.min(17, depth * .1));
    const widthMax = Math.min(LIMITS['handle.width'].max, (width - margin * 2 - 12) / 2);
    limits['handle.width'] = { ...LIMITS['handle.width'], max: widthMax };
    const handleWidth = clamp(number(product.handle?.width, profile.defaultHandle.width), LIMITS['handle.width'].min, widthMax);
    const gapMax = Math.min(LIMITS['handle.gap'].max, width - handleWidth - margin * 2);
    limits['handle.gap'] = { ...LIMITS['handle.gap'], min: Math.min(gapMax, Math.max(LIMITS['handle.gap'].min, handleWidth + 12)), max: gapMax };
  }
  return limits;
}

export function getProductPrintArea(config) {
  const profile = getProductProfile(config), dimensions = config?.dimensions || profile.dimensions;
  if (!profile.referenceLayout) {
    const size = profile.printGuideSize || 170;
    const bottom = config?.bottomPanel?.height ?? profile.defaultBottomPanel?.height ?? 75;
    const h = config?.handle || profile.defaultHandle;
    const width = Math.min(size, Math.max(60, profile.supportsPocket ? h.gap - h.width - 10 : dimensions.width - 40));
    const height = Math.min(size, dimensions.height - bottom - (profile.supportsPocket ? 20 : 30));
    return { width, height, x: 0, y: bottom + (profile.supportsPocket ? 0 : 10) + height / 2 - dimensions.height / 2 };
  }
  const { image, body, print } = profile.referenceLayout;
  return { width: print.width * image.width / body.width * dimensions.width,
    height: print.height * image.height / body.height * dimensions.height,
    x: (print.cx * image.width - body.x - body.width / 2) / body.width * dimensions.width,
    y: (body.y + body.height / 2 - print.cy * image.height) / body.height * dimensions.height };
}

export function createDefaultConfig(product = SAMPLE_PRODUCT_ID) {
  const profile = getProductProfile(product);
  const sample = profile.category === 'sample';
  return {
    schemaVersion: SCHEMA_VERSION,
    productType: profile.type,
    productId: profile.id,
    productName: profile.name,
    dimensions: { ...profile.dimensions }, nominalDepth: profile.nominalDepth, depthBasis: profile.depthBasis,
    bottomPanel: profile.defaultBottomPanel ? { ...profile.defaultBottomPanel } : sample ? { height: 75, color: '#171c28' } : { height: 0, color: '#ece6d9' },
    body: { color: profile.clothKind === 'poly' ? '#1a1a1a' : '#ece6d9', fabricId: 'basic' },
    handle: { ...profile.defaultHandle },
    crossStrap: { length: 800 },
    pocket: profile.defaultPocket ? { ...profile.defaultPocket } : { width: 180, height: 190, bottom: 75, color: '#ece6d9' },
    printArea: getProductPrintArea(profile.id),
    print: { front: { enabled: true, image: null, imageName: '', appearance: 'print', width: 100, height: 100,
      x: 0, y: sample ? getProductPrintArea(profile.id).y : 0, rotation: 0, lockAspect: true },
      back: { enabled: true, image: null, imageName: '', appearance: 'print', width: 100, height: 100, x: 0, y: 0, rotation: 0, lockAspect: true },
      innerPocket: { enabled: true, image: null, imageName: '', appearance: 'print', width: 70, height: 40, x: 0, y: 0, rotation: 0, lockAspect: true,
        partDimensions: { width: 140, height: 120 } } },
    options: { pocket: profile.supportsPocket, lining: false, ...Object.fromEntries(Object.keys(DESIGN_OPTION_LABELS).map(key => [key, profile.lockedOptions.includes(key)])) },
    measurementBasis: 'finished-body-outer-mm',
    assumptions: [...profile.assumptions],
  };
}

export function createDailyConfig() {
  return createDefaultConfig(DAILY_PRODUCT_ID);
}

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const number = (value, fallback) => Number.isFinite(Number(value)) && value !== '' && value !== null ? Number(value) : fallback;
const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || '') ? value.toLowerCase() : fallback;
const bool = (value, fallback) => typeof value === 'boolean' ? value : fallback;
const at = (object, path) => path.split('.').reduce((o, key) => o?.[key], object);
function put(object, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, key) => o[key], object)[last] = value;
}

export function getCrossStrapLengthMin(config) {
  return Math.max(LIMITS['crossStrap.length'].min, Number(config?.dimensions?.width || 480) + 12);
}

export function normalizeConfig(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) input = {};
  const profile = getProductProfile(input);
  const c = createDefaultConfig(profile.id);
  for (const [path, limit] of Object.entries(getProductLimits(input))) {
    put(c, path, clamp(number(at(input, path), at(c, path)), limit.min, limit.max));
  }
  c.crossStrap.length = Math.max(c.crossStrap.length, getCrossStrapLengthMin(c));
  c.body.color = color(input.body?.color, c.body.color);
  c.body.fabricId = profile.clothKind === 'poly' ? 'basic' : getFabricOption(input.body?.fabricId).id;
  // Existing saved samples inherited the pocket color from the body.
  c.pocket.color = color(input.pocket?.color, c.body.color);
  c.bottomPanel.color = color(input.bottomPanel?.color, c.bottomPanel.color);
  c.handle.color = color(input.handle?.color, c.handle.color);
  for (const option of Object.keys(c.options)) c.options[option] = bool(input.options?.[option], c.options[option]);
  if (!profile.supportsPocket) c.options.pocket = false;
  if (profile.category !== 'sample') c.options.lining = false;
  for (const option of Object.keys(DESIGN_OPTION_LABELS)) {
    if (!profile.allowedOptions.includes(option)) c.options[option] = false;
    if (profile.lockedOptions.includes(option)) c.options[option] = true;
  }
  if (c.options.innerPocketPrint) c.options.innerPocket = true;
  c.nominalDepth = profile.depthBasis === 'opening-estimate' ? 0 : c.dimensions.depth;
  for (const side of PRINT_SIDES) {
    const p = input.print?.[side] || (side === 'innerPocket' ? input.print?.inner : null) || {};
    const dest = c.print[side];
    dest.enabled = bool(p.enabled, dest.enabled);
    dest.lockAspect = bool(p.lockAspect, dest.lockAspect);
    dest.appearance = PRINT_APPEARANCES.includes(p.appearance) ? p.appearance : 'print';
    if (typeof p.image === 'string' && /^data:image\/(png|jpeg);base64,[a-z0-9+/=\s]+$/i.test(p.image)
        && p.image.length <= 14 * 1024 * 1024) dest.image = p.image;
    dest.imageName = typeof p.imageName === 'string' ? p.imageName.slice(0, 180) : '';
    if (p.image === null) dest.image = null;
    if (side === 'innerPocket') dest.partDimensions = {
      width: clamp(number(p.partDimensions?.width, dest.partDimensions.width), 60, 250),
      height: clamp(number(p.partDimensions?.height, dest.partDimensions.height), 40, 250),
    };
  }
  if (input.syncMetadata && typeof input.syncMetadata === 'object' && !Array.isArray(input.syncMetadata)) {
    try {
      const metadata = JSON.stringify(input.syncMetadata);
      if (metadata.length <= 2 * 1024 * 1024) c.syncMetadata = JSON.parse(metadata);
    } catch { /* Unsuitable transient values are not part of the saved design. */ }
  }
  c.bottomPanel.height = Math.min(c.bottomPanel.height, c.dimensions.height - 30);
  if (!profile.supportsBottomPanel) {
    c.bottomPanel.height = 0;
    c.bottomPanel.color = c.body.color;
  }
  const sideMargin = Math.max(20, c.dimensions.width * 0.06 + Math.min(17, c.dimensions.depth * 0.1));
  if (profile.supportsHandles) {
    const handleMargin = profile.handleEdgeMarginMm ?? sideMargin;
    c.handle.width = Math.min(c.handle.width, (c.dimensions.width - handleMargin * 2 - 12) / 2);
    c.handle.gap = clamp(c.handle.gap, c.handle.width + 12, c.dimensions.width - c.handle.width - handleMargin * 2);
  }
  c.pocket.width = Math.min(c.pocket.width, c.dimensions.width - sideMargin * 2);
  c.pocket.bottom = Math.min(c.pocket.bottom, c.dimensions.height - 60);
  c.pocket.height = Math.min(c.pocket.height, c.dimensions.height - c.pocket.bottom - 15);
  // The two-tone guides follow the lower seam without resizing artwork.
  c.printArea = getProductPrintArea(c);
  return c;
}

const SETTABLE = new Set([...Object.keys(LIMITS), 'body.color', 'body.fabricId', 'pocket.color', 'bottomPanel.color', 'handle.color',
  'print.front.enabled', 'print.front.lockAspect', 'print.front.image', 'print.front.imageName',
  ...PRINT_SIDES.flatMap(side => ['enabled', 'lockAspect', 'image', 'imageName', 'appearance'].map(key => `print.${side}.${key}`)),
  'options.pocket', 'options.lining', ...Object.keys(DESIGN_OPTION_LABELS).map(key => `options.${key}`)]);
export function patchConfig(config, path, value) {
  if (!SETTABLE.has(path)) throw new Error('지원하지 않는 설정 항목입니다.');
  const c = normalizeConfig(config);
  put(c, path, value);
  if (path === 'options.innerPocket' && value === false) c.options.innerPocketPrint = false;
  if (['options.snap', 'options.magnet', 'options.zipper'].includes(path) && value === true) {
    for (const key of ['snap', 'magnet', 'zipper']) c.options[key] = path === `options.${key}`;
  }
  return normalizeConfig(c);
}

function sidePrintBoundsWarnings(c, side) {
  const p = c.print[side];
  if (!p) return [];
  if (!p.enabled || !p.image) return [];
  if (side === 'innerPocket') return [];
  const radians = p.rotation * Math.PI / 180;
  const halfW = (Math.abs(Math.cos(radians)) * p.width + Math.abs(Math.sin(radians)) * p.height) / 2;
  const halfH = (Math.abs(Math.sin(radians)) * p.width + Math.abs(Math.cos(radians)) * p.height) / 2;
  const warnings = [];
  const g = c.printArea;
  if (Math.abs(p.x - g.x) + halfW > g.width / 2 || Math.abs(p.y - g.y) + halfH > g.height / 2) {
    warnings.push('권장 인쇄 영역을 벗어났습니다. 희망 위치는 그대로 전달되며 상담 시 확인합니다.');
  }
  if (Math.abs(p.x) + halfW > c.dimensions.width / 2 - 10 || Math.abs(p.y) + halfH > c.dimensions.height / 2 - 10) {
    warnings.push('이미지 일부가 가방 가장자리 밖에 있습니다.');
  }
  const strapHalf = c.handle.width / 2;
  const overlapsStrapX = [-c.handle.gap / 2, c.handle.gap / 2]
    .some(x => p.x + halfW > x - strapHalf && p.x - halfW < x + strapHalf);
  const profile = getProductProfile(c);
  if (['gusset', 'pouch-gusset', 'tumbler'].includes(profile.construction)) {
    const bottomY = p.y - halfH + c.dimensions.height / 2;
    const foldDepth = Math.min(c.dimensions.depth / 2, c.dimensions.height * 0.2, c.dimensions.width * 0.2);
    const foldInset = foldDepth * Math.max(0, 1 - Math.max(0, bottomY) / foldDepth);
    if (bottomY < foldDepth && Math.abs(p.x) + halfW > c.dimensions.width / 2 - foldInset) {
      warnings.push('인쇄가 하단의 접힌 모서리에 걸칠 수 있습니다. 희망 크기와 위치는 상담에서 확인합니다.');
    }
  }
  if (profile.supportsHandles && profile.handleAttachment === 'mouth') {
    const bottomY = p.y - halfH + c.dimensions.height / 2;
    const topY = p.y + halfH + c.dimensions.height / 2;
    if (overlapsStrapX && topY > c.dimensions.height - profile.handleAttachmentDepth && bottomY < c.dimensions.height) {
      warnings.push('이미지가 입구의 손잡이 부착부와 겹칠 수 있습니다. 인쇄 위치를 상담에서 확인합니다.');
    }
  } else if (profile.supportsHandles && profile.handleAttachment === 'full-height' && overlapsStrapX && p.y - halfH + c.dimensions.height / 2 < c.dimensions.height) {
    warnings.push('이미지가 세로 웨빙과 겹칠 수 있습니다. 인쇄 위치를 상담에서 확인합니다.');
  }
  return warnings;
}

export function getPrintBoundsWarnings(config, selectedSide) {
  const c = normalizeConfig(config);
  const sides = selectedSide ? [selectedSide] : ['front', ...(c.options.doubleSided ? ['back'] : [])];
  return sides.flatMap(side => sidePrintBoundsWarnings(c, side)
    .map(message => side === 'back' ? `뒷면: ${message}` : message));
}

export function serializeConfig(config) {
  return JSON.stringify(normalizeConfig(config), null, 2);
}
export function parseConfig(text) {
  if (typeof text !== 'string' || text.length > 64 * 1024 * 1024) throw new Error('설정 파일이 너무 큽니다.');
  const input = JSON.parse(text);
  const profile = input && Object.hasOwn(PRODUCT3D_PROFILES, input.productId) ? PRODUCT3D_PROFILES[input.productId] : null;
  if (!profile || input.schemaVersion !== SCHEMA_VERSION || input.productType !== profile.type)
    throw new Error('현재 지원하는 상품의 시안 설정 파일이 아닙니다.');
  return normalizeConfig(input);
}

export function getConsultationSpecs(config) {
  const c = normalizeConfig(config), p = c.print.front;
  const profile = getProductProfile(c);
  return [
    { label: '상품', value: c.productName },
    ...(profile.depthBasis === 'opening-estimate' ? [
      { label: '몸통 가로 × 높이', value: `${c.dimensions.width} × ${c.dimensions.height} mm` },
      { label: '봉제 바닥 깊이', value: '0 mm · 평면 봉합형' },
      { label: '3D 입구 벌림 참고값', value: `${c.dimensions.depth} mm · 형태 확인용 추정, 제작 바닥 규격 아님` },
    ] : [{ label: '몸통 가로 × 높이 × 바닥 깊이', value: `${c.dimensions.width} × ${c.dimensions.height} × ${c.dimensions.depth} mm` }]),
    { label: '원단 종류', value: `${profile.clothKind === 'poly' ? '폴리 / 합성 원단' : getFabricOption(c.body.fabricId).name} · ${profile.supportsPocket ? '몸통/주머니/밑단 공통' : profile.supportsBottomPanel ? '몸통/밑단 공통' : '몸통 공통'}` },
    ...(profile.supportsBottomPanel
      ? [{ label: '밑단 높이 / 색상', value: `${c.bottomPanel.height} mm / ${getColorName(c.bottomPanel.color)}` }]
      : [{ label: '밑단 배색', value: '없음 · 몸통과 같은 원단/색상' }]),
    { label: '몸통 색상', value: getColorName(c.body.color) },
    ...(profile.supportsHandles ? [
      { label: '손잡이 폭 / 두께 / 길이', value: `${c.handle.width} / ${c.handle.thickness} / ${c.handle.drop} mm` },
      { label: '손잡이 중심 간격 / 색상', value: `${c.handle.gap} mm / ${getColorName(c.handle.color)}` },
      { label: '손잡이 원단', value: profile.handleFabricLabel },
    ] : []),
    ...(profile.supportsHandles && profile.handleAttachment === 'mouth' ? [
      { label: '손잡이 부착 방식', value: `가방 안쪽 · 입구에서 ${profile.handleAttachmentDepth} mm 깊이로 부착` },
      ...(profile.referenceHandleLength ? [{ label: '기본 상품 참고 손잡이 두른길이', value: `${profile.referenceHandleLength} mm · 시접 제외, 입구에서 손잡이 위끝까지의 길이와 다른 측정값` }] : []),
    ] : []),
    { label: '앞면 포켓', value: c.options.pocket ? `${c.pocket.width} × ${c.pocket.height} mm · 바닥에서 ${c.pocket.bottom} mm` : '없음' },
    ...(profile.supportsPocket ? [{ label: '주머니 색상', value: c.options.pocket ? getColorName(c.pocket.color) : '주머니 없음' }] : []),
    { label: '추가 옵션', value: Object.entries(DESIGN_OPTION_LABELS).filter(([key]) => c.options[key]).map(([, name]) => name).join(', ') || '없음' },
    ...(c.options.crossStrap ? [{ label: '크로스끈 길이', value: `${c.crossStrap.length} mm` }] : []),
    ...['front', ...(c.options.doubleSided ? ['back'] : []), ...(c.options.innerPocketPrint ? ['innerPocket'] : [])].map(side => {
      const print = c.print[side];
      return { label: `${{ front: '앞면', back: '뒷면', innerPocket: '안주머니' }[side]} 인쇄`,
        value: print.enabled && print.image ? `${print.appearance === 'embroidery' ? '자수' : '인쇄'} 미리보기 · ${print.width} × ${print.height} mm · X ${print.x} / Y ${print.y} mm · 회전 ${print.rotation}°`
          : side === 'innerPocket' ? '선택 · 도안은 상담 시 확인' : '없음' };
    }),
    { label: '인쇄 좌표 기준', value: '앞·뒷면: 각 면을 바라본 몸통 중심 / 안주머니: 안주머니 중심 (X: 오른쪽 +, Y: 위쪽 +)' },
    { label: '상담 확인 사항', value: '희망 시안입니다. 가격과 제작 가능 여부는 상담에서 확인합니다.' },
    ...c.assumptions.map(value => ({ label: profile.category === 'sample' ? '샘플 치수 기준' : '상품 치수 기준', value })),
  ];
}
