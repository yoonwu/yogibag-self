import * as THREE from '../vendor/three/three.module.js';
import { MM_TO_SCENE, getProductProfile } from './config.mjs?v=1.2.9';
import { getFabricOption } from './fabrics.mjs?v=1.2.9';

// The legacy poly products use their own photos, not the canvas fabric picker.
// Keep the shared fabric setting intact while rendering their finer synthetic
// weave and softer sheen from the product's construction.
const POLY_FABRIC = Object.freeze({ id: 'poly-synthetic', weave: 'poly', tileMm: 4,
  bumpScale: 0.000045, roughness: 0.68 });

const HANDLE_FABRICS = Object.freeze({
  'cotton-tape': { tileMm: 12, warpPitchMm: 1, weftPitchMm: 1.2,
    bumpScale: 0.00021, roughness: 0.93, sheen: 0.06, sheenRoughness: 0.92 },
  'dense-webbing': { tileMm: 8, warpPitchMm: 0.25, weftPitchMm: 0.25,
    bumpScale: 0.0002, roughness: 0.7, sheen: 0.3, sheenRoughness: 0.7 },
});

function installFiberReflectance(material) {
  const amount = { value: 0 };
  Object.defineProperty(material, '_fiberReflectance', { value: amount });
  material.onBeforeCompile = shader => {
    shader.uniforms.handleFiberReflectance = amount;
    shader.fragmentShader = `uniform float handleFiberReflectance;\n${shader.fragmentShader}`
      .replace('#include <map_fragment>', `
        // Small residual scattering from dyed fibers. This participates in
        // lighting and shadows; it is not emissive and keeps the selected
        // material.color intact. Apply it before the neutral yarn map.
        diffuseColor.rgb += vec3( handleFiberReflectance );
        #include <map_fragment>
      `);
  };
  material.customProgramCacheKey = () => 'handle-fiber-reflectance-v1';
}

// The whole tape width occupies U once; V repeats at a physical length. This
// places selvedges on the real edges and keeps the thread size independent of
// strap length, bag dimensions and the customer's selected body fabric.
function handleTextureSet(kind) {
  const make = channel => {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    texture.name = `procedural-handle:${kind}:${channel}`;
    if (channel === 'albedo') texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };
  return { kind, widthMm: null, map: make('albedo'), bumpMap: make('bump') };
}

