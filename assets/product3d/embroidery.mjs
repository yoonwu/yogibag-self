import { planEmbroidery, stitchLift } from './embroidery-plan.mjs?v=1.2.4';
import { sampleEmbroideryElevation } from './embroidery-relief.mjs?v=1.2.4';

const clamp = value => Math.max(0,Math.min(255,Math.round(value)));
const dimension = value => Number.isFinite(Number(value))&&Number(value)>0?Number(value):100;

// Both views use the same shape-aware stitch plan. Only display resources are
// derived: the original pixels, transparent holes and layer geometry survive.
export function createEmbroideryPixels(source,width,height,{widthMm=100,heightMm=100}={}) {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||source.length!==width*height*4)throw new Error('자수 미리보기 이미지 크기를 확인해 주세요.');
  widthMm=dimension(widthMm);heightMm=dimension(heightMm);
  const plan=planEmbroidery(source,width,height,{widthMm,heightMm});
  const color=new Uint8ClampedArray(source.length),relief=new Uint8ClampedArray(source.length),roughness=new Uint8ClampedArray(source.length),top=new Float32Array(width*height);
  const {analysis}=plan;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const pixel=y*width+x,i=pixel*4,alpha=source[i+3];color[i+3]=alpha;relief[i+3]=roughness[i+3]=255;
    roughness[i]=roughness[i+1]=roughness[i+2]=215;
    if(!alpha)continue;
    const gx=Math.min(analysis.width-1,Math.floor((x+.5)*analysis.width/width)),gy=Math.min(analysis.height-1,Math.floor((y+.5)*analysis.height/height));
    const dist=analysis.distance[gy*analysis.width+gx]*Math.min(analysis.dx,analysis.dy);
    top[pixel]=.045+.06*Math.min(1,dist/.65);
    for(let c=0;c<3;c++)color[i+c]=clamp(source[i+c]*.62);
    relief[i]=relief[i+1]=relief[i+2]=clamp(top[pixel]*255);
  }
  const px=width/widthMm,py=height/heightMm;
  for(const stitch of plan.stitches) {
    const [ax,ay]=stitch.a,[bx,by]=stitch.b,vx=bx-ax,vy=by-ay,length=Math.hypot(vx,vy),ux=vx/length,uy=vy/length,radius=stitch.radius;
    const minX=Math.max(0,Math.floor((Math.min(ax,bx)-radius-.2)*px)),maxX=Math.min(width-1,Math.ceil((Math.max(ax,bx)+radius+.2)*px));
    const minY=Math.max(0,Math.floor((Math.min(ay,by)-radius-.2)*py)),maxY=Math.min(height-1,Math.ceil((Math.max(ay,by)+radius+.2)*py));
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++) {
      const pixel=y*width+x,i=pixel*4;if(!source[i+3])continue;
      const mx=(x+.5)/px,my=(y+.5)/py,t=Math.max(0,Math.min(1,((mx-ax)*vx+(my-ay)*vy)/(length*length)));
      const qx=mx-ax-vx*t,qy=my-ay-vy*t,d=Math.hypot(qx,qy);
      if(d>radius+Math.min(.06,.5/Math.max(px,py)))continue;
      const signed=Math.max(-.995,Math.min(.995,(qx*(-uy)+qy*ux)/radius));
      const cylinder=Math.sqrt(1-signed*signed);
      const z=stitchLift(stitch,t)+radius*cylinder;
      if(z<top[pixel])continue;
      top[pixel]=z;
      const sinus=Math.max(.07,Math.sin(Math.PI*t));
      const slope=.72*stitch.lift*Math.PI*Math.cos(Math.PI*t)*Math.pow(sinus,-.28)/length;
      const nx=-ux*slope-uy*signed,ny=-uy*slope+ux*signed,nz=cylinder,norm=Math.hypot(nx,ny,nz);
      const diffuse=Math.max(0,(-.42*nx-.52*ny+.74*nz)/norm);
      const specular=Math.pow(Math.max(0,(-.23*nx-.29*ny+.929*nz)/norm),28);
      const fibre=1+.035*Math.sin((t*length)*85+stitch.region*1.7);
      const shade=(.43+.61*diffuse)*stitch.variation*fibre;
      const glint=specular*20;
      for(let c=0;c<3;c++)color[i+c]=clamp(source[i+c]*shade+glint);
      relief[i]=relief[i+1]=relief[i+2]=clamp(z*255);
      roughness[i]=roughness[i+1]=roughness[i+2]=stitch.type==='satin'?130:205;
    }
  }
  // The 2D view also needs the padded shoulder, not only the fine yarn image.
  // 3D lights shade the real raised geometry, so its albedo stays separate.
  const preview=color.slice(),shading=new Float32Array(analysis.width*analysis.height);
  for(let y=0;y<analysis.height;y++)for(let x=0;x<analysis.width;x++) {
    const mx=(x+.5)*analysis.dx,my=(y+.5)*analysis.dy;
    const hx=(sampleEmbroideryElevation(plan,mx+.2,my)-sampleEmbroideryElevation(plan,mx-.2,my))/.4;
    const hy=(sampleEmbroideryElevation(plan,mx,my+.2)-sampleEmbroideryElevation(plan,mx,my-.2))/.4;
    const norm=Math.hypot(hx,hy,1),diffuse=Math.max(0,(.42*hx+.52*hy+.74)/norm);
    shading[y*analysis.width+x]=.52+.62*diffuse;
  }
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const i=(y*width+x)*4;if(!source[i+3])continue;
    const sx=(x+.5)*analysis.width/width-.5,sy=(y+.5)*analysis.height/height-.5;
    const bx=Math.floor(sx),by=Math.floor(sy),fx=sx-bx,fy=sy-by;
    let shade=0;
    for(let oy=0;oy<2;oy++)for(let ox=0;ox<2;ox++)shade+=shading[Math.min(analysis.height-1,Math.max(0,by+oy))*analysis.width+Math.min(analysis.width-1,Math.max(0,bx+ox))]*(ox?fx:1-fx)*(oy?fy:1-fy);
    for(let c=0;c<3;c++)preview[i+c]=clamp(color[i+c]*shade);
  }
  return {color,height:relief,roughness,preview,plan};
}

