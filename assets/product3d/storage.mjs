const DATABASE = 'yogibag-product3d';
const STORE = 'designs';
const CURRENT_DESIGN = 'current';

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('이 브라우저에서는 시안을 저장할 수 없어요. 시안 파일을 내려받아 주세요.'));
      return;
    }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('저장 공간을 열지 못했어요.'));
    request.onblocked = () => reject(new Error('다른 창을 닫고 다시 저장해 주세요.'));
  });
}

export async function saveLocalConfig(serializedConfig, productId) {
  const database = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      const record = { serializedConfig, savedAt: new Date().toISOString() };
      store.put(record, CURRENT_DESIGN);
      if (productId) store.put(record, `product:${productId}`);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('시안을 저장하지 못했어요.'));
      transaction.onabort = () => reject(transaction.error || new Error('시안 저장이 중단되었어요.'));
    });
  } finally {
    database.close();
  }
}

export async function loadLocalConfig(productId) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readonly');
      const store = transaction.objectStore(STORE);
      const request = store.get(productId ? `product:${productId}` : CURRENT_DESIGN);
      request.onsuccess = () => {
        if (request.result || !productId) {
          resolve(request.result?.serializedConfig ?? null);
          return;
        }
        // Recover the original single saved design only for its own product.
        const legacy = store.get(CURRENT_DESIGN);
        legacy.onsuccess = () => {
          const serialized = legacy.result?.serializedConfig;
          try {
            resolve(serialized && JSON.parse(serialized).productId === productId ? serialized : null);
          } catch {
            resolve(null);
          }
        };
        legacy.onerror = () => reject(legacy.error || new Error('저장한 시안을 불러오지 못했어요.'));
      };
      request.onerror = () => reject(request.error || new Error('저장한 시안을 불러오지 못했어요.'));
      transaction.onabort = () => reject(transaction.error || new Error('시안 불러오기가 중단되었어요.'));
    });
  } finally {
    database.close();
  }
}
