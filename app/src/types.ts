export type ChannelKind = 'live' | 'movie' | 'series';

export interface Channel {
  /** Identifiant stable (dérivé de l'URL du flux). */
  id: string;
  name: string;
  url: string;
  logo?: string;
  group: string;
  kind: ChannelKind;
  tvgId?: string;
}

export type PlaylistSource =
  | { type: 'm3u'; url: string }
  | { type: 'xtream'; server: string; username: string; password: string };

export interface Playlist {
  id: string;
  name: string;
  source: PlaylistSource;
}
