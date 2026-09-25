import type { ItemRef, Playable, Playlist } from './types';
import type { Lang } from './i18n';
import { idbDel, idbGet, idbKeys, idbSet } from './idb';

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
  void idbDel('cache.' + id);
  void clearCategoryCache(id);
  remove('searches.' + id);
  const s = getSettings();
  if (s.activePlaylist === id) updateSettings({ activePlaylist: undefined });
}

// ───────────── Cache du catalogue ─────────────

/** Catalogue : IndexedDB (gros volumes), avec l'ancien emplacement localStorage en repli. */
export async function getCache<T>(playlistId: string): Promise<T | null> {
  const v = await idbGet<T>('cache.' + playlistId);
  if (v !== undefined) return v;
  return read<T | null>('cache.' + playlistId, null);
}

export async function setCache(playlistId: string, data: unknown): Promise<void> {
  remove('cache.' + playlistId);
  if (!(await idbSet('cache.' + playlistId, data))) {
    // Pas d'IndexedDB (très vieux moteur) : on tente localStorage, sinon tant pis.
    if (!write('cache.' + playlistId, data)) remove('cache.' + playlistId);
  }
}

/** Catalogue chargé par catégorie (box TV) : un enregistrement IndexedDB par catégorie. */
export function getCategoryCache<T>(playlistId: string, key: string): Promise<T | undefined> {
  return idbGet<T>('cat.' + playlistId + '.' + key);
}

export function setCategoryCache(playlistId: string, key: string, data: unknown): Promise<boolean> {
  return idbSet('cat.' + playlistId + '.' + key, data);
}

export async function clearCategoryCache(playlistId: string): Promise<void> {
  for (const k of await idbKeys('cat.' + playlistId + '.')) await idbDel(k);
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

/**
 * Films/épisodes commencés mais pas terminés. Une série n'apparaît qu'une fois,
 * avec le dernier épisode regardé (l'historique est classé du plus récent au plus ancien).
 */
export function getContinueWatching(playlistId: string): HistoryEntry[] {
  const seenShow: Record<string, true> = {};
  const out: HistoryEntry[] = [];
  for (const h of getHistory(playlistId)) {
    if (h.kind === 'episode' && h.showId) {
      if (seenShow[h.showId]) continue;
      seenShow[h.showId] = true;
    }
    if ((h.kind === 'movie' || h.kind === 'episode') && h.dur > 0 && h.pos > 30 && h.pos / h.dur < 0.95) out.push(h);
  }
  return out;
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
