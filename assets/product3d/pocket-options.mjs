export const POCKET_OPTION_LABELS = Object.freeze({
  frontPocketPrint: '앞주머니 인쇄',
  backPocket: '뒷면 주머니(양면)',
  backPocketPrint: '뒷면 주머니 인쇄',
});
export const isPocketTote = product => ['sample-two-line-large', 'sample-two-line-small'].includes(
  typeof product === 'string' ? product : product?.productId);

// Pocket totes use their existing independent front/back artwork channels.
// Ordinary products retain body printing and the original options.
export function isPrintSideActive(config, side) {
  if (side === 'innerPocket') return Boolean(config?.options?.innerPocketPrint);
  if (isPocketTote(config)) return side === 'back'
    ? Boolean(config?.options?.backPocket ? config?.options?.backPocketPrint : config?.options?.doubleSided)
    : Boolean(config?.options?.frontPocketPrint);
  return side !== 'back' || Boolean(config?.options?.doubleSided);
}

export function printSideLabel(config, side) {
  if (isPocketTote(config) && side !== 'innerPocket' && (side === 'front' || config.options?.backPocket)) return side === 'back' ? '뒷면 주머니' : '앞주머니';
  return { front: '앞면', back: '뒷면', innerPocket: '안주머니' }[side];
}
