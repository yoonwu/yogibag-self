import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from '../assets/vendor/three/three.module.js';
import { createDefaultConfig, normalizeConfig, MM_TO_SCENE } from '../assets/product3d/config.mjs';
import { FABRICS3D } from '../assets/product3d/fabrics.mjs';
import { createBagMaterials, updateBagMaterials, disposeBagMaterials } from '../assets/product3d/materials.mjs';
import { buildBagModel, disposeBagModel } from '../assets/product3d/model.mjs';

// Capture generated pixels without a browser. The materials and textures are
// actual Three.js objects; browser QA covers their rendered appearance.
let originalDocument;
before(() => {
  originalDocument = globalThis.document;
  globalThis.document = {
    createElement(type) {
      assert.equal(type, 'canvas');
      const canvas = {
        width: 0,
        height: 0,
        pixels: null,
        getContext(kind) {
          assert.equal(kind, '2d');
          return {
            createImageData(width, height) {
              return { width, height, data: new Uint8ClampedArray(width * height * 4) };
            },
            putImageData(imageData) { canvas.pixels = imageData.data; },
          };
        },
      };
      return canvas;
    },
  };
});
after(() => {
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
});

test('six fabric profiles generate distinct weave pixels at their physical tile size', () => {
  const config = createDefaultConfig();
  const materials = createBagMaterials(config);
  const hashes = new Set();
  const webbingTexture = materials.handle.bumpMap;
  try {
    for (const option of FABRICS3D) {
      config.body.fabricId = option.id;
      updateBagMaterials(materials, config);
      const texture = materials.body.bumpMap;
      hashes.add(createHash('sha256').update(texture.image.pixels).digest('hex'));
      assert.equal(texture.repeat.x, 1 / (option.tileMm * MM_TO_SCENE));
      assert.equal(texture.repeat.y, 1 / (option.tileMm * MM_TO_SCENE));
      assert.equal(materials.body.roughness, option.roughness);
      assert.equal(materials.body.bumpScale, option.bumpScale);
      assert.equal(materials.pocket.bumpMap, texture);
      assert.equal(materials.bottom.bumpMap, texture);
      assert.equal(materials.inside.bumpMap, texture);
      for (const key of ['innerPocket', 'pocketEdge', 'pocketStitch', 'pocketShadow']) {
        assert.equal(materials[key].bumpMap, texture);
        assert.equal(materials[key].userData.fabricId, option.id);
      }
      assert.equal(materials.handle.bumpMap, webbingTexture);
    }
    assert.equal(hashes.size, 6);
  } finally {
    disposeBagMaterials(materials);
  }
});

test('default canvas keeps the original weave recipe and material strength', () => {
  const materials = createBagMaterials(createDefaultConfig());
  try {
    const pixels = materials.body.bumpMap.image.pixels;
    for (let y = 0; y < 128; y += 1) {
      for (let x = 0; x < 128; x += 1) {
        const warp = Math.cos(x * Math.PI / 4);
        const weft = Math.cos(y * Math.PI / 4);
        const irregularity = Math.sin(x * 1.73 + y * 2.41) * 2;
        const value = Math.round(145 + warp * 21 + weft * 17 + warp * weft * 9 + irregularity);
        assert.equal(pixels[(y * 128 + x) * 4], value);
      }
    }
    assert.equal(materials.body.bumpScale, 0.00012);
    assert.ok(Math.abs(materials.bottom.bumpScale - 0.00016) < 1e-12);
    assert.equal(materials.handle.bumpScale, 0.0002, 'the sample uses separate dense webbing');
    assert.equal(materials.body.roughness, 0.94);
  } finally {
    disposeBagMaterials(materials);
  }
});

