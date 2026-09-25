import type { Channel, ItemRef, Playable, Playlist, Show } from './types';
import { mark, timed } from './diag';
import { Catalog } from './catalog';
import { describeNetworkError } from './http';
import { setPauseDuringPlayback } from './health';
import * as store from './storage';
import { Engine } from './player';
import { h, clear, toast, setLoading } from './ui/dom';
import { icon, logoMark, type IconName } from './ui/icons';
import { askPin, closeTopModal, hasModal } from './ui/components';
import { focusEl, focusFirst, move, getNavRoot } from './navigation';
import { exitApp, isTV, keyToAction, platform, registerTvKeys, type Action } from './platform';
import { detectLang, setLang, t, type TKey } from './i18n';
import { screens, type RouteName } from './screens';

export interface Screen {
  el: HTMLElement;
  /** 'nav' : affiche la barre latérale (TV) ou les onglets (mobile). */
  chrome?: 'nav' | 'none';
  /** Onglet / entrée de menu à mettre en évidence. */
  tab?: string;
  onKey?(action: Action, e: KeyboardEvent): boolean;
  onShow?(): void;
  onHide?(): void;
  destroy?(): void;
}

interface StackEntry {
  name: RouteName;
  params: any;
  screen: Screen;
  focus: HTMLElement | null;
}

interface NavItem {
  route: RouteName;
  icon: IconName;
  label: TKey;
}

const SIDE_NAV: NavItem[] = [
  { route: 'search', icon: 'search', label: 'search' },
  { route: 'home', icon: 'home', label: 'home' },
  { route: 'live', icon: 'live', label: 'liveTv' },
  { route: 'guide', icon: 'guide', label: 'tvGuide' },
  { route: 'movies', icon: 'movie', label: 'movies' },
  { route: 'series', icon: 'series', label: 'series' },
  { route: 'catchup', icon: 'catchup', label: 'catchup' },
  { route: 'library', icon: 'heart', label: 'myList' },
  { route: 'settings', icon: 'settings', label: 'settings' },
];

const TAB_NAV: NavItem[] = [
  { route: 'home', icon: 'home', label: 'home' },
  { route: 'live', icon: 'live', label: 'liveTv' },
  { route: 'search', icon: 'search', label: 'search' },
  { route: 'library', icon: 'library', label: 'library' },
  { route: 'profile', icon: 'user', label: 'profile' },
];

const ADULT_RE = /adult|xxx|\+18|18\+|porn|erotic|for adults/i;

class AppCore {
  catalog: Catalog | null = null;
  engine = new Engine();
  layout: 'wide' | 'compact' = 'compact';

  private shell!: HTMLElement;
  private stage!: HTMLElement;
  private sidenav!: HTMLElement;
  private tabbar!: HTMLElement;
  private stack: StackEntry[] = [];
  private unlocked: Record<string, boolean> = {};

  get wide(): boolean {
    return this.layout === 'wide';
  }

  get playlistId(): string {
    return this.catalog ? this.catalog.playlist.id : '';
  }

  start(root: HTMLElement): void {
    const settings = store.getSettings();
    setLang(settings.lang || detectLang());
    this.engine.quality = settings.quality;
    document.documentElement.className = 'platform-' + platform + (isTV ? ' tv' : ' touch');

    this.sidenav = h('nav', { class: 'sidenav' });
    this.tabbar = h('nav', { class: 'tabbar' });
    this.stage = h('main', { class: 'stage' });
    this.shell = h('div', { class: 'shell' }, this.sidenav, this.stage, this.tabbar);
    root.appendChild(this.shell);

    this.updateLayout();
    window.addEventListener('resize', () => this.updateLayout());
    this.sidenav.addEventListener('focusin', () => this.shell.classList.add('nav-open'));
    // Le navigateur fait défiler un conteneur « overflow: hidden » pour montrer l'élément
    // qui reçoit le focus : on garde le menu calé à gauche (sinon libellés coupés).
    this.sidenav.addEventListener('scroll', () => {
      if (this.sidenav.scrollLeft) this.sidenav.scrollLeft = 0;
    });
    this.sidenav.addEventListener('focusout', () => {
      window.setTimeout(() => {
        if (!this.sidenav.contains(document.activeElement)) this.shell.classList.remove('nav-open');
      }, 0);
    });

    registerTvKeys();
    document.addEventListener('keydown', (e) => this.onKey(e), true);
    // Anneau de focus seulement quand on navigue au clavier (hors TV).
    const noKbd = () => document.documentElement.classList.remove('kbd');
    document.addEventListener('mousedown', noKbd, true);
    document.addEventListener('touchstart', noKbd, true);
    this.bindAndroidBack();
    this.reset('splash');
  }

