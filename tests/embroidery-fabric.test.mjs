import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installFabricEmbroideryPreview} from '../assets/product3d/embroidery-fabric.mjs';

test('2D thread preview caches derived canvases, preserves editable data, and bypasses original exports',()=>{
  const previousDocument=globalThis.document;
  const drawings=[];
  globalThis.document={createElement:()=>({width:0,height:0,getContext(){const element=this;return {
    setTransform(){},drawImage(){},putImageData(){},
    createImageData(width,height){return {data:new Uint8ClampedArray(width*height*4)};},
    getImageData(){const data=new Uint8ClampedArray(element.width*element.height*4);data.fill(255);return {data};},
  };}})};
  class ObjectLayer {
    constructor(){Object.assign(this,{isUserObject:true,width:20,height:10,scaleX:1,scaleY:1,text:'editable logo',uploadId:'original-upload',dirty:false});}
    drawObject(context){drawings.push({object:this,context});}
    _getNonTransformedDimensions(){return {x:this.width,y:this.height};}
    toObject(){return {text:this.text,width:this.width,height:this.height,uploadId:this.uploadId,scaleX:this.scaleX,scaleY:this.scaleY};}
  }
  let appearance='embroidery';
  const layer=new ObjectLayer(),canvas={getObjects:()=>[layer],renderAll(){layer.drawObject(mainContext,false);}};
  layer.canvas=canvas;
  const painted=[];
  const mainContext={save(){},restore(){},drawImage(image,...rect){painted.push({image,rect});}};
  try {
    const effect=installFabricEmbroideryPreview({fabric:{Object:ObjectLayer},getCanvas:()=>canvas,
      getAppearance:()=>appearance,getMmPerPixel:()=>.1});
    const original=layer.toObject();
    canvas.renderAll();
    assert.equal(drawings.length,1);assert.equal(painted.length,1);
    const cached=painted[0].image;
    canvas.renderAll();assert.equal(drawings.length,1);assert.equal(painted[1].image,cached);
    assert.deepEqual(layer.toObject(),original);
    layer.text='new editable text';canvas.renderAll();assert.equal(drawings.length,2);
    const changedPreview=painted.at(-1).image,drawnBeforeExport=drawings.length;
    effect.withOriginalArtwork(()=>{
      assert.equal(drawings.at(-1).context,mainContext);
      assert.equal(layer.text,'new editable text');
    });
    assert.equal(painted.length,4);
    assert.equal(painted.at(-1).image,changedPreview,'Export and 2D/3D synchronization must reuse the expensive thread preview');
    assert.equal(drawings.length,drawnBeforeExport+1,'Only the original export should be rendered, without rebuilding the cached preview');
    appearance='print';canvas.renderAll();assert.equal(drawings.at(-1).context,mainContext);
    appearance='embroidery';layer.canvas={};layer.drawObject(mainContext,false);
    assert.equal(drawings.at(-1).context,mainContext,'isolated bridge clones render original pixels');
    layer.canvas=canvas;layer.isEditing=true;layer.drawObject(mainContext,false);
    assert.equal(drawings.at(-1).context,mainContext,'text remains editable while typing');
  } finally {globalThis.document=previousDocument;}
});

test('2D asynchronous previews discard obsolete edits and reuse completed stitches during export',async t=>{
  const previousDocument=globalThis.document;
  globalThis.document={createElement:()=>({width:0,height:0,getContext(){const element=this;return {
    setTransform(){},drawImage(){},putImageData(){},
    createImageData(width,height){return {data:new Uint8ClampedArray(width*height*4)};},
    getImageData(){return {data:new Uint8ClampedArray(element.width*element.height*4)};}
  };}})};
  t.after(()=>{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;});
  class Layer {
    constructor(){Object.assign(this,{isUserObject:true,width:20,height:10,scaleX:1,scaleY:1,text:'old'});}
    drawObject(){}
    _getNonTransformedDimensions(){return {x:this.width,y:this.height};}
    toObject(){return {text:this.text};}
  }
  const jobs=[],painted=[];let renders=0,disposed=false;
  const processor={run(job,{signal}){return new Promise(resolve=>jobs.push({job,signal,resolve}));},dispose(){disposed=true;}};
  const layer=new Layer(),context={save(){},restore(){},drawImage(image){painted.push(image);}};
  const canvas={getObjects:()=>[layer],renderAll(){layer.drawObject(context,false);},requestRenderAll(){renders++;}};
  layer.canvas=canvas;
  const effect=installFabricEmbroideryPreview({fabric:{Object:Layer},getCanvas:()=>canvas,
    getAppearance:()=> 'embroidery',getMmPerPixel:()=>.1,processor});
  canvas.renderAll();layer.text='latest';canvas.renderAll();
  assert.equal(jobs.length,2);assert.equal(jobs[0].signal.aborted,true);
  const currentSource=painted.at(-1);
  jobs[0].resolve({preview:new Uint8ClampedArray(16),width:2,height:2});await Promise.resolve();
  canvas.renderAll();assert.equal(painted.at(-1),currentSource);assert.equal(renders,0);
  jobs[1].resolve({preview:new Uint8ClampedArray(16),width:2,height:2});await Promise.resolve();
  assert.equal(renders,1);canvas.renderAll();
  const finished=painted.at(-1);assert.notEqual(finished,currentSource);
  effect.withOriginalArtwork(()=>assert.equal(layer.text,'latest'));
  assert.equal(jobs.length,2);assert.equal(painted.at(-1),finished);
  effect.dispose();assert.equal(disposed,true);
});
