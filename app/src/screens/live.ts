import type { Screen } from '../app';
import { app, refOf } from '../app';
import type { Channel } from '../types';
import { h, clear, pagedList } from '../ui/dom';
import { art, chips, emptyState, heartBtn, iconBtn, screenHeader, type ChipOption } from '../ui/components';
import { icon } from '../ui/icons';
import * as store from '../storage';
import { t } from '../i18n';
import { brandClock, channelNumber, fillNow } from './common';

/** 9 / 13. TV en direct : liste (mobile) ou grille (TV), filtrée par catégorie. */
export function live(params: { group?: string }): Screen {
  const cat = app.catalog!;
  let filter = params.group || 'all';
  const body = h('div', { class: 'scroll live-scroll' });
  const list = h('div', { class: app.wide ? 'channel-grid' : 'channel-list' });
  body.appendChild(list);

  const options: ChipOption[] = [
    { id: 'all', label: t('all') },
    { id: 'fav', label: t('favorites') },
  ].concat(cat.groups(cat.live).map((g) => ({ id: 'g:' + g, label: (app.isLocked(g) ? '🔒 ' : '') + g })));

  const current = (): Channel[] => {
    if (filter === 'all') return cat.live.filter((c) => !app.isLocked(c.group));
    if (filter === 'fav') {
      const ids: Record<string, boolean> = {};
      for (const r of store.getMyList(cat.playlist.id)) ids[r.id] = true;
      return cat.live.filter((c) => ids[c.id]);
    }
    const g = filter.slice(2);
    return cat.live.filter((c) => c.group === g);
  };

  const render = () => {
    clear(list);
    body.scrollTop = 0;
    const items = current();
    if (!items.length) {
      list.appendChild(
        filter === 'fav'
          ? emptyState('heart', t('emptyList'), t('emptyListText'))
          : emptyState('live', t('noResults'), t('noResultsText')),
      );
      return;
    }
    pagedList(body, list, items, (ch) => (app.wide ? channelCard(ch, items) : channelRow(ch, items)), app.wide ? 30 : 40);
  };

  const filterRow = chips(options, filter, async (id) => {
    if (id.indexOf('g:') === 0 && !(await app.unlock(id.slice(2)))) return;
    filter = id;
    render();
  });

  const header = app.wide
    ? h('header', { class: 'tv-header' }, h('h1', { class: 'screen-title', text: t('liveTv') }), brandClock())
    : screenHeader(t('liveTv'), { actions: [iconBtn('guide', t('tvGuide'), () => app.push('guide'))] });

  render();
  return {
    el: h('section', { class: 'live' }, header, filterRow, body),
    chrome: 'nav',
    tab: 'live',
    onKey: (action) => {
      // Touche jaune : ajoute/retire la chaîne sélectionnée des favoris.
      const el = document.activeElement as HTMLElement | null;
      const id = el && (el.getAttribute('data-id') || (el.parentElement && el.parentElement.getAttribute('data-id')));
      if (action !== 'yellow' || !id) return false;
      const ch = cat.get(id) as Channel | undefined;
      if (ch) {
        const on = app.toggleMyList(refOf(ch));
        el!.classList.toggle('is-fav', on);
        const heart = el!.parentElement && el!.parentElement.querySelector('.heart-btn');
        if (heart) heart.classList.toggle('on', on);
      }
      return true;
    },
  };
}

function channelRow(ch: Channel, queue: Channel[]): HTMLElement {
  const sub = h('div', { class: 'row-sub' });
  fillNow(sub, ch, ch.group);
  return h(
    'div',
    { class: 'list-row', 'data-id': ch.id },
    h(
      'button',
      { type: 'button', class: 'list-main focusable', on: { click: () => app.playChannel(ch, queue) } },
      h('div', { class: 'row-media square' }, art(ch.logo, ch.name, 'contain')),
      h('div', { class: 'row-text' }, h('div', { class: 'row-title', text: ch.name }), sub),
    ),
    heartBtn(app.inMyList(ch.id), () => app.toggleMyList(refOf(ch))),
  );
}

function channelCard(ch: Channel, queue: Channel[]): HTMLElement {
  const sub = h('div', { class: 'card-sub' });
  fillNow(sub, ch, ch.group);
  return h(
    'button',
    {
      type: 'button',
      class: 'card card-live focusable' + (app.inMyList(ch.id) ? ' is-fav' : ''),
      on: {
        click: () => app.playChannel(ch, queue),
        contextmenu: (e: Event) => {
          e.preventDefault();
          app.toggleMyList(refOf(ch));
        },
      },
      'data-id': ch.id,
    },
    h('div', { class: 'card-media' }, art(ch.logo, ch.name, 'contain'), h('span', { class: 'card-fav' }, icon('heart'))),
    h('div', { class: 'card-title' }, h('span', { class: 'num', text: channelNumber(ch) }), ch.name),
    sub,
  );
}