  private updateLayout(): void {
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    const next = isTV || (w >= 900 && w > hgt) ? 'wide' : 'compact';
    const changed = next !== this.layout || !this.sidenav.firstChild;
    this.layout = next;
    this.shell.classList.toggle('layout-wide', next === 'wide');
    this.shell.classList.toggle('layout-compact', next === 'compact');
    // Aussi sur <html> : les modales sont ajoutées hors de la coquille.
    document.documentElement.classList.toggle('layout-wide', next === 'wide');
    document.documentElement.classList.toggle('layout-compact', next === 'compact');
    if (changed) {
      this.renderNav();
      // Les écrans dont la mise en page diffère sont reconstruits.
      const top = this.stack[this.stack.length - 1];
      if (top && top.screen.chrome === 'nav') this.replace(top.name, top.params);
    }
  }

  // ───────────────────────── Navigation ─────────────────────────

  private renderNav(): void {
    clear(this.sidenav);
    clear(this.tabbar);
    this.sidenav.appendChild(h('div', { class: 'sidenav-logo' }, logoMark(34), h('span', { class: 'brand' }, 'Stream', h('b', null, 'Pro'))));
    const side = h('div', { class: 'sidenav-items' });
    for (const it of SIDE_NAV) {
      side.appendChild(
        h(
          'button',
          { type: 'button', class: 'nav-item focusable', 'data-route': it.route, on: { click: () => this.reset(it.route) } },
          icon(it.icon),
          h('span', { text: t(it.label) }),
        ),
      );
    }
    this.sidenav.appendChild(side);
    for (const it of TAB_NAV) {
      this.tabbar.appendChild(
        h(
          'button',
          { type: 'button', class: 'tab-item focusable', 'data-route': it.route, on: { click: () => this.reset(it.route) } },
          icon(it.icon),
          h('span', { text: t(it.label) }),
        ),
      );
    }
    this.highlightNav();
  }

  private highlightNav(): void {
    const top = this.stack[this.stack.length - 1];
    const tab = top ? top.screen.tab || top.name : '';
    const items = this.shell.querySelectorAll<HTMLElement>('.nav-item, .tab-item');
    for (let i = 0; i < items.length; i++) items[i].classList.toggle('active', items[i].getAttribute('data-route') === tab);
    const chrome = top && top.screen.chrome === 'nav';
    this.shell.classList.toggle('with-nav', !!chrome);
    // Menu toujours replié (icônes) : il s'ouvre en surimpression quand il reçoit le focus.
    this.shell.classList.remove('nav-expanded');
  }

  /** Relance l'interface (changement de langue, de playlist...). */
  rebuild(): void {
    this.renderNav();
    const top = this.stack[this.stack.length - 1];
    if (top) this.replace(top.name, top.params);
  }

  push(name: RouteName, params?: any): void {
    const cur = this.stack[this.stack.length - 1];
    if (cur) {
      cur.focus = document.activeElement as HTMLElement | null;
      cur.screen.el.classList.remove('active');
      if (cur.screen.onHide) cur.screen.onHide();
    }
    const screen = timed('écran « ' + name + ' » : construction', () => screens[name](params || {}));
    screen.el.classList.add('screen');
    this.stage.appendChild(screen.el);
    this.stack.push({ name, params: params || {}, screen, focus: null });
    this.activate(this.stack[this.stack.length - 1], true);
  }

