import type { Screen } from '../app';
import { app, channelPlayable, refOf } from '../app';
import type { Channel, Program } from '../types';
import { h, clear, pagedList } from '../ui/dom';
import { art, btn, chips, emptyState, heartBtn, iconBtn, screenHeader, type ChipOption } from '../ui/components';
import { icon } from '../ui/icons';
import { focusEl } from '../navigation';
import { currentProgram, nextProgram } from '../epg';
import * as store from '../storage';
import { formatTime, t } from '../i18n';
import { brandClock, channelNumber } from './common';

/**
 * 9 / 13. TV en direct : liste compacte de chaînes + moniteur d'aperçu.
 * - TV / tablette : catégories | liste | moniteur + programme (3 colonnes).
 * - Mobile : moniteur en haut, catégories en puces, liste dessous.
 * Un appui lance la chaîne dans le moniteur, un second passe en plein écran.
 */
export function live(params: { group?: string }): Screen {
  const cat = app.catalog!;
  const engine = app.engine;
  const pid = cat.playlist.id;
  const wide = app.wide;
  let filter = params.group || 'all';
  let query = '';
  let items: Channel[] = [];
  let preview: Channel | null = null;
  let infoTimer: number | undefined;
  let destroyed = false;

  // ───── Données ─────
  const favIds = (): Record<string, boolean> => {
    const ids: Record<string, boolean> = {};
    for (const r of store.getMyList(pid)) ids[r.id] = true;
    return ids;
  };
  const current = (): Channel[] => {
    let list: Channel[];
    if (filter === 'all') list = cat.live.filter((c) => !app.isLocked(c.group));
    else if (filter === 'fav') {
      const ids = favIds();
      list = cat.live.filter((c) => ids[c.id]);
    } else list = cat.live.filter((c) => c.group === filter.slice(2));
    const q = query.trim().toLowerCase();
    return q ? list.filter((c) => c.name.toLowerCase().indexOf(q) !== -1) : list;
  };

  // ───── Moniteur ─────
  const screenBox = h('div', { class: 'monitor-screen' });
  const placeholder = h('div', { class: 'monitor-placeholder' }, icon('live'), h('p', { text: t('selectChannel') }));
  const monLabel = h('div', { class: 'monitor-label' });
  const monError = h('div', { class: 'monitor-error hidden' });
  const monSpinner = h('div', { class: 'monitor-spinner hidden' }, h('div', { class: 'spinner' }));
  screenBox.appendChild(placeholder);
  screenBox.appendChild(monLabel);
  screenBox.appendChild(monSpinner);
  screenBox.appendChild(monError);
  const fsBtn = h('button', { type: 'button', class: 'monitor-fs focusable', 'aria-label': t('fullscreen'), on: { click: () => fullscreen() } }, icon('fullscreen'));
  screenBox.appendChild(fsBtn);
  screenBox.addEventListener('click', (e) => {
    if (e.target !== fsBtn && preview) fullscreen();
  });

  const infoBox = h('div', { class: 'monitor-info' });
  const monitor = h('div', { class: 'monitor' }, screenBox, infoBox);

  const onWaiting = () => monSpinner.classList.remove('hidden');
  const onPlaying = () => {
    monSpinner.classList.add('hidden');
    monError.classList.add('hidden');
  };
  engine.video.addEventListener('waiting', onWaiting);
  engine.video.addEventListener('playing', onPlaying);

  const renderInfo = () => {
    clear(infoBox);
    window.clearTimeout(infoTimer);
    const ch = preview;
    if (!ch) {
      infoBox.appendChild(h('p', { class: 'muted mi-empty', text: t('selectChannelText') }));
      return;
    }
    const nowTitle = h('div', { class: 'mi-title', text: t('noProgram') });
    const nowTime = h('div', { class: 'mi-time' });
    const bar = h('i');
    const desc = h('p', { class: 'mi-desc' });
    const next = h('div', { class: 'mi-next' });
    const fav = heartBtn(app.inMyList(ch.id), () => {
      const on = app.toggleMyList(refOf(ch));
      markFav(ch.id, on);
      return on;
    });
    infoBox.appendChild(
      h(
        'div',
        { class: 'mi-head' },
        h('div', { class: 'mi-logo' }, art(ch.logo, ch.name, 'contain')),
        h('div', { class: 'mi-name' }, h('div', { class: 'mi-ch', text: channelNumber(ch) + '  ' + ch.name }), h('div', { class: 'muted mi-group', text: ch.group })),
        fav,
      ),
    );
    infoBox.appendChild(
      h('div', { class: 'mi-now' }, h('div', { class: 'mi-label' }, h('span', { class: 'live-dot' }), t('liveNow')), nowTitle, nowTime, h('div', { class: 'mi-bar' }, bar), desc),
    );
    infoBox.appendChild(next);
    infoBox.appendChild(
      h(
        'div',
        { class: 'mi-actions' },
        btn(t('fullscreen'), { variant: 'primary', icon: 'fullscreen', onClick: fullscreen }),
        wide ? btn(t('tvGuide'), { variant: 'glass', icon: 'guide', onClick: () => app.push('guide') }) : null,
      ),
    );
    const fill = (list: Program[]) => {
      if (destroyed || preview !== ch) return;
      const p = currentProgram(list);
      const n = nextProgram(list);
      if (p) {
        nowTitle.textContent = p.title;
        nowTime.textContent = formatTime(p.start) + ' – ' + formatTime(p.end);
        bar.style.width = Math.min(100, ((Date.now() - p.start) / (p.end - p.start)) * 100) + '%';
        desc.textContent = p.desc || '';
      }
      next.textContent = n ? t('upNext') + ' · ' + formatTime(n.start) + '  ' + n.title : '';
      infoTimer = window.setTimeout(() => fill(list), 30000);
    };
    if (cat.epg.available) cat.epg.programs(ch).then(fill, () => undefined);
  };

  const startPreview = (ch: Channel, focusRow = false) => {
    preview = ch;
    placeholder.classList.add('hidden');
    monError.classList.add('hidden');
    monSpinner.classList.remove('hidden');
    screenBox.insertBefore(engine.video, screenBox.firstChild);
    clear(monLabel);
    monLabel.appendChild(h('span', { class: 'badge live-badge', text: t('live') }));
    monLabel.appendChild(h('span', { text: channelNumber(ch) + '  ' + ch.name }));
    engine.onTracks = () => undefined;
    engine.onError = (kind) => {
      if (preview !== ch) return;
      monSpinner.classList.add('hidden');
      clear(monError);
      monError.appendChild(icon('offline'));
      monError.appendChild(h('p', { text: kind === 'network' ? t('streamUnreachable') : t('unsupported') }));
      monError.classList.remove('hidden');
    };
    if (!engine.isPlaying(ch.url)) {
      engine.quality = store.getSettings().quality;
      engine.load(ch.url);
    } else engine.play();
    store.recordHistory(pid, channelPlayable(ch), 0, 0);
    markPlaying();
    renderInfo();
    if (focusRow) {
      const row = list.querySelector<HTMLElement>('[data-id="' + ch.id + '"]');
      if (row) focusEl(row);
    }
  };

  const fullscreen = () => {
    if (preview) app.playChannel(preview, items.length ? items : [preview]);
  };

  const stopPreview = () => {
    engine.stop();
    if (engine.video.parentNode === screenBox) screenBox.removeChild(engine.video);
    preview = null;
    placeholder.classList.remove('hidden');
    monSpinner.classList.add('hidden');
    clear(monLabel);
    markPlaying();
  };

  // ───── Liste ─────
  const listScroll = h('div', { class: 'scroll live-list' });
  const list = h('div', { class: 'ch-list' });
  listScroll.appendChild(list);
  let pager: { renderUntil(i: number): void } | null = null;

  const markPlaying = () => {
    const rows = list.querySelectorAll<HTMLElement>('.ch-row');
    for (let i = 0; i < rows.length; i++) rows[i].classList.toggle('playing', !!preview && rows[i].getAttribute('data-id') === preview.id);
  };
  const markFav = (id: string, on: boolean) => {
    const row = list.querySelector('[data-id="' + id + '"]');
    if (row) row.classList.toggle('is-fav', on);
  };

  const row = (ch: Channel): HTMLElement => {
    const prog = h('div', { class: 'ch-prog', text: ch.group });
    const bar = h('i');
    const el = h(
      'button',
      {
        type: 'button',
        class: 'ch-row focusable' + (app.inMyList(ch.id) ? ' is-fav' : '') + (preview && preview.id === ch.id ? ' playing' : ''),
        'data-id': ch.id,
        on: {
          click: () => (preview && preview.id === ch.id ? fullscreen() : startPreview(ch)),
          contextmenu: (e: Event) => {
            e.preventDefault();
            markFav(ch.id, app.toggleMyList(refOf(ch)));
          },
        },
      },
      h('span', { class: 'ch-num', text: channelNumber(ch) }),
      h('div', { class: 'ch-logo' }, art(ch.logo, ch.name, 'contain')),
      h('div', { class: 'ch-text' }, h('div', { class: 'ch-name', text: ch.name }), prog, h('div', { class: 'ch-bar' }, bar)),
      h('span', { class: 'ch-fav' }, icon('heart')),
      h('span', { class: 'ch-eq' }, h('i'), h('i'), h('i')),
    );
    if (cat.epg.available) {
      const fill = (list: Program[]) => {
        const p = currentProgram(list);
        if (!p) return;
        prog.textContent = p.title;
        bar.style.width = Math.min(100, ((Date.now() - p.start) / (p.end - p.start)) * 100) + '%';
        el.classList.add('has-prog');
      };
      const cached = cat.epg.peek(ch);
      if (cached) fill(cached);
      else cat.epg.programs(ch).then(fill, () => undefined);
    }
    return el;
  };

  const renderList = () => {
    clear(list);
    listScroll.scrollTop = 0;
    items = current();
    if (!items.length) {
      pager = null;
      list.appendChild(
        filter === 'fav' ? emptyState('heart', t('emptyList'), t('emptyListText')) : emptyState('live', t('noResults'), t('noResultsText')),
      );
      return;
    }
    pager = pagedList(listScroll, list, items, row, 40);
  };

  // ───── Catégories ─────
  const groups = cat.groups(cat.live);
  const selectFilter = async (id: string) => {
    if (id.indexOf('g:') === 0 && !(await app.unlock(id.slice(2)))) return false;
    filter = id;
    renderList();
    return true;
  };

  let catsEl: HTMLElement;
  if (wide) {
    const ids = favIds();
    type CatEntry = { id: string; label: string; count: number; ic?: 'heart' | 'grid' | 'lock' };
    const base: CatEntry[] = [
      { id: 'all', label: t('all'), count: cat.live.filter((c) => !app.isLocked(c.group)).length, ic: 'grid' },
      { id: 'fav', label: t('favorites'), count: cat.live.filter((c) => ids[c.id]).length, ic: 'heart' },
    ];
    const entries = base.concat(
      groups.map((g): CatEntry => ({ id: 'g:' + g, label: g, count: cat.live.filter((c) => c.group === g).length, ic: app.isLocked(g) ? 'lock' : undefined })),
    );
    catsEl = h(
      'nav',
      { class: 'scroll live-cats' },
      entries.map((e) =>
        h(
          'button',
          {
            type: 'button',
            class: 'cat-item focusable' + (e.id === filter ? ' selected' : ''),
            'data-cat': e.id,
            on: {
              click: async (ev: Event) => {
                const target = ev.currentTarget as HTMLElement;
                if (!(await selectFilter(e.id))) return;
                const prev = catsEl.querySelector('.cat-item.selected');
                if (prev) prev.classList.remove('selected');
                target.classList.add('selected');
              },
            },
          },
          e.ic ? icon(e.ic) : null,
          h('span', { class: 'cat-label', text: e.label }),
          h('span', { class: 'cat-count', text: String(e.count) }),
        ),
      ),
    );
  } else {
    const options: ChipOption[] = [
      { id: 'all', label: t('all') },
      { id: 'fav', label: t('favorites') },
    ].concat(groups.map((g) => ({ id: 'g:' + g, label: (app.isLocked(g) ? '🔒 ' : '') + g })));
    catsEl = chips(options, filter, (id) => void selectFilter(id));
  }

  // ───── Mise en page ─────
  let el: HTMLElement;
  if (wide) {
    const search = h('input', {
      class: 'input live-search focusable',
      type: 'search',
      placeholder: t('searchChannel'),
      on: {
        input: () => {
          query = search.value;
          renderList();
        },
      },
    });
    el = h(
      'section',
      { class: 'live live-wide' },
      h('header', { class: 'tv-header' }, h('h1', { class: 'screen-title', text: t('liveTv') }), brandClock()),
      h(
        'div',
        { class: 'live-layout' },
        catsEl,
        h('div', { class: 'live-list-col' }, h('div', { class: 'live-search-wrap' }, icon('search', 'search-ic'), search), listScroll),
        h('aside', { class: 'live-monitor-col' }, monitor),
      ),
    );
  } else {
    el = h(
      'section',
      { class: 'live live-compact' },
      screenHeader(t('liveTv'), { actions: [iconBtn('guide', t('tvGuide'), () => app.push('guide'))] }),
      monitor,
      catsEl,
      listScroll,
    );
  }

  renderList();
  renderInfo();

  // Reprend la dernière chaîne regardée (TV / tablette uniquement : évite de consommer des données sur mobile).
  const lastLive = (): Channel | null => {
    for (const hEntry of store.getHistory(pid)) {
      if (hEntry.kind !== 'live') continue;
      const ch = cat.get(hEntry.id) as Channel | undefined;
      if (ch && ch.kind === 'live' && !app.isLocked(ch.group)) return ch;
      return null;
    }
    return null;
  };

  let firstShow = true;
  return {
    el,
    chrome: 'nav',
    tab: 'live',
    onShow: () => {
      const last = lastLive();
      if (firstShow) {
        firstShow = false;
        if (wide && last) startPreview(last);
      } else if (preview) {
        // Retour du plein écran : on reprend la chaîne regardée en dernier (zapping inclus).
        startPreview(last || preview);
      }
      const target = preview ? list.querySelector<HTMLElement>('[data-id="' + preview.id + '"]') : null;
      if (preview && !target && pager) {
        const idx = items.indexOf(preview);
        if (idx >= 0) pager.renderUntil(idx);
      }
      // L'écran donne ensuite le focus à [data-autofocus] : la chaîne en cours, sinon la première.
      const old = el.querySelector('[data-autofocus]');
      if (old) old.removeAttribute('data-autofocus');
      const focusTarget = (preview && list.querySelector<HTMLElement>('[data-id="' + preview.id + '"]')) || list.querySelector<HTMLElement>('.ch-row');
      if (focusTarget) focusTarget.setAttribute('data-autofocus', '');
    },
    onHide: () => {
      // Le moniteur continue seulement si on passe en plein écran.
      window.setTimeout(() => {
        if (!destroyed && app.current !== 'player') stopPreview();
      }, 0);
    },
    destroy: () => {
      destroyed = true;
      window.clearTimeout(infoTimer);
      engine.video.removeEventListener('waiting', onWaiting);
      engine.video.removeEventListener('playing', onPlaying);
      if (app.current !== 'player' && engine.video.parentNode === screenBox) engine.stop();
    },
    onKey: (action) => {
      const active = document.activeElement as HTMLElement | null;
      if (action === 'yellow' && active && active.classList.contains('ch-row')) {
        const ch = cat.get(active.getAttribute('data-id') || '') as Channel | undefined;
        if (ch) markFav(ch.id, app.toggleMyList(refOf(ch)));
        return true;
      }
      if ((action === 'chup' || action === 'chdown') && preview && items.length) {
        const i = items.indexOf(preview);
        const n = items[(i + (action === 'chup' ? 1 : -1) + items.length) % items.length];
        if (pager) pager.renderUntil(items.indexOf(n));
        startPreview(n, true);
        return true;
      }
      if ((action === 'playpause' || action === 'play' || action === 'pause') && preview) {
        engine.togglePause();
        return true;
      }
      return false;
    },
  };
}
