import type { Screen } from '../app';
import { app } from '../app';
import type { Channel, Show } from '../types';
import { h, clear, pagedList } from '../ui/dom';
import { btn, card, chips, emptyState, iconBtn, screenHeader, type ChipOption } from '../ui/components';
import { t } from '../i18n';
import * as store from '../storage';
import { brandClock, catalogProgress, categoryButton, imageFirst, prefetchOnIntent, resolvePoster } from './common';
import { icon } from '../ui/icons';
import { dedupeVersions, interfaceLanguage, languageCounts, languageOf } from '../versions';
import { matchesQuery } from '../textsearch';

type Item = Channel | Show;
type Sort = 'popular' | 'new' | 'az';

/**
 * Catalogue de films ou de séries : bouton « Catégorie » + tri, puis grille d'affiches.
 * Réutilisé par l'écran Films / Séries et par la Bibliothèque (mobile).
 */
export function vodBrowser(kind: 'movies' | 'series', initialGroup?: string): { toolbar: HTMLElement; body: HTMLElement; destroy: () => void } {
  const cat = app.catalog!;
  const all: Item[] = kind === 'movies' ? cat.movies : cat.shows;
  const hasNew = all.some((x) => !!x.added);
  const hasRating = all.some((x) => !!x.rating);
  let group: string | null = initialGroup || null;
  let sort: Sort = hasRating ? 'popular' : hasNew ? 'new' : 'az';
  let lang = '';
  let query = '';

  // Langue de chaque titre (catégorie puis étiquettes du nom) ; mise en cache par élément.
  const langOf = (x: Item): string => languageOf(x) || '';

  const body = h('div', { class: 'scroll' });
  const grid = h('div', { class: 'poster-grid' });
  body.appendChild(grid);

  const PARTIAL_MIN = 2500;
  const PARTIAL_K = 600;
  let truncated = false;
  let fullCount = 0;
  let showAll = false;
  const collate = typeof Intl !== 'undefined' && Intl.Collator ? new Intl.Collator(undefined, { sensitivity: 'base', numeric: true }).compare : (a: string, b: string) => a.localeCompare(b);
  const current = (): Item[] => {
    let list = group === null ? all.filter((x) => !app.isLocked(x.group)) : all.filter((x) => x.group === group);
    if (lang) list = list.filter((x) => langOf(x) === lang);
    if (query) {
      // L'index de recherche est construit sur le catalogue complet (stable), une seule fois.
      const ok: Record<string, true> = {};
      for (const x of matchesQuery(all, query)) ok[x.id] = true;
      list = list.filter((x) => ok[x.id]);
    }
    const cmp: (a: Item, b: Item) => number =
      sort === 'popular' ? (a, b) => (b.rating || 0) - (a.rating || 0) : sort === 'new' ? (a, b) => (b.added || 0) - (a.added || 0) : (a, b) => collate(a.name, b.name);
    // Grande liste (« toutes les catégories » : des dizaines de milliers de titres) : on ne
    // trie que les meilleurs, une box TV mettait 0,5 s à tout trier ; « Tout afficher » fait le reste.
    fullCount = list.length;
    truncated = !showAll && list.length > PARTIAL_MIN;
    list = truncated ? topK(list, cmp, PARTIAL_K * 2) : list.slice().sort(cmp);
    // Une carte par titre : les autres langues se choisissent sur la fiche.
    list = dedupeVersions(list, lang || interfaceLanguage(store.getSettings().lang));
    if (truncated) list = list.slice(0, PARTIAL_K);
    return imageFirst(list, (x) => ('kind' in x ? x.logo : x.cover));
  };

  let renderToken = 0;
  const render = () => {
    clear(grid);
    body.scrollTop = 0;
    const items = current();
    if (!items.length) {
      // Catégorie pas encore chargée (catalogue progressif) : on la demande en priorité.
      if (group && !cat.loadState.complete) {
        const token = ++renderToken;
        grid.appendChild(h('div', { class: 'grid-loading' }, h('div', { class: 'spinner' }), h('p', { class: 'muted', text: t('categoryLoading') })));
        cat.ensureGroup(kind, group).then(() => {
          if (token !== renderToken) return;
          catBtn.set(group);
          render();
        });
        return;
      }
      grid.appendChild(emptyState(kind === 'movies' ? 'movie' : 'series', t('noResults'), t('noResultsText')));
      return;
    }
    pagedList(body, grid, items, (x) => posterCard(x), 42);
    if (truncated) {
      const more = btn(t('showAll') + ' (' + fullCount + ')', {
        variant: 'glass',
        cls: 'vod-show-all',
        onClick: () => {
          showAll = true;
          render();
        },
      });
      body.appendChild(more);
    }
  };

  // Nombre de titres par catégorie, compté une fois (le sélecteur le demande pour chaque catégorie).
  const counts: Record<string, number> = {};
  let unlocked = 0;
  for (const x of all) {
    counts[x.group] = (counts[x.group] || 0) + 1;
    if (!app.isLocked(x.group)) unlocked++;
  }
  const countOf = (g: string | null) => (g === null ? unlocked : counts[g] || 0);
  const allGroups = kind === 'movies' ? cat.vodGroups : cat.showGroups;
  const catBtn = categoryButton({
    groups: allGroups.length ? allGroups : cat.groups(all),
    selected: group,
    countOf,
    onChange: (g) => {
      group = g;
      renderToken++;
      render();
      if (g && !cat.loadState.complete) cat.ensureGroup(kind, g);
    },
  });
  if (group && !cat.loadState.complete) cat.ensureGroup(kind, group);

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
  // Puces de langue : comptage immédiat si le catalogue est préchauffé, sinon par tranches
  // en arrière-plan (les puces apparaissent alors une fois prêtes).
  const langEl = h('div', { class: 'lang-chips hidden' });
  let langsDone = false;
  languageCounts([all], (counts) => {
    if (langsDone) return;
    langsDone = true;
    const langs = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    if (langs.length < 2) return;
    langEl.appendChild(
      chips([{ id: '', label: t('allLanguages') }].concat(langs.map((l) => ({ id: l, label: l }))), lang, (id) => {
        lang = id;
        render();
      }),
    );
    langEl.classList.remove('hidden');
  });

  const progress = catalogProgress();
  // Fin du chargement progressif : la vue « Toutes les catégories » se complète.
  let lastProgressRender = Date.now();
  const offProgress = cat.onProgress((s) => {
    // « Toutes les catégories » : la grille se complète au fil des catégories reçues
    // (au plus toutes les 3 s, et dès qu'elle était vide), puis une dernière fois à la fin.
    const now = Date.now();
    const empty = !grid.querySelector('.card');
    if (!s.complete && !(group === null && (empty || now - lastProgressRender > 3000))) return;
    lastProgressRender = now;
    catBtn.set(group);
    if (!group) render();
  });
  render();
  return {
    toolbar: h('div', { class: 'vod-tools' }, h('div', { class: 'live-filterbar vod-filterbar' }, catBtn.el, searchEl, sorts.length > 1 ? sortEl : null), langEl, progress.el),
    body,
    destroy: () => {
      progress.off();
      offProgress();
    },
  };
}

