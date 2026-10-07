import { normalizeConfig, getProductProfile } from './config.mjs';
import { isSharedProduct, SHARED_OPTIONS } from './sync.mjs';

const PARTS = ['front', 'back', 'innerPocket'];
const EMPTY_PRINT = { image: null, imageName: '', width: 100, height: 100, x: 0, y: 0, rotation: 0, enabled: true, lockAspect: true, appearance: 'print' };
const clone = value => structuredClone(value);

export function multiplyAffine(a, b) {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
    a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
    a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}

// Original objects remain editable: map the captured composite rectangle to the
// requested millimetre rectangle, then map that rectangle onto the 2D body.
export function artworkTransform(bounds, print, frame) {
  const radians = print.rotation * Math.PI / 180, c = Math.cos(radians), s = Math.sin(radians);
  const normalize = [1/bounds.width, 0, 0, -1/bounds.height,
    -(bounds.left+bounds.width/2)/bounds.width, (bounds.top+bounds.height/2)/bounds.height];
  const desired = [c*print.width, s*print.width, -s*print.height, c*print.height, print.x, print.y];
  const pixels = [1/frame.mmX, 0, 0, -1/frame.mmY, frame.cx, frame.cy];
  return multiplyAffine(pixels, multiplyAffine(desired, normalize));
}

function bounded(promise, milliseconds, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })])
    .finally(() => clearTimeout(timer));
}

function unionBounds(objects, boundsOf) {
  const boxes = objects.map(boundsOf).filter(b => Number.isFinite(b?.left) && Number.isFinite(b?.top) && b.width > 0 && b.height > 0);
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map(b => b.left)), top = Math.min(...boxes.map(b => b.top));
  const right = Math.max(...boxes.map(b => b.left+b.width)), bottom = Math.max(...boxes.map(b => b.top+b.height));
  // Integer pixel boundaries prevent clipping antialiased edges. The same
  // rectangle supplies physical dimensions and the reversible layer transform.
  return {left: Math.floor(left)-1, top: Math.floor(top)-1,
    width: Math.ceil(right)-Math.floor(left)+2, height: Math.ceil(bottom)-Math.floor(top)+2};
}

function validatePrint(print) {
  if (!print || typeof print !== 'object') throw new Error('인쇄 정보가 올바르지 않습니다.');
  for (const key of ['width', 'height', 'x', 'y', 'rotation']) {
    if (!Number.isFinite(print[key]) || Math.abs(print[key]) > 10000 || (['width','height'].includes(key) && print[key] <= 0)) {
      throw new Error('인쇄 크기와 위치를 확인해 주세요.');
    }
  }
  if (print.image !== null && (typeof print.image !== 'string' || !/^data:image\/(png|jpeg);base64,[a-z0-9+/=\s]+$/i.test(print.image) || print.image.length > 14*1024*1024)) {
    throw new Error('PNG 또는 JPG 인쇄 이미지가 필요합니다.');
  }
  return {...EMPTY_PRINT, ...print, appearance: print.appearance === 'embroidery' ? 'embroidery' : 'print'};
}

