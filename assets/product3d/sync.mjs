import { createDefaultConfig, normalizeConfig, getProductProfile, isSupportedProduct } from './config.mjs?v=1.2.7';

export const SHARED_OPTIONS = Object.freeze({
  innerPocket: '안주머니', innerPocketPrint: '안주머니인쇄',
  snap: '똑딱이', magnet: '자석', zipper: '지퍼', crossStrap: '크로스끈',
  nameTag: '이름표', individualPackaging: 'OPP개별포장', doubleSided: '양면인쇄',
});
const clone = value => structuredClone(value);

export function isSharedProduct(productId) {
  return isSupportedProduct(productId) && getProductProfile(productId).category !== 'sample';
}

function requireSharedProduct(productId) {
  if (!isSharedProduct(productId)) throw new Error('이 상품은 2D와 함께 편집할 수 없습니다.');
  return getProductProfile(productId);
}

// Transparent artwork uses millimetres about each face's centre. The legacy
// editor holds editable objects by token so a view switch never flattens them.
export function configFrom2D(snapshot, previous) {
  requireSharedProduct(snapshot?.productId);
  const base = previous?.productId === snapshot.productId ? clone(previous) : createDefaultConfig(snapshot.productId);
  const selected = new Set(snapshot.options || []);
  base.dimensions = { ...base.dimensions, ...snapshot.dimensions };
  base.body = { ...base.body, ...snapshot.body, color: snapshot.body?.color || base.body.color, fabricId: snapshot.body?.fabricId || base.body.fabricId };
  base.handle = { ...base.handle, ...snapshot.handle, color: snapshot.handle?.color || base.handle.color };
  base.crossStrap = { ...base.crossStrap, ...snapshot.crossStrap };
  for (const [key, label] of Object.entries(SHARED_OPTIONS)) base.options[key] = selected.has(label);
  base.options.doubleSided = Boolean(snapshot.twoSided || selected.has('양면인쇄'));
  for (const side of ['front', 'back', 'innerPocket']) {
    const artwork = snapshot.print?.[side];
    if (artwork) base.print[side] = { ...base.print[side], ...clone(artwork), image: artwork.image || null };
    else base.print[side] = { ...base.print[side], image: null, imageName: '' };
  }
  return normalizeConfig(base);
}

export function snapshotFrom3D(config, previous = {}) {
  const profile = requireSharedProduct(config?.productId);
  if (previous.productId && previous.productId !== config.productId) throw new Error('이 시안과 이전 가방이 다릅니다.');
  const c = normalizeConfig(config);
  return {
    ...clone(previous), schemaVersion: 1, productId: c.productId,
    dimensions: clone(c.dimensions), body: clone(c.body), handle: clone(c.handle), crossStrap: clone(c.crossStrap),
    options: Object.entries(SHARED_OPTIONS).filter(([key]) => c.options[key] && profile.allowedOptions.includes(key)).map(([, label]) => label),
    twoSided: c.options.doubleSided,
    currentSide: c.options.doubleSided && previous.currentSide === 'back' ? 'back' : 'front',
    print: clone(c.print),
  };
}
