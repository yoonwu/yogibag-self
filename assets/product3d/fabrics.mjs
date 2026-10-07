// Match the fabric choices already offered by the existing self editor.
// These procedural profiles are visual references; replace them with measured
// swatch textures when the actual fabric samples are available.
export const FABRICS3D = Object.freeze([
  { id: 'basic', name: '기본 캔버스', weave: 'plain', tileMm: 8, bumpScale: 0.00012, roughness: 0.94 },
  { id: 'twill', name: '트윌', weave: 'twill', tileMm: 8, bumpScale: 0.0002, roughness: 0.91 },
  { id: 'denim', name: '데님', weave: 'denim', tileMm: 8, bumpScale: 0.00023, roughness: 0.93 },
  { id: 'linen', name: '리넨', weave: 'linen', tileMm: 12, bumpScale: 0.0003, roughness: 0.97 },
  { id: 'jute', name: '주트', weave: 'jute', tileMm: 16, bumpScale: 0.00045, roughness: 1 },
  { id: 'herringbone', name: '헤링본', weave: 'herringbone', tileMm: 12, bumpScale: 0.00025, roughness: 0.95 },
].map(option => Object.freeze(option)));

export const FABRIC_COLOR_PRESETS = Object.freeze([
  { name: '아이보리', hex: '#ece6d9' },
  { name: '화이트', hex: '#f3f1ec' },
  { name: '블랙', hex: '#171c28' },
  { name: '네이비', hex: '#1a2a4a' },
  { name: '그레이', hex: '#c9c8c4' },
  { name: '베이지', hex: '#e0d2b8' },
  { name: '핑크', hex: '#f0c3cd' },
  { name: '그린', hex: '#7d9070' },
  { name: '블루', hex: '#5f82a8' },
  { name: '브라운', hex: '#7a5c43' },
  { name: '레드', hex: '#c2141c' },
  { name: '옐로우', hex: '#f5c632' },
].map(option => Object.freeze(option)));

export function getFabricOption(id) {
  return FABRICS3D.find(option => option.id === id) || FABRICS3D[0];
}

export function getColorName(hex) {
  const value = String(hex || '').toLowerCase();
  const preset = FABRIC_COLOR_PRESETS.find(option => option.hex === value);
  return preset ? `${preset.name} (${value})` : value;
}