function updateHandleTextureSet(set, widthMm) {
  if (set.widthMm === widthMm) return;
  const option = HANDLE_FABRICS[set.kind], cotton = set.kind === 'cotton-tape';
  const canvases = [set.map.image, set.bumpMap.image];
  const contexts = canvases.map(canvas => canvas.getContext('2d'));
  const pixels = canvases.map((canvas, index) => contexts[index].createImageData(canvas.width, canvas.height));
  const width = canvases[0].width, height = canvases[0].height;
  const tau = Math.PI * 2;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const across = (x + 0.5) / width * widthMm;
    const along = y / height * option.tileMm;
    const edge = Math.min(across, widthMm - across);
    const warp = Math.cos(tau * across / option.warpPitchMm + Math.sin(tau * along / option.weftPitchMm) * (cotton ? 0.14 : 0.06));
    const weft = Math.cos(tau * along / option.weftPitchMm);
    const fine = Math.sin(tau * (across / 0.11 + y / height * 47))
      * Math.sin(tau * (across / 0.17 - y / height * 31));
    let weave = (0.5 + weft * 0.5) ** 2 * 0.8 + warp * 0.25 + warp * weft * 0.12 - 0.36;
    let yarnShadow = 0, fiber = fine;
    if (cotton) {
      // The reference tape shows bundles of fine threads, rather than a
      // perfectly continuous sine-wave rib. Interleaved rounded yarns at
      // about 1 mm retain their shading through a screen pixel / mip level,
      // while the sub-thread grain supplies detail when zoomed further in.
      // All length variations are periodic over the same 12 mm tile.
      const u = across / option.warpPitchMm + Math.sin(tau * along / 12) * 0.045
        + Math.sin(tau * along / 6 + across * 0.19) * 0.025;
      const v = along / option.weftPitchMm + Math.sin(across * 1.13) * 0.04;
      const column = Math.floor(u), row = Math.floor(v);
      const cu = u - column - 0.5, cv = v - row - 0.5;
      const warpYarn = Math.cos(cu * Math.PI) ** 2 * (0.85 + 0.15 * Math.cos(cv * Math.PI) ** 2);
      const weftYarn = Math.cos(cv * Math.PI) ** 2 * (0.76 + 0.24 * Math.cos(cu * Math.PI) ** 2);
      const topWarp = ((column + row) % 2 + 2) % 2 === 0;
      const top = topWarp ? warpYarn : weftYarn;
      const underneath = topWarp ? weftYarn : warpYarn;
      const rowInTile = (row % 10 + 10) % 10;
      const yarnVariation = Math.sin(column * 12.9898 + rowInTile * 78.233) * 43758.5453;
      const uneven = (yarnVariation - Math.floor(yarnVariation)) - 0.5;
      weave = top * 0.8 + underneath * 0.2 - 0.44 + uneven * 0.055;
      yarnShadow = (1 - warpYarn) * (1 - weftYarn);
      fiber = Math.sin(tau * (across / 0.18 + Math.sin(tau * along / 12) * 0.04))
        * (0.45 + 0.55 * top) + fine * 0.4;
    }
    const fold = Math.exp(-Math.pow((edge - (cotton ? 0.55 : 0.4)) / (cotton ? 0.3 : 0.22), 2));
    const crease = Math.exp(-Math.pow((edge - (cotton ? 1.1 : 0.9)) / 0.16, 2));
    const stitchRow = Math.exp(-Math.pow((edge - (cotton ? 1.8 : 1.25)) / 0.18, 2));
    const stitch = stitchRow * Math.max(0, Math.cos(tau * along / (cotton ? 3 : 2)));
    const bump = 145 + weave * (cotton ? 100 : 42) - yarnShadow * 22
      + fiber * (cotton ? 6 : 3) + fold * 20 - crease * 14 + stitch * 18;
    // Neutral fiber shading multiplies the chosen color; no photographic
    // ivory/black tint is baked into a handle or changed in the saved config.
    const albedo = (cotton ? 255 : 247) + weave * (cotton ? 38 : 6) - yarnShadow * 18 + fiber * (cotton ? 2.5 : 1.3)
      - fold * 3 - crease * 10 + stitch * 3 - (edge < 0.28 ? 4 : 0);
    const offset = (y * width + x) * 4;
    for (let channel = 0; channel < 2; channel += 1) {
      const value = Math.round(THREE.MathUtils.clamp(channel === 0 ? albedo : bump, 0, 255));
      pixels[channel].data[offset] = pixels[channel].data[offset + 1] = pixels[channel].data[offset + 2] = value;
      pixels[channel].data[offset + 3] = 255;
    }
  }
  contexts.forEach((context, index) => context.putImageData(pixels[index], 0, 0));
  for (const texture of [set.map, set.bumpMap]) {
    texture.repeat.set(1 / (widthMm * MM_TO_SCENE), 1 / (option.tileMm * MM_TO_SCENE));
    texture.userData = { handleKind: set.kind, widthMm, tileMm: option.tileMm,
      warpPitchMm: option.warpPitchMm, weftPitchMm: option.weftPitchMm, reference: true };
    texture.needsUpdate = true;
  }
  set.widthMm = widthMm;
}