export function embroideryTextureSize({widthMm=100,heightMm=100}={}) {
  widthMm=dimension(widthMm);heightMm=dimension(heightMm);
  // Three pixels per normal stitch row suffice for the filtered texture;
  // enlarged views use the physical yarn surfaces for finer cross-sections.
  const density=Math.min(8,1536/Math.max(widthMm,heightMm));
  const width=Math.max(1,Math.round(widthMm*density)),height=Math.max(1,Math.round(heightMm*density));
  return {width,height,density,widthMm,heightMm};
}

export function readEmbroiderySource(source,print) {
  const size=embroideryTextureSize(print);
  const canvas=document.createElement('canvas');canvas.width=size.width;canvas.height=size.height;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(source,0,0,size.width,size.height);
  return {...size,source:context.getImageData(0,0,size.width,size.height).data};
}

export function embroideryPreviewCanvas(preview,width,height) {
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d'),image=context.createImageData(width,height);
  image.data.set(preview);context.putImageData(image,0,0);return canvas;
}

export function renderEmbroideryCanvas(source,print={}) {
  const {width,height,density,widthMm,heightMm,source:rgba}=readEmbroiderySource(source,print);
  const pixels=createEmbroideryPixels(rgba,width,height,{widthMm,heightMm});
  return embroideryCanvases(pixels,{width,height,density});
}

export function embroideryCanvases(pixels,{width,height,density}) {
  const color=document.createElement('canvas');color.width=width;color.height=height;
  const context=color.getContext('2d'),input=context.createImageData(width,height);
  input.data.set(pixels.color);context.putImageData(input,0,0);
  const relief=document.createElement('canvas');relief.width=width;relief.height=height;
  const reliefContext=relief.getContext('2d'),heightImage=reliefContext.createImageData(width,height);
  heightImage.data.set(pixels.height);reliefContext.putImageData(heightImage,0,0);
  const roughness=document.createElement('canvas');roughness.width=width;roughness.height=height;
  const roughnessContext=roughness.getContext('2d'),roughnessImage=roughnessContext.createImageData(width,height);
  roughnessImage.data.set(pixels.roughness);roughnessContext.putImageData(roughnessImage,0,0);
  const preview=document.createElement('canvas');preview.width=width;preview.height=height;
  const previewContext=preview.getContext('2d'),previewImage=previewContext.createImageData(width,height);
  previewImage.data.set(pixels.preview);previewContext.putImageData(previewImage,0,0);
  // Contact shading resolves the sub-mm gap that the whole-bag shadow map
  // cannot sample. It follows the same alpha contour, including inner holes.
  const mask=document.createElement('canvas');mask.width=width;mask.height=height;
  const maskContext=mask.getContext('2d'),maskImage=maskContext.createImageData(width,height);
  for(let i=0;i<pixels.color.length;i+=4) {
    maskImage.data[i]=25;maskImage.data[i+1]=21;maskImage.data[i+2]=17;maskImage.data[i+3]=Math.round(pixels.color[i+3]*.42);
  }
  maskContext.putImageData(maskImage,0,0);
  const margin=3,padding=Math.ceil(margin*density),shadow=document.createElement('canvas');shadow.width=width+2*padding;shadow.height=height+2*padding;
  const shadowContext=shadow.getContext('2d');shadowContext.filter=`blur(${.48*density}px)`;
  shadowContext.drawImage(mask,padding+.4*density,padding+.65*density);
  return {color,height:relief,roughness,preview,shadow,shadowMarginMm:padding/density,plan:pixels.plan};
}
