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

/**
 * Les panels Xtream renvoient souvent des champs vides (null), des nombres à la place
 * de textes, ou des tableaux : tout texte passe par ici avant d'entrer dans l'app.
 */
function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(str).filter(Boolean).join(', ');
  return '';
}

function opt(v: unknown): string | undefined {
  return str(v) || undefined;
}

function list<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]).filter((x) => x && typeof x === 'object') : [];
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : parseFloat(String(v || ''));
  return isFinite(n) && n > 0 ? n : undefined;
}

function year(date?: string): string | undefined {
  const m = date ? /(\d{4})/.exec(date) : null;
  return m ? m[1] : undefined;
}

function firstImage(v: unknown): string | undefined {
  if (Array.isArray(v)) return opt(v[0]);
  return opt(v);
}

function b64(v: unknown): string {
  const s = str(v);
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
    status: opt(u.status),
    expires: num(u.exp_date) ? num(u.exp_date)! * 1000 : undefined,
    created: num(u.created_at) ? num(u.created_at)! * 1000 : undefined,
    maxConnections: num(u.max_connections),
    activeConnections: parseInt(str(u.active_cons), 10) || 0,
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
    for (const cat of list<XCategory>(cats)) m[str(cat.category_id)] = str(cat.category_name);
    return (id: unknown) => m[str(id)] || 'Autres';
  };
  const untitled = (id: unknown) => 'Sans titre ' + str(id);
  const liveCat = names(liveCats);
  const vodCat = names(vodCats);
  const serCat = names(serCats);
  const liveBase = streamBase(c, 'live');
  const movieBase = streamBase(c, 'movie');

  return {
    account,
    live: list<XStream>(live).filter((s) => s.stream_id !== undefined && s.stream_id !== null).map((s) => ({
      id: 'l' + s.stream_id,
      name: str(s.name) || untitled(s.stream_id),
      url: liveBase + s.stream_id + '.m3u8',
      logo: opt(s.stream_icon),
      group: liveCat(s.category_id),
      tvgId: opt(s.epg_channel_id),
      kind: 'live' as const,
      streamId: s.stream_id,
      archive: s.tv_archive === 1 || s.tv_archive === '1',
    })),
    movies: list<XStream>(vod).filter((s) => s.stream_id !== undefined && s.stream_id !== null).map((s) => ({
      id: 'm' + s.stream_id,
      // « Titre (2021) » → titre seul, l'année est affichée à part.
      name: str(s.name).replace(/\s*\((\d{4})\)\s*$/, '') || str(s.name) || untitled(s.stream_id),
      url: movieBase + s.stream_id + '.' + (str(s.container_extension) || 'mp4'),
      logo: opt(s.stream_icon),
      group: vodCat(s.category_id),
      kind: 'movie' as const,
      streamId: s.stream_id,
      added: num(s.added) ? num(s.added)! * 1000 : undefined,
      rating: num(s.rating),
      year: year((/\((\d{4})\)/.exec(str(s.name)) || [])[1]),
    })),
    shows: list<XSeries>(series).filter((s) => s.series_id !== undefined && s.series_id !== null).map((s) => ({
      id: 's' + s.series_id,
      name: str(s.name) || untitled(s.series_id),
      cover: opt(s.cover),
      backdrop: firstImage(s.backdrop_path),
      group: serCat(s.category_id),
      plot: opt(s.plot),
      genre: opt(s.genre),
      rating: num(s.rating),
      year: year(str(s.releaseDate)),
      added: num(s.last_modified) ? num(s.last_modified)! * 1000 : undefined,
      seriesId: s.series_id,
    })),
  };
}

export async function getMovieDetails(c: XtreamCredentials, movie: Channel): Promise<Details> {
  const r = await get<{ info?: Record<string, any> }>(api(c, '&action=get_vod_info&vod_id=' + movie.streamId));
  const i = r.info || {};
  return {
    title: str(i.name) || movie.name,
    plot: opt(i.plot) || opt(i.description),
    year: year(str(i.releasedate) || str(i.release_date)),
    genre: opt(i.genre),
    rating: num(i.rating),
    duration: opt(i.duration),
    cast: splitList(str(i.cast) || str(i.actors)),
    director: opt(i.director),
    poster: opt(i.movie_image) || movie.logo,
    backdrop: firstImage(i.backdrop_path) || opt(i.movie_image) || movie.logo,
  };
}

export async function getSeriesDetails(c: XtreamCredentials, show: Show): Promise<Details> {
  const r = await get<{ info?: Record<string, any>; episodes?: Record<string, any[]> }>(
    api(c, '&action=get_series_info&series_id=' + show.seriesId),
  );
  const i = r.info || {};
  const base = streamBase(c, 'series');
  const seasons: { season: number; episodes: Episode[] }[] = [];
  // Selon les panels, « episodes » est un objet { "1": [...] } ou un tableau de saisons.
  const eps: Record<string, any[]> = {};
  const raw = r.episodes as unknown;
  if (Array.isArray(raw)) raw.forEach((v, i) => (eps[String(i + 1)] = Array.isArray(v) ? v : [v]));
  else if (raw && typeof raw === 'object') for (const k in raw as Record<string, any>) eps[k] = list((raw as Record<string, any>)[k]);
  for (const key in eps) {
    const season = parseInt(key, 10) || 1;
    seasons.push({
      season,
      episodes: list<any>(eps[key])
        .filter((e) => e.id !== undefined && e.id !== null)
        .map((e, idx) => {
          const info = e.info && typeof e.info === 'object' ? e.info : {};
          return {
            id: 'e' + e.id,
            title: str(e.title) || 'Episode ' + (idx + 1),
            season,
            episode: parseInt(str(e.episode_num), 10) || idx + 1,
            url: base + e.id + '.' + (str(e.container_extension) || 'mp4'),
            image: opt(info.movie_image),
            plot: opt(info.plot),
            duration: opt(info.duration),
          };
        }),
    });
  }
  seasons.sort((a, b) => a.season - b.season);
  return {
    title: str(i.name) || show.name,
    plot: opt(i.plot) || show.plot,
    year: year(str(i.releaseDate)) || show.year,
    genre: opt(i.genre) || show.genre,
    rating: num(i.rating) || show.rating,
    cast: splitList(str(i.cast)),
    director: opt(i.director),
    poster: opt(i.cover) || show.cover,
    backdrop: firstImage(i.backdrop_path) || show.backdrop || opt(i.cover) || show.cover,
    seasons,
  };
}

/** Programmes à venir d'une chaîne (EPG court). */
export async function getShortEpg(c: XtreamCredentials, streamId: number, limit = 12): Promise<Program[]> {
  const r = await get<{ epg_listings?: any[] }>(
    api(c, '&action=get_short_epg&stream_id=' + streamId + '&limit=' + limit),
  );
  return list<any>(r && r.epg_listings).map(toProgram).filter((p) => p.end > p.start);
}

/** Programmes passés et à venir, avec l'indicateur de replay. */
export async function getFullEpg(c: XtreamCredentials, streamId: number): Promise<Program[]> {
  const r = await get<{ epg_listings?: any[] }>(api(c, '&action=get_simple_data_table&stream_id=' + streamId));
  return list<any>(r && r.epg_listings).map(toProgram).filter((p) => p.end > p.start);
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
