import type { Screen } from '../app';
import { app, refOf } from '../app';
import type { Channel, Details, Program, Show } from '../types';
import { h, clear } from '../ui/dom';
import { icon, logoMark, type IconName } from '../ui/icons';
import { art, bgArt, btn, card, iconBtn, rail, rescuableArt } from '../ui/components';
import { focusEl } from '../navigation';
import { currentProgram } from '../epg';
import * as store from '../storage';
import { formatRemaining, formatTime, t, type TKey } from '../i18n';
import { channelNumber, clock, continueEntries, historyEntries, imageFirst, prefetchOnIntent, resolvePoster } from './common';
import { hasGoodImage } from '../imgcache';

type Item = Channel | Show;
/** Ce que la grande affiche peut présenter. */
type HeroItem = { kind: 'entry'; e: store.HistoryEntry } | { kind: 'item'; x: Item };

const ROTATE_MS = 9000;
const MAX_FEATURED = 6;

const isLive = (x: Item): boolean => 'kind' in x && x.kind === 'live';
const isShow = (x: Item): x is Show => !('kind' in x);
/** Visuel large : backdrop des films / séries. Les chaînes n'ont qu'un logo. */
const backdropOf = (x: Item): string | undefined => (isShow(x) ? x.backdrop || x.cover : isLive(x) ? undefined : (x as Channel).logo);
const posterOf = (x: Item): string | undefined => (isShow(x) ? x.cover : x.logo);

/**
 * Accueil façon Netflix : grande affiche (rotation automatique, ou élément sélectionné
 * sur TV), puis rangées thématiques. Fonctionne aussi pour une playlist 100 % TV en direct.
 */
