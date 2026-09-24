import type { Screen } from '../app';
import { splash, onboarding, offline } from './onboarding';
import { login } from './login';
import { home } from './home';
import { live } from './live';
import { guide } from './guide';
import { movies, series } from './vod';
import { detail } from './detail';
import { player } from './player';
import { search } from './search';
import { library } from './library';
import { catchup, catchupChannel } from './catchup';
import { categories, profile, devices, settings, parental, playlists } from './account';

export const screens = {
  splash,
  onboarding,
  offline,
  login,
  home,
  live,
  guide,
  movies,
  series,
  detail,
  player,
  search,
  library,
  catchup,
  catchupChannel,
  categories,
  profile,
  devices,
  settings,
  parental,
  playlists,
} as Record<string, (params: any) => Screen>;

export type RouteName =
  | 'splash'
  | 'onboarding'
  | 'offline'
  | 'login'
  | 'home'
  | 'live'
  | 'guide'
  | 'movies'
  | 'series'
  | 'detail'
  | 'player'
  | 'search'
  | 'library'
  | 'catchup'
  | 'catchupChannel'
  | 'categories'
  | 'profile'
  | 'devices'
  | 'settings'
  | 'parental'
  | 'playlists';
