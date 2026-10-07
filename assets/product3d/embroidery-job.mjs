import {createEmbroideryPixels} from './embroidery.mjs?v=1.2.7';
import {createEmbroideryReliefGeometry} from './embroidery-relief.mjs?v=1.2.7';
import {createEmbroideryThreadMesh} from './embroidery-geometry.mjs?v=1.2.7';

export function geometryPacket(geometry) {
  if(!geometry)return null;
  return {index:geometry.index.array,attributes:Object.fromEntries(Object.entries(geometry.attributes)
    .map(([name,attribute])=>[name,{array:attribute.array,itemSize:attribute.itemSize}]))};
}

export function embroideryGeometryKey(config,side) {
  const {image,imageName,appearance,...print}=config.print[side];
  return JSON.stringify([config.productId,config.dimensions,config.bottomPanel.height,config.pocket,config.options,side,print]);
}

export function embroideryGeometryConfig(config) {
  const {legacyDesign,syncMetadata,...copy}=config;
  return {...copy,print:Object.fromEntries(Object.entries(config.print)
    .map(([side,{image,imageName,...print}])=>[side,print]))};
}

export function computeEmbroideryJob(job) {
  const pixels=job.kind==='geometry'?null:createEmbroideryPixels(job.source,job.width,job.height,job.print);
  if(job.kind==='preview')return {preview:pixels.preview,width:job.width,height:job.height};
  const plan=pixels?.plan||job.plan;
  const relief=createEmbroideryReliefGeometry(job.config,job.side,plan);
  const threads=createEmbroideryThreadMesh(job.config,job.side,plan);
  const geometry={relief:geometryPacket(relief),threads:geometryPacket(threads?.geometry),
    threadData:threads?.userData||null};
  relief.dispose();threads?.geometry.dispose();threads?.material.dispose();
  return {pixels,geometry};
}

export function embroideryTransferables(value,buffers=new Set()) {
  if(ArrayBuffer.isView(value))buffers.add(value.buffer);
  else if(value&&typeof value==='object')for(const child of Object.values(value))embroideryTransferables(child,buffers);
  return [...buffers];
}
