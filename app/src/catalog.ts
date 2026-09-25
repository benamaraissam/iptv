import type { AccountInfo, Channel, Details, Episode, Playlist, Program, Show } from './types';
import { VersionIndex } from './versions';
import { prepareSearch } from './textsearch';
import { mark, timed } from './diag';
import { hashId, parseEpgUrl, parseM3U } from './m3u';
import { fetchText } from './http';
import * as xt from './xtream';
import * as store from './storage';
import { EpgStore } from './epg';
import { hasGoodImage, knownPoster } from './imgcache';
import { isNative, lowPower } from './platform';

interface CacheData {
  v: number;
  live: Channel[];
  movies: Channel[];
  shows: Show[];
  episodes: Channel[];
  account?: AccountInfo;
  epgUrl?: string;
  /** Xtream chargé par catégorie : les films / séries arrivent après (cache par catégorie). */
  progressive?: boolean;
  vodCats?: xt.XtreamCategory[];
  serCats?: xt.XtreamCategory[];
}

const CACHE_VERSION = 4;

/**
 * Box TV et appareils peu puissants : la liste complète des films (plusieurs dizaines de Mo
 * de JSON) ne passe pas par le pont natif sans figer l'appareil. On charge alors les
 * catégories une par une, en arrière-plan, et l'interface est utilisable tout de suite.
 */
const PROGRESSIVE = isNative || lowPower;

export interface LoadState {
  done: number;
  total: number;
  complete: boolean;
}
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

const preloaded: Record<string, Promise<boolean>> = {};