/** 17 / 18. Écran Films ou Séries. */
function vodScreen(kind: 'movies' | 'series', params: { group?: string }): Screen {
  const title = t(kind);
  const header = app.wide
    ? h('header', { class: 'tv-header' }, h('h1', { class: 'screen-title', text: title }), brandClock())
    : screenHeader(title, { back: () => app.back(), actions: [iconBtn('search', t('search'), () => app.reset('search'))] });
  const b = vodBrowser(kind, params.group);
  return { el: h('section', { class: 'vod' }, header, b.toolbar, b.body), chrome: 'nav', tab: kind, destroy: b.destroy };
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

/**
 * Les `k` premiers éléments selon `cmp`, triés, sans trier toute la liste (sélection
 * rapide, en O(n)) : une catégorie « tout » de 100 000 titres s'ouvre sans attendre.
 */
function topK<T>(list: T[], cmp: (a: T, b: T) => number, k: number): T[] {
  const a = list.slice();
  if (a.length <= k) return a.sort(cmp);
  let lo = 0;
  let hi = a.length - 1;
  while (lo < hi) {
    const pivot = a[(lo + hi) >> 1];
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (cmp(a[i], pivot) < 0) i++;
      while (cmp(a[j], pivot) > 0) j--;
      if (i <= j) {
        const tmp = a[i];
        a[i] = a[j];
        a[j] = tmp;
        i++;
        j--;
      }
    }
    if (k - 1 <= j) hi = j;
    else if (k - 1 >= i) lo = i;
    else break;
  }
  return a.slice(0, k).sort(cmp);
}
