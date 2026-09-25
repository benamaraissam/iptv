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

/**
 * Réputation des hébergeurs d'images : les fournisseurs IPTV servent souvent leurs affiches
 * depuis des serveurs à IP brute lents ou en panne. Après plusieurs échecs sur un même hôte,
 * on n'attend plus ses images : on passe directement à l'image de secours (fiche / TMDB).
 */
const HOST_LIMIT = 4;
const hostFails: Record<string, number> = {};

function hostOf(url: string): string {
  const m = /^[a-z]+:\/\/([^/]+)/i.exec(url);
  return m ? m[1].toLowerCase() : '';
}

export function hostLooksDown(url: string): boolean {
  return (hostFails[hostOf(url)] || 0) >= HOST_LIMIT;
}

/**
 * Certains hébergeurs refusent les navigateurs mais servent VLC : en développement,
 * le proxy s'identifie comme VLC. On apprend, hôte par hôte, si ce détour fonctionne.
 * 'ok' : utiliser le proxy directement ; 'no' : inutile d'insister.
 */
const proxyState: Record<string, 'ok' | 'no'> = {};
const proxyFails: Record<string, number> = {};

export function hostProxyState(url: string): 'ok' | 'no' | undefined {
  return proxyState[hostOf(url)];
}

export function markHostProxy(url: string, ok: boolean): void {
  const host = hostOf(url);
  if (!host) return;
  if (ok) {
    proxyState[host] = 'ok';
    return;
  }
  proxyFails[host] = (proxyFails[host] || 0) + 1;
  if (proxyFails[host] >= 2) proxyState[host] = 'no';
}

/** Vrai si l'image mérite encore un essai (lien inconnu, ou hôte en panne mais proxy à tester). */
export function worthTrying(url: string, canProxy: boolean): boolean {
  if (!isBad(url)) return true;
  return canProxy && hostProxyState(url) !== 'no' && !(bad[url] && Date.now() - bad[url] < EXPIRY);
}

/** Échecs en accès direct seulement : si l'hôte marche ensuite via le proxy, ils ne comptent plus. */
const directOnly: Record<string, 1> = {};

function isBad(url: string): boolean {
  const at = bad[url];
  if (at && Date.now() - (at > 1 ? at : 0) < EXPIRY && !(directOnly[url] && hostProxyState(url) === 'ok')) return true;
  return hostLooksDown(url) && hostProxyState(url) !== 'ok';
}

export function markBadImage(url?: string, triedProxy = false): void {
  if (!url) return;
  const host = hostOf(url);
  if (host) hostFails[host] = (hostFails[host] || 0) + 1;
  if (!triedProxy) directOnly[url] = 1;
  else delete directOnly[url];
  if (bad[url] && Date.now() - bad[url] < EXPIRY) return;
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
  for (const k in hostFails) delete hostFails[k];
  for (const k in proxyState) delete proxyState[k];
  for (const k in proxyFails) delete proxyFails[k];
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
