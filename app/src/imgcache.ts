/**
 * Images cassées : beaucoup de playlists indiquent une affiche ou un logo dont le lien
 * ne répond plus. On mémorise ces liens (y compris entre deux sessions) pour que les
 * éléments sans image réellement affichable passent après les autres.
 */
const KEY = 'sp.badimg';
const MAX = 4000;

/** Lien → date de l'échec. Un échec expire au bout de quelques jours (le serveur peut revenir). */
let bad: Record<string, number> = {};
const EXPIRY = 3 * 86400000;
try {
  bad = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
} catch {
  bad = {};
}

let saveTimer: number | undefined;

function isBad(url: string): boolean {
  const at = bad[url];
  return !!at && Date.now() - (at > 1 ? at : 0) < EXPIRY;
}

export function markBadImage(url?: string): void {
  if (!url || isBad(url)) return;
  bad[url] = Date.now();
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
  return !!url && !isBad(url);
}

/** Oublie les images marquées comme cassées (Paramètres › Revérifier les images). */
export function clearBadImages(): void {
  bad = {};
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Affiches retrouvées via la fiche détaillée (quand le lien du catalogue est vide ou cassé),
 * mémorisées entre deux sessions : id du film / de la série → lien de l'image.
 */
const PKEY = 'sp.posters';
let posters: Record<string, string> = {};
try {
  posters = JSON.parse(localStorage.getItem(PKEY) || '{}') || {};
} catch {
  posters = {};
}
let posterTimer: number | undefined;

export function rememberPoster(id: string, url: string): void {
  if (posters[id] === url) return;
  posters[id] = url;
  window.clearTimeout(posterTimer);
  posterTimer = window.setTimeout(() => {
    try {
      const keys = Object.keys(posters);
      if (keys.length > MAX) for (const k of keys.slice(0, keys.length - MAX)) delete posters[k];
      localStorage.setItem(PKEY, JSON.stringify(posters));
    } catch {
      /* ignore */
    }
  }, 800);
}

export function knownPoster(id: string): string | undefined {
  const u = posters[id];
  return u && !isBad(u) ? u : undefined;
}
