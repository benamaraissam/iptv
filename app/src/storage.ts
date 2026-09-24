import type { Channel, Playlist } from './types';

const KEY_PLAYLISTS = 'iptv.playlists';
const KEY_FAVORITES = 'iptv.favorites.';
const KEY_RECENTS = 'iptv.recents.';
const KEY_CACHE = 'iptv.cache.';
const MAX_RECENTS = 30;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota dépassé ou stockage indisponible : on continue sans persister */
  }
}

export function getPlaylists(): Playlist[] {
  return read<Playlist[]>(KEY_PLAYLISTS, []);
}

export function savePlaylist(p: Playlist): void {
  const list = getPlaylists().filter((x) => x.id !== p.id);
  list.push(p);
  write(KEY_PLAYLISTS, list);
}

export function removePlaylist(id: string): void {
  write(
    KEY_PLAYLISTS,
    getPlaylists().filter((x) => x.id !== id),
  );
  try {
    localStorage.removeItem(KEY_FAVORITES + id);
    localStorage.removeItem(KEY_RECENTS + id);
    localStorage.removeItem(KEY_CACHE + id);
  } catch {
    /* ignore */
  }
}

export function getFavorites(playlistId: string): string[] {
  return read<string[]>(KEY_FAVORITES + playlistId, []);
}

export function toggleFavorite(playlistId: string, channelId: string): boolean {
  const favs = getFavorites(playlistId);
  const i = favs.indexOf(channelId);
  if (i === -1) favs.push(channelId);
  else favs.splice(i, 1);
  write(KEY_FAVORITES + playlistId, favs);
  return i === -1;
}

export function getRecents(playlistId: string): string[] {
  return read<string[]>(KEY_RECENTS + playlistId, []);
}

export function pushRecent(playlistId: string, channelId: string): void {
  const list = getRecents(playlistId).filter((id) => id !== channelId);
  list.unshift(channelId);
  write(KEY_RECENTS + playlistId, list.slice(0, MAX_RECENTS));
}

export function getCachedChannels(playlistId: string): Channel[] | null {
  return read<Channel[] | null>(KEY_CACHE + playlistId, null);
}

export function setCachedChannels(playlistId: string, channels: Channel[]): void {
  write(KEY_CACHE + playlistId, channels);
}
