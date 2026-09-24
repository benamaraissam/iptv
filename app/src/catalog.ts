import type { AccountInfo, Channel, Details, Episode, Playlist, Program, Show } from './types';
import { hashId, parseEpgUrl, parseM3U } from './m3u';
import { fetchText } from './http';
import * as xt from './xtream';
import * as store from './storage';
import { EpgStore } from './epg';

interface CacheData {
  v: number;
  live: Channel[];
  movies: Channel[];
  shows: Show[];
  episodes: Channel[];
  account?: AccountInfo;
  epgUrl?: string;
}

const CACHE_VERSION = 2;
const SEASON_RE = /^(.*?)[\s\-–:|]+(?:saison|season|s)\s*(\d+)\s*$/i;

/** « Awled Moufida - Season 2 » → { name: 'Awled Moufida', season: 2 }. */
export function splitSeason(group: string): { name: string; season: number } {
  const m = SEASON_RE.exec(group.trim());
  if (m && m[1].trim()) return { name: m[1].trim(), season: parseInt(m[2], 10) };
  return { name: group.trim(), season: 1 };
}

/** Transforme les épisodes M3U (groupés par « Série - Saison N ») en séries. */
export function buildM3UShows(episodes: Channel[]): Show[] {
  const shows = new Map<string, Show>();
  for (const ep of episodes) {
    const { name } = splitSeason(ep.group);
    let s = shows.get(name);
    if (!s) {
      s = { id: 'g' + hashId(name), name, group: 'Séries', cover: ep.logo, m3uGroup: name };
      shows.set(name, s);
    }
    if (!s.cover && ep.logo) s.cover = ep.logo;
  }
  return Array.from(shows.values());
}

export class Catalog {
  live: Channel[] = [];
  movies: Channel[] = [];
  shows: Show[] = [];
  /** Épisodes M3U (les séries Xtream sont chargées à la demande). */
  private episodes: Channel[] = [];
  account?: AccountInfo;
  epg: EpgStore;
  private index = new Map<string, Channel | Show>();

  private constructor(
    readonly playlist: Playlist,
    data: CacheData,
  ) {
    this.live = data.live;
    this.movies = data.movies;
    this.shows = data.shows;
    this.episodes = data.episodes;
    this.account = data.account;
    for (const list of [this.live, this.movies, this.shows] as (Channel | Show)[][]) {
      for (const x of list) this.index.set(x.id, x);
    }
    const src = playlist.source;
    this.epg = new EpgStore(
      this.live,
      src.type === 'xtream' ? (ch) => xt.getShortEpg(src, ch.streamId!, 12) : undefined,
      data.epgUrl,
      src.type === 'xtream' ? (ch) => xt.getFullEpg(src, ch.streamId!) : undefined,
    );
  }

  static async load(playlist: Playlist, force = false): Promise<Catalog> {
    if (!force) {
      const cached = store.getCache<CacheData>(playlist.id);
      if (cached && cached.v === CACHE_VERSION) return new Catalog(playlist, cached);
    }
    const data = await Catalog.fetch(playlist);
    store.setCache(playlist.id, data);
    return new Catalog(playlist, data);
  }

  private static async fetch(p: Playlist): Promise<CacheData> {
    if (p.source.type === 'xtream') {
      const r = await xt.loadXtream(p.source);
      if (!r.live.length && !r.movies.length && !r.shows.length) throw new Error('playlist vide');
      return { v: CACHE_VERSION, live: r.live, movies: r.movies, shows: r.shows, episodes: [], account: r.account };
    }
    const text = await fetchText(p.source.url);
    const all = parseM3U(text);
    if (!all.length) throw new Error('aucune chaîne trouvée');
    const episodes = all.filter((c) => c.kind === 'series');
    return {
      v: CACHE_VERSION,
      live: all.filter((c) => c.kind === 'live'),
      movies: all.filter((c) => c.kind === 'movie'),
      shows: buildM3UShows(episodes),
      episodes,
      epgUrl: parseEpgUrl(text),
    };
  }

  get isXtream(): boolean {
    return this.playlist.source.type === 'xtream';
  }

  get(id: string): Channel | Show | undefined {
    return this.index.get(id);
  }

  /** Catégories dans l'ordre d'apparition. */
  groups(items: { group: string }[]): string[] {
    const seen: Record<string, boolean> = {};
    const out: string[] = [];
    for (const x of items) {
      if (!seen[x.group]) {
        seen[x.group] = true;
        out.push(x.group);
      }
    }
    return out;
  }

  get catchupChannels(): Channel[] {
    return this.live.filter((c) => c.archive);
  }

  async details(item: Channel | Show): Promise<Details> {
    const src = this.playlist.source;
    if ('kind' in item) {
      if (src.type === 'xtream' && item.streamId) {
        try {
          return await xt.getMovieDetails(src, item);
        } catch {
          /* on retombe sur les infos de base */
        }
      }
      return { title: item.name, poster: item.logo, backdrop: item.logo, year: item.year, rating: item.rating };
    }
    if (src.type === 'xtream' && item.seriesId) return xt.getSeriesDetails(src, item);
    return this.m3uShowDetails(item);
  }

  private m3uShowDetails(show: Show): Details {
    const bySeason = new Map<number, Episode[]>();
    for (const ep of this.episodes) {
      const { name, season } = splitSeason(ep.group);
      if (name !== show.m3uGroup) continue;
      let list = bySeason.get(season);
      if (!list) bySeason.set(season, (list = []));
      list.push({
        id: ep.id,
        title: ep.name,
        season,
        episode: list.length + 1,
        url: ep.url,
        image: ep.logo,
      });
    }
    const seasons = Array.from(bySeason.entries())
      .map(([season, episodes]) => ({ season, episodes }))
      .sort((a, b) => a.season - b.season);
    return { title: show.name, poster: show.cover, backdrop: show.cover, seasons };
  }

  async catchupPrograms(ch: Channel): Promise<Program[]> {
    const src = this.playlist.source;
    if (src.type !== 'xtream' || !ch.streamId) return [];
    const now = Date.now();
    const list = await xt.getFullEpg(src, ch.streamId);
    return list.filter((p) => p.archive && p.end < now).sort((a, b) => b.start - a.start);
  }

  catchupUrl(ch: Channel, p: Program): string {
    const src = this.playlist.source;
    if (src.type !== 'xtream' || !ch.streamId) return ch.url;
    return xt.catchupUrl(src, ch.streamId, p);
  }

  async refreshAccount(): Promise<AccountInfo | undefined> {
    const src = this.playlist.source;
    if (src.type !== 'xtream') return undefined;
    this.account = await xt.getAccount(src);
    return this.account;
  }
}