/** Télécharge une image à l'avance ; résout true si elle est affichable. */
export function preloadImage(url?: string): Promise<boolean> {
  if (!url) return Promise.resolve(false);
  if (!preloaded[url]) {
    preloaded[url] = new Promise((resolve) => {
      const img = new Image();
      img.setAttribute('referrerpolicy', 'no-referrer');
      img.onload = () => resolve(!(img.naturalWidth === 1 && img.naturalHeight === 1));
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }
  return preloaded[url];
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
  private movieVersions = new VersionIndex<Channel>(() => this.movies);
  private showVersions = new VersionIndex<Show>(() => this.shows);
  /** Catégories films / séries (complètes dès le départ, même si leur contenu arrive après). */
  vodGroups: string[] = [];
  showGroups: string[] = [];
  loadState: LoadState = { done: 0, total: 0, complete: true };
  private progressListeners: ((s: LoadState) => void)[] = [];
  private catQueue: { kind: 'm' | 's'; cat: xt.XtreamCategory }[] = [];
  private catDone: Record<string, Promise<void>> = {};
  private catResolve: Record<string, () => void> = {};
  private running = 0;

  private constructor(
    readonly playlist: Playlist,
    data: CacheData,
  ) {
    this.live = data.live;
    this.movies = data.movies;
    this.shows = data.shows;
    this.episodes = data.episodes;
    this.account = data.account;
    // Affiches retrouvées lors d'une session précédente (lien du catalogue vide ou cassé).
    for (const m of this.movies) if (!hasGoodImage(m.logo)) m.logo = knownPoster(m.id) || m.logo;
    for (const sh of this.shows) if (!hasGoodImage(sh.cover)) sh.cover = knownPoster(sh.id) || sh.cover;
    for (const list of [this.live, this.movies, this.shows] as (Channel | Show)[][]) {
      for (const x of list) this.index.set(x.id, x);
    }
    this.vodGroups = data.vodCats ? data.vodCats.map((c) => c.name) : this.groups(this.movies);
    this.showGroups = data.serCats ? data.serCats.map((c) => c.name) : this.groups(this.shows);
    if (data.progressive) {
      for (const cat of data.vodCats || []) this.catQueue.push({ kind: 'm', cat });
      for (const cat of data.serCats || []) this.catQueue.push({ kind: 's', cat });
      this.loadState = { done: 0, total: this.catQueue.length, complete: this.catQueue.length === 0 };
      for (const q of this.catQueue) this.catDone[q.kind + q.cat.id] = new Promise((r) => (this.catResolve[q.kind + q.cat.id] = r));
    }
    // Index de recherche construit en arrière-plan, une fois l'interface affichée.
    window.setTimeout(() => {
      prepareSearch(this.movies);
      prepareSearch(this.shows);
      prepareSearch(this.live);
    }, 2000);
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
      mark('catalogue : lecture du cache');
      const cached = await store.getCache<CacheData>(playlist.id);
      mark('catalogue : cache lu');
      if (cached && cached.v === CACHE_VERSION) {
        const cat = timed('catalogue : préparation', () => new Catalog(playlist, cached));
        cat.startProgressive();
        return cat;
      }
    } else if (playlist.source.type === 'xtream') {
      await store.clearCategoryCache(playlist.id);
    }
    const data = await Catalog.fetch(playlist);
    await store.setCache(playlist.id, data);
    const cat = new Catalog(playlist, data);
    cat.startProgressive();
    return cat;
  }

  private static async fetch(p: Playlist): Promise<CacheData> {
    if (p.source.type === 'xtream') {
      if (PROGRESSIVE) {
        const b = await xt.loadXtreamBase(p.source);
        if (!b.live.length && !b.vodCats.length && !b.serCats.length) throw new Error('playlist vide');
        return { v: CACHE_VERSION, live: b.live, movies: [], shows: [], episodes: [], account: b.account, progressive: true, vodCats: b.vodCats, serCats: b.serCats };
      }
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

  // ───────────── Chargement progressif (catégorie par catégorie) ─────────────

  onProgress(fn: (s: LoadState) => void): () => void {
    this.progressListeners.push(fn);
    return () => {
      const i = this.progressListeners.indexOf(fn);
      if (i >= 0) this.progressListeners.splice(i, 1);
    };
  }

  private notifyProgress(): void {
    for (const fn of this.progressListeners.slice()) fn(this.loadState);
  }

  /** Charge en priorité une catégorie que l'utilisateur ouvre ; résolu quand elle est là. */
  ensureGroup(kind: 'movies' | 'series', group: string): Promise<void> {
    const k = kind === 'movies' ? 'm' : 's';
    for (let i = 0; i < this.catQueue.length; i++) {
      const q = this.catQueue[i];
      if (q.kind === k && q.cat.name === group) {
        this.catQueue.splice(i, 1);
        this.catQueue.unshift(q);
        this.pump();
        return this.catDone[k + q.cat.id];
      }
    }
    for (const key in this.catDone) if (key.charAt(0) === k) return Promise.resolve();
    return Promise.resolve();
  }

  private startProgressive(): void {
    if (this.loadState.complete) return;
    this.pump();
  }

  private pump(): void {
    const max = lowPower ? 1 : 3;
    while (this.running < max && this.catQueue.length) {
      const q = this.catQueue.shift()!;
      this.running++;
      this.loadCategory(q.kind, q.cat).then(
        () => this.finishCategory(q),
        () => this.finishCategory(q),
      );
    }
  }

  private finishCategory(q: { kind: 'm' | 's'; cat: xt.XtreamCategory }): void {
    this.running--;
    this.loadState = { done: this.loadState.done + 1, total: this.loadState.total, complete: this.loadState.done + 1 >= this.loadState.total };
    const r = this.catResolve[q.kind + q.cat.id];
    if (r) r();
    this.notifyProgress();
    this.pump();
  }

  private async loadCategory(kind: 'm' | 's', cat: xt.XtreamCategory): Promise<void> {
    const key = kind + '.' + cat.id;
    const src = this.playlist.source;
    if (src.type !== 'xtream') return;
    let items = await store.getCategoryCache<(Channel | Show)[]>(this.playlist.id, key);
    if (!items) {
      mark('catalogue : catégorie « ' + cat.name + ' »');
      items = kind === 'm' ? await xt.loadVodCategory(src, cat) : await xt.loadSeriesCategory(src, cat);
      await store.setCategoryCache(this.playlist.id, key, items);
    }
    if (kind === 'm') {
      for (const m of items as Channel[]) {
        if (!hasGoodImage(m.logo)) m.logo = knownPoster(m.id) || m.logo;
        this.movies.push(m);
        this.index.set(m.id, m);
      }
      prepareSearch(this.movies);
    } else {
      for (const sh of items as Show[]) {
        if (!hasGoodImage(sh.cover)) sh.cover = knownPoster(sh.id) || sh.cover;
        this.shows.push(sh);
        this.index.set(sh.id, sh);
      }
      prepareSearch(this.shows);
    }
  }

  get(id: string): Channel | Show | undefined {
    return this.index.get(id);
  }

  /** Autres versions (langues) du même film ou de la même série, l'élément lui-même en tête. */
  versions(item: Channel | Show): (Channel | Show)[] {
    return 'kind' in item ? this.movieVersions.of(item) : this.showVersions.of(item);
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

  private detailCache = new Map<string, Promise<Details>>();
  private detailDone = new Map<string, Details>();

  /** Fiche détaillée, mise en cache (un seul appel serveur par titre). */
  details(item: Channel | Show): Promise<Details> {
    let p = this.detailCache.get(item.id);
    if (!p) {
      p = this.loadDetails(item).then((d) => {
        this.detailDone.set(item.id, d);
        return d;
      });
      p.catch(() => this.detailCache.delete(item.id));
      this.detailCache.set(item.id, p);
    }
    return p;
  }

  /** Fiche déjà chargée (synchrone), pour un affichage immédiat. */
  cachedDetails(id: string): Details | undefined {
    return this.detailDone.get(id);
  }

  /** Précharge la fiche et son grand visuel (survol / sélection d'une affiche). */
  prefetch(item: Channel | Show): void {
    if ('kind' in item && item.kind === 'live') return;
    this.details(item).then((d) => preloadImage(d.backdrop), () => undefined);
  }

  private async loadDetails(item: Channel | Show): Promise<Details> {
    const src = this.playlist.source;
    if ('kind' in item) {
      // Échec réseau : on ne met PAS en cache un résultat vide (la prochaine demande réessaie).
      if (src.type === 'xtream' && item.streamId) return xt.getMovieDetails(src, item);
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
