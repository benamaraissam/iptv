type Child = Node | string | null | undefined | false;
type Props = Record<string, unknown> & {
  class?: string;
  on?: Partial<Record<keyof HTMLElementEventMap, (e: any) => void>>;
};

/** Mini-créateur d'éléments DOM (pas de framework : plus léger pour les TV). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props | null = null,
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const key in props) {
      const value = props[key];
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') el.className = String(value);
      else if (key === 'on') {
        const handlers = value as Record<string, (e: Event) => void>;
        for (const evt in handlers) el.addEventListener(evt, handlers[evt]);
      } else if (key === 'text') el.textContent = String(value);
      else if (key === 'style') el.setAttribute('style', String(value));
      else if (key in el && typeof value !== 'string') (el as any)[key] = value;
      else el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  append(el, children);
  return el;
}

export function append(el: Node, children: (Child | Child[])[]): void {
  for (const c of children) {
    if (Array.isArray(c)) append(el, c);
    else if (c === null || c === undefined || c === false) continue;
    else el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
}

export function clear(el: Node): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function detach(el: Node | null | undefined): void {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

export function qs<T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string): T | null {
  return root.querySelector<T>(sel);
}

let toastTimer: number | undefined;

export function toast(message: string, isError = false): void {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status' });
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = 'show' + (isError ? ' error' : '');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el!.className = '';
  }, 3500);
}

export function setLoading(on: boolean, label = ''): void {
  let el = document.getElementById('loading');
  if (!el) {
    el = h('div', { id: 'loading' }, h('div', { class: 'spinner' }), h('p'));
    document.body.appendChild(el);
  }
  el.querySelector('p')!.textContent = label;
  el.className = on ? 'show' : '';
}

/** Ajoute les éléments par paquets quand on approche du bas (listes de milliers d'entrées). */
export function pagedList<T>(
  scroller: HTMLElement,
  container: HTMLElement,
  items: T[],
  render: (item: T, index: number) => HTMLElement,
  pageSize = 60,
): { renderUntil(index: number): void; count(): number } {
  let rendered = 0;
  const more = () => {
    const end = Math.min(rendered + pageSize, items.length);
    const frag = document.createDocumentFragment();
    for (let i = rendered; i < end; i++) frag.appendChild(render(items[i], i));
    container.appendChild(frag);
    rendered = end;
  };
  const check = () => {
    if (rendered < items.length && scroller.scrollTop + scroller.clientHeight > scroller.scrollHeight - 800) more();
  };
  scroller.addEventListener('scroll', check);
  container.addEventListener('focusin', check);
  more();
  return {
    renderUntil(index: number) {
      while (rendered <= index && rendered < items.length) more();
    },
    count: () => rendered,
  };
}
