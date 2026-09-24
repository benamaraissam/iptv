import type { Channel } from './types';
import { hashId } from './m3u';
import { fetchJson } from './http';

interface XtreamCategory {
  category_id: string;
  category_name: string;
}

interface XtreamLiveStream {
  stream_id: number;
  name: string;
  stream_icon?: string;
  category_id: string;
  epg_channel_id?: string;
}

interface XtreamVodStream extends XtreamLiveStream {
  container_extension?: string;
}

export interface XtreamCredentials {
  server: string;
  username: string;
  password: string;
}

export function normalizeServer(server: string): string {
  let s = server.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  return s;
}

async function getJson<T>(url: string): Promise<T> {
  try {
    return await fetchJson<T>(url);
  } catch (e) {
    throw new Error('Erreur serveur Xtream : ' + (e as Error).message);
  }
}

function apiUrl(c: XtreamCredentials, action?: string): string {
  const base =
    normalizeServer(c.server) +
    '/player_api.php?username=' +
    encodeURIComponent(c.username) +
    '&password=' +
    encodeURIComponent(c.password);
  return action ? base + '&action=' + action : base;
}

/**
 * Charge les chaînes live et les films (VOD) d'un compte Xtream Codes.
 * Les séries nécessitent un appel par série : elles sont chargées à la demande
 * dans une évolution future.
 */
export async function loadXtream(c: XtreamCredentials): Promise<Channel[]> {
  const auth = await getJson<{ user_info?: { auth?: number } }>(apiUrl(c));
  if (!auth.user_info || auth.user_info.auth === 0) {
    throw new Error('Identifiants Xtream invalides');
  }

  const server = normalizeServer(c.server);
  const user = encodeURIComponent(c.username);
  const pass = encodeURIComponent(c.password);

  const [liveCats, live, vodCats, vod] = await Promise.all([
    getJson<XtreamCategory[]>(apiUrl(c, 'get_live_categories')),
    getJson<XtreamLiveStream[]>(apiUrl(c, 'get_live_streams')),
    getJson<XtreamCategory[]>(apiUrl(c, 'get_vod_categories')).catch(() => []),
    getJson<XtreamVodStream[]>(apiUrl(c, 'get_vod_streams')).catch(() => []),
  ]);

  const catName = (cats: XtreamCategory[], id: string) => {
    for (const cat of cats) if (cat.category_id === id) return cat.category_name;
    return 'Sans catégorie';
  };

  const channels: Channel[] = [];
  for (const s of live) {
    const url = server + '/live/' + user + '/' + pass + '/' + s.stream_id + '.m3u8';
    channels.push({
      id: hashId('live|' + s.stream_id),
      name: s.name,
      url,
      logo: s.stream_icon || undefined,
      group: catName(liveCats, s.category_id),
      tvgId: s.epg_channel_id || undefined,
      kind: 'live',
    });
  }
  for (const s of vod) {
    const ext = s.container_extension || 'mp4';
    channels.push({
      id: hashId('vod|' + s.stream_id),
      name: s.name,
      url: server + '/movie/' + user + '/' + pass + '/' + s.stream_id + '.' + ext,
      logo: s.stream_icon || undefined,
      group: catName(vodCats, s.category_id),
      kind: 'movie',
    });
  }
  return channels;
}
