import type { Screen } from '../app';
import { app } from '../app';
import type { Channel, Show } from '../types';
import { h } from '../ui/dom';
import { icon, logoMark, type IconName } from '../ui/icons';
import { art, btn, card, iconBtn, rail } from '../ui/components';
import * as store from '../storage';
import { formatRemaining, t, type TKey } from '../i18n';
import { clock } from './common';

type Featured = { kind: 'history'; entry: store.HistoryEntry } | { kind: 'item'; item: Channel | Show };

export function home(): Screen {
  const cat = app.catalog!;
  const pid = cat.playlist.id;
  const cont = store.getContinueWatching(pid);

  const byAdded = (a: { added?: number }, b: { added?: number }) => (b.added || 0) - (a.added || 0);
  const byRating = (a: { rating?: number }, b: { rating?: number }) => (b.rating || 0) - (a.rating || 0);
  const visibleMovies = cat.movies.filter((m) => !app.isLocked(m.group));
  const visibleShows = cat.shows.filter((s) => !app.isLocked(s.group));
  const recent: (Channel | Show)[] = (visibleMovies as (Channel | Show)[]).concat(visibleShows).filter((x) => x.added).sort(byAdded).slice(0, 20);
  let recommended: (Channel | Show)[] = (visibleMovies as (Channel | Show)[]).concat(visibleShows).filter((x) => x.rating).sort(byRating).slice(0, 20);
  if (!recommended.length) recommended = (visibleShows as (Channel | Show)[]).concat(visibleMovies).slice(0, 20);
  const live = cat.live.filter((c) => !app.isLocked(c.group));

  // ───── Mise en avant ─────
  let featured: Featured | null = null;
  if (cont.length) featured = { kind: 'history', entry: cont[0] };
  else {
    const pick = recent.filter(imageOf)[0] || recommended.filter(imageOf)[0] || recommended[0] || live[0];
    if (pick) featured = { kind: 'item', item: pick };
  }

  const heroBg = h('div', { class: 'hero-bg' });
  const heroPlot = h('p', { class: 'hero-plot' });
  const heroMeta = h('div', { class: 'meta' });
  let hero: HTMLElement | null = null;
  if (featured) {
    const title = featured.kind === 'history' ? featured.entry.title : featured.item.name;
    const image = featured.kind === 'history' ? featured.entry.poster : imageOf(featured.item);
    heroBg.appendChild(art(image, title, 'cover'));
    const actions: HTMLElement[] = [];
    if (featured.kind === 'history') {
      const e = featured.entry;
      heroMeta.appendChild(h('span', { class: 'tag', text: e.subtitle || t('continueWatching') }));
      heroMeta.appendChild(h('span', { class: 'tag', text: formatRemaining(e.dur - e.pos) + ' ' + t('left') }));
      actions.push(btn(t('resume'), { variant: 'primary', icon: 'play', autofocus: true, onClick: () => app.play(e) }));
    } else {
      const item = featured.item;
      const isLive = 'kind' in item && item.kind === 'live';
      heroMeta.appendChild(h('span', { class: 'tag', text: item.group }));
      if ('year' in item && item.year) heroMeta.insertBefore(h('span', { text: item.year }), heroMeta.firstChild);
      if (isLive) heroMeta.appendChild(h('span', { class: 'tag live-tag', text: t('live') }));
      actions.push(btn(t('play'), { variant: 'primary', icon: 'play', autofocus: true, onClick: () => playOrOpen(item) }));
      if (!isLive) actions.push(btn(t('moreInfo'), { variant: 'glass', onClick: () => app.openItem(item) }));
      // Synopsis et visuel HD (Xtream) chargés en arrière-plan.
      if (!isLive) {
        cat.details(item).then((d) => {
          if (d.plot) heroPlot.textContent = d.plot;
          if (d.backdrop && d.backdrop !== image) {
            heroBg.innerHTML = '';
            heroBg.appendChild(art(d.backdrop, title, 'cover'));
          }
        }, () => undefined);
      }
    }
    hero = h(
      'section',
      { class: 'hero' },
      heroBg,
      h('div', { class: 'hero-shade' }),
      h('div', { class: 'hero-content' }, h('h1', { class: 'hero-title', text: title }), heroMeta, heroPlot, h('div', { class: 'hero-actions' }, actions)),
    );
  }

  // ───── Rangées ─────
  const contCards = cont.map((e) =>
    card(
      { title: e.title, sub: e.subtitle || formatRemaining(e.dur - e.pos) + ' ' + t('left'), image: e.poster, progress: e.pos / e.dur },
      'landscape',
      () => app.play(e),
    ),
  );

  const itemCard = (x: Channel | Show) =>
    card({ title: x.name, sub: 'year' in x && x.year ? x.year : x.group, image: imageOf(x), fav: app.inMyList(x.id) }, 'poster', () => app.openItem(x));

  const liveCards = live.slice(0, 20).map((c, i) =>
    card({ title: c.name, sub: c.group, image: c.logo }, 'channel', () => app.playChannel(c, live), { 'data-num': String(i + 1) }),
  );

  const categoryTiles: [IconName, TKey, () => void][] = [
    ['live', 'liveTv', () => app.reset('live')],
    ['movie', 'movies', () => app.push('movies')],
    ['series', 'series', () => app.push('series')],
    ['guide', 'tvGuide', () => app.push('guide')],
    ['catchup', 'catchup', () => app.push('catchup')],
  ];
  const tiles = categoryTiles.map(([ic, label, go]) =>
    h('button', { type: 'button', class: 'cat-tile focusable', on: { click: go } }, h('span', { class: 'cat-ic' }, icon(ic)), h('span', { text: t(label) })),
  );

  const header = app.wide
    ? h('div', { class: 'home-top' }, clock())
    : h(
        'header',
        { class: 'home-header' },
        h('div', { class: 'brand-row' }, logoMark(26), h('span', { class: 'brand' }, 'Stream', h('b', null, 'Pro'))),
        h('div', { class: 'header-actions' }, iconBtn('search', t('search'), () => app.reset('search')), iconBtn('guide', t('tvGuide'), () => app.push('guide'))),
      );

  const scroller = h(
    'div',
    { class: 'scroll home-scroll' },
    header,
    hero,
    h(
      'div',
      { class: 'rails' },
      rail(t('continueWatching'), contCards, () => app.reset('library', { tab: 'continue' })),
      !app.wide ? rail(t('categories'), tiles, () => app.push('categories')) : null,
      rail(t('recommended'), recommended.map(itemCard), () => app.push(visibleMovies.length ? 'movies' : 'series')),
      rail(t('recentlyAdded'), recent.map(itemCard)),
      rail(t('liveTv'), liveCards, () => app.reset('live')),
      app.wide ? rail(t('categories'), tiles, () => app.push('categories')) : null,
    ),
  );

  return { el: h('section', { class: 'home' }, scroller), chrome: 'nav', tab: 'home' };
}

function imageOf(x: Channel | Show): string | undefined {
  return 'kind' in x ? x.logo : x.backdrop || x.cover;
}

function playOrOpen(item: Channel | Show): void {
  if ('kind' in item && item.kind === 'live') return void app.openItem(item);
  if ('kind' in item && item.kind === 'movie') {
    return void app.unlock(item.group).then((ok) => {
      if (ok) app.play({ id: item.id, kind: 'movie', title: item.name, url: item.url, poster: item.logo, subtitle: item.group });
    });
  }
  app.openItem(item);
}
