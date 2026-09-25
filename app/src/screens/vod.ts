import type { Screen } from '../app';
import { app } from '../app';
import type { Channel, Show } from '../types';
import { h, clear, pagedList } from '../ui/dom';
import { card, chips, emptyState, iconBtn, screenHeader, type ChipOption } from '../ui/components';
import { t } from '../i18n';
import { brandClock, categoryButton, imageFirst, prefetchOnIntent, resolvePoster } from './common';
import { icon } from '../ui/icons';
import { languageOf } from '../versions';
import { matchesQuery } from '../textsearch';

type Item = Channel | Show;
type Sort = 'popular' | 'new' | 'az';

/**
 * Catalogue de films ou de séries : bouton « Catégorie » + tri, puis grille d'affiches.
 * Réutilisé par l'écran Films / Séries et par la Bibliothèque (mobile).
 */
export function vodBrowser(kind: 'movies' | 'series', initialGroup?: string): { toolbar: HTMLElement; body: HTMLElement } {
  const cat = app.catalog!;
  const all: Item[] = kind === 'movies' ? cat.movies : cat.shows;
  const hasNew = all.some((x) => !!x.added);
  const hasRating = all.some((x) => !!x.rating);
  let group: string | null = initialGroup || null;
  let sort: Sort = hasRating ? 'popular' : hasNew ? 'new' : 'az';
  let lang = '';
  let query = '';

  // Langue de chaque titre (catégorie puis étiquettes du nom), calculée une fois par catégorie.
  const langByGroup: Record<string, string | undefined> = {};
  const langOf = (x: Item): string => {
    if (!(x.group in langByGroup)) langByGroup[x.group] = languageOf({ name: '', group: x.group });
    return langByGroup[x.group] || languageOf(x) || '';
  };
  const langCounts: Record<string, number> = {};
  for (const x of all) {
    const l = langOf(x);
    if (l) langCounts[l] = (langCounts[l] || 0) + 1;
  }
  const langs = Object.keys(langCounts).sort((a, b) => langCounts[b] - langCounts[a]);

  const body = h('div', { class: 'scroll' });
  const grid = h('div', { class: 'poster-grid' });
  body.appendChild(grid);

  const current = (): Item[] => {
    let list = group === null ? all.filter((x) => !app.isLocked(x.group)) : all.filter((x) => x.group === group);
    if (lang) list = list.filter((x) => langOf(x) === lang);
    if (query) {
      // L'index de recherche est construit sur le catalogue complet (stable), une seule fois.
      const ok: Record<string, true> = {};
      for (const x of matchesQuery(all, query)) ok[x.id] = true;
      list = list.filter((x) => ok[x.id]);
    }
    list = list.slice();
    if (sort === 'popular') list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    else if (sort === 'new') list.sort((a, b) => (b.added || 0) - (a.added || 0));
    else list.sort((a, b) => a.name.localeCompare(b.name));
    return imageFirst(list, (x) => ('kind' in x ? x.logo : x.cover));
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

  const countOf = (g: string | null) => (g === null ? all.filter((x) => !app.isLocked(x.group)).length : all.filter((x) => x.group === g).length);
  const catBtn = categoryButton({
    groups: cat.groups(all),
    selected: group,
    countOf,
    onChange: (g) => {
      group = g;
      render();
    },
  });

  const sorts: ChipOption[] = ([] as ChipOption[])
    .concat(hasRating ? [{ id: 'popular', label: t('popular') }] : [])
    .concat(hasNew ? [{ id: 'new', label: t('newest') }] : [])
    .concat([{ id: 'az', label: 'A–Z' }]);
  const sortEl = chips(sorts, sort, (id) => {
    sort = id as Sort;
    render();
  });
  sortEl.classList.add('segmented', 'scope-switch');

  // Recherche dans le catalogue affiché (titre), et filtre par langue.
  let timer: number | undefined;
  const input = h('input', { class: 'input vod-search-input focusable', type: 'search', placeholder: t('searchIn') + ' ' + t(kind).toLowerCase(), autocomplete: 'off' });
  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      query = (input as HTMLInputElement).value.trim();
      render();
    }, 250);
  });
  input.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).keyCode === 13) (input as HTMLInputElement).blur();
  });
  const searchEl = h('div', { class: 'vod-search' }, icon('search', 'search-ic'), input);
  const langEl =
    langs.length > 1
      ? chips([{ id: '', label: t('allLanguages') }].concat(langs.map((l) => ({ id: l, label: l }))), lang, (id) => {
          lang = id;
          render();
        })
      : null;
  if (langEl) langEl.classList.add('lang-chips');

  render();
  return {
    toolbar: h('div', { class: 'vod-tools' }, h('div', { class: 'live-filterbar vod-filterbar' }, catBtn.el, searchEl, sorts.length > 1 ? sortEl : null), langEl),
    body,
  };
}

/** 17 / 18. Écran Films ou Séries. */
function vodScreen(kind: 'movies' | 'series', params: { group?: string }): Screen {
  const title = t(kind);
  const header = app.wide
    ? h('header', { class: 'tv-header' }, h('h1', { class: 'screen-title', text: title }), brandClock())
    : screenHeader(title, { back: () => app.back(), actions: [iconBtn('search', t('search'), () => app.reset('search'))] });
  const b = vodBrowser(kind, params.group);
  return { el: h('section', { class: 'vod' }, header, b.toolbar, b.body), chrome: 'nav', tab: kind };
}

export function posterCard(x: Item): HTMLElement {
  const sub = 'year' in x && x.year ? x.year : x.rating ? '★ ' + x.rating.toFixed(1) : x.group;
  const image = 'kind' in x ? x.logo : x.cover;
  return prefetchOnIntent(
    card({ title: x.name, sub, image, fav: app.inMyList(x.id), resolveImage: () => resolvePoster(x) }, 'poster', () => app.openItem(x), { 'data-id': x.id }),
    x,
  );
}

export function movies(params: { group?: string }): Screen {
  return vodScreen('movies', params);
}

export function series(params: { group?: string }): Screen {
  return vodScreen('series', params);
}