function updateHandleMaterials(materials, config, profile) {
  const handleFabric = profile.handleFabric || (profile.clothKind === 'poly' ? 'double-weave' : profile.category === 'sample' ? 'webbing' : 'cotton-tape');
  const kind = handleFabric === 'cotton-tape' ? 'cotton-tape' : 'dense-webbing';
  const state = materials._handleState;
  if (!state.cache.has(kind)) state.cache.set(kind, handleTextureSet(kind));
  const set = state.cache.get(kind), option = HANDLE_FABRICS[kind];
  updateHandleTextureSet(set, Math.max(1, Number(config.handle.width) || 30));
  for (const key of ['handle', 'crossStrapEdge']) {
    const material = materials[key], compile = !material.map || !material.bumpMap;
    material.map = set.map; material.bumpMap = set.bumpMap;
    material.bumpScale = option.bumpScale * (key === 'handle' ? 1 : 0.7);
    material.roughness = option.roughness;
    material.userData.handleKind = kind;
    material.userData.handleFabric = handleFabric;
    // Pure photographic black (including legacy #040000) otherwise gives
    // almost no diffuse response. A small neutral fiber scattering floor
    // exposes its weave under the existing studio lights, without lifting
    // body artwork or changing customer color values in the configuration.
    const selected = materials.handle.color;
    const maximum = Math.max(selected.r, selected.g, selected.b);
    material._fiberReflectance.value = kind === 'dense-webbing'
      ? 0.0065 * Math.max(0, 1 - maximum / 0.025) : 0;
    if (compile) material.needsUpdate = true;
  }
  materials.handle.sheen = option.sheen;
  materials.handle.sheenRoughness = option.sheenRoughness;
  state.activeId = kind;
}

// Generated cloth UVs use scene metres. Each fabric's tile represents a real
// millimetre size, so bag dimensions never stretch the weave. These are subtle
// procedural references, ready to be replaced by calibrated fabric scans.
function fabricBump(option) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const pixels = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const warp = Math.cos(x * Math.PI / 4);
      const weft = Math.cos(y * Math.PI / 4);
      const irregularity = Math.sin(x * 1.73 + y * 2.41) * 2;
      let height;
      switch (option.weave) {
        case 'poly':
          height = Math.cos(x * Math.PI / 2) * 11 + Math.cos(y * Math.PI / 2) * 9
            + Math.cos((x + y) * Math.PI / 4) * 4;
          break;
        case 'twill':
          height = Math.cos((x + y) * Math.PI / 8) * 29 + warp * 9 + weft * 6;
          break;
        case 'denim':
          height = Math.cos((x * 2 + y) * Math.PI / 6) * 25 + warp * 11 + weft * 7;
          break;
        case 'linen': {
          const looseWarp = Math.cos((x + Math.sin(y * Math.PI / 16) * 2) * Math.PI / 8);
          const looseWeft = Math.cos((y + Math.sin(x * Math.PI / 16) * 2) * Math.PI / 8);
          height = looseWarp * 25 + looseWeft * 20 + looseWarp * looseWeft * 7;
          break;
        }
        case 'jute': {
          const coarseWarp = Math.cos(x * Math.PI / 8);
          const coarseWeft = Math.cos(y * Math.PI / 8);
          height = coarseWarp * 31 + coarseWeft * 26 + coarseWarp * coarseWeft * 10 + Math.cos(x * Math.PI / 2) * 4;
          break;
        }
        case 'herringbone': {
          const foldedX = x % 64 < 32 ? x % 32 : 32 - x % 32;
          height = Math.cos((foldedX + y) * Math.PI / 8) * 29 + warp * 8 + weft * 7;
          break;
        }
        default:
          height = warp * 21 + weft * 17 + warp * weft * 9;
      }
      const value = Math.round(THREE.MathUtils.clamp(145 + height + irregularity, 0, 255));
      const index = (y * canvas.width + x) * 4;
      pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = value;
      pixels.data[index + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1 / (option.tileMm * MM_TO_SCENE), 1 / (option.tileMm * MM_TO_SCENE));
  texture.anisotropy = 2;
  texture.name = `procedural-fabric:${option.id}`;
  texture.userData = { fabricId: option.id, tileMm: option.tileMm, reference: true };
  return texture;
}

