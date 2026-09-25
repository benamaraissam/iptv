import type { Screen } from '../app';
import { app } from '../app';
import type { Channel, Show } from '../types';
import { h, clear } from '../ui/dom';
import { icon } from '../ui/icons';
import { card, chips, emptyState, rail, screenHeader } from '../ui/components';
import * as store from '../storage';
import { t } from '../i18n';
import { posterCard } from './vod';
import { brandClock, catalogProgress } from './common';
import { hasGoodImage } from '../imgcache';
import { languageOf } from '../versions';
import { rankSearch } from '../textsearch';

const MAX_RESULTS = 60;


/** 11. Recherche : films, séries et chaînes. */
export function search(): Screen {
  const cat = app.catalog!;
  const pid = cat.playlist.id;
  let scope = 'all';
  let lang = '';
  let timer: number | undefined;

  // Langue de chaque élément (déduite de sa catégorie / de son titre), calculée une fois.
  const langCache = new Map<string, string>();
  const langOf = (x: { id: string; name: string; group: string }): string => {
    let l = langCache.get(x.id);
    if (l === undefined) {
      l = languageOf(x) || '';
      langCache.set(x.id, l);
    }
    return l;
  };
  const langCounts: Record<string, number> = {};
  for (const x of (cat.movies as { id: string; name: string; group: string }[]).concat(cat.shows, cat.live)) {
    const l = langOf(x);
    if (l) langCounts[l] = (langCounts[l] || 0) + 1;
  }
  const langs = Object.keys(langCounts).sort((a, b) => langCounts[b] - langCounts[a]);

  const input = h('input', {
    class: 'input search-input focusable',
    type: 'search',
    placeholder: t('searchPlaceholder'),
    autocomplete: 'off',
    'data-autofocus': app.wide ? undefined : true,
  });
  const body = h('div', { class: 'scroll search-body' });

  const open = <T extends { id: string; name: string; group: string }>(list: T[]) => list.filter((x) => !app.isLocked(x.group) && (!lang || langOf(x) === lang));

  const render = () => {
    clear(body);
    const q = input.value.trim();
    if (!q) return renderIdle();
    // Recherche tolérante (fautes, mots oubliés, ordre libre), classée par pertinence ;
    // à pertinence égale, les titres avec image puis les mieux notés passent devant.
    const boost = (x: { rating?: number }, img?: string) => (hasGoodImage(img) ? 500 : 0) + Math.min(499, Math.round((x.rating || 0) * 40));
    const find = <T extends { id: string; name: string; group: string; rating?: number }>(list: T[], img: (x: T) => string | undefined) => {
      const res = rankSearch(list, q, MAX_RESULTS * 2, (x) => boost(x, img(x)));
      return open(res).slice(0, MAX_RESULTS);
    };
    const liveRes = scope === 'all' || scope === 'live' ? find(cat.live, (c) => c.logo) : [];
    const movieRes = scope === 'all' || scope === 'movies' ? find(cat.movies, (c) => c.logo) : [];
    const showRes = scope === 'all' || scope === 'series' ? find(cat.shows, (c) => c.cover) : [];
    if (!liveRes.length && !movieRes.length && !showRes.length) {
      body.appendChild(emptyState('noResults', t('noResults'), t('noResultsText')));
      return;
    }
    const section = (title: string, items: HTMLElement[]) =>
      items.length ? h('section', { class: 'result-section' }, h('h2', { class: 'section-title', text: title }), h('div', { class: 'poster-grid' }, items)) : null;
    body.appendChild(h('div', null, section(t('movies'), movieRes.map(posterCard)), section(t('series'), showRes.map(posterCard)), section(t('channels'), liveRes.map((c) => liveCard(c, liveRes)))));
  };

  const renderIdle = () => {
    const recent = store.getSearches(pid);
    if (recent.length) {
      body.appendChild(h('h2', { class: 'section-title', text: t('recentSearches') }));
      body.appendChild(
        h(
          'div',
          { class: 'recent-list' },
          recent.map((q) =>
            h(
              'button',
              {
                type: 'button',
                class: 'recent-item focusable',
                on: {
                  click: () => {
                    input.value = q;
                    render();
                  },
                },
              },
              icon('search'),
              h('span', { text: q }),
            ),
          ),
        ),
      );
    }
    const popular: (Channel | Show)[] = (open(cat.movies) as (Channel | Show)[])
      .concat(open(cat.shows))
      .filter((x) => ('kind' in x ? x.logo : x.cover))
      .sort((a, b) => (b.added || 0) - (a.added || 0) || (b.rating || 0) - (a.rating || 0))
      .slice(0, 18);
    const r = rail(t('popularNow'), popular.map(posterCard));
    if (r) body.appendChild(r);
    if (!recent.length && !popular.length) body.appendChild(emptyState('search', t('search'), t('searchPlaceholder')));
  };

  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(render, 250);
  });
  input.addEventListener('change', () => store.pushSearch(pid, input.value));
  input.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).keyCode === 13) {
      store.pushSearch(pid, input.value);
      (input as HTMLInputElement).blur();
    }
  });

  const scopes = chips(
    [
      { id: 'all', label: t('all') },
      { id: 'movies', label: t('movies') },
      { id: 'series', label: t('series') },
      { id: 'live', label: t('channels') },
    ],
    scope,
    (id) => {
      scope = id;
      render();
    },
  );

  // Filtre par langue (films, séries, chaînes), quand le catalogue en distingue plusieurs.
  const langChips =
    langs.length > 1
      ? chips(
          [{ id: '', label: t('allLanguages') }].concat(langs.map((l) => ({ id: l, label: l }))),
          lang,
          (id) => {
            lang = id;
            render();
          },
        )
      : null;
  if (langChips) langChips.classList.add('lang-chips');

  const header = app.wide
    ? h('header', { class: 'tv-header' }, h('h1', { class: 'screen-title', text: t('search') }), brandClock())
    : screenHeader(t('search'));

  const progress = catalogProgress();
  render();
  return {
    el: h('section', { class: 'search' }, header, h('div', { class: 'search-bar' }, icon('search', 'search-ic'), input), scopes, langChips, progress.el, body),
    chrome: 'nav',
    tab: 'search',
    destroy: () => {
      window.clearTimeout(timer);
      progress.off();
    },
  };
}

function liveCard(c: Channel, _queue: Channel[]): HTMLElement {
  return card({ title: c.name, sub: c.group, image: c.logo }, 'channel', () => void app.openChannel(c));
}