export function createLegacyDesignBridge(env) {
  const tokens = new Map();
  const latestProductTokens = new Map();
  const productCaches = new Map();
  let busy = false, sequence = 0;
  function productCache(productId) {
    if (!isSharedProduct(productId)) throw new Error('이 가방의 3D 보기는 준비 중입니다.');
    if (!productCaches.has(productId)) productCaches.set(productId, { appliedArtwork: new Map(), lastInnerFrame: null });
    return productCaches.get(productId);
  }
  function fingerprint(object) {
    const data = object.toObject ? object.toObject(env.designProps) : Object.fromEntries(
      Object.entries(object).filter(([key,value]) => typeof value !== 'function' && key !== 'transformCalls' && key !== 'matrix'));
    return JSON.stringify({data,matrix:object.calcTransformMatrix()});
  }
  function sameObjects(objects, capture) {
    return capture && objects.length===capture.objects.length && capture.objects.every((object,index) =>
      objects[index]===object && fingerprint(object)===capture.fingerprints[index]);
  }
  function rememberCanonical(cache, part, plan, frame) {
    const {objects,print,capture}=plan;
    let bounds, matrices;
    if(capture?.bounds) {
      // Keep the original PNG coordinate basis. These matrices precede the
      // requested pose; storing the transformed matrices here rotates twice.
      bounds={...capture.bounds}; matrices=capture.matrices.map(entry=>({...entry,matrix:[...entry.matrix]}));
    } else if(objects.length) {
      const image=objects[0];
      bounds={left:-image.width/2,top:-image.height/2,width:image.width,height:image.height};
      matrices=[{object:image,matrix:[1,0,0,1,0,0],visible:true}];
    } else {bounds=null;matrices=[];}
    cache.appliedArtwork.set(part,{objects:[...objects],bounds,matrices,frame:frame?{...frame}:null,
      print:clone(print),fingerprints:objects.map(fingerprint)});
  }
  const ready = (allowRestoring = false) => {
    const s = env.getState();
    return Boolean(s.canvas && s.bagBodyRect && (allowRestoring || !s.isRestoring) && !s.drawBagPending
      && (!s.options.includes('안주머니인쇄') || s.optionVisuals['안주머니인쇄']));
  };
  async function settle(allowRestoring = false) {
    const until = Date.now()+15000;
    while (!ready(allowRestoring)) {
      if (Date.now() > until) throw new Error('가방을 불러오는 중입니다. 잠시 후 다시 눌러 주세요.');
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  }
  function bodyFrame(s) {
    const body = s.bagBodyRect, b = env.getOpaqueBBox(body.getElement(), s.currentBag.id+'_body');
    const rect = {left: body.left+b.x*body.scaleX, top: body.top+b.y*body.scaleY,
      width: b.w*body.scaleX, height: b.h*body.scaleY};
    const dimensions = env.getDimensions();
    if (!(rect.width > 0 && rect.height > 0 && dimensions.width > 0 && dimensions.height > 0)) throw new Error('가방 실측 기준을 읽지 못했습니다.');
    return {cx: rect.left+rect.width/2, cy: rect.top+rect.height/2,
      mmX: dimensions.width/rect.width, mmY: dimensions.height/rect.height};
  }
  function innerFrame(s, dimensions = {width:140,height:120}) {
    const part = s.optionVisuals['안주머니인쇄'];
    if (!part) return null;
    const b = env.boundsOf(part);
    return {cx:b.left+b.width/2, cy:b.top+b.height/2,
      mmX:dimensions.width/b.width, mmY:dimensions.height/b.height};
  }
  function collect(s) {
    s.canvas.discardActiveObject();
    const current = s.canvas.getObjects().filter(o => o.isUserObject);
    const innerPocket = current.filter(env.isInnerPocketObj);
    innerPocket.forEach(o => { o.legacyPrintPart = 'innerPocket'; });
    const sides = {front:[],back:[],innerPocket};
    sides[s.currentSide] = current.filter(o => !innerPocket.includes(o));
    const opposite = s.currentSide === 'front' ? 'back' : 'front';
    sides[opposite] = s.sideDesigns[opposite].filter(o => o.isUserObject && !env.isInnerPocketObj(o));
    return sides;
  }
  async function composite(objects, frame, side, fabric) {
    const bounds = unionBounds(objects, env.boundsOf);
    const matrices = objects.map(object => ({object, matrix:[...object.calcTransformMatrix()], visible:object.visible !== false}));
    if (!bounds) return {print:{...EMPTY_PRINT, ...(side === 'innerPocket' ? {partDimensions:{width:140,height:120}} : {})}, objects, matrices, bounds:null, frame, fingerprints:objects.map(fingerprint)};
    if (!frame) throw new Error('안주머니 인쇄 영역이 준비되지 않았습니다.');
    const copies = await Promise.all(matrices.map(({object,matrix}) => bounded(new Promise(resolve => {
      object.clone(copy => {
        copy.set({visible:true, selectable:false, evented:false});
        fabric.util.applyTransformToObject(copy, matrix);
        copy.setCoords();
        resolve(copy);
      }, env.designProps);
    }), 12000, '인쇄 레이어를 복사하지 못했습니다.')));
    const isolated = new fabric.StaticCanvas(null, {width:bounds.width,height:bounds.height,
      backgroundColor:'', renderOnAddRemove:false, enableRetinaScaling:false});
    let image;
    try {
      isolated.setViewportTransform([1,0,0,1,-bounds.left,-bounds.top]);
      copies.forEach(copy => isolated.add(copy));
      isolated.renderAll();
      image = isolated.toDataURL({format:'png',multiplier:Math.min(3,4096/Math.max(bounds.width,bounds.height))});
      if (image.length > 14*1024*1024) throw new Error('인쇄 이미지 용량이 큽니다. 이미지 크기를 줄여 주세요.');
    } finally { isolated.dispose(); }
    const names = objects.map(o => env.originalUploads.get(o.uploadId)?.name).filter(Boolean);
    return {objects,matrices,bounds,frame,fingerprints:objects.map(fingerprint),print:{image,imageName:names.length===1 ? names[0] : `${{front:'앞면',back:'뒷면',innerPocket:'안주머니'}[side]} 디자인.png`,
      width:bounds.width*frame.mmX,height:bounds.height*frame.mmY,
      x:(bounds.left+bounds.width/2-frame.cx)*frame.mmX,
      y:(frame.cy-bounds.top-bounds.height/2)*frame.mmY,
      rotation:0, enabled:objects.some(o=>!o.p3dPrintDisabled),lockAspect:true,
      ...(side==='innerPocket' ? {partDimensions:{width:140,height:120}} : {})}};
  }
  async function locked(action) {
    if (busy) throw new Error('시안을 반영하고 있습니다. 잠시 기다려 주세요.');
    busy = true;
    const unlock = env.lockUI?.() || (()=>{});
    env.onBusy?.(true);
    try { return await action(); }
    finally { busy=false; unlock(); env.onBusy?.(false); }
  }
  async function exportDesign() {
    return locked(async()=> {
      await settle();
      const s = env.getState();
      const cache=productCache(s.currentBag.id), appliedArtwork=cache.appliedArtwork;
      const sides=collect(s), body=bodyFrame(s), inner=innerFrame(s)||cache.lastInnerFrame;
      if(inner) cache.lastInnerFrame={...inner};
      const captures = {};
      const appearances=env.getPrintAppearances?.() || {};
      for (const part of PARTS) {
        const frame=part==='innerPocket'?inner:body, retained=appliedArtwork.get(part);
        // A view switch is exact: transparent image margins and the requested
        // physical pose remain canonical until a real 2D layer edit occurs.
        if(sameObjects(sides[part],retained) && ((!retained.objects.length&&!frame)||sameFrame(frame,retained.frame))) {
          captures[part]={...retained,print:clone(retained.print),fingerprints:[...retained.fingerprints]};
        } else {
          appliedArtwork.delete(part);
          captures[part]=await composite(sides[part],frame,part,env.fabric);
        }
        // Appearance is metadata; the exported composite always contains the
        // editable original artwork, never a baked-in preview texture.
        captures[part].print.appearance=appearances[part]==='embroidery'?'embroidery':'print';
      }
      if (env.getState().currentBag.id !== s.currentBag.id) throw new Error('가방이 바뀌었습니다. 다시 열어 주세요.');
      const token='legacy_'+Date.now()+'_'+(++sequence);
      const snapshot={schemaVersion:1,productId:s.currentBag.id,dimensions:clone(env.getDimensions()),
        body:{color:env.getBodyColor?.(s) || s.bagBodyColor || env.defaultBodyColor(s.bagFabricId),fabricId:s.bagFabricId},
        handle:{color:env.getHandleColor?.(s) || s.webbingColor || '#ece6d9'},options:[...s.options,...(s.twoSided?['양면인쇄']:[])],
        crossStrap:clone(normalizeConfig({productId:s.currentBag.id,dimensions:env.getDimensions(),crossStrap:env.getCrossStrap?.()}).crossStrap),
        twoSided:s.twoSided,currentSide:s.currentSide,
        print:Object.fromEntries(PARTS.map(part=>[part,clone(captures[part].print)])),legacyToken:token};
      tokens.set(token,{snapshot:clone(snapshot),captures,rawAppearance:{bodyColor:s.bagBodyColor,handleColor:s.webbingColor,texture:s.bagTexture,polyBodyKey:s.polyBodyKey}});
      latestProductTokens.set(snapshot.productId, token);
      if(tokens.size>48) {
        const retained = new Set(latestProductTokens.values());
        tokens.delete([...tokens.keys()].find(key => !retained.has(key)));
      }
      return snapshot;
    });
  }
  async function loadArtwork(print, part) {
    if (!print.image) return [];
    const image = await bounded(new Promise((resolve,reject)=>env.fabric.Image.fromURL(print.image, img=> {
      const element=img?.getElement();
      if(!img || !(img.width>0 && img.height>0) || (element && 'naturalWidth' in element && !element.naturalWidth)) reject(new Error('인쇄 이미지를 읽지 못했습니다.'));
      else resolve(img);
    })),12000,'인쇄 이미지를 읽는 시간이 초과되었습니다.');
    image.set({isUserObject:true,isCustomerUpload:true,uploadId:env.newUploadId(),selectable:true,evented:true,
      legacyPrintPart:part,p3dPrintDisabled:print.enabled===false,visible:print.enabled!==false});
    return [image];
  }
  function samePose(a,b) { return ['width','height','x','y','rotation'].every(key=>Math.abs(a[key]-b[key])<1e-7); }
  function sameFrame(a,b) { return a&&b&&['cx','cy','mmX','mmY'].every(key=>Math.abs(a[key]-b[key])<1e-7); }
  async function applyDesign(snapshot, { restoreProductDraft = false } = {}) {
    return locked(async()=> {
      await settle();
      const s=env.getState();
      if(snapshot?.productId!==s.currentBag.id || !isSharedProduct(snapshot?.productId)) throw new Error('이 시안과 현재 가방이 다릅니다.');
      const cache=productCache(s.currentBag.id), appliedArtwork=cache.appliedArtwork;
      const dimensions=snapshot.dimensions;
      if(!dimensions || !['width','height','depth'].every(k=>Number.isFinite(dimensions[k])&&dimensions[k]>0&&dimensions[k]<=3000)) throw new Error('가방 크기를 확인해 주세요.');
      const baseline=tokens.get(snapshot.legacyToken);
      if(baseline && baseline.snapshot.productId!==snapshot.productId) throw new Error('이 시안과 원본 가방이 다릅니다.');
      const current=collect(s), plans={};
      for(const part of PARTS) {
        if (!snapshot.print || !(part in snapshot.print)) { plans[part]={objects:current[part],preserve:true}; continue; }
        const print=validatePrint(snapshot.print[part]), capture=baseline?.captures[part];
        const matching=Boolean(capture && print.image===capture.print.image);
        if(matching && !sameObjects(current[part],capture) && (!restoreProductDraft || current[part].length)) {
          throw new Error('2D 디자인이 변경되었습니다. 현재 디자인에서 다시 3D 보기를 열어 주세요.');
        }
        plans[part]={print,capture:matching?capture:null,objects:matching?capture.objects:await loadArtwork(print,part)};
      }
      const before=env.captureState(), previousDimensions=clone(env.getDimensions()), previousCrossStrap=env.getCrossStrap?.();
      const previousCanonical=new Map(appliedArtwork), previousInnerFrame=cache.lastInnerFrame?{...cache.lastInnerFrame}:null;
      const originalEntries = [];
      try {
        env.setRestoring(true);
        env.setPrintAppearances?.(Object.fromEntries(PARTS.map(part=>[part,plans[part].preserve
          ? env.getPrintAppearances?.()?.[part] || 'print' : plans[part].print.appearance])));
        env.setDimensions(dimensions);
        env.setCrossStrap?.(normalizeConfig({productId:snapshot.productId,dimensions,crossStrap:snapshot.crossStrap}).crossStrap);
        const profile=getProductProfile(snapshot.productId);
        const normalizedOptions=normalizeConfig({productId:snapshot.productId,
          options:Object.fromEntries(Object.entries(SHARED_OPTIONS).map(([key,label])=>[key,(snapshot.options||[]).includes(label)]))}).options;
        const options=Object.entries(SHARED_OPTIONS).filter(([key,label])=>normalizedOptions[key]
          && profile.allowedOptions.includes(key) && env.validOptions.includes(label)).map(([,label])=>label);
        await env.applyAppearance({body:snapshot.body,handle:snapshot.handle,options,
          originalAppearance:baseline?.rawAppearance,
          preserveBody:Boolean(baseline && snapshot.body?.color===baseline.snapshot.body.color && snapshot.body?.fabricId===baseline.snapshot.body.fabricId),
          preserveHandle:Boolean(baseline && snapshot.handle?.color===baseline.snapshot.handle.color),
          twoSided:Boolean(snapshot.twoSided || snapshot.options?.includes('양면인쇄'))});
        await settle(true);
        const after=env.getState(), frame=bodyFrame(after);
        const inner=innerFrame(after,snapshot.print?.innerPocket?.partDimensions)||cache.lastInnerFrame;
        if(inner) cache.lastInnerFrame={...inner};
        for(const part of PARTS) {
          const plan=plans[part];
          if(plan.preserve) continue;
          const targetFrame=part==='innerPocket'?(inner||plan.capture?.frame):frame;
          if(plan.objects.length && !targetFrame) throw new Error('안주머니 인쇄를 적용하려면 안주머니 인쇄 옵션을 선택해 주세요.');
          const {print,capture}=plan;
          if(capture?.bounds) {
            if(!samePose(print,capture.print)||!sameFrame(targetFrame,capture.frame)) {
              const transform=artworkTransform(capture.bounds,print,targetFrame);
              capture.matrices.forEach(({object,matrix})=> {
                env.fabric.util.applyTransformToObject(object,multiplyAffine(transform,matrix)); object.setCoords();
              });
            }
          } else if(plan.objects.length) {
            const image=plan.objects[0], r=print.rotation*Math.PI/180,c=Math.cos(r),sin=Math.sin(r);
            const pose=[c*print.width/image.width,sin*print.width/image.width,
              -sin*print.height/image.height,c*print.height/image.height,print.x,print.y];
            // Image local coordinates use downward Y; reverse that axis before
            // applying the physical pose, whose Y axis points upward.
            const local=[1,0,0,-1,0,0], pixels=[1/targetFrame.mmX,0,0,-1/targetFrame.mmY,targetFrame.cx,targetFrame.cy];
            env.fabric.util.applyTransformToObject(image,multiplyAffine(pixels,multiplyAffine(pose,local))); image.setCoords();
            originalEntries.push([image.uploadId,{dataURL:print.image,name:print.imageName||`${part}.png`,mime:print.image.startsWith('data:image/jpeg')?'image/jpeg':'image/png',bgRemoved:false}]);
          }
          plan.objects.forEach(object=>object.set({legacyPrintPart:part,p3dPrintDisabled:print.enabled===false,
            visible:print.enabled!==false && (part!=='innerPocket'||after.options.includes('안주머니인쇄'))}));
        }
        const side=snapshot.currentSide==='back'&&after.twoSided?'back':'front';
        env.installArtwork({front:plans.front.objects,back:plans.back.objects,innerPocket:plans.innerPocket.objects},side);
        originalEntries.forEach(([id,original])=>env.originalUploads.set(id,original));
        for(const part of PARTS) {
          if(!plans[part].preserve) rememberCanonical(cache,part,plans[part],part==='innerPocket'?(inner||plans[part].capture?.frame):frame);
        }
        env.setRestoring(false);
        env.refreshUI();
        env.saveState();
      } catch(error) {
        appliedArtwork.clear(); previousCanonical.forEach((capture,part)=>appliedArtwork.set(part,capture));
        cache.lastInnerFrame=previousInnerFrame;
        originalEntries.forEach(([id])=>env.originalUploads.delete(id));
        env.setDimensions(previousDimensions);
        if (previousCrossStrap) env.setCrossStrap?.(previousCrossStrap);
        await bounded(env.restoreState(before),15000,'이전 디자인 복원이 지연되고 있습니다.');
        throw error;
      } finally { env.setRestoring(false); }
    });
  }
  return Object.freeze({exportDesign,applyDesign,isReady:()=>!busy&&ready()});
}