test('poly products retain shared color settings but render fine synthetic cloth and restore canvas cleanly', () => {
  const canvas = createDefaultConfig('daily');
  const materials = createBagMaterials(canvas);
  const canvasTexture = materials.body.bumpMap;
  const canvasHash = createHash('sha256').update(canvasTexture.image.pixels).digest('hex');
  const webbingTexture = materials.handle.bumpMap;
  try {
    for (const id of ['poly_h', 'poly_v']) {
      const poly = createDefaultConfig(id);
      poly.body.color = '#104727';
      const original = JSON.stringify(poly);
      updateBagMaterials(materials, poly);
      assert.equal(JSON.stringify(poly), original);
      assert.equal(materials.body.color.getHexString(), '104727');
      assert.equal(materials.body.userData.fabricId, 'poly-synthetic');
      assert.equal(materials.body.bumpScale, 0.000045);
      assert.equal(materials.body.roughness, 0.68);
      assert.notEqual(createHash('sha256').update(materials.body.bumpMap.image.pixels).digest('hex'), canvasHash);
      assert.equal(materials.inside.bumpMap, materials.body.bumpMap);
      assert.notEqual(materials.handle.bumpMap, webbingTexture);
      assert.equal(materials.handle.userData.handleKind, 'dense-webbing');
    }
    updateBagMaterials(materials, canvas);
    assert.equal(materials.body.bumpMap, canvasTexture);
    assert.equal(materials.body.roughness, 0.94);
    assert.equal(materials.body.bumpScale, 0.00012);
    assert.equal(materials.handle.bumpMap, webbingTexture, 'switching back reuses the separate cotton-tape texture');
    assert.equal(materials._fabricState.cache.size, 2);
  } finally { disposeBagMaterials(materials); }
});

test('body, pocket, webbing and bottom colors remain independent through fabric changes', () => {
  const config = createDefaultConfig();
  config.body.color = '#ece6d9';
  config.pocket.color = '#c2141c';
  config.handle.color = '#1a2a4a';
  config.bottomPanel.color = '#7d9070';
  const materials = createBagMaterials(config);
  const bodyMaterial = materials.body;
  const webbingTexture = materials.handle.bumpMap;
  try {
    for (const option of FABRICS3D) {
      config.body.fabricId = option.id;
      updateBagMaterials(materials, config);
      assert.equal(materials.body.color.getHexString(), 'ece6d9');
      assert.equal(materials.pocket.color.getHexString(), 'c2141c');
      assert.equal(materials.handle.color.getHexString(), '1a2a4a');
      assert.equal(materials.bottom.color.getHexString(), '7d9070');
      assert.equal(materials.body, bodyMaterial);
      assert.equal(materials.handle.bumpMap, webbingTexture);
    }
  } finally {
    disposeBagMaterials(materials);
  }
});

test('cross webbing edges and thread follow the handle color while hardware and weave stay independent', () => {
  const config = createDefaultConfig(), materials = createBagMaterials(config);
  const webbingTexture = materials.handle.bumpMap;
  const metalColor = materials.crossStrapHardware.color.getHexString();
  try {
    for (const color of ['#ece6d9', '#171c28', '#c2141c', '#ffffff', '#000000']) {
      config.handle.color = color;
      config.body.color = '#7d9070';
      config.body.fabricId = 'linen';
      const saved = JSON.stringify(config);
      updateBagMaterials(materials, config);
      assert.equal(JSON.stringify(config), saved);
      assert.equal(materials.handle.color.getHexString(), color.slice(1));
      assert.equal(materials.body.color.getHexString(), '7d9070');
      assert.equal(materials.crossStrapEdge.bumpMap, webbingTexture);
      assert.equal(materials.crossStrapHardware.color.getHexString(), metalColor);
      assert.ok(materials.crossStrapHardware.metalness > 0.5);
      const base = materials.handle.color.getHSL({});
      for (const key of ['crossStrapEdge', 'crossStrapStitch']) {
        const shade = materials[key].color.getHSL({});
        assert.ok(Math.abs(shade.h - base.h) < 1e-9);
        assert.ok(Math.abs(shade.s - base.s) < 1e-9);
        assert.ok(Math.abs(shade.l - base.l) > 0.018, 'a fold/thread must separate from the selected webbing face');
      }
    }
  } finally { disposeBagMaterials(materials); }
});

