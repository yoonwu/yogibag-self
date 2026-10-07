import * as THREE from '../vendor/three/three.module.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { MM_TO_SCENE, normalizeConfig, PRINT_SIDES } from './config.mjs?v=1.2.10';
import { disposeBagModel, frontSurfaceMM, innerPocketSurfaceMM } from './model.mjs?v=1.2.10';
import { getInnerPocketLayout } from './options-model.mjs?v=1.2.10';
import { createProductModel } from './registry.mjs?v=1.2.10';
import { createBagMaterials, updateBagMaterials, disposeBagMaterials } from './materials.mjs?v=1.2.10';
import { createPrintMesh, disposePrintMesh, loadPrintTexture, createEmbroideryTextures, prepareEmbroideryTextures, disposeEmbroideryTextures } from './print.mjs?v=1.2.10';
import { EmbroideryProcessor } from './embroidery-processor.mjs?v=1.2.10';
import { embroideryGeometryKey,embroideryGeometryConfig } from './embroidery-job.mjs?v=1.2.10';
import { safeDetailDistance, clampDetailDistance, detailZoomMetrics } from './zoom.mjs?v=1.2.10';
import { drawWatermark, captureWithWatermark } from './watermark.mjs?v=1.2.10';

const BACKGROUND = '#f5f4f1';
const PRODUCT_FOV = 38;
const FRONTAL_FOV = 6;
const structuralKey = config => JSON.stringify({
  productType: config.productType,
  productId: config.productId,
  dimensions: config.dimensions,
  bottomPanelHeight: config.bottomPanel.height,
  handle: { width: config.handle.width, thickness: config.handle.thickness, drop: config.handle.drop, gap: config.handle.gap },
  pocket: { width: config.pocket.width, height: config.pocket.height, bottom: config.pocket.bottom },
  innerPocketDimensions: config.print.innerPocket.partDimensions,
  crossStrapLength: config.crossStrap?.length,
  options: config.options,
});
const printKey = (config, side = 'front') => JSON.stringify({
  dimensions: config.dimensions,
  bottomPanelHeight: config.bottomPanel.height,
  print: { ...config.print[side], image: undefined, imageName: undefined },
  active: side === 'back' ? config.options.doubleSided : side === 'innerPocket' ? config.options.innerPocketPrint : true,
});

