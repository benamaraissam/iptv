import type { AccountInfo, Channel, Details, Episode, Program, Show } from './types';
import { fetchJson } from './http';

export interface XtreamCredentials {
  server: string;
  username: string;
  password: string;
}

interface XCategory {
  category_id: string;
  category_name: string;
}

interface XStream {
  stream_id: number;
  name: string;
  stream_icon?: string;
  category_id: string;
  epg_channel_id?: string;
  tv_archive?: number | string;
  added?: string;
  rating?: string | number;
  container_extension?: string;
}

interface XSeries {
  series_id: number;
  name: string;
  cover?: string;
  category_id: string;
  plot?: string;
  genre?: string;
  releaseDate?: string;
  rating?: string | number;
  backdrop_path?: string[] | string;
  last_modified?: string;
}

export function normalizeServer(server: string): string {
  let s = server.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  return s;
}

function api(c: XtreamCredentials, params = ''): string {
  return (
    normalizeServer(c.server) +
    '/player_api.php?username=' +
    encodeURIComponent(c.username) +
    '&password=' +
    encodeURIComponent(c.password) +
    params
  );
}

function streamBase(c: XtreamCredentials, type: string): string {
  return (
    normalizeServer(c.server) + '/' + type + '/' + encodeURIComponent(c.username) + '/' + encodeURIComponent(c.password) + '/'
  );
}

async function get<T>(url: string): Promise<T> {
  try {
    return await fetchJson<T>(url);
  } catch (e) {
    throw new Error('Xtream : ' + (e as Error).message);
  }
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : parseFloat(String(v || ''));
  return isFinite(n) && n > 0 ? n : undefined;
}

function year(date?: string): string | undefined {
  const m = date ? /(\d{4})/.exec(date) : null;
  return m ? m[1] : undefined;
}

function firstImage(v: string[] | string | undefined): string | undefined {
  if (!v) return undefined;
  if (typeof v === 'string') return v || undefined;
  return v[0] || undefined;
}

function b64(s: string | undefined): string {
  if (!s) return '';
  try {
    // Les titres EPG Xtream sont encodés en base64 (UTF-8).
    const bin = atob(s);
    try {
      return decodeURIComponent(escape(bin));
    } catch {
      return bin;
    }
  } catch {
    return s;
  }
}

export async function getAccount(c: XtreamCredentials): Promise<AccountInfo> {
  const r = await get<{ user_info?: Record<string, any> }>(api(c));
  const u = r.user_info;
  if (!u || u.auth === 0 || u.auth === '0') throw new Error('identifiants invalides');
  return {
    status: u.status,
    expires: num(u.exp_date) ? num(u.exp_date)! * 1000 : undefined,
    created: num(u.created_at) ? num(u.created_at)! * 1000 : undefined,
    maxConnections: num(u.max_connections),
    activeConnections: parseInt(u.active_cons, 10) || 0,
    trial: u.is_trial === '1' || u.is_trial === 1,
  };
}

export interface XtreamCatalog {
  live: Channel[];
  movies: Channel[];
  shows: Show[];
  account: AccountInfo;
}

export async function loadXtream(c: XtreamCredentials): Promise<XtreamCatalog> {
  const account = await getAccount(c);
  const [liveCats, live, vodCats, vod, serCats, series] = await Promise.all([
    get<XCategory[]>(api(c, '&action=get_live_categories')),
    get<XStream[]>(api(c, '&action=get_live_streams')),
    get<XCategory[]>(api(c, '&action=get_vod_categories')).catch(() => [] as XCategory[]),
    get<XStream[]>(api(c, '&action=get_vod_streams')).catch(() => [] as XStream[]),
    get<XCategory[]>(api(c, '&action=get_series_categories')).catch(() => [] as XCategory[]),
    get<XSeries[]>(api(c, '&action=get_series')).catch(() => [] as XSeries[]),
  ]);

  const names = (cats: XCategory[]) => {
    const m: Record<string, string> = {};
    for (const cat of cats || []) m[cat.category_id] = cat.category_name;
    return (id: string) => m[id] || 'Autres';
  };
  const liveCat = names(liveCats);
  const vodCat = names(vodCats);
  const serCat = names(serCats);
  const liveBase = streamBase(c, 'live');
  const movieBase = streamBase(c, 'movie');

  return {
    account,
    live: (live || []).map((s) => ({
      id: 'l' + s.stream_id,
      name: s.name,
      url: liveBase + s.stream_id + '.m3u8',
      logo: s.stream_icon || undefined,
      group: liveCat(s.category_id),
      tvgId: s.epg_channel_id || undefined,
      kind: 'live' as const,
      streamId: s.stream_id,
      archive: s.tv_archive === 1 || s.tv_archive === '1',
    })),
    movies: (vod || []).map((s) => ({
      id: 'm' + s.stream_id,
      // « Titre (2021) » → titre seul, l'année est affichée à part.
      name: s.name.replace(/\s*\((\d{4})\)\s*$/, '') || s.name,
      url: movieBase + s.stream_id + '.' + (s.container_extension || 'mp4'),
      logo: s.stream_icon || undefined,
      group: vodCat(s.category_id),
      kind: 'movie' as const,
      streamId: s.stream_id,
      added: num(s.added) ? num(s.added)! * 1000 : undefined,
      rating: num(s.rating),
      year: year((/\((\d{4})\)/.exec(s.name) || [])[1]),
    })),
    shows: (series || []).map((s) => ({
      id: 's' + s.series_id,
      name: s.name,
      cover: s.cover || undefined,
      backdrop: firstImage(s.backdrop_path),
      group: serCat(s.category_id),
      plot: s.plot,
      genre: s.genre,
      rating: num(s.rating),
      year: year(s.releaseDate),
      added: num(s.last_modified) ? num(s.last_modified)! * 1000 : undefined,
      seriesId: s.series_id,
    })),
  };
}

