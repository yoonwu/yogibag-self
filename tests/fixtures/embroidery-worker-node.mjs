import {parentPort} from 'node:worker_threads';
globalThis.self={postMessage:(data,transfer)=>parentPort.postMessage(data,transfer)};
await import('../../assets/product3d/embroidery-worker.mjs');
parentPort.on('message',data=>self.onmessage({data}));
