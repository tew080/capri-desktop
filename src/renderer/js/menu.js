// Her themed right-click menu, drawn inside her own overlay window.
// It used to be a second, full-screen BrowserWindow: opening and closing it took the mouse hook of her
// click-through window with it (left press lost, she couldn't be clicked or dragged). Here there is no
// second window: main only hands over the tray menu's items (host.menuItems) and runs the picked one
// (host.menuAction). While it is open the overlay is kept clickable by app.js (menu.open).

export class ThemedMenu {
  constructor({ host, root = document.getElementById('cmenu') }) {
    this.host = host;
    this.root = root;
    this.open = false;
    this.onChange = null; // (open) => void: app.js keeps her window clickable while it's open
    this.panels = new Map(); // item id -> its flyout element
    root.addEventListener('mousedown', (e) => {
      if (e.target === root || e.target.classList.contains('cm__stage')) this.close();
    });
    root.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (e.target === root || e.target.classList.contains('cm__stage')) this.close();
    });
    window.addEventListener('keydown', (e) => {
      if (this.open && e.key === 'Escape') this.close();
    });
  }

  async show() {
    if (this.open) return this.close();
    let items = [];
    try {
      items = await this.host.menuItems();
    } catch {
      return;
    }
    if (!items?.length) return;
    this.build(items);
    this.root.hidden = false;
    this.open = true;
    this.onChange?.(true);
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.root.hidden = true;
    this.root.replaceChildren();
    this.panels.clear();
    this.onChange?.(false);
  }

  // ---------- drawing ----------

  build(items) {
    const stage = el('div', 'cm__stage');
    const rootPanel = el('div', 'cm__panel cm__panel--root');
    const hdr = el('div', 'cm__hdr');
    hdr.textContent = 'CAPRI · MENU';
    rootPanel.append(hdr);
    this.fill(rootPanel, items);
    stage.append(rootPanel);
    this.stage = stage;
    this.root.replaceChildren(stage);
  }

  fill(panelEl, items) {
    for (const it of items) {
      if (it.visible === false) continue;
      if (it.type === 'separator') {
        panelEl.append(el('div', 'cm__sep'));
        continue;
      }
      const hasSub = Boolean(it.children?.length);
      const checkable = it.type === 'checkbox' || it.type === 'radio';
      const row = el('div', 'cm__item');
      if (it.enabled === false) row.classList.add('is-disabled');
      if (it.checked) row.classList.add('is-on');
      const mark = el('span', `cm__mark${hasSub && !checkable ? ' cm__mark--arrow' : ''}`);
      mark.textContent = checkable ? (it.checked ? '✓' : '') : (hasSub ? '›' : '');
      const label = el('span', 'cm__lab');
      label.textContent = it.label || '';
      row.append(mark, label);
      row.addEventListener('mouseenter', () => this.hover(row, panelEl, it, hasSub));
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        if (it.enabled === false) return;
        if (hasSub) return this.hover(row, panelEl, it, true);
        const id = it.id;
        this.close();
        this.host.menuAction(id);
      });
      panelEl.append(row);
    }
  }

  hover(row, panelEl, it, hasSub) {
    if (row.classList.contains('is-disabled')) return;
    // close the flyouts of the rows beside this one (and the ones deeper than it)
    panelEl.querySelectorAll(':scope > .cm__item.is-open').forEach((o) => {
      if (o !== row) o.classList.remove('is-open');
    });
    for (const [id, p] of this.panels) {
      if (p === panelEl || id === it.id) continue;
      if (id.startsWith(`${it.id}.`)) continue;
      if (it.id.startsWith(`${id}.`)) continue; // an ancestor's flyout stays
      p.classList.remove('is-shown');
    }
    if (!hasSub) return;
    row.classList.add('is-open');
    let sub = this.panels.get(it.id);
    if (!sub) {
      sub = el('div', 'cm__panel cm__panel--fly');
      this.fill(sub, it.children);
      this.stage.append(sub);
      this.panels.set(it.id, sub);
    }
    this.place(row, sub);
  }

  place(anchor, sub) {
    const r = anchor.getBoundingClientRect();
    sub.classList.add('is-shown');
    const w = sub.offsetWidth || 260;
    const h = sub.offsetHeight || 120;
    let left = r.right + 6;
    let top = r.top;
    if (left + w > window.innerWidth - 8) left = Math.max(8, r.left - w - 6);
    if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
    if (top < 8) top = 8;
    sub.style.left = `${left}px`;
    sub.style.top = `${top}px`;
  }
}

function el(tag, cls) {
  const node = document.createElement(tag);
  node.className = cls;
  return node;
}