export async function getMovieDetails(c: XtreamCredentials, movie: Channel): Promise<Details> {
  const r = await get<{ info?: Record<string, any> }>(api(c, '&action=get_vod_info&vod_id=' + movie.streamId));
  const i = r.info || {};
  return {
    title: i.name || movie.name,
    plot: i.plot || i.description,
    year: year(i.releasedate || i.release_date),
    genre: i.genre,
    rating: num(i.rating),
    duration: i.duration,
    cast: splitList(i.cast || i.actors),
    director: i.director,
    poster: i.movie_image || movie.logo,
    backdrop: firstImage(i.backdrop_path) || i.movie_image || movie.logo,
  };
}

export async function getSeriesDetails(c: XtreamCredentials, show: Show): Promise<Details> {
  const r = await get<{ info?: Record<string, any>; episodes?: Record<string, any[]> }>(
    api(c, '&action=get_series_info&series_id=' + show.seriesId),
  );
  const i = r.info || {};
  const base = streamBase(c, 'series');
  const seasons: { season: number; episodes: Episode[] }[] = [];
  const eps = r.episodes || {};
  for (const key in eps) {
    const season = parseInt(key, 10) || 1;
    seasons.push({
      season,
      episodes: (eps[key] || []).map((e, idx) => ({
        id: 'e' + e.id,
        title: e.title || 'Episode ' + (idx + 1),
        season,
        episode: parseInt(e.episode_num, 10) || idx + 1,
        url: base + e.id + '.' + (e.container_extension || 'mp4'),
        image: (e.info && e.info.movie_image) || undefined,
        plot: e.info && e.info.plot,
        duration: e.info && e.info.duration,
      })),
    });
  }
  seasons.sort((a, b) => a.season - b.season);
  return {
    title: i.name || show.name,
    plot: i.plot || show.plot,
    year: year(i.releaseDate) || show.year,
    genre: i.genre || show.genre,
    rating: num(i.rating) || show.rating,
    cast: splitList(i.cast),
    director: i.director,
    poster: i.cover || show.cover,
    backdrop: firstImage(i.backdrop_path) || show.backdrop || i.cover || show.cover,
    seasons,
  };
}

/** Programmes à venir d'une chaîne (EPG court). */
export async function getShortEpg(c: XtreamCredentials, streamId: number, limit = 12): Promise<Program[]> {
  const r = await get<{ epg_listings?: any[] }>(
    api(c, '&action=get_short_epg&stream_id=' + streamId + '&limit=' + limit),
  );
  return (r.epg_listings || []).map(toProgram).filter((p) => p.end > p.start);
}

/** Programmes passés et à venir, avec l'indicateur de replay. */
export async function getFullEpg(c: XtreamCredentials, streamId: number): Promise<Program[]> {
  const r = await get<{ epg_listings?: any[] }>(api(c, '&action=get_simple_data_table&stream_id=' + streamId));
  return (r.epg_listings || []).map(toProgram).filter((p) => p.end > p.start);
}

function toProgram(e: any): Program {
  const start = num(e.start_timestamp) ? num(e.start_timestamp)! * 1000 : Date.parse(String(e.start).replace(' ', 'T'));
  const end = num(e.stop_timestamp) ? num(e.stop_timestamp)! * 1000 : Date.parse(String(e.end || e.stop).replace(' ', 'T'));
  return {
    title: b64(e.title) || '—',
    desc: b64(e.description),
    start,
    end,
    archive: e.has_archive === 1 || e.has_archive === '1',
  };
}

/** URL de replay (timeshift) d'un programme passé. */
export function catchupUrl(c: XtreamCredentials, streamId: number, p: Program): string {
  const d = new Date(p.start);
  const pad = (n: number) => (n < 10 ? '0' : '') + n;
  const start = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ':' + pad(d.getHours()) + '-' + pad(d.getMinutes());
  const minutes = Math.max(1, Math.round((p.end - p.start) / 60000));
  return streamBase(c, 'timeshift') + minutes + '/' + start + '/' + streamId + '.ts';
}

function splitList(v: unknown): string[] | undefined {
  if (!v || typeof v !== 'string') return undefined;
  const out = v
    .split(/,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  return out.length ? out.slice(0, 12) : undefined;
}
