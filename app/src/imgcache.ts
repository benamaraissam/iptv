/**
 * Images cassées : beaucoup de playlists indiquent une affiche ou un logo dont le lien
 * ne répond plus. On mémorise ces liens (y compris entre deux sessions) pour que les
 * éléments sans image réellement affichable passent après les autres.
 */
const KEY = 'sp.badimg';
const MAX = 4000;

let bad: Record<string, 1> = {};
try {
  bad = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
} catch {
  bad = {};
}

let saveTimer: number | undefined;

export function markBadImage(url?: string): void {
  if (!url || bad[url]) return;
  bad[url] = 1;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      const keys = Object.keys(bad);
      if (keys.length > MAX) for (const k of keys.slice(0, keys.length - MAX)) delete bad[k];
      localStorage.setItem(KEY, JSON.stringify(bad));
    } catch {
      /* stockage plein : on garde en mémoire */
    }
  }, 800);
}

/** Vrai si l'élément a un lien d'image qui n'est pas connu comme cassé. */
export function hasGoodImage(url?: string | null): boolean {
  return !!url && !bad[url];
}
