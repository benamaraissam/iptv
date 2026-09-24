export type ChannelKind = 'live' | 'movie' | 'series';

/** Entrée brute d'une playlist : chaîne live, film, ou épisode (M3U). */
export interface Channel {
  /** Identifiant stable (dérivé de l'URL du flux ou de l'id Xtream). */
  id: string;
  name: string;
  url: string;
  logo?: string;
  group: string;
  kind: ChannelKind;
  tvgId?: string;
  /** Identifiant Xtream (stream_id / vod_id). */
  streamId?: number;
  /** Chaîne disposant du replay (Xtream tv_archive). */
  archive?: boolean;
  /** Date d'ajout (ms), pour « Nouveautés ». */
  added?: number;
  rating?: number;
  year?: string;
}

/** Une série : issue de l'API Xtream, ou d'un groupe d'épisodes M3U. */
export interface Show {
  id: string;
  name: string;
  cover?: string;
  backdrop?: string;
  group: string;
  plot?: string;
  rating?: number;
  year?: string;
  genre?: string;
  added?: number;
  /** Xtream : series_id ; M3U : nom du groupe contenant les épisodes. */
  seriesId?: number;
  m3uGroup?: string;
}

export interface Episode {
  id: string;
  title: string;
  season: number;
  episode: number;
  url: string;
  image?: string;
  plot?: string;
  duration?: string;
}

export interface Details {
  title: string;
  plot?: string;
  year?: string;
  genre?: string;
  rating?: number;
  duration?: string;
  cast?: string[];
  director?: string;
  poster?: string;
  backdrop?: string;
  /** Pour une série : épisodes groupés par saison. */
  seasons?: { season: number; episodes: Episode[] }[];
}

export interface Program {
  title: string;
  start: number;
  end: number;
  desc?: string;
  /** Replay disponible (Xtream has_archive). */
  archive?: boolean;
}

export type PlaylistSource =
  | { type: 'm3u'; url: string }
  | { type: 'xtream'; server: string; username: string; password: string };

export interface Playlist {
  id: string;
  name: string;
  source: PlaylistSource;
}

export interface AccountInfo {
  status?: string;
  expires?: number;
  created?: number;
  maxConnections?: number;
  activeConnections?: number;
  trial?: boolean;
}

/** Ce que le lecteur sait lire, et ce qui est mémorisé dans l'historique. */
export interface Playable {
  id: string;
  kind: 'live' | 'movie' | 'episode' | 'catchup';
  title: string;
  subtitle?: string;
  url: string;
  poster?: string;
  /** Pour reprendre au bon endroit et proposer l'épisode suivant. */
  showId?: string;
  season?: number;
  episode?: number;
}

/** Élément affichable dans Ma liste / l'historique sans relire le catalogue. */
export interface ItemRef {
  id: string;
  kind: 'live' | 'movie' | 'series';
  title: string;
  poster?: string;
  sub?: string;
}
