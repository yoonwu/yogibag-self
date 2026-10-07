import { renderEmbroideryCanvas,readEmbroiderySource,embroideryPreviewCanvas } from './embroidery.mjs';
import { EmbroideryProcessor } from './embroidery-processor.mjs';

// A render-only effect keeps Fabric text, SVGs and uploaded originals editable.
// Clones rendered by the 2D/3D bridge use another canvas and bypass this preview.
export function installFabricEmbroideryPreview({fabric,getCanvas,getAppearance,getMmPerPixel,designProps=[],processor=null}) {
  const originalDraw=fabric.Object.prototype.drawObject;
  const generated=new WeakMap();
  let originalsOnly=false;
  const invalidate=objects=>objects.forEach(object=>{object.dirty=true;generated.get(object)?.controller?.abort();generated.delete(object);});
  fabric.Object.prototype.drawObject=function(ctx,forClipping) {
    if(originalsOnly || forClipping || !this.isUserObject || this.canvas!==getCanvas()
      || getAppearance(this)!=='embroidery' || this.isEditing) {
      return originalDraw.call(this,ctx,forClipping);
    }
    const local=this._getNonTransformedDimensions();
    const width=Math.max(1,local.x+4),height=Math.max(1,local.y+4);
    const mmPerPixel=getMmPerPixel()||1;
    const widthMm=width*Math.abs(this.scaleX||1)*mmPerPixel;
    const heightMm=height*Math.abs(this.scaleY||1)*mmPerPixel;
    const data=this.toObject(designProps);
    // Moving/rotating a layer changes its pose, not the stitch pattern.
    for(const key of ['left','top','angle','originX','originY']) delete data[key];
    const key=JSON.stringify([data,widthMm,heightMm]);
    let cached=generated.get(this);
    if(!cached || cached.key!==key) {
      cached?.controller?.abort();
      const density=Math.min(4,2048/Math.max(width,height));
      const source=document.createElement('canvas');
      source.width=Math.max(1,Math.ceil(width*density));
      source.height=Math.max(1,Math.ceil(height*density));
      const offscreen=source.getContext('2d');
      offscreen.setTransform(source.width/width,0,0,source.height/height,source.width/2,source.height/2);
      originalDraw.call(this,offscreen,false);
      cached={key,color:source};
      generated.set(this,cached);
      if(globalThis.Worker||processor) {
        processor ||= new EmbroideryProcessor();
        const controller=cached.controller=new AbortController(),entry=cached;
        const input=readEmbroiderySource(source,{widthMm,heightMm});
        processor.run({kind:'preview',source:input.source,width:input.width,height:input.height,
          print:{widthMm,heightMm}},{signal:controller.signal}).then(result=>{
          if(generated.get(this)!==entry||controller.signal.aborted||this.canvas!==getCanvas())return;
          entry.color=embroideryPreviewCanvas(result.preview,result.width,result.height);
          this.dirty=true;getCanvas().requestRenderAll();
        }).catch(error=>{
          if(error.name==='AbortError'||generated.get(this)!==entry||controller.signal.aborted)return;
          entry.color=renderEmbroideryCanvas(source,{widthMm,heightMm}).preview;
          this.dirty=true;getCanvas().requestRenderAll();
        });
      } else cached.color=renderEmbroideryCanvas(source,{widthMm,heightMm}).preview;
    }
    ctx.save();
    const localMm=mmPerPixel*Math.max(.01,(Math.abs(this.scaleX||1)+Math.abs(this.scaleY||1))/2);
    ctx.shadowColor='rgba(30,25,20,.42)';
    ctx.shadowBlur=.7/localMm;ctx.shadowOffsetX=.4/localMm;ctx.shadowOffsetY=.65/localMm;
    ctx.drawImage(cached.color,-width/2,-height/2,width,height);
    ctx.restore();
  };
  function withOriginalArtwork(action) {
    const canvas=getCanvas(),objects=canvas.getObjects().filter(object=>object.isUserObject);
    const previous=originalsOnly;
    // An export bypass changes rendering mode, not artwork. Keep the expensive
    // stitch cache instead of regenerating it after every 2D/3D synchronization.
    originalsOnly=true;objects.forEach(object=>object.dirty=true);
    try {canvas.renderAll();return action();}
    finally {originalsOnly=previous;objects.forEach(object=>object.dirty=true);canvas.renderAll();}
  }
  return Object.freeze({invalidate,withOriginalArtwork,dispose:()=>processor?.dispose()});
}
