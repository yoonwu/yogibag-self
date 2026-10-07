import { createDefaultConfig, normalizeConfig, getProductProfile, getProductPrintArea } from './config.mjs?v=1.2.8';

export const CUSTOM_2D_IDS=Object.freeze(['sample-two-line-large','sample-two-line-small','two-tone-kids']);
export const isCustom2DTote=id=>CUSTOM_2D_IDS.includes(id);
const templates=new Map();
const sources={
  'sample-two-line-large':new URL('./pocket-large-2d-photo.png',import.meta.url).href,
  'sample-two-line-small':new URL('./pocket-small-2d-photo.png',import.meta.url).href,
};
const sheet=(width,height)=>{const c=document.createElement('canvas');c.width=width;c.height=height;return c;};
async function photograph(url){const image=new Image();image.crossOrigin='anonymous';image.src=url;await image.decode();return image;}

// Read actual alpha, including the folded corners, rather than treating the
// full transparent photograph frame as the physical body measurement.
export function alphaBounds(pixels,width,height,y0=0){
  let left=width,right=-1,top=height,bottom=-1;
  for(let y=y0;y<height;y++)for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]>128){
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  return {left,top,width:right-left+1,height:bottom-top+1};
}

async function template(id,legacyImages){
  if(templates.has(id))return templates.get(id);
  const pending=(async()=>{
    const profile=getProductProfile(id),base=createDefaultConfig(id);
    if(id==='two-tone-kids'){
      const [body,handle]=await Promise.all([photograph(legacyImages.kids_body),photograph(legacyImages.kids_handle)]);
      const c=sheet(body.naturalWidth,body.naturalHeight),ctx=c.getContext('2d');ctx.drawImage(body,0,0);
      const pixels=ctx.getImageData(0,0,c.width,c.height);
      return {body:c,handle,width:c.width,height:c.height,rect:alphaBounds(pixels.data,c.width,c.height),profile,base};
    }
    const photo=await photograph(sources[id]),c=sheet(photo.naturalWidth,photo.naturalHeight),ctx=c.getContext('2d');
    ctx.drawImage(photo,0,0);const source=ctx.getImageData(0,0,c.width,c.height),rows=[];
    for(let y=0;y<c.height;y++){let n=0;for(let x=0;x<c.width;x++)if(source.data[(y*c.width+x)*4+3]>128)n++;rows.push(n);}
    const widest=Math.max(...rows),top=rows.findIndex(n=>n>widest*.72);
    const rect=alphaBounds(source.data,c.width,c.height,top);
    // Ignore tiny detached generation specks outside the real textile cutout.
    for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(x<rect.left-2||x>rect.left+rect.width+2||y>rect.top+rect.height+2)source.data[(y*c.width+x)*4+3]=0;
    const body=sheet(c.width,c.height),bodyData=body.getContext('2d').createImageData(c.width,c.height);
    const tape=sheet(c.width,c.height),tapeData=tape.getContext('2d').createImageData(c.width,c.height);
    const pocket=base.pocket,px=rect.width/profile.dimensions.width,py=rect.height/profile.dimensions.height;
    const pocketRect={left:rect.left+(rect.width-pocket.width*px)/2,top:rect.top+rect.height-(pocket.bottom+pocket.height)*py,width:pocket.width*px,height:pocket.height*py};
    const pocketPhoto=sheet(c.width,c.height);ctx.putImageData(source,0,0);
    pocketPhoto.getContext('2d').drawImage(c,pocketRect.left,pocketRect.top,pocketRect.width,pocketRect.height,pocketRect.left,pocketRect.top,pocketRect.width,pocketRect.height);
    const originalBandY=rect.top+rect.height-base.bottomPanel.height/profile.dimensions.height*rect.height;
    const neutral=(i,out)=>{
      const l=(source.data[i]+source.data[i+1]+source.data[i+2])/3;
      const shade=Math.max(.60,Math.min(1.02,(l/65)**.17));
      out[i]=236*shade;out[i+1]=230*shade;out[i+2]=216*shade;out[i+3]=source.data[i+3];
    };
    for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
      const i=(y*c.width+x)*4;if(!source.data[i+3])continue;
      const dark=Math.max(source.data[i],source.data[i+1],source.data[i+2])<115;
      if(y<top||(dark&&y<originalBandY))neutral(i,tapeData.data);
      if(y>=top){
        if(dark)neutral(i,bodyData.data);else bodyData.data.set(source.data.subarray(i,i+4),i);
        // The pocket is a separate removable/colorable layer. Reconstruct its
        // underlying canvas from a clean patch of this same photograph.
        if(x>pocketRect.left-3&&x<pocketRect.left+pocketRect.width+3&&y>pocketRect.top-3&&y<Math.min(originalBandY,pocketRect.top+pocketRect.height+3)){
          const sx=Math.round(rect.left+rect.width*.09)+(x%Math.round(rect.width*.07)),sy=y;
          const si=(sy*c.width+sx)*4;
          bodyData.data[i]=source.data[si];bodyData.data[i+1]=source.data[si+1];bodyData.data[i+2]=source.data[si+2];
        }
      }
    }
    body.getContext('2d').putImageData(bodyData,0,0);tape.getContext('2d').putImageData(tapeData,0,0);
    return {body,handle:tape,pocketPhoto,width:c.width,height:c.height,rect,profile,base,pocketRect};
  })();
  templates.set(id,pending);try{return await pending;}catch(error){templates.delete(id);throw error;}
}

