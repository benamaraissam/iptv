import {
  House,
  Tv,
  Film,
  Clapperboard,
  RotateCcw,
  Heart,
  Settings,
  Search,
  Library,
  User,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Star,
  Plus,
  Check,
  Lock,
  Wifi,
  WifiOff,
  SearchX,
  Maximize,
  ListVideo,
  AudioLines,
  Captions,
  Gauge,
  RefreshCw,
  Trash,
  LogOut,
  Globe,
  Shield,
  MonitorSmartphone,
  CalendarDays,
  LayoutGrid,
  Baby,
  Trophy,
  Newspaper,
  Music,
  Sparkles,
  X,
  Info,
  Clock,
  Radio,
  Eye,
  Crown,
} from 'lucide';

type IconNode = [string, Record<string, string | number | undefined>][];

export const icons = {
  home: House,
  live: Tv,
  movie: Film,
  series: Clapperboard,
  catchup: RotateCcw,
  heart: Heart,
  settings: Settings,
  search: Search,
  library: Library,
  user: User,
  back: ChevronLeft,
  chevron: ChevronRight,
  down: ChevronDown,
  play: Play,
  pause: Pause,
  prev: SkipBack,
  next: SkipForward,
  star: Star,
  plus: Plus,
  check: Check,
  lock: Lock,
  wifi: Wifi,
  offline: WifiOff,
  noResults: SearchX,
  fullscreen: Maximize,
  episodes: ListVideo,
  audio: AudioLines,
  subtitles: Captions,
  quality: Gauge,
  refresh: RefreshCw,
  trash: Trash,
  logout: LogOut,
  globe: Globe,
  shield: Shield,
  devices: MonitorSmartphone,
  guide: CalendarDays,
  grid: LayoutGrid,
  kids: Baby,
  sports: Trophy,
  news: Newspaper,
  music: Music,
  sparkles: Sparkles,
  close: X,
  info: Info,
  clock: Clock,
  radio: Radio,
  eye: Eye,
  crown: Crown,
} as const;

export type IconName = keyof typeof icons;

const NS = 'http://www.w3.org/2000/svg';

/** Icône SVG (jeu Lucide, trait fin comme sur la maquette). */
export function icon(name: IconName, cls = ''): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'ic' + (cls ? ' ' + cls : ''));
  for (const [tag, attrs] of icons[name] as unknown as IconNode) {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] !== undefined && k !== 'key') el.setAttribute(k, String(attrs[k]));
    svg.appendChild(el);
  }
  return svg;
}

/** Logo StreamPro (triangle « play » dégradé bleu → violet). */
let logoId = 0;

export function logoMark(size = 32): SVGSVGElement {
  // innerHTML sur un <div> : fonctionne aussi sur les vieux Chromium des TV.
  const id = 'spg' + ++logoId;
  const wrap = document.createElement('div');
  wrap.innerHTML =
    '<svg viewBox="0 0 64 64" width="' + size + '" height="' + size + '" class="logo-mark" aria-hidden="true">' +
    '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#3fa2ff"/><stop offset="1" stop-color="#8b5cff"/></linearGradient></defs>' +
    '<path d="M14 8.5c0-3 3.2-4.8 5.8-3.3l37 21.6c2.6 1.5 2.6 5.2 0 6.7l-37 21.6C17.2 56.6 14 54.8 14 51.8z" fill="url(#' + id + ')"/>' +
    '<path d="M24 22.5v19l16.5-9.5z" fill="#0a1030" opacity=".55"/></svg>';
  return wrap.firstChild as SVGSVGElement;
}
