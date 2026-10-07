const CATEGORIES = [['ecobag', '에코백'], ['pouch', '파우치'], ['poly', '폴리백']];

function node(tag, className, text) {
  const value = document.createElement(tag);
  if (className) value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

function button(text, className = 'p3d-button') {
  const value = node('button', className, text);
  value.type = 'button';
  return value;
}

export function openProductPicker({ host, editorDialog, choices, selected, onSelect, onClose }) {
  const previousFocus = document.activeElement;
  const previousInert = editorDialog.inert;
  editorDialog.inert = true;
  const controller = new AbortController();
  const signal = controller.signal;
  const root = node('div', 'p3d-picker-overlay');
  const dialog = node('section', 'p3d-picker-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', '가방 선택');
  const header = node('header', 'p3d-picker-header');
  const heading = node('div');
  heading.append(node('h2', '', '어떤 가방을 꾸밀까요?'), node('p', '', '사진을 고르면 3D로 바로 바뀌어요. 작업 중인 시안은 가방별로 유지돼요.'));
  const closeButton = button('닫기', 'p3d-button p3d-close');
  closeButton.setAttribute('aria-label', '가방 선택창 닫기');
  header.append(heading, closeButton);
  const tabs = node('div', 'p3d-picker-tabs');
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', '가방 종류');
  const grid = node('div', 'p3d-picker-grid');
  grid.setAttribute('aria-label', '선택할 가방');
  let category = choices.find(choice => choice.id === selected)?.category || 'ecobag';
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    controller.abort();
    root.remove();
    editorDialog.inert = previousInert;
    if (previousFocus?.isConnected) previousFocus.focus();
    onClose?.();
  };
  const render = () => {
    grid.replaceChildren();
    for (const tab of tabs.children) tab.setAttribute('aria-pressed', String(tab.dataset.category === category));
    for (const choice of choices.filter(choice => choice.category === category)) {
      const card = button('', 'p3d-picker-card');
      card.dataset.product = choice.id;
      card.setAttribute('aria-label', `${choice.name} ${choice.size}`.trim());
      card.setAttribute('aria-pressed', String(choice.id === selected));
      const picture = node('span', 'p3d-picker-picture');
      for (const src of [choice.handleImage, choice.bodyImage].filter(Boolean)) {
        const image = node('img');
        image.src = src;
        image.alt = '';
        image.loading = 'lazy';
        picture.append(image);
      }
      card.append(picture, node('span', 'p3d-picker-name', choice.name), node('span', 'p3d-picker-size', choice.size));
      if (choice.id === selected) card.append(node('span', 'p3d-picker-current', '현재 가방'));
      grid.append(card);
    }
    grid.scrollTop = 0;
  };
  for (const [id, label] of CATEGORIES) {
    const tab = button(label, 'p3d-button p3d-picker-tab');
    tab.dataset.category = id;
    tab.addEventListener('click', () => { category = id; render(); }, { signal });
    tabs.append(tab);
  }
  grid.addEventListener('click', event => {
    const card = event.target.closest('[data-product]');
    if (!card || !grid.contains(card)) return;
    const id = card.dataset.product;
    close();
    if (id !== selected) onSelect(id);
  }, { signal });
  closeButton.addEventListener('click', close, { signal });
  root.addEventListener('click', event => { if (event.target === root) close(); }, { signal });
  root.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab') {
      const focusable = [...dialog.querySelectorAll('button:not(:disabled)')];
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }, { signal });
  dialog.append(header, tabs, grid);
  root.append(dialog);
  host.append(root);
  render();
  closeButton.focus();
  return { close };
}