test('the inside name label keeps its white cloth and gray outline across bag color and fabric changes', () => {
  const config = createDefaultConfig();
  const materials = createBagMaterials(config);
  const labelTexture = materials.nameTag.bumpMap;
  try {
    for (const option of FABRICS3D) {
      config.body.fabricId = option.id;
      config.body.color = option.id === 'basic' ? '#ffffff' : '#171c28';
      updateBagMaterials(materials, config);
      assert.equal(materials.nameTag.color.getHexString(), 'faf9f5');
      assert.equal(materials.nameTagBorder.color.getHexString(), '8b8a87');
      assert.equal(materials.nameTag.bumpMap, labelTexture);
      assert.equal(materials.nameTag.userData.fabricId, 'basic');
      assert.equal(labelTexture, materials._fabricState.cache.get('basic'));
      assert.ok(materials._fabricState.cache.size <= FABRICS3D.length);
    }
  } finally { disposeBagMaterials(materials); }
});

test('600 fabric changes keep a bounded reusable cache and dispose each resource once', () => {
  const config = createDefaultConfig();
  const materials = createBagMaterials(config);
  const firstTextures = new Map();
  const pocketMaterials = Object.fromEntries(['innerPocket', 'pocketEdge', 'pocketStitch', 'pocketShadow']
    .map(key => [key, materials[key]]));
  for (let edit = 0; edit < 600; edit += 1) {
    const option = FABRICS3D[edit % FABRICS3D.length];
    config.body.fabricId = option.id;
    updateBagMaterials(materials, config);
    if (!firstTextures.has(option.id)) firstTextures.set(option.id, materials.body.bumpMap);
    assert.equal(materials.body.bumpMap, firstTextures.get(option.id));
    for (const [key, material] of Object.entries(pocketMaterials)) {
      assert.equal(materials[key], material);
      assert.equal(material.bumpMap, firstTextures.get(option.id));
    }
    assert.ok(materials._fabricState.cache.size <= FABRICS3D.length);
  }
  assert.equal(materials._fabricState.cache.size, 6);
  const textures = new Set([...firstTextures.values(), materials.handle.bumpMap, materials.handle.map]);
  const uniqueMaterials = new Set(Object.values(materials));
  const disposalCounts = new Map();
  for (const resource of [...textures, ...uniqueMaterials]) {
    disposalCounts.set(resource, 0);
    resource.addEventListener('dispose', () => disposalCounts.set(resource, disposalCounts.get(resource) + 1));
  }
  disposeBagMaterials(materials);
  disposeBagMaterials(materials);
  assert.equal(textures.size, 8);
  assert.equal(materials._fabricState.cache.size, 0);
  assert.ok([...disposalCounts.values()].every(count => count === 1));
});

