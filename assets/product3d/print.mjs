import * as THREE from '../vendor/three/three.module.js';
import * as surfaces from './model.mjs';
import { MM_TO_SCENE } from './config.mjs';
import { getInnerPocketLayout } from './options-model.mjs';
import { renderEmbroideryCanvas,readEmbroiderySource,embroideryCanvases } from './embroidery.mjs';
import { createEmbroideryThreadMesh,createEmbroideryThreadObject } from './embroidery-geometry.mjs';
import { embroideryGeometryConfig } from './embroidery-job.mjs';
import { createEmbroideryReliefGeometry, createEmbroideryContactShadow } from './embroidery-relief.mjs';

function clipPolygon(polygon, axis, boundary, keepGreater) {
  const output=[];
  const side=point=>(point[axis]-boundary)*(keepGreater?1:-1);
  for(let i=0;i<polygon.length;i++) {
    const a=polygon[i],b=polygon[(i+1)%polygon.length],sa=side(a),sb=side(b);
    if(sa>=-1e-9)output.push(a);
    if((sa<0&&sb>0)||(sa>0&&sb<0)) {
      const t=sa/(sa-sb);
      output.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,
        u:a.u+(b.u-a.u)*t,v:a.v+(b.v-a.v)*t});
    }
  }
  return output;
}