  replace(name: RouteName, params?: any): void {
    const cur = this.stack.pop();
    if (cur) this.destroy(cur);
    this.push(name, params);
  }

  /** Vide la pile et affiche un écran racine (onglets, menu latéral). */
  reset(name: RouteName, params?: any): void {
    while (this.stack.length) this.destroy(this.stack.pop()!);
    this.push(name, params);
  }

  back(): void {
    if (hasModal()) return closeTopModal();
    if (this.stack.length <= 1) {
      const top = this.stack[0];
      if (top && top.name !== 'home' && top.screen.chrome === 'nav') return this.reset('home');
      if (top && (top.name === 'onboarding' || top.name === 'login') && this.catalog) return this.reset('home');
      return exitApp();
    }
    this.destroy(this.stack.pop()!);
    const prev = this.stack[this.stack.length - 1];
    this.activate(prev, false);
  }

  private activate(entry: StackEntry, fresh: boolean): void {
    entry.screen.el.classList.add('active');
    this.highlightNav();
    if (entry.screen.onShow) entry.screen.onShow();
    if (!fresh && entry.focus && entry.screen.el.contains(entry.focus)) focusEl(entry.focus);
    else if (getNavRoot() === document.body) focusFirst(entry.screen.el);
  }

  private destroy(entry: StackEntry): void {
    mark('écran « ' + entry.name + ' » : destruction');
    if (entry.screen.onHide) entry.screen.onHide();
    if (entry.screen.destroy) entry.screen.destroy();
    if (entry.screen.el.parentNode) entry.screen.el.parentNode.removeChild(entry.screen.el);
  }

  get current(): RouteName | null {
    const top = this.stack[this.stack.length - 1];
    return top ? top.name : null;
  }

  // ───────────────────────── Clavier / télécommande ─────────────────────────

  private onKey(e: KeyboardEvent): void {
    // Clavier virtuel Tizen : « Terminé » / « Annuler »
    if (e.keyCode === 65376 || e.keyCode === 65385) {
      (document.activeElement as HTMLElement | null)?.blur();
      return;
    }
    const action = keyToAction(e);
    if (!action) return;
    this.handleAction(action, e);
  }

  /** Action d'une touche (clavier, télécommande TV, ou relayée par l'activité Android). */
  private handleAction(action: Action, e: KeyboardEvent): void {
    // Fire TV : la touche Menu tient lieu de touche jaune (liste des chaînes, favoris).
    if (action === 'menu') action = 'yellow';
    if (!isTV) document.documentElement.classList.add('kbd');
    const active = document.activeElement as HTMLElement | null;
    const inInput = !!active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA');
    if (inInput && (action === 'left' || action === 'right' || action === 'digit')) return;
    if (inInput && e.keyCode === 27) {
      active!.blur();
      focusEl(active);
      e.preventDefault();
      return;
    }

    const top = this.stack[this.stack.length - 1];
    if (!hasModal() && top && top.screen.onKey && top.screen.onKey(action, e)) {
      e.preventDefault();
      return;
    }

    switch (action) {
      case 'up':
      case 'down':
      case 'left':
      case 'right':
        e.preventDefault();
        if (!move(action) && action === 'left' && !hasModal() && this.wide && top && top.screen.chrome === 'nav') {
          focusEl(this.sidenav.querySelector<HTMLElement>('.nav-item.active') || this.sidenav.querySelector<HTMLElement>('.nav-item'));
        }
        break;
      case 'enter':
        if (active && active !== document.body && !inInput) {
          e.preventDefault();
          active.click();
        }
        break;
      case 'back':
        e.preventDefault();
        this.back();
        break;
      default:
    }
  }

