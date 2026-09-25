import { CapacitorHttp } from '@capacitor/core';
import { isNative, platform } from './platform';

/**
 * Dans un navigateur (npm run dev / preview), les serveurs IPTV refusent les appels
 * (pas d'en-têtes CORS) : on passe par le petit proxy du serveur de développement.
 * Inutile sur Android/iOS (HTTP natif) et sur les TV (pas de CORS).
 */
const useProxy =
  platform === 'web' && typeof location !== 'undefined' && /^https?:$/.test(location.protocol) && /^(localhost|127\.|192\.168\.|10\.|\[?::1)/.test(location.hostname);

export function proxied(url: string): string {
  if (!useProxy || !/^https?:\/\//i.test(url) || url.indexOf(location.origin) === 0) return url;
  return '/__proxy?url=' + encodeURIComponent(url);
}

/** Message clair à partir d'une erreur réseau. */
export function describeNetworkError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) return 'network';
  return msg;
}

/**
 * Récupère un texte distant.
 * Sur Android/iOS on passe par la couche HTTP native de Capacitor pour éviter
 * les restrictions CORS (la plupart des serveurs IPTV n'envoient pas les en-têtes).
 * Sur Tizen/webOS, les web-apps packagées ne sont pas soumises au CORS
 * (voir <access origin="*"> dans config.xml).
 */
export async function fetchText(url: string): Promise<string> {
  if (isNative) {
    const res = await CapacitorHttp.get({ url, responseType: 'text' });
    if (res.status < 200 || res.status >= 300) throw new Error('HTTP ' + res.status);
    return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  }
  const res = await fetch(proxied(url));
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error('HTTP ' + res.status + (body && body.length < 200 ? ' — ' + body : ''));
  }
  return res.text();
}

export async function fetchJson<T>(url: string): Promise<T> {
  const text = await fetchText(url);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text.trim() ? 'réponse inattendue du serveur' : 'réponse vide du serveur (identifiants refusés ?)');
  }
}
