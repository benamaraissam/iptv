import type { Screen } from '../app';
import { app } from '../app';
import type { Channel, Show } from '../types';
import { h, clear } from '../ui/dom';
import { icon } from '../ui/icons';
import { card, chips, emptyState, rail, screenHeader } from '../ui/components';
import * as store from '../storage';
import { t } from '../i18n';
import { posterCard } from './vod';
import { brandClock, imageFirst } from './common';

const MAX_RESULTS = 60;

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[àáâä]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[îï]/g, 'i')
    .replace(/[ôö]/g, 'o')
    .replace(/[ùûü]/g, 'u')
    .replace(/ç/g, 'c');
}

/** 11. Recherche : films, séries et chaînes. */
export function search(): Screen {
  const cat = app.catalog!;
  const pid = cat.playlist.id;
  let scope = 'all';
  let timer: number | undefined;

  const input = h('input', {
    class: 'input search-input focusable',
    type: 'search',
    placeholder: t('searchPlaceholder'),
    autocomplete: 'off',
    'data-autofocus': app.wide ? undefined : true,
  });
  const body = h('div', { class: 'scroll search-body' });

  const open = <T extends { group: string }>(list: T[]) => list.filter((x) => !app.isLocked(x.group));

  const render = () => {
    clear(body);
    const q = norm(input.value.trim());
    if (!q) return renderIdle();
    const match = (name: string) => norm(name).indexOf(q) !== -1;
    const liveRes = scope === 'all' || scope === 'live' ? imageFirst(open(cat.live).filter((c) => match(c.name)), (c) => c.logo).slice(0, MAX_RESULTS) : [];
    const movieRes = scope === 'all' || scope === 'movies' ? imageFirst(open(cat.movies).filter((c) => match(c.name)), (c) => c.logo).slice(0, MAX_RESULTS) : [];
    const showRes = scope === 'all' || scope === 'series' ? imageFirst(open(cat.shows).filter((c) => match(c.name)), (c) => c.cover).slice(0, MAX_RESULTS) : [];
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

  const header = app.wide
    ? h('header', { class: 'tv-header' }, h('h1', { class: 'screen-title', text: t('search') }), brandClock())
    : screenHeader(t('search'));

  render();
  return {
    el: h('section', { class: 'search' }, header, h('div', { class: 'search-bar' }, icon('search', 'search-ic'), input), scopes, body),
    chrome: 'nav',
    tab: 'search',
    destroy: () => window.clearTimeout(timer),
  };
}

function liveCard(c: Channel, _queue: Channel[]): HTMLElement {
  return card({ title: c.name, sub: c.group, image: c.logo }, 'channel', () => void app.openChannel(c));
}
