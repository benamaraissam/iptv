/**
 * Navigation spatiale pour télécommande (flèches + OK).
 * Tout élément visible portant la classe `focusable` est atteignable ;
 * on choisit le voisin le plus proche dans la direction demandée.
 */
export type Direction = 'up' | 'down' | 'left' | 'right';

let root: HTMLElement = document.body;

/** Limite la navigation à un conteneur (modale ouverte, par exemple). */
export function setNavRoot(el: HTMLElement | null): void {
  root = el || document.body;
}

export function getNavRoot(): HTMLElement {
  return root;
}

function visible(el: HTMLElement): boolean {
  if ((el as HTMLButtonElement).disabled) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  // Hors de l'écran horizontalement ET verticalement dans un conteneur caché : on garde,
  // les rails défilants doivent rester atteignables.
  return true;
}

/**
 * Candidats à la navigation. Sans conteneur imposé (modale…), on se limite à l'écran
 * actif et au menu latéral : les écrans empilés en dessous restent dans le DOM et
 * mesurer leurs centaines d'éléments à chaque appui ralentissait les box TV.
 */
export function focusables(scope: HTMLElement = root): HTMLElement[] {
  const out: HTMLElement[] = [];
  const collect = (el: Element | null) => {
    if (!el) return;
    const nodes = el.querySelectorAll<HTMLElement>('.focusable');
    for (let i = 0; i < nodes.length; i++) if (visible(nodes[i])) out.push(nodes[i]);
  };
  if (scope === document.body) {
    const active = document.querySelector('.screen.active');
    if (active) {
      collect(document.querySelector('.sidenav'));
      collect(document.querySelector('.tabbar'));
      collect(active);
      return out;
    }
  }
  collect(scope);
  return out;
}

/** Rangées horizontales : ◀ ▶ vont au voisin dans l'ordre du DOM, sans rien mesurer. */
const ROW_SELECTOR = '.rail-track, .chips, .pl-cats, .lib-tabs, .scope-switch, .pl-menu-list, .detail-actions, .detail-versions';

function rowNeighbour(current: HTMLElement, dir: Direction): HTMLElement | null | undefined {
  const row = current.closest<HTMLElement>(ROW_SELECTOR);
  if (!row) return undefined;
  const vertical = dir === 'up' || dir === 'down';
  // Listes verticales (catégories du lecteur, menu) : ▲ ▼ ; rangées : ◀ ▶.
  const isColumn = row.classList.contains('pl-cats') || row.classList.contains('pl-menu-list');
  if (vertical !== isColumn) return undefined;
  const items = row.querySelectorAll<HTMLElement>('.focusable');
  let idx = -1;
  for (let i = 0; i < items.length; i++) if (items[i] === current) idx = i;
  if (idx < 0) return undefined;
  const step = dir === 'right' || dir === 'down' ? 1 : -1;
  for (let i = idx + step; i >= 0 && i < items.length; i += step) if (visible(items[i])) return items[i];
  // Bout de rangée : dans une rangée horizontale on s'arrête là (pas de saut ailleurs) ;
  // dans une colonne on laisse la navigation géométrique sortir de la liste.
  return isColumn ? undefined : null;
}

export function focusEl(el: HTMLElement | null | undefined): boolean {
  if (!el) return false;
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
  revealEl(el);
  return true;
}

/** Fait défiler chaque conteneur parent pour montrer l'élément (sans scrollIntoView options). */
export function revealEl(el: HTMLElement): void {
  const margin = 32;
  let p = el.parentElement;
  while (p && p !== document.body) {
    const cs = getComputedStyle(p);
    const r = el.getBoundingClientRect();
    const c = p.getBoundingClientRect();
    if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && p.scrollHeight > p.clientHeight) {
      if (r.top < c.top + margin) p.scrollTop -= c.top + margin - r.top;
      else if (r.bottom > c.bottom - margin) p.scrollTop += r.bottom - (c.bottom - margin);
    }
    if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && p.scrollWidth > p.clientWidth) {
      if (r.left < c.left + margin) p.scrollLeft -= c.left + margin - r.left;
      else if (r.right > c.right - margin) p.scrollLeft += r.right - (c.right - margin);
    }
    p = p.parentElement;
  }
}

/** Donne le focus à `[data-autofocus]`, sinon au premier focusable. */
export function focusFirst(scope: HTMLElement = root): boolean {
  const auto = scope.querySelector<HTMLElement>('[data-autofocus]');
  if (auto && visible(auto)) return focusEl(auto);
  return focusEl(focusables(scope)[0]);
}

export function move(dir: Direction, scope: HTMLElement = root): boolean {
  const current = document.activeElement as HTMLElement | null;
  if (current && current.classList.contains('focusable')) {
    const n = rowNeighbour(current, dir);
    if (n) return focusEl(n);
    if (n === null && (dir === 'left' || dir === 'right')) return false;
  }
  const items = focusables(scope);
  if (!current || items.indexOf(current) === -1) return focusEl(items[0]);

  const from = current.getBoundingClientRect();
  const fx = from.left + from.width / 2;
  const fy = from.top + from.height / 2;

  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of items) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let primary: number;
    let secondary: number;
    switch (dir) {
      case 'left':
        if (cx >= fx - 1 || r.left >= from.left) continue;
        primary = from.left - r.right;
        secondary = overlap(from.top, from.bottom, r.top, r.bottom) ? 0 : Math.abs(cy - fy);
        break;
      case 'right':
        if (cx <= fx + 1 || r.right <= from.right) continue;
        primary = r.left - from.right;
        secondary = overlap(from.top, from.bottom, r.top, r.bottom) ? 0 : Math.abs(cy - fy);
        break;
      case 'up':
        if (cy >= fy - 1 || r.top >= from.top) continue;
        primary = from.top - r.bottom;
        secondary = overlap(from.left, from.right, r.left, r.right) ? Math.abs(r.left - from.left) / 4 : Math.abs(cx - fx);
        break;
      default:
        if (cy <= fy + 1 || r.bottom <= from.bottom) continue;
        primary = r.top - from.bottom;
        secondary = overlap(from.left, from.right, r.left, r.right) ? Math.abs(r.left - from.left) / 4 : Math.abs(cx - fx);
    }
    const score = Math.max(primary, 0) + secondary * 2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return focusEl(best);
}

function overlap(a1: number, a2: number, b1: number, b2: number): boolean {
  return Math.min(a2, b2) - Math.max(a1, b1) > 4;
}
