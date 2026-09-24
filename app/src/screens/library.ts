import type { Screen } from '../app';
import { app } from '../app';
import type { Channel, ItemRef } from '../types';
import { h, clear } from '../ui/dom';
import { btn, chips, emptyState, listRow, screenHeader } from '../ui/components';
import * as store from '../storage';
import { formatDay, formatRemaining, formatTime, t } from '../i18n';
import { brandClock } from './common';

type Tab = 'list' | 'continue' | 'history';

/** 21 / 22. Bibliothèque : Ma liste, Continuer à regarder, Historique. */
export function library(params: { tab?: Tab }): Screen {
  const cat = app.catalog!;
  const pid = cat.playlist.id;
  let tab: Tab = params.tab || 'list';
  let listFilter = 'all';
  const body = h('div', { class: 'scroll' });
  const sub = h('div', { class: 'sub-chips' });

  const openRef = (r: ItemRef) => {
    const item = cat.get(r.id);
    if (!item) return;
    if (r.kind === 'live') app.playChannel(item as Channel, cat.live.filter((c) => app.inMyList(c.id)));
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
      const items = store.getContinueWatching(pid);
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
    [
      { id: 'list', label: t('myList') },
      { id: 'continue', label: t('continueWatching') },
      { id: 'history', label: t('history') },
    ],
    tab,
    (id) => {
      tab = id as Tab;
      render();
    },
  );
  tabs.classList.add('segmented');

  const header = app.wide
    ? h('header', { class: 'tv-header' }, h('h1', { class: 'screen-title', text: t('library') }), brandClock())
    : screenHeader(t('library'));

  return { el: h('section', { class: 'library' }, header, tabs, sub, body), chrome: 'nav', tab: 'library', onShow: render };
}
