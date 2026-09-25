import type { Screen } from '../app';
import { app } from '../app';
import type { Channel, ItemRef } from '../types';
import { h, clear } from '../ui/dom';
import { btn, chips, emptyState, listRow, screenHeader } from '../ui/components';
import * as store from '../storage';
import { formatDay, formatRemaining, formatTime, t } from '../i18n';
import { brandClock, continueEntries } from './common';
import { vodBrowser } from './vod';

type Tab = 'movies' | 'series' | 'list' | 'continue' | 'history';

/** 21 / 22. Bibliothèque : Films, Séries, Ma liste, Continuer à regarder, Historique. */
export function library(params: { tab?: Tab }): Screen {
  const cat = app.catalog!;
  const pid = cat.playlist.id;
  const hasMovies = cat.movies.length > 0;
  const hasSeries = cat.shows.length > 0;
  let tab: Tab = params.tab || (hasMovies ? 'movies' : hasSeries ? 'series' : 'list');
  let listFilter = 'all';
  const body = h('div', { class: 'scroll' });
  const sub = h('div', { class: 'sub-chips' });
  // Contenu de l'onglet : soit (filtres + liste), soit le catalogue films / séries.
  const content = h('div', { class: 'lib-content' });
  const vodCache: Partial<Record<'movies' | 'series', { toolbar: HTMLElement; body: HTMLElement }>> = {};

  const show = () => {
    clear(content);
    if (tab === 'movies' || tab === 'series') {
      const b = vodCache[tab] || (vodCache[tab] = vodBrowser(tab));
      content.appendChild(b.toolbar);
      content.appendChild(b.body);
      return;
    }
    content.appendChild(sub);
    content.appendChild(body);
    render();
  };

  const openRef = (r: ItemRef) => {
    const item = cat.get(r.id);
    if (!item) return;
    if (r.kind === 'live') void app.openChannel(item as Channel);
    else app.openItem(item);
  };

  const render = () => {
    clear(body);
    clear(sub);
    const list = h('div', { class: 'row-list' });
    if (tab === 'list') {
      sub.appendChild(
        chips(
          [
            { id: 'all', label: t('all') },
            { id: 'movie', label: t('movies') },
            { id: 'series', label: t('series') },
            { id: 'live', label: t('channels') },
          ],
          listFilter,
          (id) => {
            listFilter = id;
            render();
          },
        ),
      );
      const refs = store.getMyList(pid).filter((r) => listFilter === 'all' || r.kind === listFilter);
      if (!refs.length) return body.appendChild(emptyState('heart', t('emptyList'), t('emptyListText')));
      for (const r of refs) {
        list.appendChild(
          listRow(
            {
              title: r.title,
              sub: r.kind === 'live' ? t('liveTv') + ' · ' + (r.sub || '') : r.kind === 'series' ? t('series') + ' · ' + (r.sub || '') : t('movies') + ' · ' + (r.sub || ''),
              image: r.poster,
              imageShape: r.kind === 'live' ? 'square' : 'landscape',
              chevron: true,
            },
            () => openRef(r),
          ),
        );
      }
    } else if (tab === 'continue') {
      const items = continueEntries(pid);
      if (!items.length) return body.appendChild(emptyState('clock', t('emptyHistory'), t('emptyHistoryText')));
      for (const e of items) {
        list.appendChild(
          listRow(
            {
              title: e.title,
              sub: (e.subtitle ? e.subtitle + ' · ' : '') + formatRemaining(e.dur - e.pos) + ' ' + t('left'),
              image: e.poster,
              imageShape: 'landscape',
              progress: e.pos / e.dur,
            },
            () => app.play(e),
          ),
        );
      }
    } else {
      const items = store.getHistory(pid);
      if (!items.length) return body.appendChild(emptyState('clock', t('emptyHistory'), t('emptyHistoryText')));
      for (const e of items) {
        list.appendChild(
          listRow(
            {
              title: e.title,
              sub: (e.subtitle ? e.subtitle + ' · ' : '') + formatDay(e.at) + ' ' + formatTime(e.at),
              image: e.poster,
              imageShape: e.kind === 'live' ? 'square' : 'landscape',
              progress: e.dur ? e.pos / e.dur : undefined,
            },
            () => app.play(e),
          ),
        );
      }
      body.appendChild(
        h(
          'div',
          { class: 'list-footer' },
          btn(t('clearHistory'), {
            variant: 'ghost',
            icon: 'trash',
            onClick: () => {
              store.clearHistory(pid);
              render();
            },
          }),
        ),
      );
    }
    body.insertBefore(list, body.firstChild);
  };

  const tabs = chips(
    ([] as { id: string; label: string }[])
      .concat(hasMovies ? [{ id: 'movies', label: t('movies') }] : [])
      .concat(hasSeries ? [{ id: 'series', label: t('series') }] : [])
      .concat([
        { id: 'list', label: t('myList') },
        { id: 'continue', label: t('resumeTab') },
        { id: 'history', label: t('history') },
      ]),
    tab,
    (id) => {
      tab = id as Tab;
      show();
    },
  );
  tabs.classList.add('lib-tabs');

  const header = app.wide
    ? h('header', { class: 'tv-header' }, h('h1', { class: 'screen-title', text: t('library') }), brandClock())
    : screenHeader(t('library'));

  show();
  return {
    el: h('section', { class: 'library' }, header, tabs, content),
    chrome: 'nav',
    tab: 'library',
    // Au retour (fiche, lecteur), les listes personnelles sont rafraîchies ; le catalogue garde sa position.
    onShow: () => {
      if (tab !== 'movies' && tab !== 'series') render();
    },
  };
}