test('same-color inside pockets retain the chosen hue while their edges stay visible on light and dark cloth', () => {
  const config = createDefaultConfig();
  config.pocket.color = '#3aa66c';
  const materials = createBagMaterials(config);
  const luminance = color => color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  try {
    for (const color of ['#ffffff', '#ece6d9', '#000000', '#171c28', '#1a2a4a', '#e32727']) {
      config.body.color = color;
      const saved = JSON.stringify(config);
      updateBagMaterials(materials, config);
      assert.equal(JSON.stringify(config), saved);
      assert.equal(materials.body.color.getHexString(), color.slice(1));
      assert.equal(materials.pocket.color.getHexString(), '3aa66c');
      const base = materials.body.color.getHSL({});
      for (const key of ['innerPocket', 'pocketEdge', 'pocketStitch', 'pocketShadow']) {
        const shade = materials[key].color.getHSL({});
        assert.ok(Math.abs(shade.h - base.h) < 1e-9, `${color}: ${key} must retain the selected hue.`);
        assert.ok(Math.abs(shade.s - base.s) < 1e-9, `${color}: ${key} must retain the selected saturation.`);
        assert.equal(materials[key].bumpMap, materials.body.bumpMap);
      }
      const face = luminance(materials.innerPocket.color);
      const lining = luminance(materials.inside.color);
      const edge = luminance(materials.pocketEdge.color);
      const thread = luminance(materials.pocketStitch.color);
      assert.ok(face > lining, `${color}: the pocket face should separate from the same-color lining.`);
      assert.ok(Math.abs(edge - face) > 0.015, `${color}: the folded edge needs visible contrast.`);
      assert.ok(Math.abs(thread - face) > 0.03, `${color}: fine stitches need visible contrast.`);
      assert.ok(luminance(materials.pocketShadow.color) < face,
        `${color}: the opening must read as a recessed shadow.`);
      if (color === '#ffffff' || color === '#ece6d9' || color === '#e32727') {
        assert.ok(edge < face);
        assert.equal(materials.pocketStitch.emissiveIntensity, 0);
        assert.ok(luminance(materials.seam.color)<luminance(materials.body.color)*.65,
          `${color}: raised stitches must contrast with pale or bright body cloth.`);
        assert.ok(Math.abs(materials.seam.color.getHSL({}).h-base.h)<1e-9);
        assert.equal(materials.seam.emissiveIntensity, 0);
      } else {
        assert.ok(edge > face);
        assert.ok(materials.innerPocket.color.getHSL({}).l >= 0.022 - 1e-9);
        assert.ok(materials.pocketEdge.color.getHSL({}).l >= 0.08);
        assert.ok(materials.pocketStitch.color.getHSL({}).l >= 0.13);
        const emittedLight = luminance(materials.pocketStitch.emissive) * materials.pocketStitch.emissiveIntensity;
        assert.ok(emittedLight >= 0.002, `${color}: stitches need a small readable contribution in shadow.`);
        assert.ok(materials.pocketStitch.emissiveIntensity <= 0.04, 'the stitch contribution must remain subtle.');
        assert.ok(luminance(materials.seam.color) > luminance(materials.body.color) + 0.06,
          `${color}: outer cloth seams should stay visible against dark body fabric.`);
        assert.ok(Math.abs(materials.seam.color.getHSL({}).h - base.h) < 1e-9);
        assert.ok(materials.seam.emissiveIntensity <= 0.02);
      }
    }
  } finally { disposeBagMaterials(materials); }
});

