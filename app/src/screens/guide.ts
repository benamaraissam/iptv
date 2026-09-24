import type { Screen } from '../app';
import { app } from '../app';
import type { Channel, Program } from '../types';
import { h, clear, pagedList } from '../ui/dom';
import { btn, chips, emptyState, openModal, screenHeader } from '../ui/components';
import { formatDay, formatTime, startOfDay, t } from '../i18n';
import { brandClock, channelNumber } from './common';

const SLOT = 30 * 60000;

/** 10 / 14. Guide TV : grille horaire, une ligne par chaîne. */
export function guide(): Screen {
  const cat = app.catalog!;
  const channels = cat.live.filter((c) => !app.isLocked(c.group) && (c.tvgId || c.streamId));
  const pxPerMin = app.wide ? 7 : 4.2;
  const today = startOfDay(new Date());
  let day = today;

  const header = app.wide
    ? h('header', { class: 'tv-header' }, h('h1', { class: 'screen-title', text: t('tvGuide') }), brandClock())
    : screenHeader(t('tvGuide'), { back: () => app.back() });

  if (!cat.epg.available || !channels.length) {
    return {
      el: h('section', { class: 'guide' }, header, emptyState('guide', t('emptyGuide'), t('emptyGuideText'))),
      chrome: 'nav',
      tab: 'guide',
    };
  }

  const dayChips = chips(
    [0, 1, 2, 3].map((d) => ({ id: String(d), label: formatDay(today + d * 86400000) })),
    '0',
    (id) => {
      day = today + parseInt(id, 10) * 86400000;
      render();
    },
  );

  const grid = h('div', { class: 'epg-grid' });
  const x = (ms: number) => ((ms - day) / 60000) * pxPerMin;
  const width = 24 * 60 * pxPerMin;

  // Les lignes doivent faire toute la largeur défilable, sinon la colonne
  // des chaînes (position: sticky) disparaît avec sa ligne.
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const fullWidth = Math.ceil(width + (app.wide ? 12 : 5.6) * rem) + 'px';

  const render = () => {
    clear(grid);
    const times = h('div', { class: 'epg-times', style: 'width:' + width + 'px' });
    for (let s = day; s < day + 86400000; s += SLOT) {
      times.appendChild(h('span', { style: 'left:' + x(s) + 'px', text: formatTime(s) }));
    }
    grid.appendChild(h('div', { class: 'epg-head', style: 'width:' + fullWidth }, h('div', { class: 'epg-corner' }), times));
    const rows = h('div', { class: 'epg-rows', style: 'width:' + fullWidth });
    grid.appendChild(rows);
    const now = Date.now();
    if (now > day && now < day + 86400000) {
      rows.appendChild(h('div', { class: 'epg-now', style: 'left:' + x(now) + 'px' }));
    }
    pagedList(grid, rows, channels, (ch) => row(ch), 25);
    scrollToNow();
  };

  // Positionne la vue sur l'heure actuelle (ou 18h pour les jours suivants).
  // Doit être fait une fois la grille affichée : un élément détaché ne défile pas.
  const scrollToNow = () => {
    const now = Date.now();
    const target = now > day && now < day + 86400000 ? now - SLOT : day + 18 * 3600000;
    grid.scrollLeft = Math.max(0, x(target));
    grid.scrollTop = 0;
  };

  const row = (ch: Channel): HTMLElement => {
    const track = h('div', { class: 'epg-track', style: 'width:' + width + 'px' });
    const r = h(
      'div',
      { class: 'epg-row' },
      h(
        'button',
        { type: 'button', class: 'epg-channel focusable', on: { click: () => app.playChannel(ch, channels) } },
        h('span', { class: 'num', text: channelNumber(ch) }),
        h('span', { class: 'name', text: ch.name }),
      ),
      track,
    );
    track.appendChild(h('div', { class: 'epg-loading' }));
    cat.epg.programs(ch, true).then((list) => {
      clear(track);
      const dayEnd = day + 86400000;
      const inDay = list.filter((p) => p.end > day && p.start < dayEnd);
      if (!inDay.length) {
        track.appendChild(h('div', { class: 'epg-empty', text: t('noProgram') }));
        return;
      }
      const now = Date.now();
      for (const p of inDay) {
        const left = Math.max(0, x(p.start));
        const w = Math.max(24, x(Math.min(p.end, dayEnd)) - left - 4);
        const airing = p.start <= now && p.end > now;
        track.appendChild(
          h(
            'button',
            {
              type: 'button',
              class: 'epg-prog focusable' + (airing ? ' now' : '') + (p.end <= now ? ' past' : ''),
              style: 'left:' + left + 'px;width:' + w + 'px',
              on: { click: () => programDialog(ch, p, channels) },
            },
            h('span', { class: 'prog-title', text: p.title }),
            h('span', { class: 'prog-time', text: formatTime(p.start) + ' – ' + formatTime(p.end) }),
          ),
        );
      }
    });
    return r;
  };

  render();
  let shown = false;
  return {
    el: h('section', { class: 'guide' }, header, dayChips, grid),
    chrome: 'nav',
    tab: 'guide',
    onShow: () => {
      if (!shown) scrollToNow();
      shown = true;
    },
  };
}

function programDialog(ch: Channel, p: Program, queue: Channel[]): void {
  const cat = app.catalog!;
  const now = Date.now();
  const airing = p.start <= now && p.end > now;
  const replay = p.end <= now && p.archive && ch.archive;
  const close = openModal(
    h(
      'div',
      { class: 'dialog prog-dialog' },
      h('div', { class: 'muted', text: ch.name + ' · ' + formatDay(p.start) + ' ' + formatTime(p.start) + ' – ' + formatTime(p.end) }),
      h('h3', { text: p.title }),
      p.desc ? h('p', { class: 'prog-desc', text: p.desc }) : null,
      h(
        'div',
        { class: 'dialog-actions' },
        btn(t('close'), { onClick: () => close() }),
        airing
          ? btn(t('play'), { variant: 'primary', icon: 'play', autofocus: true, onClick: () => (close(), app.playChannel(ch, queue)) })
          : null,
        replay
          ? btn(t('catchup'), {
              variant: 'primary',
              icon: 'catchup',
              autofocus: true,
              onClick: () => {
                close();
                app.play({ id: ch.id + '@' + p.start, kind: 'catchup', title: p.title, subtitle: ch.name, url: cat.catchupUrl(ch, p), poster: ch.logo });
              },
            })
          : null,
      ),
    ),
  );
}
