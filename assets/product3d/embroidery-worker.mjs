import {computeEmbroideryJob,embroideryTransferables} from './embroidery-job.mjs';

self.onmessage=({data:{id,job}})=>{
  try {
    const started=performance.now(),result=computeEmbroideryJob(job);
    self.postMessage({id,result,elapsedMs:performance.now()-started},embroideryTransferables(result));
  } catch(error) {self.postMessage({id,error:error.message||'자수 미리보기를 만들지 못했어요.'});}
};