test('photo-derived handle families use neutral full-width edge maps and distinct directional thread patterns',()=>{
  const hash=texture=>createHash('sha256').update(texture.image.pixels).digest('hex');
  const families=new Map();
  for(const [id,expectedKind] of [['daily','cotton-tape'],['tumbler','cotton-tape'],['poly_h','dense-webbing'],['sample-two-line-large','dense-webbing']]) {
    const config=createDefaultConfig(id);config.handle.width=30;config.handle.color='#c2141c';
    const materials=createBagMaterials(config);
    try {
      const handle=materials.handle,{map,bumpMap}=handle;
      assert.equal(handle.userData.handleKind,expectedKind);
      assert.notEqual(map,materials.body.bumpMap);assert.notEqual(bumpMap,materials.body.bumpMap);
      assert.equal(handle.color.getHexString(),'c2141c');
      assert.ok(handle.isMeshPhysicalMaterial);assert.ok(handle.sheen>0&&handle.sheen<=.3);
      for(const texture of [map,bumpMap]) {
        assert.equal(texture.repeat.x,1/(30*MM_TO_SCENE));
        assert.equal(texture.repeat.y,1/(texture.userData.tileMm*MM_TO_SCENE));
        assert.equal(texture.userData.widthMm,30);
        const pixels=texture.image.pixels;
        for(let index=0;index<pixels.length;index+=4) {
          assert.equal(pixels[index],pixels[index+1]);assert.equal(pixels[index],pixels[index+2]);assert.equal(pixels[index+3],255);
        }
      }
      const {width,height,pixels}=map.image;
      const average=(lowMm,highMm)=>{
        let total=0,count=0;
        for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
          const mm=(x+.5)/width*30;
          if(mm>=lowMm&&mm<highMm){total+=pixels[(y*width+x)*4];count++;}
        }
        return total/count;
      };
      assert.ok(average(0,2.3)<average(10,20)-1,'narrow selvedges must differ from the broad face');
      const data=bumpMap.image.pixels;let dx=0,dy=0,count=0;
      for(let y=0;y<height-1;y++)for(let x=Math.ceil(width/3);x<Math.floor(width*2/3);x++) {
        const value=data[(y*width+x)*4];
        dx+=Math.abs(data[(y*width+x+1)*4]-value)/(30/width);
        dy+=Math.abs(data[((y+1)*width+x)*4]-value)/(bumpMap.userData.tileMm/height);count++;
      }
      if(expectedKind==='cotton-tape') {
        assert.ok(dx>dy*1.4,'cotton threads run along the length of the tape');
        assert.ok(handle.roughness>=.9&&handle.sheen<=.08,'cotton tape should keep a dry fiber finish');
        // Average the actual pixels over 0.3 and 0.6 mm screen footprints.
        // Bundled yarn shading must survive filtering at 300--600% detail
        // zoom without turning the chosen cloth color into a dark grid.
        for(const footprintMm of [.3,.6]) {
          const shades=[];
          const stepX=Math.round(footprintMm/30*width),stepY=Math.round(footprintMm/map.userData.tileMm*height);
          for(let y=0;y<height-stepY;y+=stepY)for(let x=Math.ceil(width/3);x<Math.floor(width*2/3)-stepX;x+=stepX) {
            let sum=0;
            for(let sy=0;sy<stepY;sy++)for(let sx=0;sx<stepX;sx++)sum+=pixels[((y+sy)*width+x+sx)*4];
            shades.push(sum/(stepX*stepY));
          }
          assert.ok(Math.max(...shades)-Math.min(...shades)>12,'woven yarn light and shadow must survive detail filtering');
          assert.ok(Math.min(...shades)>215,'neutral cotton shading must not become dark decorative grid lines');
          assert.ok(shades.reduce((sum,value)=>sum+value,0)/shades.length>238,'fiber shading must keep a light neutral average');
        }
      }
      else assert.ok(dy>dx*1.1,'double webbing has stronger transverse pickup ribs');
      if(families.has(expectedKind)) assert.equal(hash(bumpMap),families.get(expectedKind));
      else families.set(expectedKind,hash(bumpMap));
    } finally {disposeBagMaterials(materials);}
  }
  assert.notEqual(families.get('cotton-tape'),families.get('dense-webbing'));
});

test('actual ribbon UVs map the complete width and physical yarn pitch without clamping the broad face',()=>{
  for(const id of ['daily','small','tumbler','poly_h','sample-two-line-large']) {
    const draft=createDefaultConfig(id);draft.handle.width=34;
    const config=normalizeConfig(draft);
    const materials=createBagMaterials(config),model=buildBagModel(config,materials);
    try {
      const textures=[materials.handle.map,materials.handle.bumpMap];
      for(const texture of textures) {
        texture.updateMatrix();
        const first=new THREE.Vector2(0,0).applyMatrix3(texture.matrix);
        const last=new THREE.Vector2(config.handle.width*MM_TO_SCENE,texture.userData.tileMm*MM_TO_SCENE).applyMatrix3(texture.matrix);
        assert.equal(first.x,0);assert.equal(first.y,0);
        assert.ok(Math.abs(last.x-1)<1e-12);assert.ok(Math.abs(last.y-1)<1e-12);
      }
      let ribbons=0;
      model.traverse(mesh=>{
        if(!mesh.isMesh||!/^handle(?:Front|Back)|^handlesLoop/.test(mesh.name))return;
        ribbons++;
        const uv=mesh.geometry.getAttribute('uv');
        // A ribbon ends in two separate four-vertex caps; its long faces
        // all use the cloth coordinates, rather than bag-space X/Z.
        let uMin=Infinity,uMax=-Infinity;
        for(let index=0;index<uv.count-8;index++) {
          const u=uv.getX(index);uMin=Math.min(uMin,u);uMax=Math.max(uMax,u);
          const transformed=new THREE.Vector2(u,uv.getY(index)).applyMatrix3(textures[0].matrix);
          assert.ok(transformed.x>=-1e-6&&transformed.x<=1+1e-6,'a broad-face UV must stay within the complete tape map');
        }
        assert.equal(uMin,0);assert.ok(Math.abs(uMax-34*MM_TO_SCENE)<1e-8);
      });
      assert.ok(ribbons>=2,'photo-shaped loops must actually receive the handle material');
    } finally {disposeBagModel(model);disposeBagMaterials(materials);}
  }
});

