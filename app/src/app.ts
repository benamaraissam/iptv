import type { Channel, ChannelKind, Playlist } from './types';
import { parseM3U, groupChannels, hashId } from './m3u';
import { loadXtream } from './xtream';
import { fetchText } from './http';
import * as store from './storage';
import { Player } from './player';
import { h, clear, toast, setLoading } from './ui/dom';
import { focusEl, focusFirst, move, setNavRoot } from './navigation';
import { exitApp, isTV, keyToAction, platform, registerTvKeys, type Action } from './platform';

const SAMPLE_PLAYLIST_URL = 'https://raw.githubusercontent.com/benamaraissam/iptv/master/list.m3u';
const PAGE_SIZE = 120;

type ScreenName = 'home' | 'form' | 'browser' | 'player';
type Section = { type: 'all' } | { type: 'favorites' } | { type: 'recents' } | { type: 'group'; name: string };

const KIND_LABELS: Record<ChannelKind, string> = {
  live: 'TV en direct',
  movie: 'Films',
  series: 'Séries',
};

export class App {
  private screens: Record<ScreenName, HTMLElement>;
  private current: ScreenName = 'home';
  private player: Player;

  private playlist: Playlist | null = null;
  private channels: Channel[] = [];
  private byId = new Map<string, Channel>();
  private favorites = new Set<string>();
  private section: Section = { type: 'all' };
  private kind: ChannelKind | 'all' = 'all';
  private query = '';
  /** Liste affichée : sert aussi au zapping dans le lecteur. */
  private visible: Channel[] = [];
  private rendered = 0;
  private playingIndex = -1;
  private lastFocusedChannelId: string | null = null;

  private overlayTimer: number | undefined;
  private digitBuffer = '';
  private digitTimer: number | undefined;

  constructor(root: HTMLElement) {
    document.documentElement.className = 'platform-' + platform + (isTV ? ' tv' : ' touch');

    const video = h('video', { id: 'video' });
    this.player = new Player(video, (msg) => toast(msg, true));

    this.screens = {
      home: h('section', { class: 'screen', id: 'screen-home' }),
      form: h('section', { class: 'screen', id: 'screen-form' }),
      browser: h('section', { class: 'screen', id: 'screen-browser' }),
      player: h('section', { class: 'screen', id: 'screen-player' }, video),
    };
    for (const k in this.screens) root.appendChild(this.screens[k as ScreenName]);

    registerTvKeys();
    document.addEventListener('keydown', (e) => this.onKey(e), true);
    this.bindNativeBack();
    this.showHome();
  }

  // ───────────────────────── Navigation entre écrans ─────────────────────────

  private show(name: ScreenName): void {
    for (const k in this.screens) {
      this.screens[k as ScreenName].classList.toggle('active', k === name);
    }
    this.current = name;
    setNavRoot(this.screens[name]);
  }

  private back(): void {
    switch (this.current) {
      case 'player':
        this.closePlayer();
        break;
      case 'browser':
        this.showHome();
        break;
      case 'form':
        this.showHome();
        break;
      default:
        exitApp();
    }
  }

  private async bindNativeBack(): Promise<void> {
    if (platform !== 'android') return;
    const { App: CapApp } = await import('@capacitor/app');
    CapApp.addListener('backButton', () => this.back());
  }

  // ───────────────────────────── Clavier / télécommande ─────────────────────────────

