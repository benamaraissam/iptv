/**
 * Navigation spatiale pour télécommande (flèches + OK).
 * Tout élément portant la classe `focusable` est atteignable ; on choisit
 * le voisin le plus proche dans la direction demandée.
 */
export type Direction = 'up' | 'down' | 'left' | 'right';

let root: HTMLElement = document.body;

/** Limite la navigation à un conteneur (écran courant ou modale). */
export function setNavRoot(el: HTMLElement): void {
  root = el;
}

function visible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && !(el as HTMLButtonElement).disabled;
}

export function focusables(scope: HTMLElement = root): HTMLElement[] {
  const nodes = scope.querySelectorAll<HTMLElement>('.focusable');
  const out: HTMLElement[] = [];
  for (let i = 0; i < nodes.length; i++) if (visible(nodes[i])) out.push(nodes[i]);
  return out;
}

export function focusEl(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.focus({ preventScroll: true });
  // scrollIntoView avec options n'existe pas sur les vieux Chromium des TV.
  const container = scrollParent(el);
  if (container) {
    const r = el.getBoundingClientRect();
    const c = container.getBoundingClientRect();
    const margin = 24;
    if (r.top < c.top + margin) container.scrollTop -= c.top + margin - r.top;
    else if (r.bottom > c.bottom - margin) container.scrollTop += r.bottom - (c.bottom - margin);
  }
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  let p = el.parentElement;
  while (p && p !== document.body) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
    p = p.parentElement;
  }
  return null;
}

/** Donne le focus au premier élément `[data-autofocus]`, sinon au premier focusable. */
export function focusFirst(scope: HTMLElement = root): void {
  const auto = scope.querySelector<HTMLElement>('[data-autofocus]');
  if (auto && visible(auto)) return focusEl(auto);
  focusEl(focusables(scope)[0]);
}

export function move(dir: Direction): boolean {
  const current = document.activeElement as HTMLElement | null;
  const items = focusables();
  if (!current || items.indexOf(current) === -1) {
    focusEl(items[0]);
    return true;
  }

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
        primary = from.left - r.right;
        secondary = Math.abs(cy - fy);
        if (cx >= fx) continue;
        break;
      case 'right':
        primary = r.left - from.right;
        secondary = Math.abs(cy - fy);
        if (cx <= fx) continue;
        break;
      case 'up':
        primary = from.top - r.bottom;
        secondary = Math.abs(cx - fx);
        if (cy >= fy) continue;
        break;
      default:
        primary = r.top - from.bottom;
        secondary = Math.abs(cx - fx);
        if (cy <= fy) continue;
    }
    const score = Math.max(primary, 0) + secondary * 2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (best) {
    focusEl(best);
    return true;
  }
  return false;
}