test('near-black webbing retains its exact chosen color and uses light-dependent fiber scattering before its yarn map',()=>{
  const config=createDefaultConfig('poly_v');config.handle.color='#040000';
  const materials=createBagMaterials(config);
  try {
    assert.equal(materials.handle.color.getHexString(),'040000');
    assert.equal(materials.handle.emissiveIntensity,1);
    assert.equal(materials.handle.emissive.getHexString(),'000000','the handle must not glow');
    const shader={uniforms:{},fragmentShader:'#include <map_fragment>'};
    materials.handle.onBeforeCompile(shader);
    const uniform=shader.uniforms.handleFiberReflectance;
    assert.ok(uniform.value>.005&&uniform.value<.0065);
    assert.equal(materials.crossStrapEdge._fiberReflectance.value,uniform.value);
    assert.ok(shader.fragmentShader.indexOf('diffuseColor.rgb +=')<shader.fragmentShader.indexOf('#include <map_fragment>'));
    const body=materials.body.color.getHexString();
    config.handle.color='#c2141c';updateBagMaterials(materials,config);
    assert.equal(materials.handle.color.getHexString(),'c2141c');assert.equal(uniform.value,0);
    assert.equal(materials.crossStrapEdge._fiberReflectance.value,0);
    assert.equal(materials.body.color.getHexString(),body);
    const cotton=createDefaultConfig('daily');cotton.handle.color='#040000';updateBagMaterials(materials,cotton);
    assert.equal(materials.handle.color.getHexString(),'040000');assert.equal(uniform.value,0);
  } finally {disposeBagMaterials(materials);}
});

test('600 color, fabric, product and tape-width edits reuse two handle sets and clean every albedo and bump texture once',()=>{
  const materials=createBagMaterials(createDefaultConfig('daily'));
  const handleTextures=new Set(),textures=new Set(),disposals=new Map();
  const watch=resource=>{
    if(disposals.has(resource))return;
    disposals.set(resource,0);resource.addEventListener('dispose',()=>disposals.set(resource,disposals.get(resource)+1));
  };
  for(let edit=0;edit<600;edit++) {
    const config=createDefaultConfig(['daily','poly_h','sample-two-line-large'][edit%3]);
    config.body.fabricId=FABRICS3D[edit%FABRICS3D.length].id;
    config.handle.width=20+Math.floor(edit/20)%26;
    config.handle.color=['#ece6d9','#1a2a4a','#c2141c'][edit%3];
    const before=JSON.stringify(config);
    updateBagMaterials(materials,config);
    assert.equal(JSON.stringify(config),before);assert.equal(materials.handle.color.getHexString(),config.handle.color.slice(1));
    assert.equal(materials.handle.map,materials.crossStrapEdge.map);
    assert.equal(materials.handle.bumpMap,materials.crossStrapEdge.bumpMap);
    assert.equal(materials.handle.map.repeat.x,1/(config.handle.width*MM_TO_SCENE));
    for(const set of materials._handleState.cache.values())for(const texture of [set.map,set.bumpMap]) {
      handleTextures.add(texture);textures.add(texture);watch(texture);
    }
    for(const texture of materials._fabricState.cache.values()){textures.add(texture);watch(texture);}
    assert.ok(materials._handleState.cache.size<=2);assert.ok(handleTextures.size<=4);
    assert.ok(materials._fabricState.cache.size<=FABRICS3D.length+1);
  }
  assert.equal(handleTextures.size,4);
  for(const material of new Set(Object.values(materials)))watch(material);
  disposeBagMaterials(materials);disposeBagMaterials(materials);
  updateBagMaterials(materials,createDefaultConfig('daily'));
  assert.equal(materials._handleState.cache.size,0);assert.equal(materials._fabricState.cache.size,0);
  assert.ok([...disposals.values()].every(count=>count===1));
});