export function home(): Screen {
  const cat = app.catalog!;
  const pid = cat.playlist.id;
  const wide = app.wide;
  const open = <T extends { group: string }>(list: T[]) => list.filter((x) => !app.isLocked(x.group));

  // Partout sur l'accueil, les éléments avec une image passent devant.
  const movies = imageFirst(open(cat.movies), (m) => m.logo);
  const shows = imageFirst(open(cat.shows), (x) => x.cover || x.backdrop);
  const live = imageFirst(open(cat.live), (c) => c.logo);
  const vod: Item[] = (movies as Item[]).concat(shows);
  const cont = continueEntries(pid);
  const history = historyEntries(pid);
  const myList = store.getMyList(pid);

  // Les « meilleurs N » se choisissent en une passe (pas de tri de 170 000 titres) ;
  // on en prend un peu plus que nécessaire pour que ceux avec image passent devant.
  const recent = imageFirst(topN(vod, 60, (x) => x.added || 0), posterOf).slice(0, 20);
  const top10 = imageFirst(topN(vod, 40, (x) => x.rating || 0), posterOf).slice(0, 10);

  // ───── Éléments mis en avant (rotation) ─────
  const featured: HeroItem[] = [];
  const seen: Record<string, boolean> = {};
  const feature = (hi: HeroItem) => {
    const id = hi.kind === 'entry' ? hi.e.id : hi.x.id;
    if (seen[id] || featured.length >= MAX_FEATURED) return;
    seen[id] = true;
    featured.push(hi);
  };
  if (cont[0] && cont[0].poster) feature({ kind: 'entry', e: cont[0] });
  // Mise en avant : uniquement des visuels qui s'affichent vraiment.
  const goodBackdrop = (x: Item) => hasGoodImage(backdropOf(x));
  for (const x of recent.filter(goodBackdrop).slice(0, 4)) feature({ kind: 'item', x });
  for (const x of top10.filter(goodBackdrop).slice(0, 4)) feature({ kind: 'item', x });
  for (const x of firstN(vod, 4, goodBackdrop)) feature({ kind: 'item', x });
  if (featured.length < 3) {
    // Playlist de chaînes : favoris, dernières regardées, puis une chaîne par catégorie.
    const liveIds: Record<string, boolean> = {};
    for (const r of myList) if (r.kind === 'live') liveIds[r.id] = true;
    for (const hEntry of history) if (hEntry.kind === 'live') liveIds[hEntry.id] = true;
    for (const c of live) if (liveIds[c.id] && c.logo) feature({ kind: 'item', x: c });
    for (const g of cat.groups(live)) {
      const c = live.filter((x) => x.group === g && x.logo)[0];
      if (c) feature({ kind: 'item', x: c });
    }
  }

  // ───── Grande affiche ─────
  const heroBg = h('div', { class: 'hero-bg' });
  const heroLogo = h('div', { class: 'hero-logo' });
  const heroKicker = h('div', { class: 'hero-kicker' });
  const heroTitle = h('h1', { class: 'hero-title' });
  const heroMeta = h('div', { class: 'meta hero-meta' });
  const heroPlot = h('p', { class: 'hero-plot' });
  const heroLive = h('div', { class: 'hero-live' });
  const heroActions = h('div', { class: 'hero-actions' });
  const dots = h('div', { class: 'hero-dots' });
  const hero = h(
    'section',
    { class: 'billboard' },
    heroBg,
    heroLogo,
    h('div', { class: 'hero-shade' }),
    h('div', { class: 'hero-content' }, heroKicker, heroTitle, heroMeta, heroLive, heroPlot, heroActions),
    dots,
  );

  let heroIndex = 0;
  let heroToken = 0;
  const detailsCache: Record<string, Details> = {};

  const showHero = (hi: HeroItem, keepFocus = false) => {
    const token = ++heroToken;
    const x = hi.kind === 'item' ? hi.x : null;
    const e = hi.kind === 'entry' ? hi.e : null;
    const title = e ? e.title : x!.name;
    const liveCh = x && isLive(x) ? (x as Channel) : null;

    // Visuel : image plein écran, ou halo + logo net pour une chaîne.
    clear(heroBg);
    clear(heroLogo);
    hero.classList.toggle('is-live', !!liveCh);
    const image = e ? e.poster : liveCh ? liveCh.logo : backdropOf(x!);
    if (liveCh) {
      if (image) heroBg.appendChild(h('div', { class: 'hero-ambient', style: 'background-image:url("' + image.replace(/"/g, '%22') + '")' }));
      heroLogo.appendChild(art(image, title, 'contain'));
    } else if (image) heroBg.appendChild(bgArt(image, title));
    hero.classList.remove('hero-enter');
    void hero.offsetWidth; // relance l'animation de fondu
    hero.classList.add('hero-enter');

    clear(heroKicker);
    clear(heroMeta);
    clear(heroLive);
    heroPlot.textContent = '';
    heroTitle.textContent = title;
    if (e) {
      heroKicker.appendChild(h('span', { class: 'kicker', text: t('continueWatching') }));
      if (e.subtitle) heroMeta.appendChild(h('span', { text: e.subtitle }));
      heroLive.appendChild(h('div', { class: 'hero-progress' }, h('i', { style: 'width:' + Math.round((e.pos / e.dur) * 100) + '%' })));
      heroLive.appendChild(h('span', { class: 'muted', text: formatRemaining(e.dur - e.pos) + ' ' + t('left') }));
    } else if (liveCh) {
      heroKicker.appendChild(h('span', { class: 'kicker live' }, h('span', { class: 'live-dot' }), t('live')));
      heroKicker.appendChild(h('span', { class: 'kicker-sub', text: channelNumber(liveCh) + ' · ' + liveCh.group }));
      if (cat.epg.available) {
        cat.epg.programs(liveCh).then((list: Program[]) => {
          if (token !== heroToken) return;
          const p = currentProgram(list);
          if (!p) return;
          clear(heroLive);
          heroLive.appendChild(h('div', { class: 'hero-now', text: p.title }));
          heroLive.appendChild(h('div', { class: 'hero-progress' }, h('i', { style: 'width:' + Math.min(100, ((Date.now() - p.start) / (p.end - p.start)) * 100) + '%' })));
          heroLive.appendChild(h('span', { class: 'muted', text: formatTime(p.start) + ' – ' + formatTime(p.end) }));
          if (p.desc) heroPlot.textContent = p.desc;
        }, () => undefined);
      }
    } else {
      const it = x!;
      heroKicker.appendChild(h('span', { class: 'kicker', text: isShow(it) ? t('series') : t('movies') }));
      fillMeta(heroMeta, { year: it.year, genre: isShow(it) ? it.genre : undefined, rating: it.rating, group: it.group });
      if (isShow(it) && it.plot) heroPlot.textContent = it.plot;
      const d = detailsCache[it.id] || cat.cachedDetails(it.id);
      const apply = (det: Details) => {
        if (token !== heroToken) return;
        if (det.plot) heroPlot.textContent = det.plot;
        clear(heroMeta);
        fillMeta(heroMeta, { year: det.year || it.year, genre: det.genre, rating: det.rating || it.rating, duration: det.duration, group: it.group });
        if (det.backdrop && det.backdrop !== image) {
          clear(heroBg);
          heroBg.appendChild(bgArt(det.backdrop, title));
        }
      };
      if (d) apply(d);
      else if (cat.isXtream) {
        cat.details(it).then((det) => {
          detailsCache[it.id] = det;
          apply(det);
        }, () => undefined);
      }
    }

    // Actions
    const hadFocus = hero.contains(document.activeElement);
    clear(heroActions);
    const playLabel = e ? t('resume') : liveCh ? t('watchLive') : isShow(x!) ? t('episodes') : t('play');
    heroActions.appendChild(btn(playLabel, { variant: 'light', icon: 'play', cls: 'hero-play', onClick: () => playHero(hi, live) }));
    if (!e) {
      heroActions.appendChild(
        btn(liveCh ? t('allChannels') : t('moreInfo'), {
          variant: 'glass',
          icon: liveCh ? 'live' : 'info',
          onClick: () => (liveCh ? app.reset('live', { group: liveCh.group }) : app.openItem(x!)),
        }),
      );
      const inList = app.inMyList(x!.id);
      const listBtn = iconBtn(inList ? 'check' : 'plus', t('addToList'), () => {
        const on = app.toggleMyList(refOf(x!));
        clear(listBtn);
        listBtn.appendChild(icon(on ? 'check' : 'plus'));
      }, 'hero-list');
      heroActions.appendChild(listBtn);
    }
    if (hadFocus && !keepFocus) focusEl(heroActions.querySelector<HTMLElement>('.btn'));

    // Points de rotation
    const i = featured.indexOf(hi);
    const nodes = dots.children;
    for (let k = 0; k < nodes.length; k++) nodes[k].classList.toggle('on', k === i);
  };

  // Rotation automatique ; en pause dès que l'utilisateur parcourt les rangées.
  let rotateTimer: number | undefined;
  let browsing = false;
  const next = (delta = 1) => {
    if (featured.length < 2) return;
    heroIndex = (heroIndex + delta + featured.length) % featured.length;
    showHero(featured[heroIndex], true);
    armRotation();
  };
  const armRotation = () => {
    window.clearTimeout(rotateTimer);
    if (featured.length > 1 && !browsing) rotateTimer = window.setTimeout(() => next(1), ROTATE_MS);
  };
  featured.forEach((_f, i) =>
    dots.appendChild(
      h('button', {
        type: 'button',
        class: 'hero-dot',
        'aria-label': String(i + 1),
        on: {
          click: () => {
            heroIndex = i;
            showHero(featured[i], true);
            armRotation();
          },
        },
      }),
    ),
  );

  // Balayage horizontal sur mobile.
  let touchX = 0;
  hero.addEventListener('touchstart', (ev) => (touchX = (ev as TouchEvent).touches[0].clientX), { passive: true } as any);
  hero.addEventListener('touchend', (ev) => {
    const dx = (ev as TouchEvent).changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) next(dx < 0 ? 1 : -1);
  });

  // ───── Rangées ─────
  const onFocusItem = (hi: HeroItem) => {
    if (!wide) return;
    browsing = true;
    window.clearTimeout(rotateTimer);
    window.clearTimeout(focusTimer);
    focusTimer = window.setTimeout(() => showHero(hi, true), 280);
  };
  let focusTimer: number | undefined;

  const attachHero = (el: HTMLElement, hi: HeroItem) => {
    el.addEventListener('focus', () => onFocusItem(hi));
    return el;
  };

  const posterCard = (x: Item) =>
    prefetchOnIntent(
      attachHero(
        card(
          { title: x.name, sub: x.year || (x.rating ? '★ ' + x.rating.toFixed(1) : x.group), image: posterOf(x), fav: app.inMyList(x.id), resolveImage: () => resolvePoster(x) },
          'poster',
          () => app.openItem(x),
        ),
        { kind: 'item', x },
      ),
      x,
    );

  const rows: (HTMLElement | null)[] = [];
  const addRow = (title: string, items: HTMLElement[], seeAll?: () => void, cls = '') => {
    const r = rail(title, items, seeAll);
    if (r && cls) r.classList.add(cls);
    rows.push(r);
  };

  addRow(
    t('continueWatching'),
    cont.map((e) =>
      attachHero(
        card({ title: e.title, sub: e.subtitle || formatRemaining(e.dur - e.pos) + ' ' + t('left'), image: e.poster, progress: e.pos / e.dur }, 'landscape', () => app.play(e)),
        { kind: 'entry', e },
      ),
    ),
    () => app.reset('library', { tab: 'continue' }),
  );

  // Ma liste
  const listItems: HTMLElement[] = [];
  for (const r of myList) {
    const x = cat.get(r.id) as Item | undefined;
    if (!x || app.isLocked(x.group)) continue;
    listItems.push(isLive(x) ? channelTile(x as Channel, live, attachHero) : posterCard(x));
  }
  addRow(t('myList'), listItems, () => app.reset('library', { tab: 'list' }));

  // Top 10
  addRow(
    t('top10'),
    top10.map((x, i) =>
      attachHero(
        h(
          'button',
          { type: 'button', class: 'card card-top focusable', on: { click: () => app.openItem(x) } },
          h('span', { class: 'top-num', text: String(i + 1) }),
          h('div', { class: 'card-media' }, rescuableArt(posterOf(x), x.name, '', () => resolvePoster(x))),
        ),
        { kind: 'item', x },
      ),
    ),
    undefined,
    'rail-top',
  );

  // En direct maintenant (chaînes avec programme connu en priorité)
  const liveNow = pickLiveNow(live, history, myList.map((r) => r.id));
  addRow(t('liveNowRow'), liveNow.map((c) => channelTile(c, live, attachHero)), () => app.reset('live'), 'rail-live');

  addRow(t('recentlyAdded'), recent.map(posterCard));

  // Genres films / séries
  const movieGroups = topGroups(movies, 4);
  const byMovieGroup = firstByGroup(movies, movieGroups, 20);
  for (const g of movieGroups) addRow(g, byMovieGroup[g].map(posterCard), () => app.push('movies', { group: g }));
  const showGroups = topGroups(shows, 3);
  const byShowGroup = firstByGroup(shows, showGroups, 20);
  for (const g of showGroups) addRow(g, byShowGroup[g].map(posterCard), () => app.push('series', { group: g }));

  // Chaînes par catégorie
  const liveGroups = topGroups(live, 8);
  const byLiveGroup = firstByGroup(live, liveGroups, 20);
  for (const g of liveGroups) {
    const chans = byLiveGroup[g];
    addRow(g, chans.map((c) => channelTile(c, chans, attachHero)), () => app.reset('live', { group: g }), 'rail-live');
  }

  // Chaînes regardées récemment
  const recentLive: Channel[] = [];
  for (const hEntry of history) {
    if (hEntry.kind !== 'live') continue;
    const c = cat.get(hEntry.id) as Channel | undefined;
    if (c && isLive(c) && !app.isLocked(c.group)) recentLive.push(c);
  }
  addRow(t('recentChannels'), recentLive.slice(0, 20).map((c) => channelTile(c, recentLive, attachHero)), undefined, 'rail-live');

  // Accès rapides (mobile)
  const quick: [IconName, TKey, () => void][] = [
    ['live', 'liveTv', () => app.reset('live')],
    ['movie', 'movies', () => app.push('movies')],
    ['series', 'series', () => app.push('series')],
    ['guide', 'tvGuide', () => app.push('guide')],
    ['catchup', 'catchup', () => app.push('catchup')],
  ];
  const quickRow = h(
    'div',
    { class: 'quick-row' },
    quick
      .filter(([, label]) => !(label === 'movies' && !movies.length) && !(label === 'series' && !shows.length))
      .map(([ic, label, go]) => h('button', { type: 'button', class: 'quick-chip focusable', on: { click: go } }, icon(ic), h('span', { text: t(label) }))),
  );

  const header = wide
    ? h('div', { class: 'home-top' }, clock())
    : h(
        'header',
        { class: 'home-header overlay' },
        h('div', { class: 'brand-row' }, logoMark(26), h('span', { class: 'brand' }, 'Stream', h('b', null, 'Pro'))),
        h('div', { class: 'header-actions' }, iconBtn('search', t('search'), () => app.reset('search')), iconBtn('guide', t('tvGuide'), () => app.push('guide'))),
      );

  // TV / grand écran : l'affiche reste fixe en haut et présente la vignette sélectionnée,
  // seules les rangées défilent dessous (comme Netflix sur TV).
  const scroller = wide
    ? h('div', { class: 'scroll home-scroll home-rails-area' }, h('div', { class: 'rails' }, rows))
    : h('div', { class: 'scroll home-scroll' }, featured.length ? hero : null, quickRow, h('div', { class: 'rails' }, rows));
  const el = wide
    ? h('section', { class: 'home netflix immersive' + (featured.length ? '' : ' no-hero') }, featured.length ? hero : null, header, scroller)
    : h('section', { class: 'home netflix' }, header, scroller);

  if (wide) {
    // En parcourant les rangées, l'affiche passe en mode « aperçu » (sans boutons).
    scroller.addEventListener('focusin', (ev) => {
      el.classList.add('browsing');
      scroller.scrollLeft = 0;
      // La rangée sélectionnée se cale en haut de la zone (pas de rangée à moitié coupée).
      let node = ev.target as HTMLElement | null;
      while (node && node !== scroller && !node.classList.contains('rail')) node = node.parentElement;
      if (node && node !== scroller) scroller.scrollTop = Math.max(0, node.offsetTop - 8);
    });
    hero.addEventListener('focusin', () => {
      el.classList.remove('browsing');
      scroller.scrollTop = 0;
      browsing = false;
      armRotation();
    });
  }

  // En-tête mobile : devient opaque en faisant défiler.
  if (!wide) scroller.addEventListener('scroll', () => header.classList.toggle('solid', scroller.scrollTop > 40));

  if (featured.length) showHero(featured[0], true);

  return {
    el,
    chrome: 'nav',
    tab: 'home',
    onShow: () => {
      // Le bouton Lecture de l'affiche reçoit le focus au retour sur l'accueil.
      const play = heroActions.querySelector<HTMLElement>('.btn');
      if (play) play.setAttribute('data-autofocus', '');
      armRotation();
    },
    onHide: () => window.clearTimeout(rotateTimer),
    destroy: () => {
      window.clearTimeout(rotateTimer);
      window.clearTimeout(focusTimer);
    },
    onKey: (action) => {
      // Sur l'affiche : ◀ ▶ changent l'élément mis en avant.
      const active = document.activeElement as HTMLElement | null;
      if (!active || !hero.contains(active)) {
        if (action === 'up' && active && scroller.contains(active)) {
          // En remontant vers l'affiche, la rotation reprend.
          window.setTimeout(() => {
            if (hero.contains(document.activeElement)) {
              browsing = false;
              armRotation();
            }
          }, 0);
        }
        return false;
      }
      if ((action === 'left' && active === heroActions.firstElementChild) || (action === 'right' && active === heroActions.lastElementChild)) {
        if (action === 'left' && wide) return false; // vers le menu latéral
        next(action === 'right' ? 1 : -1);
        return true;
      }
      return false;
    },
  };

  function playHero(hi: HeroItem, _liveList: Channel[]): void {
    if (hi.kind === 'entry') return app.play(hi.e);
    const x = hi.x;
    if (isLive(x)) return void app.openChannel(x as Channel);
    if (isShow(x)) return void app.openItem(x);
    const m = x as Channel;
    app.unlock(m.group).then((ok) => {
      if (ok) app.play({ id: m.id, kind: 'movie', title: m.name, url: m.url, poster: m.logo, subtitle: m.group });
    });
  }
}

function fillMeta(el: HTMLElement, m: { year?: string; genre?: string; rating?: number; duration?: string; group?: string }): void {
  if (m.rating) el.appendChild(h('span', { class: 'match', text: Math.round(m.rating * 10) + '% ' + t('match') }));
  if (m.year) el.appendChild(h('span', { text: m.year }));
  if (m.duration) el.appendChild(h('span', { text: m.duration }));
  const genre = m.genre ? m.genre.split(/[,/]/)[0].trim() : m.group;
  if (genre) el.appendChild(h('span', { class: 'tag', text: genre }));
}

/** Catégories les plus fournies, dans l'ordre de la playlist. */
function topGroups<T extends { group: string }>(items: T[], max: number): string[] {
  const counts: Record<string, number> = {};
  const order: string[] = [];
  for (const x of items) {
    if (!counts[x.group]) order.push(x.group);
    counts[x.group] = (counts[x.group] || 0) + 1;
  }
  const keep = order
    .filter((g) => counts[g] >= 2)
    .sort((a, b) => counts[b] - counts[a])
    .slice(0, max);
  return order.filter((g) => keep.indexOf(g) !== -1);
}

/** Les n plus grands selon `key`, en une passe (liste de sortie triée, décroissante). */
function topN<T>(list: T[], n: number, key: (x: T) => number): T[] {
  const out: T[] = [];
  const keys: number[] = [];
  let min = -Infinity;
  for (const x of list) {
    const k = key(x);
    if (!k) continue;
    if (out.length >= n && k <= min) continue;
    let i = keys.length;
    while (i > 0 && keys[i - 1] < k) i--;
    keys.splice(i, 0, k);
    out.splice(i, 0, x);
    if (out.length > n) {
      out.pop();
      keys.pop();
    }
    if (out.length >= n) min = keys[keys.length - 1];
  }
  return out;
}

/** Les n premiers éléments qui vérifient `ok`, sans parcourir toute la liste. */
function firstN<T>(list: T[], n: number, ok: (x: T) => boolean): T[] {
  const out: T[] = [];
  for (const x of list) {
    if (ok(x)) out.push(x);
    if (out.length >= n) break;
  }
  return out;
}

/** Les n premiers éléments de chaque catégorie demandée, en une seule passe. */
function firstByGroup<T extends { group: string }>(list: T[], groups: string[], n: number): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const g of groups) out[g] = [];
  let remaining = groups.length;
  for (const x of list) {
    const bucket = out[x.group];
    if (!bucket || bucket.length >= n) continue;
    bucket.push(x);
    if (bucket.length === n && --remaining === 0) break;
  }
  return out;
}

