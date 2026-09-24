import { CapacitorHttp } from '@capacitor/core';
import { isNative } from './platform';

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
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

export async function fetchJson<T>(url: string): Promise<T> {
  return JSON.parse(await fetchText(url)) as T;
}