export function createBagMaterials(config) {
  const nameTagFabric = getFabricOption('basic');
  const nameTagBump = fabricBump(nameTagFabric);
  const fabric = (bumpMap, bumpScale) => new THREE.MeshStandardMaterial({
    color: '#eee6d8',
    roughness: 0.94,
    metalness: 0,
    bumpMap,
    bumpScale,
    side: THREE.DoubleSide,
  });
  const materials = {
    body: fabric(null, 0.00012),
    bottom: fabric(null, 0.00016),
    handle: new THREE.MeshPhysicalMaterial({ color: '#eee6d8', roughness: 0.88, metalness: 0,
      sheen: 0.12, sheenColor: '#ffffff', sheenRoughness: 0.88, side: THREE.DoubleSide }),
    crossStrapEdge: fabric(null, 0.00011),
    crossStrapStitch: new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, side: THREE.DoubleSide }),
    crossStrapHardware: new THREE.MeshStandardMaterial({ color: '#737a82', roughness: 0.33, metalness: 0.65 }),
    inside: fabric(null, 0.0001),
    pocket: fabric(null, 0.00012),
    innerPocket: fabric(null, 0.0001),
    pocketEdge: fabric(null, 0.00016),
    pocketStitch: fabric(null, 0.00008),
    pocketShadow: fabric(null, 0.0001),
    nameTag: fabric(nameTagBump, nameTagFabric.bumpScale * 0.6),
    nameTagBorder: new THREE.MeshStandardMaterial({ color: '#8b8a87', roughness: 1, metalness: 0, side: THREE.DoubleSide }),
    seam: new THREE.MeshStandardMaterial({ color: '#d2cabd', roughness: .78, metalness: 0, side: THREE.DoubleSide }),
    zipper: new THREE.MeshStandardMaterial({ color: '#353941', roughness: 0.67, metalness: 0.18 }),
    snap: new THREE.MeshStandardMaterial({ color: '#888a8c', roughness: 0.42, metalness: 0.65 }),
  };
  installFiberReflectance(materials.handle);
  installFiberReflectance(materials.crossStrapEdge);
  materials.nameTag.color.set('#faf9f5');
  materials.nameTag.userData.fabricId = nameTagFabric.id;
  materials.webbing = materials.handle;
  materials.lining = materials.inside;
  materials.stitch = materials.seam;
  materials.bottomPanel = materials.bottom;
  // Keep implementation state out of the public material-key aliases. A cache
  // belongs to this viewer and is bounded by the fabric catalog, not by edits.
  Object.defineProperty(materials, '_fabricState', {
    value: { cache: new Map([[nameTagFabric.id, nameTagBump]]), activeId: null, disposed: false },
    enumerable: false,
  });
  Object.defineProperty(materials, '_handleState', {
    value: { cache: new Map(), activeId: null }, enumerable: false,
  });
  updateBagMaterials(materials, config);
  return materials;
}