  private async bindAndroidBack(): Promise<void> {
    if (platform !== 'android') return;
    // Touches relayées par MainActivity (média, menu, chaîne +/−, couleurs).
    window.addEventListener('spRemote', (ev: Event) => {
      // Capacitor copie les champs du message sur l'événement lui-même.
      const a = ((ev as any).action || ((ev as CustomEvent).detail && (ev as CustomEvent).detail.action)) as Action | undefined;
      if (a) this.handleAction(a, new KeyboardEvent('keydown'));
    });
    const { App: CapApp } = await import('@capacitor/app');
    // Retour matériel : même chemin que la touche Retour (ferme d'abord la liste ou le menu).
    CapApp.addListener('backButton', () => this.handleAction('back', new KeyboardEvent('keydown')));
  }

  // ───────────────────────── Playlist ─────────────────────────

  async openPlaylist(p: Playlist, force = false): Promise<boolean> {
    setLoading(true, t('loading'));
    try {
      this.catalog = await Catalog.load(p, force);
      setPauseDuringPlayback(p.source.type === 'xtream');
      store.updateSettings({ activePlaylist: p.id });
      return true;
    } catch (e) {
      const m = describeNetworkError(e);
      toast(
        t('loadError') + ' : ' + (m === 'network' ? t('errNetwork') : /identifiants|auth/i.test(m) ? t('errAuth') : m),
        true,
      );
      return false;
    } finally {
      setLoading(false);
    }
  }

  // ───────────────────────── Contenu ─────────────────────────

  isLocked(group: string): boolean {
    const p = store.getParental();
    if (!p.enabled || !p.pin || this.unlocked[group]) return false;
    return p.lockedGroups.indexOf(group) !== -1 || (p.lockAdult && ADULT_RE.test(group));
  }

  /** Demande le code PIN si la catégorie est verrouillée. */
  async unlock(group: string): Promise<boolean> {
    if (!this.isLocked(group)) return true;
    const pin = store.getParental().pin;
    const ok = await askPin(t('enterPin'), (v) => v === pin);
    if (ok) this.unlocked[group] = true;
    return !!ok;
  }

  async openItem(item: Channel | Show, _queue?: Channel[]): Promise<void> {
    if (!(await this.unlock(item.group))) return;
    if ('kind' in item && item.kind === 'live') return this.openChannel(item);
    this.push('detail', { id: item.id });
  }

  /** Ouvre la TV en direct (liste + moniteur) avec cette chaîne lancée dans le moniteur. */
  async openChannel(ch: Channel): Promise<void> {
    if (!(await this.unlock(ch.group))) return;
    this.reset('live', { channelId: ch.id });
  }

  /** Lecture plein écran directe (depuis la TV en direct ou le guide). */
  playChannel(ch: Channel, queue?: Channel[]): void {
    const list = queue && queue.length ? queue : [ch];
    this.play(channelPlayable(ch), {
      queue: list.map(channelPlayable),
      index: Math.max(0, list.indexOf(ch)),
    });
  }

  play(p: Playable, o: { queue?: Playable[]; index?: number; resume?: boolean; at?: number } = {}): void {
    const params = { item: p, queue: o.queue || [p], index: o.index || 0, resume: o.resume !== false, at: o.at };
    if (this.current === 'player') this.replace('player', params);
    else this.push('player', params);
  }

  toggleMyList(ref: ItemRef): boolean {
    const added = store.toggleMyList(this.playlistId, ref);
    toast((added ? '♥ ' : '') + ref.title + ' ' + t(added ? 'addedToList' : 'removedFromList'));
    return added;
  }

  inMyList(id: string): boolean {
    return store.inMyList(this.playlistId, id);
  }
}

export function channelPlayable(ch: Channel): Playable {
  return { id: ch.id, kind: ch.kind === 'movie' ? 'movie' : 'live', title: ch.name, subtitle: ch.group, url: ch.url, poster: ch.logo };
}

export function refOf(item: Channel | Show): ItemRef {
  if ('kind' in item) {
    return { id: item.id, kind: item.kind === 'live' ? 'live' : 'movie', title: item.name, poster: item.logo, sub: item.group };
  }
  return { id: item.id, kind: 'series', title: item.name, poster: item.cover, sub: item.group };
}

export const app = new AppCore();
