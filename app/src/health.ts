import { CapacitorHttp } from '@capacitor/core';
import { isNative, platform } from './platform';

/**
 * État des flux : vérifié par une petite requête (manifeste HLS ou en-têtes),
 * et mis à jour par la lecture réelle (lecture OK / erreur).
 */
export type Health = 'unknown' | 'checking' | 'ok' | 'down';

const TTL = 10 * 60000;
const TIMEOUT = 8000;
const MAX_PARALLEL = 3;

const cache = new Map<string, { s: Health; at: number }>();
const listeners: ((url: string, s: Health) => void)[] = [];
const queue: string[] = [];
let running = 0;

export function getHealth(url: string): Health {
  const c = cache.get(url);
  if (!c) return 'unknown';
  if (c.s !== 'checking' && Date.now() - c.at > TTL) return 'unknown';
  return c.s;
}

export function setHealth(url: string, s: Health): void {
  const prev = cache.get(url);
  cache.set(url, { s, at: Date.now() });
  if (!prev || prev.s !== s) for (const fn of listeners.slice()) fn(url, s);
}

export function onHealth(fn: (url: string, s: Health) => void): () => void {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i !== -1) listeners.splice(i, 1);
  };
}

/** Met la vérification en file (3 en parallèle). `force` ignore le cache. */
export function check(url: string, force = false): void {
  const cur = getHealth(url);
  if (!force && cur !== 'unknown') return;
  if (cur === 'checking' || queue.indexOf(url) !== -1) return;
  setHealth(url, 'checking');
  queue.push(url);
  pump();
}

/** Vide la file (changement de catégorie). Les vérifications en cours se terminent. */
export function cancelPending(): void {
  while (queue.length) {
    const url = queue.shift()!;
    const c = cache.get(url);
    if (c && c.s === 'checking') cache.delete(url);
  }
}

function pump(): void {
  while (running < MAX_PARALLEL && queue.length) {
    const url = queue.shift()!;
    running++;
    probe(url)
      .then(
        (s) => setHealth(url, s),
        () => setHealth(url, 'unknown'),
      )
      .then(() => {
        running--;
        pump();
      });
  }
}

const isHls = (url: string) => /\.m3u8?(\?|$)/i.test(url);

function probe(url: string): Promise<Health> {
  if (isNative) return probeNative(url);
  return probeXhr(url);
}

/** Android / iOS : requête native (pas de CORS). Seuls les manifestes HLS sont lus (un flux .ts ne se termine jamais). */
async function probeNative(url: string): Promise<Health> {
  if (!isHls(url)) return 'unknown';
  try {
    const res = await CapacitorHttp.get({ url, responseType: 'text', connectTimeout: TIMEOUT, readTimeout: TIMEOUT });
    const body = typeof res.data === 'string' ? res.data : '';
    return res.status >= 200 && res.status < 400 && body.indexOf('#EXT') !== -1 ? 'ok' : 'down';
  } catch {
    return 'down';
  }
}

/**
 * Navigateur / TV : XMLHttpRequest (compatible vieux moteurs, contrairement à AbortController).
 * Pour un flux continu on s'arrête dès les en-têtes reçus.
 */
function probeXhr(url: string): Promise<Health> {
  return new Promise((resolve) => {
    const hls = isHls(url);
    const xhr = new XMLHttpRequest();
    let done = false;
    const finish = (s: Health) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      try {
        xhr.abort();
      } catch {
        /* ignore */
      }
      resolve(s);
    };
    const timer = window.setTimeout(() => finish('down'), TIMEOUT);
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 2 && xhr.status) {
        if (xhr.status >= 400) finish('down');
        else if (!hls) finish('ok');
      } else if (xhr.readyState === 4 && hls) {
        if (!xhr.status) return; // géré par onerror
        finish(xhr.status < 400 && (xhr.responseText || '').indexOf('#EXT') !== -1 ? 'ok' : 'down');
      }
    };
    // Statut 0 : réseau coupé… ou CORS. Sur TV (pas de CORS) c'est un vrai échec ;
    // dans un navigateur on ne peut pas savoir.
    xhr.onerror = () => finish(platform === 'web' ? 'unknown' : 'down');
    try {
      xhr.open('GET', url, true);
      xhr.send();
    } catch {
      finish('unknown');
    }
  });
}
