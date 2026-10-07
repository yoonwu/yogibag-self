import { createDefaultConfig, SAMPLE_PRODUCT_ID, PRODUCT3D_PROFILES } from './config.mjs';
import { buildBagModel } from './model.mjs';

// New product shapes register a generator; products sharing a shape register defaults.
export const Product3DRegistry = new Map([
  ['bottom-color-tote', { create: buildBagModel, name: '하단 배색 토트백' }],
  ['daily-tote', { create: buildBagModel, name: '데일리 에코백' }],
  ['flat-tote', { create: buildBagModel, name: '평면 에코백' }],
  ['gusset-tote', { create: buildBagModel, name: '밑단 에코백' }],
  ['flat-pouch', { create: buildBagModel, name: '민자 파우치' }],
  ['gusset-pouch', { create: buildBagModel, name: '밑단 파우치' }],
  ['tumbler-pouch', { create: buildBagModel, name: '텀블러 파우치' }],
  ['poly-tote', { create: buildBagModel, name: '폴리백' }],
]);
export const Product3DCatalog = new Map(Object.values(PRODUCT3D_PROFILES)
  .map(profile => [profile.id, { type: profile.type, defaults: () => createDefaultConfig(profile.id) }]));
export function createProductModel(config, materials) {
  const product = Product3DCatalog.get(config.productId);
  if (!product || product.type !== config.productType) throw new Error('상품과 3D 가방 유형이 맞지 않습니다.');
  const template = Product3DRegistry.get(config.productType);
  if (!template) throw new Error('아직 준비되지 않은 3D 가방 유형입니다.');
  return template.create(config, materials);
}
export function configForProduct(productId = SAMPLE_PRODUCT_ID) {
  const product = Product3DCatalog.get(productId);
  if (!product) throw new Error('해당 상품의 3D 시안은 아직 준비되지 않았습니다.');
  return product.defaults();
}
