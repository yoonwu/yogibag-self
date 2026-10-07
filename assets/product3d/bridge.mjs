import { configFrom2D, snapshotFrom3D, isSharedProduct } from './sync.mjs';

// Each product owns its editor and reversible 2D token. Switching products
// cannot reuse another bag's artwork, inner-pocket frame or custom structure.
export function createProductBridge(env) {
  let loading;
  let opening = false;
  let switching = false;
  const sessions = new Map();
  const linkedEditors = new Map();
  const standaloneEditors = new Map();
  const standaloneConfigs = new Map();

  function releaseOtherEditors(productId, linked) {
    for (const [id, editor] of linkedEditors) {
      if (linked && id === productId) continue;
      const session = sessions.get(id);
      if (session && editor.getConfig) session.config = editor.getConfig();
      editor.dispose();
      linkedEditors.delete(id);
    }
    for (const [id, editor] of standaloneEditors) {
      if (!linked && id === productId) continue;
      if (editor.getConfig) standaloneConfigs.set(id, editor.getConfig());
      editor.dispose();
      standaloneEditors.delete(id);
    }
  }

  async function returnTo2D(productId, config, { updateURL = true } = {}) {
    const session = sessions.get(productId);
    const legacy = env.legacy();
    if (!session || !legacy) throw new Error('2D 에디터를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    if (config.productId !== productId || env.currentProductId() !== productId) throw new Error('이 시안과 현재 가방이 다릅니다.');
    const snapshot = snapshotFrom3D(config, session.snapshot);
    const side = linkedEditors.get(productId)?.getPrintSide?.();
    if (side === 'front' || side === 'back') snapshot.currentSide = side === 'back' && snapshot.twoSided ? 'back' : 'front';
    await legacy.applyDesign(snapshot);
    const updated = await legacy.exportDesign();
    if (updated.productId !== productId) throw new Error('가방이 바뀌었습니다. 다시 열어 주세요.');
    sessions.set(productId, { snapshot: updated, config: structuredClone(config) });
    if (updateURL) env.show2DURL?.(productId);
  }

  async function switchProduct(sourceId, productId) {
    if (opening || switching) return false;
    if (sourceId === productId) return true;
    const source = linkedEditors.get(sourceId) || standaloneEditors.get(sourceId);
    if (!source || source.disposed) throw new Error('현재 가방을 다시 열어 주세요.');
    switching = true;
    const previousProduct = env.currentProductId();
    let previousSnapshot;
    try {
      loading ||= env.load();
      const [, , { Product3DCatalog }] = await loading;
      if (!Product3DCatalog.has(productId)) throw new Error('선택한 가방의 3D 시안은 아직 준비 중입니다.');
      if (linkedEditors.has(sourceId)) await returnTo2D(sourceId, source.getConfig(), { updateURL: false });
      const legacy = env.legacy();
      if (isSharedProduct(productId) && legacy && previousProduct !== productId) {
        if (!env.selectProduct) throw new Error('가방 선택을 준비하지 못했어요. 다시 열어 주세요.');
        previousSnapshot = linkedEditors.has(sourceId) ? sessions.get(previousProduct).snapshot : await legacy.exportDesign();
        if (sessions.has(previousProduct)) sessions.get(previousProduct).snapshot = previousSnapshot;
        await env.selectProduct(productId);
        if (env.currentProductId() !== productId) throw new Error('선택한 가방을 불러오지 못했어요.');
        const saved = sessions.get(productId);
        if (saved) await legacy.applyDesign(saved.snapshot, { restoreProductDraft: true });
      }
      if (!await openProduct(productId)) throw new Error('선택한 가방을 불러오지 못했어요.');
      return true;
    } catch (error) {
      if (previousSnapshot && env.currentProductId() !== previousProduct) {
        await env.selectProduct(previousProduct);
        await env.legacy().applyDesign(previousSnapshot, { restoreProductDraft: true });
      }
      if (source.disposed) await openProduct(sourceId);
      else source.updateProductURL?.();
      throw error;
    } finally { switching = false; }
  }

  async function openProduct(productId, { from2D = false } = {}) {
    if (opening) return false;
    opening = true;
    env.setOpening?.(true);
    try {
      loading ||= env.load();
      const [{ createProduct3DEditor }, { openConsultation }, { configForProduct, Product3DCatalog }] = await loading;
      if (!Product3DCatalog.has(productId)) throw new Error('선택한 가방의 3D 시안은 아직 준비 중입니다.');
      await env.ready?.();
      const legacy = env.legacy();
      const linked = isSharedProduct(productId) && legacy && env.currentProductId() === productId;
      if (from2D && !linked) throw new Error('현재 선택한 가방에서 3D 보기를 다시 열어 주세요.');
      if (linked) {
        const snapshot = await legacy.exportDesign();
        if (snapshot.productId !== productId) throw new Error('가방이 바뀌었습니다. 다시 열어 주세요.');
        const config = configFrom2D(snapshot, sessions.get(productId)?.config);
        sessions.set(productId, { snapshot, config });
        releaseOtherEditors(productId, true);
        let editor = linkedEditors.get(productId);
        if (!editor) {
          editor = createProduct3DEditor({
            initialConfig: config, onConsult: openConsultation,
            productChoices: env.productChoices?.(), onSelectProduct: next => switchProduct(productId, next),
            onReturnTo2D: next => returnTo2D(productId, next),
            onDesignChange: next => {
              const session = sessions.get(productId);
              if (session && next.productId === productId) session.config = structuredClone(next);
            },
          });
          linkedEditors.set(productId, editor);
        }
        await editor.replaceConfig(config);
        editor.open();
        editor.selectPrintSide?.(snapshot.currentSide === 'back' && snapshot.twoSided ? 'back' : 'front');
      } else {
        releaseOtherEditors(productId, false);
        let editor = standaloneEditors.get(productId);
        if (!editor) {
          editor = createProduct3DEditor({ onConsult: openConsultation,
            productChoices: env.productChoices?.(), onSelectProduct: next => switchProduct(productId, next),
            onClose: () => env.show2DURL?.(env.currentProductId()),
            initialConfig: standaloneConfigs.get(productId) || configForProduct(productId) });
          standaloneEditors.set(productId, editor);
        }
        editor.openProduct(productId);
      }
      return true;
    } catch (error) {
      loading = null;
      env.toast?.(error.message || '3D 시안을 열지 못했습니다. 다시 시도해 주세요.');
      env.onError?.(error);
      return false;
    } finally {
      opening = false;
      env.setOpening?.(false);
    }
  }
  return Object.freeze({ openProduct, switchProduct });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const releaseQuery = new URL(import.meta.url).search;
  const bridge = createProductBridge({
    load: () => Promise.all([import(`./editor.mjs${releaseQuery}`), import(`./consultation.mjs${releaseQuery}`), import('./registry.mjs')]),
    legacy: () => window.yogibagDesignBridge,
    currentProductId: () => window.getYogibagCurrentBag?.()?.id,
    selectProduct: id => window.selectYogibagBagFor3D(id),
    productChoices: () => window.getYogibagBagChoices?.(),
    ready: () => document.readyState === 'complete' ? Promise.resolve()
      : new Promise(resolve => window.addEventListener('load', resolve, { once: true })),
    toast: message => window.showToast?.(message),
    onError: error => console.error('2D / 3D editor:', error),
    setOpening: busy => {
      for (const id of ['product3dLaunch', 'product3dCanvasToggle']) {
        const control = document.getElementById(id);
        if (!control) continue;
        control.setAttribute('aria-busy', String(busy));
        control.disabled = busy || control.dataset.p3dUnavailable === 'true';
      }
    },
    show2DURL: productId => {
      const url = new URL(location.href);
      url.searchParams.delete('mode');
      url.searchParams.delete('product');
      url.searchParams.set('bag', productId);
      history.replaceState(history.state, '', url);
    },
  });
  for (const id of ['product3dLaunch', 'product3dCanvasToggle']) {
    document.getElementById(id)?.addEventListener('click', () => bridge.openProduct(window.getYogibagCurrentBag?.()?.id, { from2D: true }));
  }
  document.getElementById('bagGrid')?.addEventListener('click', async event => {
    const card = event.target.closest('[data-p3d-select-product]');
    if (!card) return;
    const selector = document.getElementById('bagModal');
    selector?.classList.remove('show');
    document.getElementById('currentBagBtn')?.focus();
    if (!await bridge.openProduct(card.dataset.p3dSelectProduct)) {
      selector?.classList.add('show');
      card.focus();
    }
  });
  const params = new URLSearchParams(location.search);
  if (params.get('mode') === '3d') bridge.openProduct(params.get('product') || params.get('bag') || 'sample-two-line-large');
}
