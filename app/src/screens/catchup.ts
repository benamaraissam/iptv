import type { Screen } from '../app';
import { app } from '../app';
import type { Channel } from '../types';
import { h, clear, pagedList } from '../ui/dom';
import { art, chips, emptyState, listRow, screenHeader } from '../ui/components';
import { formatDay, formatTime, t } from '../i18n';
import { brandClock } from './common';

/** 23. Replay : chaînes avec archive, puis programmes passés rejouables. */
export function catchup(): Screen {
  const cat = app.catalog!;
  const channels = cat.catchupChannels.filter((c) => !app.isLocked(c.group));
  let filter = 'all';
  const body = h('div', { class: 'scroll' });

  const header = app.wide
    ? h('header', { class: 'tv-header' }, h('h1', { class: 'screen-title', text: t('catchup') }), brandClock())
    : screenHeader(t('catchup'), { back: () => app.back() });

  if (!channels.length) {
    return {
      el: h('section', { class: 'catchup' }, header, emptyState('catchup', t('emptyCatchup'), t('emptyCatchupText'))),
      chrome: 'nav',
      tab: 'catchup',
    };
  }

  const render = () => {
    clear(body);
    body.scrollTop = 0;
    const list = h('div', { class: 'row-list' });
    body.appendChild(list);
    const items = filter === 'all' ? channels : channels.filter((c) => c.group === filter);
    pagedList(body, list, items, (ch) =>
      listRow(
        { title: ch.name, sub: ch.group, image: ch.logo, imageShape: 'landscape', chevron: true },
        () => app.push('catchupChannel', { id: ch.id }),
      ),
    );
  };

  const filters = chips(
    [{ id: 'all', label: t('all') }].concat(cat.groups(channels).map((g) => ({ id: g, label: g }))),
    filter,
    (id) => {
      filter = id;
      render();
    },
  );
  render();
  return { el: h('section', { class: 'catchup' }, header, filters, body), chrome: 'nav', tab: 'catchup' };
}

/** Programmes passés d'une chaîne. */
export function catchupChannel(params: { id: string }): Screen {
  const cat = app.catalog!;
  const ch = cat.get(params.id) as Channel;
  const body = h('div', { class: 'scroll' }, h('div', { class: 'loading-inline' }, h('div', { class: 'spinner' })));
  const header = screenHeader(ch.name, { back: () => app.back() });

  cat.catchupPrograms(ch).then(
    (progs) => {
      clear(body);
      if (!progs.length) return body.appendChild(emptyState('catchup', t('emptyCatchup'), ''));
      const list = h('div', { class: 'row-list' });
      body.appendChild(list);
      pagedList(body, list, progs, (p) =>
        listRow(
          {
            title: p.title,
            sub: formatDay(p.start) + ', ' + formatTime(p.start) + ' – ' + formatTime(p.end),
            image: ch.logo,
            imageShape: 'landscape',
            chevron: true,
          },
          () =>
            app.play({
              id: ch.id + '@' + p.start,
              kind: 'catchup',
              title: p.title,
              subtitle: ch.name + ' · ' + formatDay(p.start) + ' ' + formatTime(p.start),
              url: cat.catchupUrl(ch, p),
              poster: ch.logo,
            }),
        ),
      );
    },
    () => {
      clear(body);
      body.appendChild(emptyState('offline', t('noInternet'), t('noInternetText')));
    },
  );

  return { el: h('section', { class: 'catchup' }, header, h('div', { class: 'catchup-hero' }, art(ch.logo, ch.name, 'contain')), body), chrome: 'nav', tab: 'catchup' };
}
