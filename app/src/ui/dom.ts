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
      else if (key in el && typeof value !== 'string') (el as any)[key] = value;
      else el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  appendChildren(el, children);
  return el;
}

function appendChildren(el: HTMLElement, children: (Child | Child[])[]): void {
  for (const c of children) {
    if (Array.isArray(c)) appendChildren(el, c);
    else if (c === null || c === undefined || c === false) continue;
    else el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
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

export function setLoading(on: boolean, label = 'Chargement…'): void {
  let el = document.getElementById('loading');
  if (!el) {
    el = h('div', { id: 'loading' }, h('div', { class: 'spinner' }), h('p'));
    document.body.appendChild(el);
  }
  el.querySelector('p')!.textContent = label;
  el.className = on ? 'show' : '';
}
