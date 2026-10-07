import {embroideryTransferables} from './embroidery-job.mjs?v=1.2.11';

const aborted=()=>Object.assign(new Error('자수 미리보기 작업을 바꿨어요.'),{name:'AbortError'});

// One reusable worker per editor. New pose/size requests cancel obsolete work
// rather than building every intermediate slider value on the UI thread.
export class EmbroideryProcessor {
  constructor({workerFactory=()=>new Worker(new URL('./embroidery-worker.mjs?v=1.2.11',import.meta.url),{type:'module'})}={}) {
    this.workerFactory=workerFactory;this.queue=[];this.serial=0;this.disposed=false;
  }
  run(job,{signal}={}) {
    if(this.disposed||signal?.aborted)return Promise.reject(aborted());
    return new Promise((resolve,reject)=>{
      const task={id:++this.serial,job,resolve,reject,signal};
      task.abort=()=>{
        const index=this.queue.indexOf(task);if(index>=0)this.queue.splice(index,1);
        if(this.active===task){this.worker?.terminate();this.worker=null;this.active=null;}
        task.signal?.removeEventListener('abort',task.abort);reject(aborted());this._next();
      };
      signal?.addEventListener('abort',task.abort,{once:true});this.queue.push(task);this._next();
    });
  }
  _next() {
    if(this.disposed||this.active||!this.queue.length)return;
    const task=this.active=this.queue.shift();
    try {
      if(!this.worker) {
        this.worker=this.workerFactory();
        this.worker.onmessage=({data})=>{
          if(this.active?.id!==data.id)return;
          const current=this.active;this.active=null;current.signal?.removeEventListener('abort',current.abort);
          if(data.error)current.reject(new Error(data.error));else current.resolve({...data.result,elapsedMs:data.elapsedMs});
          this._next();
        };
        this.worker.onerror=()=>{
          const current=this.active;this.active=null;this.worker?.terminate();this.worker=null;
          if(current){current.signal?.removeEventListener('abort',current.abort);current.reject(new Error('자수 작업을 시작하지 못했어요.'));}
          this._next();
        };
      }
      // Geometry-only requests must retain the cached stitch plan on the UI
      // side. Image preparation can transfer its disposable input pixels.
      this.worker.postMessage({id:task.id,job:task.job},task.job.source?embroideryTransferables(task.job.source):[]);
    } catch(error) {
      this.active=null;task.signal?.removeEventListener('abort',task.abort);task.reject(error);
      this.worker?.terminate();this.worker=null;this._next();
    }
  }
  dispose() {
    this.disposed=true;this.worker?.terminate();this.worker=null;
    for(const task of [this.active,...this.queue].filter(Boolean)) {
      task.signal?.removeEventListener('abort',task.abort);task.reject(aborted());
    }
    this.active=null;this.queue=[];
  }
}
