// Preview digitizing: satin crosses the local stroke, tatami fills broad areas.
// The plan is display-only and never replaces customer artwork or machine data.
export const STITCH_SPACING_MM = .38;
export const TATAMI_LENGTH_MM = 4;
export const THREAD_DIAMETER_MM = .40;

const hash = n => { const v = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); };
const interpolate = (a,b,t) => [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];

export function planEmbroidery(source, width, height, {widthMm=100,heightMm=100}={}) {
  if (source.length !== width*height*4 || !(width>0&&height>0&&widthMm>0&&heightMm>0)) throw new Error('자수 도안 크기를 확인해 주세요.');
  const density = Math.min(2.5,384/Math.max(widthMm,heightMm));
  const nx=Math.max(3,Math.round(widthMm*density)),ny=Math.max(3,Math.round(heightMm*density));
  const dx=widthMm/nx,dy=heightMm/ny,n=nx*ny;
  const palette=new Int32Array(n).fill(-1),labels=new Int32Array(n),rgb=new Uint8Array(n*3);
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++) {
    const i=y*nx+x,j=(Math.min(height-1,Math.floor((y+.5)*height/ny))*width+Math.min(width-1,Math.floor((x+.5)*width/nx)))*4;
    if(source[j+3]<72)continue;
    rgb.set(source.subarray(j,j+3),i*3);
    palette[i]=(source[j]>>5)*64+(source[j+1]>>5)*8+(source[j+2]>>5);
  }
  const regions=[],queue=new Int32Array(n);
  let occupied=0;
  for(let seed=0;seed<n;seed++) {
    if(palette[seed]<0||labels[seed])continue;
    const id=regions.length+1,key=palette[seed],r={id,count:0,minX:nx,minY:ny,maxX:0,maxY:0,color:[0,0,0]};
    let head=0,tail=1;queue[0]=seed;labels[seed]=id;
    while(head<tail) {
      const i=queue[head++],x=i%nx,y=Math.floor(i/nx);
      r.count++;occupied++;r.minX=Math.min(r.minX,x);r.maxX=Math.max(r.maxX,x);r.minY=Math.min(r.minY,y);r.maxY=Math.max(r.maxY,y);
      for(let c=0;c<3;c++)r.color[c]+=rgb[i*3+c];
      for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++) {
        if(!ox&&!oy||x+ox<0||x+ox>=nx||y+oy<0||y+oy>=ny)continue;
        const j=i+oy*nx+ox;
        if(!labels[j]&&palette[j]===key){labels[j]=id;queue[tail++]=j;}
      }
    }
    r.color=r.color.map(value=>value/r.count);regions.push(r);
  }
  const at=(x,y)=>x<0||y<0||x>=widthMm||y>=heightMm?0:labels[Math.min(ny-1,Math.floor(y/dy))*nx+Math.min(nx-1,Math.floor(x/dx))];
  // Colour boundaries count as edges too; adjacent coloured objects receive
  // their own stitch directions instead of one diagonal screen-space pattern.
  const distance=new Float32Array(n);
  for(let i=0;i<n;i++)if(labels[i]) {
    const x=i%nx,y=Math.floor(i/nx),id=labels[i];
    distance[i]=!x||!y||x===nx-1||y===ny-1||labels[i-1]!==id||labels[i+1]!==id||labels[i-nx]!==id||labels[i+nx]!==id?1:10000;
  }
  const relax=(i,j,step)=>{if(j>=0&&j<n&&labels[i]===labels[j])distance[i]=Math.min(distance[i],distance[j]+step);};
  for(let i=0;i<n;i++)if(labels[i]){const x=i%nx; if(x)relax(i,i-1,1);relax(i,i-nx,1);if(x)relax(i,i-nx-1,Math.SQRT2);if(x+1<nx)relax(i,i-nx+1,Math.SQRT2);}
  for(let i=n-1;i>=0;i--)if(labels[i]){const x=i%nx;if(x+1<nx)relax(i,i+1,1);relax(i,i+nx,1);if(x+1<nx)relax(i,i+nx+1,Math.SQRT2);if(x)relax(i,i+nx-1,Math.SQRT2);}
  const skeleton=Uint8Array.from(labels,id=>id?1:0),foreground=[];
  for(let i=0;i<n;i++)if(labels[i])foreground.push(i);
  const directions=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
  // Zhang-Suen thinning preserves holes and connected letter strokes.
  for(let iteration=0;iteration<192;iteration++) {
    let removed=0;
    for(let pass=0;pass<2;pass++) {
      const erase=[];
      for(const i of foreground) {
        if(!skeleton[i])continue;
        const x=i%nx,y=Math.floor(i/nx);
        const p=directions.map(([ox,oy])=>x+ox>=0&&x+ox<nx&&y+oy>=0&&y+oy<ny&&skeleton[i+oy*nx+ox]&&labels[i+oy*nx+ox]===labels[i]?1:0),count=p.reduce((a,b)=>a+b,0);
        if(count<2||count>6)continue;
        let transitions=0;for(let k=0;k<8;k++)if(!p[k]&&p[(k+1)%8])transitions++;
        if(transitions!==1)continue;
        if(pass===0?(p[0]*p[2]*p[4]||p[2]*p[4]*p[6]):(p[0]*p[2]*p[6]||p[0]*p[4]*p[6]))continue;
        erase.push(i);
      }
      for(const i of erase)skeleton[i]=0;
      removed+=erase.length;
    }
    if(!removed)break;
  }
  const neighbours=i=>{
    const x=i%nx,y=Math.floor(i/nx),result=[];
    for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++) {
      if(!ox&&!oy||x+ox<0||x+ox>=nx||y+oy<0||y+oy>=ny)continue;
      const j=i+oy*nx+ox;
      if(!skeleton[j]||labels[j]!==labels[i])continue;
      if(ox&&oy&&(skeleton[i+ox]&&labels[i+ox]===labels[i]||skeleton[i+oy*nx]&&labels[i+oy*nx]===labels[i]))continue;
      result.push(j);
    }
    return result;
  };
  const graph=new Map();for(let i=0;i<n;i++)if(skeleton[i])graph.set(i,neighbours(i));
  const visited=new Set(),paths=[];
  const edgeKey=(a,b)=>Math.min(a,b)*n+Math.max(a,b);
  const walk=(start,next)=>{
    const path=[start];let previous=start,current=next;
    for(let guard=0;guard<n;guard++) {
      visited.add(edgeKey(previous,current));path.push(current);
      const choices=graph.get(current)||[];
      if(choices.length!==2||current===start)break;
      const following=choices.find(i=>i!==previous);
      if(visited.has(edgeKey(current,following)))break;
      previous=current;current=following;
    }
    if(path.length>1)paths.push(path);
  };
  for(const [i,adjacent]of graph)if(adjacent.length!==2)for(const j of adjacent)if(!visited.has(edgeKey(i,j)))walk(i,j);
  for(const [i,adjacent]of graph)for(const j of adjacent)if(!visited.has(edgeKey(i,j)))walk(i,j);
  const stitches=[],covered=new Uint8Array(n);
  const areaMm=occupied*dx*dy;
  const spacing=Math.max(STITCH_SPACING_MM,areaMm/(4*18000));
  const markSatin=(a,b,id)=>{
    const steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/Math.min(dx,dy));
    for(let s=0;s<=steps;s++) {
      const p=interpolate(a,b,s/Math.max(1,steps)),x=Math.floor(p[0]/dx),y=Math.floor(p[1]/dy);
      for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++) {
        if(x+ox<0||x+ox>=nx||y+oy<0||y+oy>=ny)continue;
        const i=(y+oy)*nx+x+ox;if(labels[i]===id)covered[i]=1;
      }
    }
  };
  const emit=(a,b,id,type)=>{
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<.18)return;
    const serial=stitches.length;
    stitches.push({a,b,region:id,type,color:regions[id-1].color,
      radius:THREAD_DIAMETER_MM/2*(.94+hash(serial)*.12),
      lift:type==='satin'?Math.min(.72,.26+length*.035):.18,
      variation:.94+hash(serial+19)*.10});
  };
  for(const path of paths) {
    const id=labels[path[0]],raw=path.map(i=>[(i%nx+.5)*dx,(Math.floor(i/nx)+.5)*dy]);
    // A medial axis stops halfway before a flat cap. Continue its tangent to
    // the actual contour so the top/bottom of an I stay satin too, instead of
    // acquiring unrelated diagonal fill patches at the ends.
    const extend=(point,previous,index)=>{
      const vx=point[0]-previous[0],vy=point[1]-previous[1],length=Math.hypot(vx,vy);
      if(length<.05||(graph.get(index)||[]).length!==1)return point;
      let last=0;const limit=Math.min(7,distance[index]*Math.min(dx,dy)*1.5+1);
      for(let d=.12;d<limit;d+=.12){if(at(point[0]+vx/length*d,point[1]+vy/length*d)!==id)break;last=d;}
      return [point[0]+vx/length*last,point[1]+vy/length*last];
    };
    const first=extend(raw[0],raw[Math.min(4,raw.length-1)],path[0]);
    const last=extend(raw.at(-1),raw[Math.max(0,raw.length-5)],path.at(-1));
    raw.unshift(first);raw.push(last);
    const points=raw.map((point,i)=>{
      if(i<2||i>=raw.length-2)return point;
      const avg=[0,0];let weight=0;
      for(let k=Math.max(0,i-2);k<=Math.min(raw.length-1,i+2);k++){const w=3-Math.abs(i-k);avg[0]+=raw[k][0]*w;avg[1]+=raw[k][1]*w;weight+=w;}
      avg[0]/=weight;avg[1]/=weight;return at(...avg)===id?avg:point;
    });
    const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
    const total=lengths.at(-1);if(total<.15)continue;
    const sample=s=>{
      s=Math.max(0,Math.min(total,s));let lo=0,hi=lengths.length-1;
      while(hi-lo>1){const mid=(lo+hi)>>1;if(lengths[mid]<s)lo=mid;else hi=mid;}
      return interpolate(points[lo],points[hi],(s-lengths[lo])/Math.max(.0001,lengths[hi]-lengths[lo]));
    };
    for(let s=Math.min(spacing*.35,total*.5);s<total;s+=spacing) {
      const center=sample(s);if(at(...center)!==id)continue;
      const before=sample(s-.8),after=sample(s+.8),tx=after[0]-before[0],ty=after[1]-before[1],tl=Math.hypot(tx,ty);
      if(tl<.05)continue;
      const normal=[-ty/tl,tx/tl];
      const ray=sign=>{
        let last=0;
        for(let d=.08;d<=14;d+=.08){if(at(center[0]+normal[0]*d*sign,center[1]+normal[1]*d*sign)!==id)break;last=d;}
        return [center[0]+normal[0]*last*sign,center[1]+normal[1]*last*sign];
      };
      const a=ray(-1),b=ray(1),length=Math.hypot(b[0]-a[0],b[1]-a[1]);
      if(length>.25&&length<=12){emit(a,b,id,'satin');markSatin(a,b,id);}
    }
  }
  // Remaining broad areas are short, staggered fill stitches. Colour shapes
  // have independent rows and no long thread is stretched across a big fill.
  for(const region of regions) {
    const angle=(32+(region.id%3)*8)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
    const corners=[[region.minX*dx,region.minY*dy],[(region.maxX+1)*dx,region.minY*dy],[(region.maxX+1)*dx,(region.maxY+1)*dy],[region.minX*dx,(region.maxY+1)*dy]];
    const us=corners.map(([x,y])=>x*c+y*s),vs=corners.map(([x,y])=>-x*s+y*c),umin=Math.min(...us),umax=Math.max(...us),vmin=Math.min(...vs),vmax=Math.max(...vs);
    let row=0;
    const finish=(from,to,v)=>{
      if(to-from<.18)return;
      let start=from,cut=Math.floor((from+(row%4)*TATAMI_LENGTH_MM/4)/TATAMI_LENGTH_MM)*TATAMI_LENGTH_MM-(row%4)*TATAMI_LENGTH_MM/4+TATAMI_LENGTH_MM;
      while(start<to-.18){const end=Math.min(to,cut);if(end>start+.18)emit([start*c-v*s,start*s+v*c],[end*c-v*s,end*s+v*c],region.id,'tatami');start=end;cut+=TATAMI_LENGTH_MM;}
    };
    for(let v=vmin+spacing*.5;v<=vmax;v+=spacing,row++) {
      let start=null,last=0;
      for(let u=umin;u<=umax+.2;u+=.18) {
        const x=u*c-v*s,y=u*s+v*c,id=at(x,y),i=Math.floor(y/dy)*nx+Math.floor(x/dx);
        const inside=id===region.id&&!covered[i];
        if(inside){if(start===null)start=u;last=u;}
        else if(start!==null){finish(start,last,v);start=null;}
      }
    }
  }
  return {stitches,widthMm,heightMm,spacing,threadDiameter:THREAD_DIAMETER_MM,
    analysis:{width:nx,height:ny,labels,distance,dx,dy}};
}

export function stitchLift(stitch,t) {
  return .06+stitch.lift*Math.pow(Math.max(0,Math.sin(Math.PI*t)),.72);
}
