import type { Screen } from '../app';
import { app } from '../app';
import type { Channel, Show } from '../types';
import { h, clear, pagedList } from '../ui/dom';
import { card, chips, emptyState, iconBtn, screenHeader, type ChipOption } from '../ui/components';
import { t } from '../i18n';
import { brandClock } from './common';

type Item = Channel | Show;

/** 17 / 18. Films ou séries : grille d'affiches filtrable par catégorie. */
function vodScreen(kind: 'movies' | 'series', params: { group?: string }): Screen {
  const cat = app.catalog!;
  const all: Item[] = kind === 'movies' ? cat.movies : cat.shows;
  const hasNew = all.some((x) => !!x.added);
  const hasRating = all.some((x) => !!x.rating);
  let filter = params.group ? 'g:' + params.group : hasRating ? 'popular' : 'all';

  const options: ChipOption[] = (hasRating ? [{ id: 'popular', label: t('popular') }] : [{ id: 'all', label: t('all') }])
    .concat(hasNew ? [{ id: 'new', label: t('newest') }] : [])
    .concat(cat.groups(all).map((g) => ({ id: 'g:' + g, label: (app.isLocked(g) ? '🔒 ' : '') + g })));

  const body = h('div', { class: 'scroll' });
  const grid = h('div', { class: 'poster-grid' });
  body.appendChild(grid);

  const current = (): Item[] => {
    const open = all.filter((x) => !app.isLocked(x.group));
    if (filter === 'popular') return open.slice().sort((a, b) => (b.rating || 0) - (a.rating || 0));
    if (filter === 'new') return open.filter((x) => x.added).sort((a, b) => (b.added || 0) - (a.added || 0));
    if (filter.indexOf('g:') === 0) return all.filter((x) => x.group === filter.slice(2));
    return open;
  };

  const render = () => {
    clear(grid);
    body.scrollTop = 0;
    const items = current();
    if (!items.length) {
      grid.appendChild(emptyState(kind === 'movies' ? 'movie' : 'series', t('noResults'), t('noResultsText')));
      return;
    }
    pagedList(body, grid, items, (x) => posterCard(x), 42);
  };

  const title = t(kind);
  const header = app.wide
    ? h('header', { class: 'tv-header' }, h('h1', { class: 'screen-title', text: title }), brandClock())
    : screenHeader(title, { back: () => app.back(), actions: [iconBtn('search', t('search'), () => app.reset('search'))] });

  const filterRow = chips(options, filter, async (id) => {
    if (id.indexOf('g:') === 0 && !(await app.unlock(id.slice(2)))) return;
    filter = id;
    render();
  });

  render();
  return { el: h('section', { class: 'vod' }, header, filterRow, body), chrome: 'nav', tab: kind };
}

export function posterCard(x: Item): HTMLElement {
  const sub = 'year' in x && x.year ? x.year : x.rating ? '★ ' + x.rating.toFixed(1) : x.group;
  const image = 'kind' in x ? x.logo : x.cover;
  return card({ title: x.name, sub, image, fav: app.inMyList(x.id) }, 'poster', () => app.openItem(x), { 'data-id': x.id });
}

export function movies(params: { group?: string }): Screen {
  return vodScreen('movies', params);
}

export function series(params: { group?: string }): Screen {
  return vodScreen('series', params);
}
