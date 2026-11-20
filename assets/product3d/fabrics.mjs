// Match the fabric choices already offered by the existing self editor.
// Procedural profiles are visual references. Measured fabrics specify the
// physical width and height covered by the photograph's repeat.
export const FABRICS3D = Object.freeze([
  { id: 'basic', name: '기본 캔버스', weave: 'plain', tileMm: 8, bumpScale: 0.00012, roughness: 0.94 },
  { id: 'twill', name: '트윌', weave: 'twill', tileMm: 8, bumpScale: 0.0002, roughness: 0.91 },
  { id: 'heritage-10s-twill-peach', name: '헤리티지 10수 트윌 피치', weave: 'heritage-twill',
    tileMm: 25, bumpScale: 0.00021, roughness: 0.96,
    swatch: './fabrics/heritage-10s-twill-peach.png', pitchMm: 1 },
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

const swatchLoads = new Map();

export function loadFabricSwatch(option) {
  if (!swatchLoads.has(option.id)) {
    const load = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('원단 사진을 불러오지 못했어요.'));
      image.src = new URL(option.swatch, import.meta.url).href;
    }).catch(error => {
      swatchLoads.delete(option.id);
      throw error;
    });
    swatchLoads.set(option.id, load);
  }
  return swatchLoads.get(option.id);
}

export function createFabricDetail(option) {
  const figure = document.createElement('figure');
  figure.className = 'measured-fabric-detail';
  figure.style.setProperty('--swatch-scale', `${1000 / option.tileMm}%`);
  const image = document.createElement('img');
  image.src = new URL(option.swatch, import.meta.url).href;
  image.alt = `${option.name} 원단 결 확대`;
  const ruler = document.createElement('span');
  ruler.className = 'measured-fabric-ruler';
  ruler.textContent = '10 mm';
  const label = document.createElement('figcaption');
  label.textContent = `원단 결 확대 · 사선 간격 약 ${option.pitchMm} mm`;
  figure.append(image, ruler, label);
  return figure;
}

// Apply neutralized swatch luminance to the selected dye. Canvas pattern
// transforms preserve a fractional physical repeat instead of rounding it to
// whole pixels on every tile.
export function createFabricOverlay(image, width, height, repeatX, repeatY, color) {
  const tile = document.createElement('canvas');
  tile.width = tile.height = 256;
  const tileContext = tile.getContext('2d', { willReadFrequently: true });
  tileContext.drawImage(image, 0, 0, tile.width, tile.height);
  const pixels = tileContext.getImageData(0, 0, tile.width, tile.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const shade = Math.min(1.04, 0.97 + (pixels.data[i] - 150) / 400);
    for (let channel = 0; channel < 3; channel += 1) pixels.data[i + channel] = color[channel] * shade;
  }
  tileContext.putImageData(pixels, 0, 0);
  const overlay = document.createElement('canvas');
  overlay.width = width;
  overlay.height = height;
  const context = overlay.getContext('2d');
  const pattern = context.createPattern(tile, 'repeat');
  pattern.setTransform(new DOMMatrix().scale(repeatX / tile.width, repeatY / tile.height));
  context.fillStyle = pattern;
  context.fillRect(0, 0, width, height);
  return overlay;
}

export function getColorName(hex) {
  const value = String(hex || '').toLowerCase();
  const preset = FABRIC_COLOR_PRESETS.find(option => option.hex === value);
  return preset ? `${preset.name} (${value})` : value;
}
