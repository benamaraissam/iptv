import type { ItemRef, Playable, Playlist } from './types';
import type { Lang } from './i18n';

const P = 'sp.';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(P + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(P + key, JSON.stringify(value));
    return true;
  } catch {
    // Quota dépassé ou stockage indisponible : on continue sans persister.
    return false;
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(P + key);
  } catch {
    /* ignore */
  }
}

// ───────────── Réglages ─────────────

export interface Settings {
  lang?: Lang;
  quality: 'auto' | 'high' | 'low';
  autoplayNext: boolean;
  onboarded: boolean;
  activePlaylist?: string;
}

const DEFAULT_SETTINGS: Settings = { quality: 'auto', autoplayNext: true, onboarded: false };

export function getSettings(): Settings {
  const s = read<Partial<Settings>>('settings', {});
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const k in s) (out as any)[k] = (s as any)[k];
  return out;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const s = getSettings();
  for (const k in patch) (s as any)[k] = (patch as any)[k];
  write('settings', s);
  return s;
}

// ───────────── Contrôle parental ─────────────

export interface Parental {
  enabled: boolean;
  pin: string;
  lockAdult: boolean;
  lockedGroups: string[];
}

export function getParental(): Parental {
  return read<Parental>('parental', { enabled: false, pin: '', lockAdult: true, lockedGroups: [] });
}

export function setParental(p: Parental): void {
  write('parental', p);
}

// ───────────── Playlists ─────────────

export function getPlaylists(): Playlist[] {
  return read<Playlist[]>('playlists', []);
}

export function savePlaylist(p: Playlist): void {
  const list = getPlaylists().filter((x) => x.id !== p.id);
  list.push(p);
  write('playlists', list);
}

export function removePlaylist(id: string): void {
  write(
    'playlists',
    getPlaylists().filter((x) => x.id !== id),
  );
  remove('mylist.' + id);
  remove('history.' + id);
  remove('cache.' + id);
  remove('searches.' + id);
  const s = getSettings();
  if (s.activePlaylist === id) updateSettings({ activePlaylist: undefined });
}

// ───────────── Cache du catalogue ─────────────

export function getCache<T>(playlistId: string): T | null {
  return read<T | null>('cache.' + playlistId, null);
}

export function setCache(playlistId: string, data: unknown): void {
  if (!write('cache.' + playlistId, data)) remove('cache.' + playlistId);
}

// ───────────── Ma liste ─────────────

export function getMyList(playlistId: string): ItemRef[] {
  return read<ItemRef[]>('mylist.' + playlistId, []);
}

export function inMyList(playlistId: string, id: string): boolean {
  const list = getMyList(playlistId);
  for (const x of list) if (x.id === id) return true;
  return false;
}

/** Ajoute ou retire ; retourne true si l'élément est maintenant dans la liste. */
export function toggleMyList(playlistId: string, item: ItemRef): boolean {
  const list = getMyList(playlistId);
  const next = list.filter((x) => x.id !== item.id);
  const added = next.length === list.length;
  if (added) next.unshift(item);
  write('mylist.' + playlistId, next);
  return added;
}

// ───────────── Historique & reprise ─────────────

export interface HistoryEntry extends Playable {
  /** Position et durée en secondes (0 pour le direct). */
  pos: number;
  dur: number;
  at: number;
}

const MAX_HISTORY = 60;

export function getHistory(playlistId: string): HistoryEntry[] {
  return read<HistoryEntry[]>('history.' + playlistId, []);
}

export function recordHistory(playlistId: string, p: Playable, pos: number, dur: number): void {
  const list = getHistory(playlistId).filter((x) => x.id !== p.id);
  const entry: HistoryEntry = { ...p, pos, dur, at: Date.now() };
  list.unshift(entry);
  write('history.' + playlistId, list.slice(0, MAX_HISTORY));
}

export function clearHistory(playlistId: string): void {
  remove('history.' + playlistId);
}

export function getProgress(playlistId: string, id: string): HistoryEntry | null {
  for (const h of getHistory(playlistId)) if (h.id === id) return h;
  return null;
}

/** Films/épisodes commencés mais pas terminés. */
export function getContinueWatching(playlistId: string): HistoryEntry[] {
  return getHistory(playlistId).filter(
    (h) => (h.kind === 'movie' || h.kind === 'episode') && h.dur > 0 && h.pos > 30 && h.pos / h.dur < 0.95,
  );
}

// ───────────── Recherches récentes ─────────────

export function getSearches(playlistId: string): string[] {
  return read<string[]>('searches.' + playlistId, []);
}

export function pushSearch(playlistId: string, q: string): void {
  q = q.trim();
  if (q.length < 2) return;
  const list = getSearches(playlistId).filter((x) => x.toLowerCase() !== q.toLowerCase());
  list.unshift(q);
  write('searches.' + playlistId, list.slice(0, 8));
}