/** Chaînes à mettre en avant : favoris, puis regardées récemment, puis une par catégorie. */
function pickLiveNow(live: Channel[], history: store.HistoryEntry[], favIds: string[]): Channel[] {
  const out: Channel[] = [];
  const seen: Record<string, boolean> = {};
  const add = (c: Channel | undefined) => {
    if (c && !seen[c.id] && out.length < 20) {
      seen[c.id] = true;
      out.push(c);
    }
  };
  const byId: Record<string, Channel> = {};
  for (const c of live) byId[c.id] = c;
  for (const id of favIds) add(byId[id]);
  for (const e of history) if (e.kind === 'live') add(byId[e.id]);
  const groups: Record<string, boolean> = {};
  for (const c of live) {
    if (!groups[c.group]) {
      groups[c.group] = true;
      add(c);
    }
  }
  for (const c of live) add(c);
  return out;
}

/** Vignette de chaîne : logo sur fond sombre, programme en cours et progression. */
function channelTile(c: Channel, _queue: Channel[], attachHero: (el: HTMLElement, hi: HeroItem) => HTMLElement): HTMLElement {
  const cat = app.catalog!;
  const prog = h('div', { class: 'tile-prog', text: c.group });
  const bar = h('i');
  const el = h(
    'button',
    { type: 'button', class: 'card card-tile focusable', on: { click: () => void app.openChannel(c) } },
    h(
      'div',
      { class: 'card-media' },
      c.logo ? h('div', { class: 'tile-ambient', style: 'background-image:url("' + c.logo.replace(/"/g, '%22') + '")' }) : null,
      art(c.logo, c.name, 'contain'),
      h('span', { class: 'tile-live' }, h('span', { class: 'live-dot' }), t('live')),
      h('div', { class: 'tile-bar' }, bar),
    ),
    h('div', { class: 'card-title' }, h('span', { class: 'num', text: channelNumber(c) }), c.name),
    prog,
  );
  if (cat.epg.available) {
    const fill = (list: Program[]) => {
      const p = currentProgram(list);
      if (!p) return;
      prog.textContent = p.title;
      bar.style.width = Math.min(100, ((Date.now() - p.start) / (p.end - p.start)) * 100) + '%';
      el.classList.add('has-prog');
    };
    const cached = cat.epg.peek(c);
    if (cached) fill(cached);
    else cat.epg.programs(c).then(fill, () => undefined);
  }
  return attachHero(el, { kind: 'item', x: c });
}