export function updateBagMaterials(materials, config) {
  if (materials._fabricState.disposed) return;
  const profile = getProductProfile(config);
  const synthetic = profile.clothKind === 'poly';
  const option = synthetic ? POLY_FABRIC : getFabricOption(config.body.fabricId);
  const state = materials._fabricState;
  if (state.activeId !== option.id) {
    if (!state.cache.has(option.id)) state.cache.set(option.id, fabricBump(option));
    const bump = state.cache.get(option.id);
    for (const [key, thickness] of [['body', 1], ['bottom', 4 / 3], ['pocket', 1], ['inside', 5 / 6],
      ['innerPocket', 5 / 6], ['pocketEdge', 4 / 3], ['pocketStitch', 2 / 3], ['pocketShadow', 5 / 6]]) {
      const material = materials[key];
      const hadBump = Boolean(material.bumpMap);
      material.bumpMap = bump;
      material.bumpScale = option.bumpScale * thickness;
      material.roughness = option.roughness;
      material.userData.fabricId = option.id;
      if (!hadBump) material.needsUpdate = true;
    }
    state.activeId = option.id;
  }
  materials.body.color.set(config.body.color);
  materials.pocket.color.set(config.pocket.color || config.body.color);
  materials.bottom.color.set(config.bottomPanel.color);
  materials.handle.color.set(config.handle.color);
  updateHandleMaterials(materials, config, profile);
  // The folded selvedge and sewing follow the selected webbing, while the
  // clasp/adjuster keep their metal finish. Shared textures avoid allocating
  // another fabric map when the customer changes colors or body fabric.
  const webbingHsl = materials.handle.color.getHSL({ h: 0, s: 0, l: 0 });
  const darkWebbing = webbingHsl.l < 0.06;
  materials.crossStrapEdge.color.setHSL(webbingHsl.h, webbingHsl.s,
    darkWebbing ? webbingHsl.l * 0.85 + 0.035 : webbingHsl.l * 0.74);
  materials.crossStrapStitch.color.setHSL(webbingHsl.h, webbingHsl.s,
    darkWebbing ? webbingHsl.l * 0.85 + 0.11 : webbingHsl.l * 0.61);
  materials.crossStrapStitch.emissive.copy(materials.crossStrapStitch.color);
  materials.crossStrapStitch.emissiveIntensity = darkWebbing ? 0.025 : 0;
  materials.inside.color.set(config.body.color).multiplyScalar(0.82);
  // The inside pocket uses the chosen body's hue and fabric. Tiny changes in
  // reflected light make its folded edge and stitching visible on both pale
  // canvas and very dark cloth without recording a different customer color.
  const base = materials.body.color;
  const hsl = base.getHSL({ h: 0, s: 0, l: 0 });
  const luminance = base.r * 0.2126 + base.g * 0.7152 + base.b * 0.0722;
  const dark = luminance < 0.06;
  materials.innerPocket.color.setHSL(hsl.h, hsl.s, Math.max(dark ? 0.04 : 0.006, hsl.l * 0.98));
  materials.pocketEdge.color.setHSL(hsl.h, hsl.s, dark ? Math.min(0.8, hsl.l * 0.85 + 0.10) : hsl.l * 0.55);
  materials.pocketStitch.color.setHSL(hsl.h, hsl.s, dark ? Math.min(0.8, hsl.l * 0.85 + 0.18) : hsl.l * 0.32);
  materials.seam.color.setHSL(hsl.h,hsl.s,dark?Math.min(.8,hsl.l*.85+.16):hsl.l*.46);
  // A very small shadow-independent contribution keeps thin dark-cloth
  // stitches readable inside the bag. Pale fabrics retain their prior shade.
  materials.pocketStitch.emissive.copy(materials.pocketStitch.color);
  materials.pocketStitch.emissiveIntensity = dark ? 0.035 : 0;
  materials.seam.emissive.copy(materials.seam.color);
  materials.seam.emissiveIntensity = dark ? 0.015 : 0;
  materials.pocketShadow.color.setHSL(hsl.h, hsl.s, hsl.l * 0.28 + 0.001);
}

export function disposeBagMaterials(materials) {
  const state = materials._fabricState;
  if (state?.disposed) return;
  if (state) state.disposed = true;
  const uniqueMaterials = new Set(Object.values(materials));
  const textures = new Set(state?.cache.values());
  for (const set of materials._handleState?.cache.values() || []) {
    textures.add(set.map); textures.add(set.bumpMap);
  }
  for (const material of uniqueMaterials) {
    for (const property of ['map', 'bumpMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap']) {
      if (material[property]) textures.add(material[property]);
    }
    material.dispose();
  }
  for (const texture of textures) texture.dispose();
  state?.cache.clear();
  materials._handleState?.cache.clear();
}