  private onKey(e: KeyboardEvent): void {
    // Clavier virtuel Tizen : « Terminé » / « Annuler »
    if (e.keyCode === 65376 || e.keyCode === 65385) {
      (document.activeElement as HTMLElement | null)?.blur();
      return;
    }
    const action = keyToAction(e);
    if (!action) return;

    const active = document.activeElement as HTMLElement | null;
    const inInput = !!active && (active.tagName === 'INPUT' || active.tagName === 'SELECT');
    if (inInput && (action === 'left' || action === 'right' || action === 'digit')) return;
    if (inInput && e.keyCode === 27) {
      active!.blur();
      focusEl(active);
      e.preventDefault();
      return;
    }

    if (this.current === 'player' && this.onPlayerKey(action, e)) {
      e.preventDefault();
      return;
    }

    switch (action) {
      case 'up':
      case 'down':
      case 'left':
      case 'right':
        e.preventDefault();
        if (!move(action) && action === 'left' && this.current === 'browser') {
          // En bord gauche de la grille : on remonte dans la barre latérale.
          focusEl(this.screens.browser.querySelector<HTMLElement>('.sidebar .selected'));
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
      case 'yellow':
        if (this.current === 'browser' && active && active.dataset.channel) {
          this.toggleFavorite(active.dataset.channel);
        }
        break;
      default:
    }
  }

  // ───────────────────────────── Accueil ─────────────────────────────

  private showHome(): void {
    this.player.stop();
    const el = this.screens.home;
    clear(el);
    const playlists = store.getPlaylists();

    const cards = playlists.map((p) =>
      h(
        'div',
        { class: 'playlist-row' },
        h(
          'button',
          { class: 'card playlist focusable', on: { click: () => this.openPlaylist(p) } },
          h('span', { class: 'playlist-icon', text: p.source.type === 'xtream' ? 'X' : 'M3U' }),
          h('span', { class: 'playlist-name', text: p.name }),
          h('span', { class: 'playlist-type', text: p.source.type === 'xtream' ? 'Xtream Codes' : 'Playlist M3U' }),
        ),
        h('button', {
          class: 'icon-btn focusable',
          title: 'Supprimer',
          text: '🗑',
          on: {
            click: () => {
              if (window.confirm('Supprimer « ' + p.name + ' » ?')) {
                store.removePlaylist(p.id);
                this.showHome();
              }
            },
          },
        }),
      ),
    );

    el.appendChild(
      h(
        'div',
        { class: 'home' },
        h('header', { class: 'home-header' }, h('h1', null, 'IPTV ', h('span', { class: 'accent' }, 'Player'))),
        h('p', { class: 'muted', text: 'Choisissez une playlist ou ajoutez-en une nouvelle.' }),
        h(
          'div',
          { class: 'playlist-list' },
          cards,
          h('button', {
            class: 'card add focusable',
            'data-autofocus': playlists.length === 0 ? true : undefined,
            text: '+ Ajouter une playlist',
            on: { click: () => this.showForm() },
          }),
          playlists.length === 0 &&
            h('button', {
              class: 'card sample focusable',
              text: 'Essayer avec la playlist d’exemple',
              on: {
                click: () => {
                  const p: Playlist = {
                    id: hashId(SAMPLE_PLAYLIST_URL),
                    name: 'Playlist d’exemple',
                    source: { type: 'm3u', url: SAMPLE_PLAYLIST_URL },
                  };
                  store.savePlaylist(p);
                  this.openPlaylist(p);
                },
              },
            }),
        ),
        h('p', {
          class: 'legal muted',
          text: 'Cette application est un simple lecteur : elle ne fournit aucun contenu. Utilisez uniquement des flux que vous avez le droit de regarder.',
        }),
      ),
    );
    this.show('home');
    focusFirst(el);
  }

  // ───────────────────────────── Ajout de playlist ─────────────────────────────

  private showForm(): void {
    const el = this.screens.form;
    clear(el);
    let type: 'm3u' | 'xtream' = 'm3u';

    const name = h('input', { class: 'focusable', type: 'text', placeholder: 'Ma playlist' });
    const url = h('input', { class: 'focusable', type: 'url', placeholder: 'https://exemple.com/playlist.m3u' });
    const server = h('input', { class: 'focusable', type: 'url', placeholder: 'http://serveur:8080' });
    const user = h('input', { class: 'focusable', type: 'text', autocapitalize: 'off', placeholder: 'Utilisateur' });
    const pass = h('input', { class: 'focusable', type: 'password', placeholder: 'Mot de passe' });

    const m3uFields = h('div', { class: 'fields' }, h('label', null, 'URL de la playlist M3U', url));
    const xtreamFields = h(
      'div',
      { class: 'fields hidden' },
      h('label', null, 'Serveur', server),
      h('label', null, 'Utilisateur', user),
      h('label', null, 'Mot de passe', pass),
    );

    const tabM3u = h('button', { class: 'tab focusable selected', text: 'Lien M3U' });
    const tabXtream = h('button', { class: 'tab focusable', text: 'Xtream Codes' });
    const setType = (t: 'm3u' | 'xtream') => {
      type = t;
      tabM3u.classList.toggle('selected', t === 'm3u');
      tabXtream.classList.toggle('selected', t === 'xtream');
      m3uFields.classList.toggle('hidden', t !== 'm3u');
      xtreamFields.classList.toggle('hidden', t !== 'xtream');
    };
    tabM3u.addEventListener('click', () => setType('m3u'));
    tabXtream.addEventListener('click', () => setType('xtream'));

    const submit = () => {
      let playlist: Playlist;
      if (type === 'm3u') {
        const u = url.value.trim();
        if (!/^https?:\/\//i.test(u)) return toast('Saisissez une URL valide (http/https).', true);
        playlist = { id: hashId(u), name: name.value.trim() || 'Playlist M3U', source: { type: 'm3u', url: u } };
      } else {
        if (!server.value.trim() || !user.value.trim() || !pass.value) {
          return toast('Serveur, utilisateur et mot de passe sont requis.', true);
        }
        playlist = {
          id: hashId(server.value.trim() + '|' + user.value.trim()),
          name: name.value.trim() || 'Xtream ' + user.value.trim(),
          source: { type: 'xtream', server: server.value.trim(), username: user.value.trim(), password: pass.value },
        };
      }
      store.savePlaylist(playlist);
      this.openPlaylist(playlist);
    };

    el.appendChild(
      h(
        'form',
        {
          class: 'form',
          on: {
            submit: (e: Event) => {
              e.preventDefault();
              submit();
            },
          },
        },
        h('h2', { text: 'Nouvelle playlist' }),
        h('div', { class: 'tabs' }, tabM3u, tabXtream),
        h('label', null, 'Nom', name),
        m3uFields,
        xtreamFields,
        h(
          'div',
          { class: 'actions' },
          h('button', { class: 'btn primary focusable', type: 'submit', text: 'Enregistrer' }),
          h('button', { class: 'btn focusable', type: 'button', text: 'Annuler', on: { click: () => this.showHome() } }),
        ),
      ),
    );
    this.show('form');
    focusEl(tabM3u);
  }

  // ───────────────────────────── Chargement ─────────────────────────────

  private async openPlaylist(p: Playlist, forceRefresh = false): Promise<void> {
    this.playlist = p;
    let channels = forceRefresh ? null : store.getCachedChannels(p.id);
    if (!channels || channels.length === 0) {
      setLoading(true, 'Chargement de « ' + p.name + ' »…');
      try {
        channels =
          p.source.type === 'm3u' ? parseM3U(await fetchText(p.source.url)) : await loadXtream(p.source);
        if (channels.length === 0) throw new Error('aucune chaîne trouvée');
        store.setCachedChannels(p.id, channels);
      } catch (e) {
        setLoading(false);
        toast('Impossible de charger la playlist : ' + (e as Error).message, true);
        if (this.current !== 'home') this.showHome();
        return;
      } finally {
        setLoading(false);
      }
    }

    this.channels = channels;
    this.byId = new Map(channels.map((c) => [c.id, c] as [string, Channel]));
    this.favorites = new Set(store.getFavorites(p.id));
    this.section = this.favorites.size > 0 ? { type: 'favorites' } : { type: 'all' };
    this.kind = 'all';
    this.query = '';
    this.renderBrowser();
    this.show('browser');
    this.focusChannel(null);
  }

  // ───────────────────────────── Navigateur de chaînes ─────────────────────────────

  private filtered(): Channel[] {
    let list: Channel[];
    switch (this.section.type) {
      case 'favorites':
        list = this.channels.filter((c) => this.favorites.has(c.id));
        break;
      case 'recents':
        list = store
          .getRecents(this.playlist!.id)
          .map((id) => this.byId.get(id))
          .filter((c): c is Channel => !!c);
        break;
      case 'group': {
        const name = this.section.name;
        list = this.channels.filter((c) => c.group === name);
        break;
      }
      default:
        list = this.channels;
    }
    if (this.kind !== 'all') list = list.filter((c) => c.kind === this.kind);
    const q = this.query.trim().toLowerCase();
    if (q) list = list.filter((c) => c.name.toLowerCase().indexOf(q) !== -1);
    return list;
  }

  private renderBrowser(): void {
    const el = this.screens.browser;
    clear(el);
    const p = this.playlist!;

    const kinds: ChannelKind[] = [];
    for (const c of this.channels) if (kinds.indexOf(c.kind) === -1) kinds.push(c.kind);

    const search = h('input', {
      class: 'search focusable',
      type: 'search',
      placeholder: 'Rechercher…',
      value: this.query,
      on: {
        input: () => {
          this.query = search.value;
          this.renderGrid();
        },
      },
    });

    const header = h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn focusable', title: 'Retour', text: '←', on: { click: () => this.showHome() } }),
      h('h2', { class: 'title', text: p.name }),
      kinds.length > 1 &&
        h(
          'div',
          { class: 'tabs' },
          (['all'] as (ChannelKind | 'all')[]).concat(kinds).map((k) =>
            h('button', {
              class: 'tab focusable' + (this.kind === k ? ' selected' : ''),
              text: k === 'all' ? 'Tout' : KIND_LABELS[k],
              on: {
                click: () => {
                  this.kind = k;
                  this.renderBrowser();
                  focusFirst(this.screens.browser.querySelector<HTMLElement>('.tabs')!);
                },
              },
            }),
          ),
        ),
      search,
      h('button', {
        class: 'icon-btn focusable',
        title: 'Actualiser',
        text: '⟳',
        on: { click: () => this.openPlaylist(p, true) },
      }),
    );

    const sideItem = (label: string, section: Section, count: number) => {
      const selected = sameSection(section, this.section);
      return h(
        'button',
        {
          class: 'side-item focusable' + (selected ? ' selected' : ''),
          on: {
            click: () => {
              this.section = section;
              this.renderBrowser();
              focusFirst(this.screens.browser.querySelector<HTMLElement>('.grid')!);
            },
          },
        },
        h('span', { class: 'side-label', text: label }),
        h('span', { class: 'count', text: String(count) }),
      );
    };

    const pool = this.kind === 'all' ? this.channels : this.channels.filter((c) => c.kind === this.kind);
    const groups = groupChannels(pool);
    const favCount = pool.filter((c) => this.favorites.has(c.id)).length;
    const sidebar = h(
      'nav',
      { class: 'sidebar' },
      sideItem('★ Favoris', { type: 'favorites' }, favCount),
      sideItem('🕘 Récents', { type: 'recents' }, store.getRecents(p.id).length),
      sideItem('Toutes les chaînes', { type: 'all' }, pool.length),
      h('div', { class: 'side-sep' }),
      Array.from(groups.entries()).map(([name, list]) => sideItem(name, { type: 'group', name }, list.length)),
    );

    const grid = h('div', { class: 'grid', on: { scroll: () => this.maybeRenderMore() } });
    el.appendChild(header);
    el.appendChild(h('div', { class: 'browser-body' }, sidebar, grid));
    this.renderGrid();
  }

  private renderGrid(): void {
    const grid = this.screens.browser.querySelector<HTMLElement>('.grid');
    if (!grid) return;
    clear(grid);
    grid.scrollTop = 0;
    this.visible = this.filtered();
    this.rendered = 0;
    if (this.visible.length === 0) {
      grid.appendChild(
        h('p', {
          class: 'empty muted',
          text:
            this.section.type === 'favorites'
              ? 'Aucun favori. Appuyez sur la touche jaune (ou ★) pour ajouter une chaîne.'
              : 'Aucune chaîne.',
        }),
      );
      return;
    }
    this.renderMore();
  }

  private renderMore(): void {
    const grid = this.screens.browser.querySelector<HTMLElement>('.grid')!;
    const end = Math.min(this.rendered + PAGE_SIZE, this.visible.length);
    const frag = document.createDocumentFragment();
    for (let i = this.rendered; i < end; i++) frag.appendChild(this.channelCard(this.visible[i], i));
    grid.appendChild(frag);
    this.rendered = end;
  }

  private maybeRenderMore(): void {
    const grid = this.screens.browser.querySelector<HTMLElement>('.grid');
    if (!grid || this.rendered >= this.visible.length) return;
    if (grid.scrollTop + grid.clientHeight > grid.scrollHeight - 600) this.renderMore();
  }

  private channelCard(ch: Channel, index: number): HTMLElement {
    const fav = this.favorites.has(ch.id);
    const logo = ch.logo
      ? h('img', {
          src: ch.logo,
          alt: '',
          loading: 'lazy',
          on: {
            error: (e: Event) => {
              const img = e.target as HTMLElement;
              if (img.parentNode) img.parentNode.replaceChild(h('span', { class: 'initials', text: initials(ch.name) }), img);
            },
          },
        })
      : h('span', { class: 'initials', text: initials(ch.name) });

    return h(
      'button',
      {
        class: 'channel focusable' + (fav ? ' fav' : ''),
        'data-channel': ch.id,
        on: {
          click: () => this.play(index),
          focus: () => {
            this.lastFocusedChannelId = ch.id;
            this.maybeRenderMore();
          },
          contextmenu: (e: Event) => {
            e.preventDefault();
            this.toggleFavorite(ch.id);
          },
        },
      },
      h('span', { class: 'logo' }, logo),
      h('span', { class: 'num', text: String(index + 1) }),
      h('span', { class: 'name', text: ch.name }),
      h('span', { class: 'star', text: '★' }),
    );
  }

  private toggleFavorite(channelId: string): void {
    if (!this.playlist) return;
    const added = store.toggleFavorite(this.playlist.id, channelId);
    if (added) this.favorites.add(channelId);
    else this.favorites.delete(channelId);
    const name = this.byId.get(channelId)?.name || '';
    toast(added ? '★ ' + name + ' ajouté aux favoris' : name + ' retiré des favoris');
    const card = this.screens.browser.querySelector<HTMLElement>('[data-channel="' + channelId + '"]');
    if (card) card.classList.toggle('fav', added);
    this.updatePlayerInfo();
  }

  // ───────────────────────────── Lecteur ─────────────────────────────

  private play(index: number): void {
    const ch = this.visible[index];
    if (!ch || !this.playlist) return;
    this.playingIndex = index;
    this.lastFocusedChannelId = ch.id;
    store.pushRecent(this.playlist.id, ch.id);
    if (this.current !== 'player') {
      this.buildPlayerOverlay();
      this.show('player');
    }
    this.player.load(ch.url);
    this.updatePlayerInfo();
    this.showOverlay();
  }

  private buildPlayerOverlay(): void {
    const el = this.screens.player;
    const old = el.querySelector('.overlay');
    if (old) el.removeChild(old);

    const btn = (text: string, title: string, fn: () => void, extra = '') =>
      h('button', { class: 'ctrl focusable ' + extra, title, text, on: { click: fn } });

    const overlay = h(
      'div',
      { class: 'overlay' },
      h(
        'div',
        { class: 'overlay-top' },
        btn('←', 'Retour', () => this.closePlayer()),
        h('div', { class: 'info' }, h('div', { class: 'ch-num' }), h('div', { class: 'ch-name' }), h('div', { class: 'ch-group' })),
      ),
      h(
        'div',
        { class: 'overlay-bottom' },
        btn('⏮', 'Chaîne précédente', () => this.zap(-1)),
        btn('⏯', 'Lecture / pause', () => this.player.togglePause(), 'play-btn'),
        btn('⏭', 'Chaîne suivante', () => this.zap(1)),
        btn('★', 'Favori', () => {
          const ch = this.visible[this.playingIndex];
          if (ch) this.toggleFavorite(ch.id);
        }, 'fav-btn'),
      ),
      isTV && h('div', { class: 'hint', text: '▲▼ zapper · OK pause · Jaune favori · Retour quitter' }),
    );
    el.appendChild(overlay);

    // Sur mobile : un tap sur la vidéo affiche/masque les contrôles.
    el.onclick = (e) => {
      if (e.target === el || e.target === this.player.video) {
        if (el.classList.contains('show-overlay')) this.hideOverlay();
        else this.showOverlay();
      }
    };
  }

  private updatePlayerInfo(): void {
    const ch = this.visible[this.playingIndex];
    const el = this.screens.player;
    if (!ch) return;
    const set = (sel: string, text: string) => {
      const n = el.querySelector(sel);
      if (n) n.textContent = text;
    };
    set('.ch-num', String(this.playingIndex + 1));
    set('.ch-name', ch.name);
    set('.ch-group', ch.group);
    const fav = el.querySelector('.fav-btn');
    if (fav) fav.classList.toggle('on', this.favorites.has(ch.id));
  }

  private showOverlay(): void {
    const el = this.screens.player;
    el.classList.add('show-overlay');
    if (!el.contains(document.activeElement)) focusEl(el.querySelector<HTMLElement>('.play-btn'));
    window.clearTimeout(this.overlayTimer);
    this.overlayTimer = window.setTimeout(() => this.hideOverlay(), 5000);
  }

  private hideOverlay(): void {
    this.screens.player.classList.remove('show-overlay');
    window.clearTimeout(this.overlayTimer);
  }

  private zap(delta: number): void {
    if (this.visible.length === 0) return;
    const n = this.visible.length;
    this.play((this.playingIndex + delta + n) % n);
  }

  private closePlayer(): void {
    this.player.stop();
    this.hideOverlay();
    // Favoris et récents ont pu changer : on reconstruit la vue puis on
    // replace le focus sur la dernière chaîne regardée.
    this.renderBrowser();
    this.show('browser');
    this.focusChannel(this.lastFocusedChannelId);
  }

  private focusChannel(id: string | null): void {
    const grid = this.screens.browser.querySelector<HTMLElement>('.grid')!;
    let idx = -1;
    for (let i = 0; id && i < this.visible.length; i++) if (this.visible[i].id === id) idx = i;
    while (idx >= this.rendered) this.renderMore();
    const card = idx >= 0 ? grid.querySelector<HTMLElement>('[data-channel="' + id + '"]') : null;
    focusEl(card || grid.querySelector<HTMLElement>('.channel') || this.screens.browser.querySelector<HTMLElement>('.sidebar .selected'));
  }

  /** Retourne true si la touche a été consommée par le lecteur. */
  private onPlayerKey(action: Action, e: KeyboardEvent): boolean {
    const overlayVisible = this.screens.player.classList.contains('show-overlay');
    switch (action) {
      case 'chup':
      case 'up':
        this.zap(1);
        return true;
      case 'chdown':
      case 'down':
        this.zap(-1);
        return true;
      case 'playpause':
      case 'play':
      case 'pause':
        this.player.togglePause();
        this.showOverlay();
        return true;
      case 'stop':
      case 'back':
        this.closePlayer();
        return true;
      case 'yellow': {
        const ch = this.visible[this.playingIndex];
        if (ch) this.toggleFavorite(ch.id);
        return true;
      }
      case 'digit':
        this.onDigit(String((e.keyCode >= 96 ? e.keyCode - 96 : e.keyCode - 48)));
        return true;
      case 'enter':
      case 'left':
      case 'right':
        if (!overlayVisible) {
          this.showOverlay();
          return true;
        }
        this.showOverlay(); // relance le minuteur
        return false; // laisse la navigation / le clic par défaut agir sur les boutons
      default:
        return false;
    }
  }

  private onDigit(d: string): void {
    this.digitBuffer = (this.digitBuffer + d).slice(-4);
    const num = this.screens.player.querySelector('.ch-num');
    if (num) num.textContent = this.digitBuffer + '_';
    this.showOverlay();
    window.clearTimeout(this.digitTimer);
    this.digitTimer = window.setTimeout(() => {
      const target = parseInt(this.digitBuffer, 10) - 1;
      this.digitBuffer = '';
      if (target >= 0 && target < this.visible.length) this.play(target);
      else this.updatePlayerInfo();
    }, 1500);
  }
}

function sameSection(a: Section, b: Section): boolean {
  if (a.type !== b.type) return false;
  return a.type !== 'group' || a.name === (b as { name: string }).name;
}

function initials(name: string): string {
  // Uniquement les mots commen\u00E7ant par une lettre : \u00AB Episode 01 \u00BB \u2192 \u00AB EP \u00BB, \u00AB Canal Plus \u00BB \u2192 \u00AB CP \u00BB.
  const words = name
    .replace(/[^\w\u00C0-\uFFFF]+/g, ' ')
    .split(' ')
    .filter((w) => /^[^\d_]/.test(w));
  if (words.length === 0) return name.trim().slice(0, 2).toUpperCase() || '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