export function customParts(config){
  const c=normalizeConfig(config),p=getProductProfile(c);
  return {...(p.supportsBottomPanel?{bottomPanel:{...c.bottomPanel}}:{}),
    ...(p.supportsPocket?{pocket:{...c.pocket},pocketEnabled:c.options.pocket}:{})};
}

export async function customPhotoLayers(config,side,legacyImages){
  const c=normalizeConfig(config),t=await template(c.productId,legacyImages),r=t.rect;
  const bandY=r.top+r.height-c.bottomPanel.height/c.dimensions.height*r.height;
  const band=sheet(t.width,t.height),bandContext=band.getContext('2d');
  bandContext.save();bandContext.beginPath();bandContext.rect(0,bandY,t.width,t.height-bandY);bandContext.clip();
  bandContext.drawImage(t.body,0,0);bandContext.restore();
  const trim=sheet(t.width,t.height),trimContext=trim.getContext('2d');
  trimContext.save();trimContext.beginPath();trimContext.rect(0,0,t.width,bandY);trimContext.clip();trimContext.drawImage(t.handle,0,0);trimContext.restore();
  const layers=[{part:'body',url:t.body.toDataURL(),color:c.body.color},{part:'band',url:band.toDataURL(),color:c.bottomPanel.color}];
  if(t.profile.supportsPocket&&c.options.pocket&&side!=='back'){
    const pocket=sheet(t.width,t.height),ctx=pocket.getContext('2d'),p=c.pocket;
    const px=r.width/c.dimensions.width,py=r.height/c.dimensions.height;
    const x=r.left+(r.width-p.width*px)/2,y=r.top+r.height-(p.bottom+p.height)*py,w=p.width*px,h=p.height*py;
    const original=t.pocketRect;
    ctx.drawImage(t.pocketPhoto,original.left,original.top,original.width,original.height,x,y,w,h);
    // A shallow opening shadow and sewn edge keep same-color cotton visible.
    ctx.strokeStyle='rgba(80,70,55,.27)';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y);ctx.stroke();
    ctx.strokeStyle='rgba(105,94,72,.25)';ctx.lineWidth=.9;ctx.setLineDash([3,3]);ctx.strokeRect(x+3,y+4,w-6,h-7);
    layers.push({part:'pocket',url:pocket.toDataURL(),color:p.color});
  }
  if(t.profile.supportsPocket){
    const loop=sheet(t.width,t.height),strips=sheet(t.width,t.height);
    loop.getContext('2d').drawImage(trim,0,0,t.width,r.top,0,0,t.width,r.top);
    strips.getContext('2d').drawImage(trim,0,r.top,t.width,t.height-r.top,0,r.top,t.width,t.height-r.top);
    layers.push({part:'webbing',url:strips.toDataURL(),color:c.handle.color},{part:'handle',url:loop.toDataURL(),color:c.handle.color});
  }else layers.push({part:'handle',url:trim.toDataURL(),color:c.handle.color});
  const area=getProductPrintArea(c);
  return {layers,width:t.width,height:t.height,bodyRect:r,guide:{
    left:r.left+r.width/2+(area.x-area.width/2)/c.dimensions.width*r.width,
    top:r.top+r.height/2-(area.y+area.height/2)/c.dimensions.height*r.height,
    width:area.width/c.dimensions.width*r.width,height:area.height/c.dimensions.height*r.height,
  }};
}