export class Product3DViewer {
  constructor(container, { onError, onMetrics } = {}) {
    this.container = container;
    this.onError = onError;
    this.onMetrics = onMetrics;
    this.disposed = false;
    this._raf = 0;
    this._dirty = false;
    this._view = 'initial';
    this._textureSource = null;
    this._pendingTexture = null;
    this._magnifier = false;
    this._activePointers = new Set();
    this._raycaster = new THREE.Raycaster();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BACKGROUND);
    this.camera = new THREE.PerspectiveCamera(PRODUCT_FOV, 1, 0.01, 12);
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    } catch (error) {
      this._notifyError('이 브라우저에서는 3D 미리보기를 사용할 수 없습니다. 최신 Chrome 또는 Safari에서 다시 열어 주세요.');
      this._emitMetrics(false);
      return;
    }
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.domElement.className = 'p3d-canvas';
    this.renderer.domElement.setAttribute('aria-label', '가방 3D 미리보기. 드래그로 회전하고 스크롤 또는 두 손가락으로 확대합니다.');
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);
    this.watermarkCanvas = document.createElement('canvas');
    this.watermarkCanvas.className = 'p3d-watermark';
    this.watermarkCanvas.setAttribute('aria-hidden', 'true');
    container.appendChild(this.watermarkCanvas);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = 0.18;
    this.controls.maxPolarAngle = Math.PI * 0.57;
    this.controls.addEventListener('change', this._onControlsChange = () => this.requestRender());
    this._installDetailFocus();
    this._addStudio();
    this._onContextLost = event => {
      event.preventDefault();
      this._contextLost = true;
      this._notifyError('3D 화면이 일시 중단되었습니다. 다른 탭을 닫거나 페이지를 새로고침해 주세요.');
    };
    this._onContextRestored = () => {
      this._contextLost = false;
      this.requestRender();
    };
    this.renderer.domElement.addEventListener('webglcontextlost', this._onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this._onContextRestored);
    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(container);
    this.resize();
  }

  _addStudio() {
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#d8d6cf', 1.9));
    const key = new THREE.DirectionalLight('#ffffff', 2.25);
    key.position.set(-1.2, 2.4, 1.8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -1.15, right: 1.15, top: 1.5, bottom: -1.15, near: 0.1, far: 5 });
    key.shadow.bias = -0.00008;
    key.shadow.normalBias = 0.001;
    key.shadow.radius = 3;
    key.target.position.set(0, 0.35, 0);
    this.scene.add(key, key.target);
    const fill = new THREE.DirectionalLight('#ffffff', 0.75);
    fill.position.set(1.4, 1.0, -0.8);
    this.scene.add(fill);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ color: BACKGROUND, roughness: 1, metalness: 0 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.001;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(64, 64, 8, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(0,0,0,0.21)');
    gradient.addColorStop(0.55, 'rgba(0,0,0,0.09)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    this.contactTexture = new THREE.CanvasTexture(canvas);
    this.contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.contactTexture, transparent: true, depthWrite: false, toneMapped: false }));
    this.contact.rotation.x = -Math.PI / 2;
    this.contact.position.y = 0.0001;
    this.scene.add(this.contact);
  }

  async setConfig(config, { frame = false } = {}) {
    if (this.disposed) return;
    this.config = normalizeConfig(config);
    if (!this.renderer) return;
    this._ensurePrintStates();
    if (!this.materials) this.materials = createBagMaterials(this.config);
    else updateBagMaterials(this.materials, this.config);
    const nextStructure = structuralKey(this.config);
    const structureChanged = nextStructure !== this._structuralKey;
    if (structureChanged) {
      const resetDetail = Boolean(this._magnifier);
      if (resetDetail) this._setMagnifierState(false);
      if (this.model && this._framed) this._fitDistance = this._frameMeasurements(this.camera.position.clone().sub(this.controls.target)).distance;
      if (this.model) {
        this.scene.remove(this.model);
        disposeBagModel(this.model);
      }
      this.model = createProductModel(this.config, this.materials);
      this.scene.add(this.model);
      this._bounds = new THREE.Box3().setFromObject(this.model);
      this._structuralKey = nextStructure;
      this._markShadowDirty();
      this.contact.scale.set(this.config.dimensions.width * MM_TO_SCENE * 1.5, this.config.dimensions.depth * MM_TO_SCENE * 2.5, 1);
      this._updateDistanceLimits();
      if (this._framed && !frame) this._reframePreservingDirection({ resetZoom: resetDetail });
    }
    for (const side of PRINT_SIDES) {
      if (printKey(this.config, side) !== this._printStates[side].key || structureChanged) this._updatePrint(side);
    }
    if (!this._framed || frame) {
      this.setView('initial');
      this._framed = true;
    }
    this.requestRender();
    await Promise.all(PRINT_SIDES.map(side => this._loadSidePrint(side)));
  }

  _ensurePrintStates() {
    if (this._printStates) return;
    this._printStates = Object.fromEntries(PRINT_SIDES.map(side => [side, side === 'front'
      ? { texture: this.texture || null, source: this._textureSource || null, pending: null, mesh: this.printMesh || null, key: this._printKey || null, embroidery:null, embroideryPending:null }
      : { texture: null, source: null, pending: null, mesh: null, key: null, embroidery:null, embroideryPending:null }]));
  }

  async _loadSidePrint(side) {
    const state = this._printStates[side];
    const source = this.config.print[side].image;
    if (!source) {
      if (state.texture || state.source) this._replaceTexture(null, null, side);
      return;
    }
    if (source === state.source) return;
    if (!state.pending || state.pending.source !== source) {
      const pending = { source };
      pending.promise = loadPrintTexture(source).then(texture => {
        if (this.disposed || this.config.print[side].image !== source) {
          texture.dispose();
          return null;
        }
        this._replaceTexture(texture, source, side);
        return texture;
      }).catch(error => {
        if (!this.disposed && this.config.print[side].image === source) {
          this._notifyError(error.message);
          throw error;
        }
        return null;
      }).finally(() => {
        if (state.pending === pending) state.pending = null;
        if (side === 'front' && this._pendingTexture === pending) this._pendingTexture = null;
      });
      state.pending = pending;
      if (side === 'front') this._pendingTexture = pending;
    }
    await state.pending.promise;
  }

  _replaceTexture(texture, source, side = 'front') {
    this._ensurePrintStates();
    const state = this._printStates[side];
    if (state.texture && state.texture !== texture) state.texture.dispose();
    state.texture = texture;
    state.source = source;
    if (side === 'front') { this.texture = texture; this._textureSource = source; }
    this._updatePrint(side);
    this.requestRender();
  }

  _updatePrint(side = 'front') {
    this._ensurePrintStates();
    const state = this._printStates[side];
    if (state.mesh) {
      this.scene.remove(state.mesh);
      disposePrintMesh(state.mesh);
      state.mesh = null;
    }
    const matchingTexture = state.source === this.config.print[side].image ? state.texture : null;
    const print = this.config.print[side];
    const embroideryKey = `${print.width}:${print.height}`;
    const active = side === 'back' ? this.config.options.doubleSided : side === 'innerPocket' ? this.config.options.innerPocketPrint : true;
    const needsEmbroidery = Boolean(matchingTexture && print.enabled && active && print.appearance === 'embroidery');
    const geometryKey=embroideryGeometryKey(this.config,side);
    const background=Boolean((globalThis.Worker||this._embroideryProcessor)&&!this._embroideryWorkerFailed);
    const pending=state.embroideryPending;
    if(pending&&(!needsEmbroidery||pending.texture!==matchingTexture||pending.key!==embroideryKey||pending.geometryKey!==geometryKey)) {
      state.embroideryPending=null;pending.controller.abort();
    }
    if (state.embroidery && (!needsEmbroidery || state.embroiderySource !== matchingTexture || state.embroideryKey !== embroideryKey)) {
      disposeEmbroideryTextures(state.embroidery);
      state.embroidery = null;
    }
    if (needsEmbroidery && !state.embroidery) {
      if(background)this._prepareEmbroidery(side,matchingTexture,embroideryKey,geometryKey);
      else {
        state.embroidery = createEmbroideryTextures(matchingTexture, print);
        state.embroiderySource = matchingTexture;
        state.embroideryKey = embroideryKey;
      }
    }
    if(needsEmbroidery&&background&&state.embroidery&&state.embroidery.geometryKey!==geometryKey)
      this._prepareEmbroidery(side,matchingTexture,embroideryKey,geometryKey);
    if(!background&&state.embroidery?.geometryData&&state.embroidery.geometryKey!==geometryKey)delete state.embroidery.geometryData;
    const display=state.embroideryPending&&state.embroidery?{...state.embroidery,plan:null}:state.embroidery;
    state.mesh = createPrintMesh(this.config, matchingTexture, side, display);
    if (state.mesh) this.scene.add(state.mesh);
    state.key = printKey(this.config, side);
    if (side === 'front') { this.printMesh = state.mesh; this._printKey = state.key; }
    this._markShadowDirty();
  }

  _markShadowDirty() {if(this.renderer?.shadowMap)this.renderer.shadowMap.needsUpdate=true;}

  _prepareEmbroidery(side,texture,key,geometryKey) {
    const state=this._printStates[side];
    if(state.embroideryPending)return;
    this._embroideryProcessor ||= new EmbroideryProcessor();
    const controller=new AbortController(),pending={texture,key,geometryKey,controller};
    state.embroideryPending=pending;
    const config=this.config,resources=state.embroidery;
    const work=resources
      ? this._embroideryProcessor.run({kind:'geometry',config:embroideryGeometryConfig(config),side,plan:resources.plan},{signal:controller.signal})
      : prepareEmbroideryTextures(texture,config.print[side],this._embroideryProcessor,config,side,{signal:controller.signal});
    pending.promise=work.then(result=>{
      if(this.disposed||state.embroideryPending!==pending||controller.signal.aborted) {
        if(!resources&&result.map)disposeEmbroideryTextures(result);return;
      }
      if(resources)resources.geometryData=result.geometry;
      else {state.embroidery=result;state.embroiderySource=texture;state.embroideryKey=key;}
      state.embroidery.geometryKey=geometryKey;
      state.embroideryPending=null;
      this._updatePrint(side);
      if(this._printFocusSide===side) this._framePrint(side,this.camera.position.clone().sub(this.controls.target).normalize());
      this.requestRender();
    }).catch(error=>{
      if(error.name==='AbortError'||this.disposed||state.embroideryPending!==pending)return;
      state.embroideryPending=null;
      // Older browsers or a CSP that disallows workers retain the preview.
      this._embroideryWorkerFailed=true;
      this._updatePrint(side);this.requestRender();
    });
    this.requestRender();
  }

  async _waitForEmbroidery() {
    while(!this.disposed) {
      const pending=Object.values(this._printStates||{}).map(state=>state.embroideryPending?.promise).filter(Boolean);
      if(!pending.length)return;
      await Promise.all(pending);
    }
  }

  _detailMaxPercent() {
    const side = this._view === 'inside' ? 'innerPocket' : this._view === 'back' ? 'back'
      : this.camera?.position?.z < this.controls?.target?.z ? 'back' : 'front';
    const print = this.config?.print?.[side];
    const active = side === 'back' ? this.config?.options?.doubleSided
      : side === 'innerPocket' ? this.config?.options?.innerPocketPrint : true;
    // A 0.38 mm stitch is subpixel on a small stage at the ordinary zoom cap.
    // Extra detail is view-only, with the same collision and near-plane limits.
    return active && print?.enabled && print.image && print.appearance === 'embroidery' ? 1600 : 600;
  }

  _updateDistanceLimits(direction, target) {
    if (this._view === 'inside' && this._fitDistance) {
      // This camera is deliberately inside the open bag. The whole-product
      // bounds include the handles and would prevent readable pocket detail.
      this._safeDetailMinimum = Math.max(0.002, this.camera.near * 2);
      this.controls.minDistance = Math.max(this._fitDistance * 100 / this._detailMaxPercent(), this._safeDetailMinimum);
      this.controls.maxDistance = this._fitDistance;
      return;
    }
    if (this._magnifier && this._fitDistance) {
      const viewDirection = direction || this.camera.position.clone().sub(this.controls.target);
      const focus = target || this.controls.target;
      this._safeDetailMinimum = safeDetailDistance(this._bounds, focus, viewDirection);
      if (this._detailMaxPercent() > 600) this._safeDetailMinimum = Math.max(this._safeDetailMinimum, this.camera.near * 1.5);
      this.controls.minDistance = Math.max(this._fitDistance * 100 / this._detailMaxPercent(), this._safeDetailMinimum);
      this.controls.maxDistance = Math.max(this.controls.minDistance, this._fitDistance);
      return;
    }
    this._safeDetailMinimum = 0;
    const fullHeight = (this.config.dimensions.height + this.config.handle.drop) * MM_TO_SCENE;
    const width = this.config.dimensions.width * MM_TO_SCENE;
    this.controls.minDistance = Math.max(fullHeight, width) * 0.65;
    this.controls.maxDistance = Math.max(Math.max(fullHeight, width) * 5, (this._fitDistance || 0) * 1.2);
    // A telephoto fit sits farther away than the original orbit limit. Keep
    // the entire product inside the far plane even at maximum zoom-out.
    const diagonal = this._bounds?.getSize(new THREE.Vector3()).length() || fullHeight;
    this.camera.far = Math.max(12, this.controls.maxDistance + diagonal + 0.1);
    this.camera.updateProjectionMatrix();
  }

  _frameMeasurements(direction) {
    if (this._view === 'inside') return this._insideFrameMeasurements(direction);
    const box = new THREE.Box3().setFromObject(this.model);
    return this._fitBoxMeasurements(box, direction);
  }

  _fitBoxMeasurements(box, direction, safeFrame = 0.84) {
    const center = box.getCenter(new THREE.Vector3());
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const forward = direction.clone().normalize();
    const right = new THREE.Vector3().crossVectors(this.camera.up, forward).normalize();
    const up = new THREE.Vector3().crossVectors(forward, right).normalize();
    const tangent = Math.tan(halfFov);
    let distance = 0;
    // Include depth and perspective in the fit, particularly for a wide,
    // shallow-height bag seen at an angle on a desktop viewport.
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          const point = new THREE.Vector3(x, y, z).sub(center);
          const towardCamera = point.dot(forward);
          distance = Math.max(distance,
            towardCamera + Math.abs(point.dot(right)) / (tangent * this.camera.aspect * safeFrame),
            towardCamera + Math.abs(point.dot(up)) / (tangent * safeFrame));
        }
      }
    }
    return { center, distance };
  }

  _insideFrameMeasurements(direction) {
    const layout = getInnerPocketLayout(this.config);
    const surface = innerPocketSurfaceMM(0, 0, this.config);
    const box = new THREE.Box3();
    let hasPocket = false;
    this.model.traverse(part => {
      if (!part.isMesh) return;
      if (part.name.startsWith('innerPocket')) hasPocket = true;
      if (part.name.startsWith('innerPocket') || part.name.startsWith('nameTag')) box.union(new THREE.Box3().setFromObject(part));
    });
    // Keep the inside context when only a sewn-in label is selected. The
    // virtual pocket area is a framing reference, never a rendered object.
    if (!hasPocket) box.union(new THREE.Box3(
      new THREE.Vector3(-layout.width / 2000, surface.y - layout.height / 2000, surface.z),
      new THREE.Vector3(layout.width / 2000, surface.y + layout.height / 2000, surface.z)));
    this._insideBounds = box;
    const center = box.getCenter(new THREE.Vector3());
    const forward = direction.clone().normalize();
    // Frame the entire hanging piece, including its upper attachment band and
    // binding. Looking straight at its flat face preserves the reference's
    // constant width; the surrounding bag fabric remains visible for context.
    let distance = Math.max(0.01, this.config.dimensions.depth * MM_TO_SCENE * 0.7);
    for (let i = 0; i < 3; i += 1) {
      const cameraY = center.y + forward.y * distance;
      const front = frontSurfaceMM(center.x / MM_TO_SCENE,
        cameraY / MM_TO_SCENE - this.config.dimensions.height / 2, this.config);
      distance = Math.max(0.006, (front.z - center.z - 0.003) * 0.78 / Math.max(0.5, forward.z));
    }
    const right = new THREE.Vector3().crossVectors(this.camera.up, forward).normalize();
    const up = new THREE.Vector3().crossVectors(forward, right).normalize();
    let tangent = Math.tan(THREE.MathUtils.degToRad(60 / 2));
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const point = new THREE.Vector3(x, y, z).sub(center);
      const depth = Math.max(0.001, distance - point.dot(forward));
      tangent = Math.max(tangent, Math.abs(point.dot(right)) / (depth * this.camera.aspect * 0.8),
        Math.abs(point.dot(up)) / (depth * 0.8));
    }
    this.camera.fov = Math.min(174, THREE.MathUtils.radToDeg(2 * Math.atan(tangent)));
    this.camera.near = 0.001;
    this.camera.updateProjectionMatrix();
    return { center, distance };
  }

  _placeCamera(center, direction, distance) {
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    // Flush an in-progress drag before installing a named view or reframing.
    // Otherwise its final damping delta can rotate the new front view.
    this.controls.update();
    this.controls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(direction, distance);
    this.camera.lookAt(center);
    this.controls.update();
    this.controls.enableDamping = damping;
  }

  _reframePreservingDirection({ resetZoom = false } = {}) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const zoomRatio = !resetZoom && this._fitDistance ? offset.length() / this._fitDistance : 1;
    const { center, distance } = this._frameMeasurements(offset);
    const target = this._magnifier ? this.controls.target.clone() : center;
    this._fitDistance = distance;
    this._updateDistanceLimits(offset, target);
    const nextDistance = THREE.MathUtils.clamp(distance * zoomRatio, this.controls.minDistance, this.controls.maxDistance);
    this._placeCamera(target, offset.normalize(), nextDistance);
  }

  setView(view = 'initial') {
    this._setView(view);
  }

  _insideViewDirection() {
    return new THREE.Vector3(0, 0, 1);
  }

  _setView(view, { resetMagnifier = true } = {}) {
    if (!this.renderer || !this.config || this.disposed) return;
    if (resetMagnifier) this._setMagnifierState(false);
    this._view = view;
    const inside = view === 'inside';
    this.controls.minPolarAngle = inside ? Math.PI / 2 - 0.3 : 0.18;
    this.controls.maxPolarAngle = inside ? Math.PI / 2 + 0.3 : Math.PI * 0.57;
    this.controls.minAzimuthAngle = inside ? -0.55 : -Infinity;
    this.controls.maxAzimuthAngle = inside ? 0.55 : Infinity;
    if (!inside) {
      const frontal = view === 'front' || view === 'back';
      // Photo-like frontal views use a long camera distance so turning a
      // tape edge into depth does not inflate its apparent crown thickness.
      this.camera.fov = frontal ? FRONTAL_FOV : PRODUCT_FOV;
      // Retain decal depth precision at that distance. Even 600% detail on
      // the smallest supported product remains safely past this near plane.
      this.camera.near = frontal ? 0.1 : 0.01;
      this.camera.far = 12;
      this.camera.updateProjectionMatrix();
    }
    const direction = view === 'front' ? new THREE.Vector3(0, 0.015, 1)
      : view === 'back' ? new THREE.Vector3(0, 0.015, -1)
      : view === 'inside' ? this._insideViewDirection()
      : new THREE.Vector3(0.72, 0.28, 1.3).normalize();
    direction.normalize();
    const { center, distance } = this._frameMeasurements(direction);
    this._fitDistance = distance;
    this._updateDistanceLimits(direction, center);
    this._placeCamera(center, direction, distance);
    this.requestRender();
  }

  _setMagnifierState(enabled) {
    this._magnifier = enabled;
    if (!enabled) { this._panMode = false; this._printFocusSide = null; }
    this._syncPanControls();
    this._applyPixelRatio();
  }

  _syncPanControls() {
    this.controls.enablePan = Boolean(this._magnifier);
    this.controls.mouseButtons ||= {};
    this.controls.touches ||= {};
    this.controls.mouseButtons.LEFT = this._panMode ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    this.controls.touches.ONE = this._panMode ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
    this.controls.zoomToCursor = this._view !== 'inside';
    if (this.renderer.domElement.style) this.renderer.domElement.style.cursor = this._panMode ? 'grab' : 'default';
  }

  // Wheel/pinch and switching to pan must keep the current camera in place.
  // Unlike the magnifier button, these actions must not jump straight to 200%.
  _enableDetailControls() {
    if (!this.renderer || !this.model || !this.config || this.disposed) return;
    this._printFocusSide = null;
    if (!this._magnifier) {
      const direction = this.camera.position.clone().sub(this.controls.target);
      this._fitDistance = this._frameMeasurements(direction).distance;
      this._setMagnifierState(true);
      this._updateDistanceLimits(direction);
    }
    this.requestRender();
  }

  setPanMode(enabled) {
    if (!this.renderer || !this.config || this.disposed) return;
    if (enabled) this._enableDetailControls();
    this._panMode = Boolean(enabled);
    this._syncPanControls();
    this.requestRender();
  }

  isPanMode() { return Boolean(this._panMode); }

  _printBounds(side) {
    const print = this.config?.print?.[side];
    const active = side === 'back' ? this.config?.options?.doubleSided
      : side === 'innerPocket' ? this.config?.options?.innerPocketPrint : true;
    const mesh = this._printStates?.[side]?.mesh || (side === 'front' ? this.printMesh : null);
    if (!active || !print?.enabled || !print.image || !mesh?.geometry.index?.count) return null;
    mesh.updateWorldMatrix(true, false);
    this._printBoundsCache ||= new WeakMap();
    const cached = this._printBoundsCache.get(mesh);
    if (cached) return cached.clone().applyMatrix4(mesh.matrixWorld);
    const box = new THREE.Box3();
    const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
    const point = new THREE.Vector3();
    // Only rendered vertices count: transparent/clipped grid points and the
    // contact-shadow child must not pull a small bottom logo off center.
    for (let i = 0; i < index.count; i++) {
      point.fromBufferAttribute(position, index.getX(i));
      box.expandByPoint(point);
    }
    if (box.isEmpty()) return null;
    this._printBoundsCache.set(mesh, box);
    return box.clone().applyMatrix4(mesh.matrixWorld);
  }

  canFocusPrint(side = 'front') { return Boolean(this._printBounds(side)); }

  _framePrint(side, direction) {
    const box = this._printBounds(side);
    if (!box) return false;
    const fit = this._fitBoxMeasurements(box, direction, 0.78);
    const target = this._bounds.clampPoint(fit.center, new THREE.Vector3());
    this._updateDistanceLimits(direction, target);
    // Clamp to the ordinary detail limits while retaining enough room for the
    // complete design, rather than applying a fixed magnification.
    const distance = THREE.MathUtils.clamp(fit.distance + target.distanceTo(fit.center),
      this.controls.minDistance, this.controls.maxDistance);
    this._placeCamera(target, direction, distance);
    return true;
  }

  focusPrint(side = 'front') {
    if (!this.renderer || this.disposed || !this.canFocusPrint(side)) return false;
    this.setView(side === 'back' ? 'back' : side === 'innerPocket' ? 'inside' : 'front');
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    this._setMagnifierState(true);
    this._framePrint(side, direction);
    this._printFocusSide = side;
    this.requestRender();
    return true;
  }

  _defaultDetailTarget(direction) {
    if (this._view === 'inside') {
      const artwork = this._printBounds('innerPocket');
      if (artwork) return artwork.getCenter(new THREE.Vector3());
      if (!this.config.options.innerPocket && this.config.options.nameTag) {
        const tag = this.model.getObjectByName('nameTag');
        if (tag) return new THREE.Box3().setFromObject(tag).getCenter(new THREE.Vector3());
      }
      if (this._insideBounds && !this._insideBounds.isEmpty()) return this._insideBounds.getCenter(new THREE.Vector3());
    }
    const front = direction.z >= 0;
    const artwork = this._printBounds(front ? 'front' : 'back');
    const surface = this.model.getObjectByName(front && this.config.options.pocket ? 'frontPocket' : front ? 'bodyFront' : 'bodyBack');
    const point = artwork ? artwork.getCenter(new THREE.Vector3())
      : surface ? new THREE.Box3().setFromObject(surface).getCenter(new THREE.Vector3())
      : this._bounds.getCenter(new THREE.Vector3());
    return this._bounds.clampPoint(point, point);
  }

  setMagnifier(enabled) {
    if (!this.renderer || !this.config || this.disposed) return this.getZoomMetrics();
    if (!enabled) return this.resetZoom();
    if (this._magnifier) return this.getZoomMetrics();
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    this._fitDistance = this._frameMeasurements(direction).distance;
    this._setMagnifierState(true);
    const target = this._defaultDetailTarget(direction);
    this._updateDistanceLimits(direction, target);
    const distance = clampDetailDistance(this._fitDistance / 2, this._fitDistance, this._safeDetailMinimum, this._detailMaxPercent());
    this._placeCamera(target, direction, distance);
    this.requestRender();
    return this.getZoomMetrics();
  }

  zoomBy(factor) {
    if (!this.renderer || !this.config || this.disposed || !Number.isFinite(factor) || factor <= 0) return this.getZoomMetrics();
    if (!this._magnifier) this.setMagnifier(true);
    this._printFocusSide = null;
    const offset = this.camera.position.clone().sub(this.controls.target);
    const direction = offset.clone().normalize();
    this._updateDistanceLimits(direction);
    const distance = clampDetailDistance(offset.length() / factor, this._fitDistance, this._safeDetailMinimum, this._detailMaxPercent());
    this._placeCamera(this.controls.target.clone(), direction, distance);
    this.requestRender();
    return this.getZoomMetrics();
  }

  resetZoom() {
    if (!this.renderer || !this.config || this.disposed) return this.getZoomMetrics();
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    const { center, distance } = this._frameMeasurements(direction);
    this._setMagnifierState(false);
    this._fitDistance = distance;
    this._updateDistanceLimits(direction, center);
    this._placeCamera(center, direction, distance);
    this.requestRender();
    return this.getZoomMetrics();
  }

  getZoomMetrics() {
    const distance = this.controls ? this.camera.position.distanceTo(this.controls.target) : 0;
    return detailZoomMetrics(this._magnifier, this._fitDistance || 0, distance, this._safeDetailMinimum || 0, this._detailMaxPercent());
  }

  _installDetailFocus() {
    const canvas = this.renderer.domElement;
    this._onDetailWheel = () => this._enableDetailControls();
    this._onDetailPointerDown = event => {
      this._printFocusSide = null;
      this._activePointers.add(event.pointerId);
      if(this._activePointers.size===1){this._applyPixelRatio();this.requestRender();}
      if (this._activePointers.size > 1) {
        this._pointerGesture = null;
        if (event.pointerType === 'touch') this._enableDetailControls();
      } else if (event.button === 0 || event.pointerType === 'touch') {
        this._pointerGesture = { id: event.pointerId, x: event.clientX, y: event.clientY, started: performance.now(), moved: false };
      }
    };
    this._onDetailPointerMove = event => {
      const gesture = this._pointerGesture;
      if (gesture?.id === event.pointerId && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 7) gesture.moved = true;
    };
    this._onDetailPointerUp = event => {
      const gesture = this._pointerGesture;
      this._activePointers.delete(event.pointerId);
      if(!this._activePointers.size){this._applyPixelRatio();this.requestRender();}
      this._pointerGesture = null;
      if (this._magnifier && !this._panMode && gesture?.id === event.pointerId && !gesture.moved && performance.now() - gesture.started < 650) {
        this._focusAt(event.clientX, event.clientY);
      }
    };
    this._onDetailPointerCancel = event => {
      this._activePointers.delete(event.pointerId);
      if(!this._activePointers.size){this._applyPixelRatio();this.requestRender();}
      this._pointerGesture = null;
    };
    // Capture runs before OrbitControls chooses its wheel/two-finger action.
    canvas.addEventListener('wheel', this._onDetailWheel, { capture: true, passive: true });
    canvas.addEventListener('pointerdown', this._onDetailPointerDown, true);
    canvas.addEventListener('pointermove', this._onDetailPointerMove);
    canvas.addEventListener('pointerup', this._onDetailPointerUp);
    canvas.addEventListener('pointercancel', this._onDetailPointerCancel);
  }

  _focusAt(clientX, clientY) {
    this._printFocusSide = null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!this._magnifier || rect.width < 2 || rect.height < 2) return false;
    const pointer = new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
    this.camera.updateMatrixWorld();
    this.model.updateMatrixWorld(true);
    const printMeshes = this._printStates ? Object.values(this._printStates).map(state => state.mesh).filter(Boolean) : [this.printMesh].filter(Boolean);
    printMeshes.forEach(mesh => mesh.updateMatrixWorld(true));
    this._raycaster.setFromCamera(pointer, this.camera);
    const objects = [this.model, ...printMeshes];
    const hit = this._raycaster.intersectObjects(objects, true)[0];
    if (!hit) return false;
    const offset = this.camera.position.clone().sub(this.controls.target);
    const target = this._bounds.clampPoint(hit.point, new THREE.Vector3());
    this._updateDistanceLimits(offset, target);
    const distance = clampDetailDistance(offset.length(), this._fitDistance, this._safeDetailMinimum, this._detailMaxPercent());
    this._placeCamera(target, offset.normalize(), distance);
    this.requestRender();
    return true;
  }

  _constrainDetailCamera() {
    if (!this._magnifier) return false;
    const target = this._bounds.clampPoint(this.controls.target, new THREE.Vector3());
    const shift = target.clone().sub(this.controls.target);
    let changed = shift.lengthSq() > 1e-12;
    if (changed) {
      this.controls.target.copy(target);
      this.camera.position.add(shift);
    }
    const offset = this.camera.position.clone().sub(this.controls.target);
    this._updateDistanceLimits(offset);
    const distance = clampDetailDistance(offset.length(), this._fitDistance, this._safeDetailMinimum, this._detailMaxPercent());
    if (Math.abs(distance - offset.length()) > 1e-7) {
      this.camera.position.copy(this.controls.target).addScaledVector(offset.normalize(), distance);
      changed = true;
    }
    if (changed) this.camera.lookAt(this.controls.target);
    return changed;
  }

  _applyPixelRatio() {
    if (!this.renderer || !this._size) return;
    const mobile = window.matchMedia('(max-width: 760px)').matches;
    const cap = this._activePointers?.size ? 1 : this._magnifier ? mobile ? 1.5 : 2 : mobile ? 1.25 : 1.75;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    this.renderer.setSize(this._size.width, this._size.height, false);
  }

  resize() {
    if (!this.renderer || this.disposed) return;
    const rect = this.container.getBoundingClientRect();
    // A closed dialog has no useful aspect ratio. Its observer will frame the
    // model as soon as the customer opens it.
    if (rect.width < 2 || rect.height < 2) return;
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (this.config && this._framed) this._fitDistance = this._frameMeasurements(this.camera.position.clone().sub(this.controls.target)).distance;
    this._size = { width, height };
    if (this.watermarkCanvas) {
      this.watermarkCanvas.width = width;
      this.watermarkCanvas.height = height;
      drawWatermark(this.watermarkCanvas.getContext('2d'), width, height);
    }
    this._applyPixelRatio();
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.config && this._framed) {
      if (this._printFocusSide && this.canFocusPrint(this._printFocusSide)) {
        const direction = this.camera.position.clone().sub(this.controls.target).normalize();
        this._fitDistance = this._frameMeasurements(direction).distance;
        this._framePrint(this._printFocusSide, direction);
      } else this._reframePreservingDirection();
    }
    this.requestRender();
  }

  requestRender() {
    if (!this.renderer || this.disposed || this._contextLost) return;
    this._dirty = true;
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => this._renderFrame());
  }

  _renderFrame() {
    this._raf = 0;
    if (this.disposed || this._contextLost) return;
    const changed = this.controls.update();
    const detailChanged = this._constrainDetailCamera();
    if (this._dirty || changed || detailChanged) {
      this._updateEmbroideryLOD();
      this.renderer.render(this.scene, this.camera);
      this._dirty = false;
      this._emitMetrics(true);
    }
    if (changed || detailChanged) this.requestRender();
  }

  _updateEmbroideryLOD() {
    if(!this._size||!this._printStates)return;
    this.camera.updateMatrixWorld();
    for(const [side,state]of Object.entries(this._printStates)) {
      const threads=state.mesh?.getObjectByName(`embroideryThreads-${side}`);
      if(!threads)continue;
      state.mesh.updateMatrixWorld(true);
      const center=state.mesh.geometry.boundingSphere.center.clone().applyMatrix4(state.mesh.matrixWorld);
      const projected=center.clone().project(this.camera);
      const lengths=[new THREE.Vector3(.01,0,0),new THREE.Vector3(0,.01,0)].map(axis=>{
        const point=center.clone().add(axis).project(this.camera);
        return Math.hypot((point.x-projected.x)*this._size.width/2,(point.y-projected.y)*this._size.height/2)/10;
      });
      // Subpixel cylinders alias into broad bars. At normal viewing distances
      // the filtered stitched relief carries the same shape; close views use
      // real individual thread surfaces once a row can occupy distinct pixels.
      threads.visible=Math.min(...lengths)*(state.embroidery?.plan.spacing||.38)>=1.6;
    }
  }

  _emitMetrics(webgl) {
    if (!this.onMetrics || this._captureInProgress) return;
    const metrics = {
      webgl,
      triangles: this.renderer?.info.render.triangles || 0,
      geometries: this.renderer?.info.memory.geometries || 0,
      textures: this.renderer?.info.memory.textures || 0,
      dimensions: this.config ? { ...this.config.dimensions } : null,
      printWidthMm: this.config?.print.front.width || 0,
      printHeightMm: this.config?.print.front.height || 0,
      backPrintWidthMm: this.config?.print.back.width || 0,
      backPrintHeightMm: this.config?.print.back.height || 0,
      activeOptions: this.config ? Object.keys(this.config.options).filter(key => this.config.options[key]) : [],
      embroideryPreparing: Object.values(this._printStates||{}).some(state=>Boolean(state.embroideryPending)),
      embroideryWorker: Boolean(this._embroideryProcessor&&!this._embroideryWorkerFailed),
      zoom: this.getZoomMetrics(),
    };
    if (globalThis.location && new URLSearchParams(location.search).get('debug3d') === '1') {
      const state = this._printStates?.innerPocket;
      const mesh = state?.mesh;
      const image = mesh?.material.map?.image;
      const center = mesh ? new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3()) : null;
      this.model?.updateMatrixWorld(true);
      mesh?.updateMatrixWorld(true);
      this.camera.updateMatrixWorld();
      const ray = center ? new THREE.Raycaster(this.camera.position, center.clone().sub(this.camera.position).normalize()) : null;
      metrics.debug = {
        view: this._view,
        camera: this.camera.position.toArray(),
        target: this.controls.target.toArray(),
        innerPocket: {
          sourceLength: state?.source?.length || 0,
          currentSourceMatches: state?.source === this.config?.print.innerPocket.image,
          pending: Boolean(state?.pending),
          indices: mesh?.geometry.index?.count || 0,
          mapSize: image ? [image.naturalWidth || image.width, image.naturalHeight || image.height] : null,
          center: center?.toArray() || null,
          ndc: center?.clone().project(this.camera).toArray() || null,
          firstHits: ray?.intersectObjects([this.model, mesh], true).slice(0, 4).map(hit => ({ name: hit.object.name, distance: hit.distance })) || [],
        },
      };
    }
    this.onMetrics(metrics);
  }

  _notifyError(message) {
    if (this.onError) this.onError(message);
  }

  capture() {
    if (!this.renderer || this.disposed || this._contextLost) throw new Error('3D 미리보기 이미지를 만들 수 없습니다.');
    this.controls.update();
    this._updateEmbroideryLOD();
    this.renderer.render(this.scene, this.camera);
    return this.watermarkCanvas
      ? captureWithWatermark(this.renderer.domElement, this.watermarkCanvas)
      : this.renderer.domElement.toDataURL('image/png');
  }

  async captureCurrentView() {
    if (this._printStates) await Promise.all(Object.values(this._printStates).map(state => state.pending?.promise).filter(Boolean));
    else if (this._pendingTexture) await this._pendingTexture.promise;
    await this._waitForEmbroidery();
    // Keep the customer's rotation, zoom and pan; email's multi-view capture
    // deliberately changes cameras, but the chat image is the current view.
    return this.capture();
  }

  async captureViews() {
    if (this._printStates) await Promise.all(Object.values(this._printStates).map(state => state.pending?.promise).filter(Boolean));
    else if (this._pendingTexture) await this._pendingTexture.promise;
    await this._waitForEmbroidery();
    if (!this.renderer || this.disposed || this._contextLost) throw new Error('3D 미리보기 이미지를 만들 수 없습니다.');
    // Match the current layout even when a resize observer is still pending.
    this.resize();
    const position = this.camera.position.clone();
    const target = this.controls.target.clone();
    const originalView = this._view;
    const originalFitDistance = this._fitDistance;
    const originalMagnifier = this._magnifier;
    const originalPanMode = this._panMode;
    const originalPrintFocusSide = this._printFocusSide;
    const originalSafeMinimum = this._safeDetailMinimum;
    const originalMinPolarAngle = this.controls.minPolarAngle;
    const originalMaxPolarAngle = this.controls.maxPolarAngle;
    const originalMinAzimuthAngle = this.controls.minAzimuthAngle;
    const originalMaxAzimuthAngle = this.controls.maxAzimuthAngle;
    const originalFov = this.camera.fov;
    const originalNear = this.camera.near;
    const originalFar = this.camera.far;
    const captures = [];
    this._captureInProgress = true;
    try {
      const views = [['initial', '입체'], ['front', '앞면'], ['back', '뒷면'], ...(this.config.options.innerPocket || this.config.options.nameTag ? [['inside', '안쪽']] : [])];
      for (const [view, label] of views) {
        this._setView(view, { resetMagnifier: false });
        captures.push({ label, dataURL: this.capture() });
      }
    } finally {
      const direction = position.clone().sub(target);
      const distance = direction.length();
      this._magnifier = originalMagnifier;
      this._panMode = originalPanMode;
      this._printFocusSide = originalPrintFocusSide;
      this._fitDistance = originalFitDistance;
      this._safeDetailMinimum = originalSafeMinimum;
      this._view = originalView;
      this._syncPanControls();
      this.camera.fov = originalFov;
      this.camera.near = originalNear;
      this.camera.far = originalFar;
      this.camera.updateProjectionMatrix();
      this.controls.minPolarAngle = originalMinPolarAngle;
      this.controls.maxPolarAngle = originalMaxPolarAngle;
      this.controls.minAzimuthAngle = originalMinAzimuthAngle;
      this.controls.maxAzimuthAngle = originalMaxAzimuthAngle;
      this._updateDistanceLimits(direction, target);
      this.camera.far = originalFar;
      this.camera.updateProjectionMatrix();
      this._placeCamera(target, direction.normalize(), distance);
      this._fitDistance = originalFitDistance;
      this._captureInProgress = false;
      this.requestRender();
    }
    return captures;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._resizeObserver?.disconnect();
    this.controls?.removeEventListener('change', this._onControlsChange);
    this.controls?.dispose();
    this._embroideryProcessor?.dispose();
    if(this._printStates)Object.values(this._printStates).forEach(state=>state.embroideryPending?.controller.abort());
    if (this.model) disposeBagModel(this.model);
    if (this._printStates) Object.values(this._printStates).forEach(state => {
      disposePrintMesh(state.mesh);
      disposeEmbroideryTextures(state.embroidery);
    });
    else disposePrintMesh(this.printMesh);
    if (this.materials) disposeBagMaterials(this.materials);
    if (this._printStates) new Set(Object.values(this._printStates).map(state => state.texture).filter(Boolean)).forEach(texture => texture.dispose());
    else this.texture?.dispose();
    this.ground?.geometry.dispose();
    this.ground?.material.dispose();
    this.contact?.geometry.dispose();
    this.contact?.material.dispose();
    this.contactTexture?.dispose();
    this.scene.traverse(object => object.shadow?.dispose());
    if (this.renderer) {
      this.renderer.domElement.removeEventListener('webglcontextlost', this._onContextLost);
      this.renderer.domElement.removeEventListener('webglcontextrestored', this._onContextRestored);
      this.renderer.domElement.removeEventListener('wheel', this._onDetailWheel, true);
      this.renderer.domElement.removeEventListener('pointerdown', this._onDetailPointerDown, true);
      this.renderer.domElement.removeEventListener('pointermove', this._onDetailPointerMove);
      this.renderer.domElement.removeEventListener('pointerup', this._onDetailPointerUp);
      this.renderer.domElement.removeEventListener('pointercancel', this._onDetailPointerCancel);
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer.domElement.remove();
      this.watermarkCanvas?.remove();
    }
    this.scene.clear();
  }
}