// Artwork remains a separate surface mesh in real millimetres. It follows the
// cloth bulge without changing the original artwork's width or aspect ratio.
export function createPrintMesh(config, texture, side = 'front', embroidery = null) {
  const print = config.print[side];
  if (!print) return null;
  if (side === 'back' && !config.options.doubleSided) return null;
  if (side === 'innerPocket' && !config.options.innerPocketPrint) return null;
  if (!print.enabled || !texture) return null;
  const surface = side === 'back' ? surfaces.backSurfaceMM : side === 'innerPocket' ? surfaces.innerPocketSurfaceMM : surfaces.frontSurfaceMM;
  if (!surface) return null;
  const stitched = print.appearance === 'embroidery' && embroidery;
  const reliefGeometry = Boolean(stitched && embroidery.plan);
  const across = Math.min(40, Math.max(8, Math.ceil(print.width / 10)));
  const down = Math.min(40, Math.max(8, Math.ceil(print.height / 10)));
  const angle = print.rotation * Math.PI / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const positions = [];
  const uv = [];
  const indices = [];
  const visible = [];
  const samples = [];
  const offset = (stitched ? 0.85 : 0.65) * MM_TO_SCENE;
  for (let row = 0; row <= down; row += 1) {
    for (let column = 0; column <= across; column += 1) {
      const localX = (column / across - 0.5) * print.width;
      const localY = (0.5 - row / down) * print.height;
      const xMm = print.x + localX * cosine - localY * sine;
      const yMm = print.y + localX * sine + localY * cosine;
      const point = surface(xMm, yMm, config);
      const normal = point.normal || { x: 0, y: 0, z: side === 'back' ? -1 : 1 };
      if(side==='innerPocket')positions.push(point.x,point.y,point.z+offset);
      else positions.push(point.x + normal.x * offset, point.y + normal.y * offset, point.z + normal.z * offset);
      uv.push(column / across, 1 - row / down);
      const bounds = side === 'innerPocket' ? print.partDimensions : config.dimensions;
      visible.push(point.visible !== false && Math.abs(xMm) <= bounds.width / 2 && Math.abs(yMm) <= bounds.height / 2);
      if(side==='innerPocket')samples.push({x:xMm,y:yMm,u:column/across,v:1-row/down,
        index:samples.length,region:point.region,contourVisible:point.contourVisible!==false});
    }
  }
  const layout=side==='innerPocket'?getInnerPocketLayout(config):null;
  const appendInnerVertex=vertex=>{
    if(vertex.index!==undefined)return vertex.index;
    const point=surface(vertex.x,vertex.y,config);
    const index=positions.length/3;
    // This independent hanging plane retains the exact 2D X/Y coordinates,
    // including the cut at the mouth; only depth separates ink from cloth.
    positions.push(point.x,point.y,point.z+offset);
    uv.push(vertex.u,vertex.v);vertex.index=index;return index;
  };
  const emitTriangle=(a,b,c)=>{
    if(side!=='innerPocket') {
      if(visible[a]&&visible[b]&&visible[c])indices.push(a,b,c);
      return;
    }
    const source=[samples[a],samples[b],samples[c]];
    if(!source.every(vertex=>vertex.contourVisible))return;
    if(source.every(vertex=>visible[vertex.index])&&source.every(vertex=>vertex.region===source[0].region)) {
      indices.push(a,b,c);return;
    }
    // Retain the whole-piece image coordinates while cutting the real mouth
    // out of each triangle. This also handles rotated/moved artwork exactly.
    const lower=layout.mouthY-layout.openingHeight/2,upper=layout.mouthY+layout.openingHeight/2;
    const openingHalfWidth=layout.width/2-layout.bindingWidth;
    const middle=clipPolygon(clipPolygon(source,'y',lower,true),'y',upper,false);
    const regions=[clipPolygon(source,'y',lower,false),clipPolygon(source,'y',upper,true),
      clipPolygon(middle,'x',-openingHalfWidth,false),clipPolygon(middle,'x',openingHalfWidth,true)];
    for(const polygon of regions) {
      if(polygon.length<3)continue;
      const first=appendInnerVertex(polygon[0]);
      for(let i=1;i<polygon.length-1;i++)indices.push(first,appendInnerVertex(polygon[i]),appendInnerVertex(polygon[i+1]));
    }
  };
  for (let row = 0; row < down; row += 1) {
    for (let column = 0; column < across; column += 1) {
      const a = row * (across + 1) + column;
      const b = a + 1;
      const c = a + across + 1;
      const d = c + 1;
      // Avoid a floating logo outside the body. The config still retains its
      // full dimensions, and the UI can report an out-of-bounds request.
      emitTriangle(a,c,b);
      emitTriangle(b,c,d);
    }
  }
  let geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  if (reliefGeometry) {
    geometry.dispose();
    geometry = embroidery.geometryData?.relief ? printGeometryFromPacket(embroidery.geometryData.relief)
      : createEmbroideryReliefGeometry(config,side,embroidery.plan);
  }
  const material = new (stitched ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial)({
    map: stitched ? embroidery.map : texture,
    color: '#ffffff',
    transparent: true,
    alphaTest: 0.015,
    roughness: stitched && embroidery.roughness ? 1 : stitched ? 0.62 : 1,
    metalness: 0,
    depthWrite: reliefGeometry,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    ...(stitched ? {
      bumpMap: embroidery.height,
      ...(embroidery.roughness ? {roughnessMap:embroidery.roughness} : {}),
      bumpScale: (reliefGeometry ? 0.10 : 0.85) * MM_TO_SCENE,
      ...(!reliefGeometry ? {displacementMap: embroidery.height, displacementScale: 0.72 * MM_TO_SCENE} : {}),
      sheen: 0.3,
      sheenColor: new THREE.Color('#ffffff'),
      sheenRoughness: 0.5,
    } : {}),
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = side === 'front' ? 'printArea' : `printArea-${side}`;
  mesh.renderOrder = 1;
  mesh.castShadow = Boolean(stitched);
  mesh.receiveShadow = Boolean(stitched);
  mesh.userData.printWidthMm = print.width;
  mesh.userData.printHeightMm = print.height;
  mesh.userData.printSide = side;
  mesh.userData.printAppearance = print.appearance === 'embroidery' ? 'embroidery' : 'print';
  if(stitched && embroidery.plan) {
    const contact=createEmbroideryContactShadow(config,side,embroidery.shadow,embroidery.plan);
    if(contact)mesh.add(contact);
    const threads=embroidery.geometryData
      ? createEmbroideryThreadObject(printGeometryFromPacket(embroidery.geometryData.threads),side,embroidery.plan,embroidery.roughness,embroidery.geometryData.threadData)
      : createEmbroideryThreadMesh(config,side,embroidery.plan,embroidery.roughness);
    if(threads)mesh.add(threads);
  }
  return mesh;
}

export function createEmbroideryTextures(texture, print) {
  const canvases = renderEmbroideryCanvas(texture.image, { widthMm: print.width, heightMm: print.height });
  return texturesFromEmbroideryCanvases(canvases);
}

export function printGeometryFromPacket(packet) {
  if(!packet)return null;
  const geometry=new THREE.BufferGeometry();
  for(const [name,attribute]of Object.entries(packet.attributes))geometry.setAttribute(name,new THREE.BufferAttribute(attribute.array,attribute.itemSize));
  geometry.setIndex(new THREE.BufferAttribute(packet.index,1));geometry.computeBoundingSphere();return geometry;
}

export async function prepareEmbroideryTextures(texture,print,processor,config,side,{signal}={}) {
  const input=readEmbroiderySource(texture.image,{widthMm:print.width,heightMm:print.height});
  const result=await processor.run({kind:'prepare',source:input.source,width:input.width,height:input.height,
    print:{widthMm:input.widthMm,heightMm:input.heightMm},config:embroideryGeometryConfig(config),side},{signal});
  if(signal?.aborted)throw Object.assign(new Error('시안이 바뀌었어요.'),{name:'AbortError'});
  const resources=texturesFromEmbroideryCanvases(embroideryCanvases(result.pixels,input));
  resources.geometryData=result.geometry;resources.workerElapsedMs=result.elapsedMs;return resources;
}

function texturesFromEmbroideryCanvases(canvases) {
  const map = new THREE.CanvasTexture(canvases.color);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const height = new THREE.CanvasTexture(canvases.height);
  height.anisotropy = 4;
  const roughness = new THREE.CanvasTexture(canvases.roughness);
  roughness.anisotropy = 4;
  const shadow = new THREE.CanvasTexture(canvases.shadow);
  shadow.colorSpace = THREE.SRGBColorSpace;
  shadow.userData.marginMm = canvases.shadowMarginMm;
  return { map, height, roughness, shadow, plan: canvases.plan };
}

export function disposeEmbroideryTextures(textures) {
  if (!textures) return;
  textures.map.dispose(); textures.height.dispose();
  textures.roughness?.dispose();
  textures.shadow?.dispose();
}

export function disposePrintMesh(mesh) {
  if (!mesh) return;
  mesh.traverse(part=>{if(part.isMesh){part.geometry.dispose();part.material.dispose();}});
  // Textures are owned by the viewer, so transforms can reuse one upload.
}

export function loadPrintTexture(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const longest = Math.max(image.naturalWidth, image.naturalHeight);
        if (!longest) throw new Error('이미지 크기를 확인할 수 없습니다.');
        const ratio = Math.min(1, 2048 / longest);
        let textureSource = image;
        if (ratio < 1) {
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          textureSource = canvas;
        }
        const texture = new THREE.Texture(textureSource);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        texture.needsUpdate = true;
        resolve(texture);
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error('인쇄 이미지를 불러오지 못했습니다. PNG 또는 JPG 파일을 다시 선택해 주세요.'));
    image.src = source;
  });
}
