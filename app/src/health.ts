import { CapacitorHttp } from '@capacitor/core';
import { isNative, platform } from './platform';
import { proxied } from './http';

/**
 * État des flux : vérifié par une petite requête (manifeste HLS ou en-têtes),
 * et mis à jour par la lecture réelle (lecture OK / erreur).
 */
export type Health = 'unknown' | 'checking' | 'ok' | 'down';

const TTL = 10 * 60000;
const TIMEOUT = 12000;
const MAX_PARALLEL = 3;

const cache = new Map<string, { s: Health; at: number }>();
const listeners: ((url: string, s: Health) => void)[] = [];
const queue: string[] = [];
let running = 0;
/** Pause des vérifications pendant la lecture (voir setPlaybackActive). */
let pauseDuringPlayback = false;
let playing = false;

/**
 * Xtream : chaque vérification ouvre une connexion sur le compte (souvent limité à 1 ou 2).
 * Vérifier pendant qu'on regarde peut ralentir, voire couper, la lecture.
 */
export function setPauseDuringPlayback(on: boolean): void {
  pauseDuringPlayback = on;
  pump();
}

export function setPlaybackActive(on: boolean): void {
  playing = on;
  if (!on) pump();
}

export function checksPaused(): boolean {
  return pauseDuringPlayback && playing;
}

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
  while (!checksPaused() && running < MAX_PARALLEL && queue.length) {
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
 * Navigateur / TV : on teste exactement ce que le lecteur fera.
 * - HLS (.m3u8) : lu par hls.js via XMLHttpRequest → si la requête est bloquée (CORS),
 *   la chaîne est illisible sur cet appareil : hors ligne.
 * - Autres liens : si la requête est bloquée, on essaie une balise <video> cachée
 *   (la lecture média n'est pas soumise au CORS).
 */
async function probeXhr(url: string): Promise<Health> {
  const r = await xhrProbe(url);
  if (r !== 'blocked') return r;
  if (isHls(url) || platform !== 'web') return 'down';
  return probeMedia(url);
}

/** Requête XMLHttpRequest (compatible vieux moteurs) ; s'arrête aux en-têtes pour un flux continu. */
function xhrProbe(url: string): Promise<Health | 'blocked'> {
  return new Promise((resolve) => {
    const hls = isHls(url);
    const xhr = new XMLHttpRequest();
    let done = false;
    const finish = (s: Health | 'blocked') => {
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
      } else if (xhr.readyState === 4 && hls && xhr.status) {
        finish(xhr.status < 400 && (xhr.responseText || '').indexOf('#EXT') !== -1 ? 'ok' : 'down');
      }
    };
    // Statut 0 : réseau coupé ou requête refusée par le serveur (CORS).
    xhr.onerror = () => finish('blocked');
    try {
      xhr.open('GET', proxied(url), true);
      xhr.send();
    } catch {
      finish('blocked');
    }
  });
}

/** Charge les métadonnées dans une <video> invisible : ok si le flux démarre. */
function probeMedia(url: string): Promise<Health> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'metadata';
    let done = false;
    const finish = (s: Health) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      v.removeAttribute('src');
      try {
        v.load();
      } catch {
        /* ignore */
      }
      resolve(s);
    };
    const timer = window.setTimeout(() => finish('down'), TIMEOUT);
    v.addEventListener('loadedmetadata', () => finish('ok'));
    v.addEventListener('error', () => finish('down'));
    v.src = url;
  });
}
