import type { Screen } from '../app';
import { app, channelPlayable, refOf } from '../app';
import type { Channel, Program } from '../types';
import { h, clear, pagedList } from '../ui/dom';
import { art, btn, chips, emptyState, heartBtn, iconBtn, screenHeader } from '../ui/components';
import { icon } from '../ui/icons';
import { focusEl } from '../navigation';
import { currentProgram, nextProgram } from '../epg';
import { cancelPending, check, getHealth, onHealth, type Health } from '../health';
import * as store from '../storage';
import { formatTime, t } from '../i18n';
import { brandClock, categoryButton, channelNumber, imageFirst } from './common';

/**
 * 9 / 13. TV en direct : liste compacte de chaînes + moniteur d'aperçu.
 * - TV / tablette : catégories | liste | moniteur + programme (3 colonnes).
 * - Mobile : moniteur en haut, catégories en puces, liste dessous.
 * Un appui lance la chaîne dans le moniteur, un second passe en plein écran.
 */
export function live(params: { group?: string; channelId?: string }): Screen {
  const cat = app.catalog!;
  const engine = app.engine;
  const pid = cat.playlist.id;
  const wide = app.wide;
  /** Catégorie (null = toutes) et portée : toutes / favoris / en ligne. */
  let group: string | null = params.group || null;
  let scope: 'all' | 'fav' | 'online' = 'all';
  let query = '';
  let items: Channel[] = [];
  let preview: Channel | null = null;
  let infoTimer: number | undefined;
  let destroyed = false;
  // État des chaînes vérifié automatiquement dès l'ouverture de la liste (toutes playlists).
  const AUTO_CHECK_MAX = 400;

  // ───── Données ─────
  const favIds = (): Record<string, boolean> => {
    const ids: Record<string, boolean> = {};
    for (const r of store.getMyList(pid)) ids[r.id] = true;
    return ids;
  };
  const current = (): Channel[] => {
    let list = group === null ? cat.live.filter((c) => !app.isLocked(c.group)) : cat.live.filter((c) => c.group === group);
    if (scope === 'fav') {
      const ids = favIds();
      list = list.filter((c) => ids[c.id]);
    } else if (scope === 'online') list = list.filter((c) => getHealth(c.url) === 'ok');
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((c) => c.name.toLowerCase().indexOf(q) !== -1);
    return imageFirst(list, (c) => c.logo);
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
    if (!fsBtn.contains(e.target as Node) && preview) fullscreen();
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
    screenBox.classList.add('has-preview');
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
    screenBox.classList.remove('has-preview');
    placeholder.classList.remove('hidden');
    monSpinner.classList.add('hidden');
    clear(monLabel);
    markPlaying();
  };

  // ───── Liste ─────
  const listScroll = h('div', { class: 'scroll live-list scroll-left' });
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
        class: 'ch-row focusable' + (app.inMyList(ch.id) ? ' is-fav' : '') + (preview && preview.id === ch.id ? ' playing' : '') + ' h-' + getHealth(ch.url),
        'data-id': ch.id,
        'data-url': ch.url,
        on: {
          click: () => (preview && preview.id === ch.id ? fullscreen() : startPreview(ch)),
          contextmenu: (e: Event) => {
            e.preventDefault();
            markFav(ch.id, app.toggleMyList(refOf(ch)));
          },
        },
      },
      h('span', { class: 'ch-num', text: channelNumber(ch) }),
      h('div', { class: 'ch-logo' }, art(ch.logo, ch.name, 'contain'), h('span', { class: 'ch-dot', title: t('channelStatus') })),
      h(
        'div',
        { class: 'ch-text' },
        h('div', { class: 'ch-name', text: ch.name }),
        prog,
        h('div', { class: 'ch-state' }, icon('offline'), h('span', { text: t('channelDown') })),
        h('div', { class: 'ch-bar' }, bar),
      ),
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
    check(ch.url);
    return el;
  };

  // ───── État des chaînes ─────
  const summary = h('div', { class: 'ch-summary' });
  let summaryTimer: number | undefined;
  const renderSummary = () => {
    window.clearTimeout(summaryTimer);
    summaryTimer = window.setTimeout(() => {
      let ok = 0;
      let down = 0;
      let checking = 0;
      for (const c of items) {
        const hs = getHealth(c.url);
        if (hs === 'ok') ok++;
        else if (hs === 'down') down++;
        else if (hs === 'checking') checking++;
      }
      clear(summary);
      summary.appendChild(h('span', { class: 'sum-total', text: items.length + ' ' + t('channels').toLowerCase() }));
      if (ok) summary.appendChild(h('span', { class: 'sum sum-ok' }, h('i'), ok + ' ' + t('online')));
      if (down) summary.appendChild(h('span', { class: 'sum sum-down' }, h('i'), down + ' ' + t('offlineCount')));
      if (checking) summary.appendChild(h('span', { class: 'sum sum-checking' }, h('i'), t('checking')));
    }, 150);
  };
  const applyHealth = (url: string, st: Health) => {
    const rows = list.querySelectorAll<HTMLElement>('.ch-row');
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].getAttribute('data-url') !== url) continue;
      rows[i].classList.remove('h-unknown', 'h-checking', 'h-ok', 'h-down');
      rows[i].classList.add('h-' + st);
    }
    renderSummary();
  };
  const offHealth = onHealth(applyHealth);
  const checkAll = () => {
    cancelPending();
    for (const c of items) check(c.url, true);
    renderSummary();
  };
  const checkBtn = btn(wide ? t('checkChannels') : null, { variant: wide ? 'glass' : 'icon', icon: 'wifi', title: t('checkChannels'), onClick: checkAll, cls: 'check-btn' });

  const renderList = () => {
    clear(list);
    listScroll.scrollTop = 0;
    cancelPending();
    items = current();
    // Toute la catégorie est vérifiée (pas seulement les lignes affichées),
    // pour que le compteur et les pastilles soient prêts avant de faire défiler.
    for (let i = 0; i < items.length && i < AUTO_CHECK_MAX; i++) check(items[i].url);
    renderSummary();
    if (!items.length) {
      pager = null;
      list.appendChild(
        scope === 'fav'
          ? emptyState('heart', t('emptyList'), t('emptyListText'))
          : scope === 'online'
            ? emptyState('offline', t('noOnline'), t('noOnlineText'))
            : emptyState('live', t('noResults'), t('noResultsText')),
      );
      return;
    }
    pager = pagedList(listScroll, list, items, row, 40);
  };

  // ───── Filtres : bouton « Catégorie » + sélecteur, et Tout / Favoris / En ligne ─────
  const groups = cat.groups(cat.live);
  const countOf = (g: string | null) =>
    g === null ? cat.live.filter((c) => !app.isLocked(c.group)).length : cat.live.filter((c) => c.group === g).length;

  const catFilter = categoryButton({
    groups,
    selected: group,
    countOf,
    onChange: (g) => {
      group = g;
      renderList();
    },
  });
  const catBtn = catFilter.el;

  const scopeEl = chips(
    [
      { id: 'all', label: t('all') },
      { id: 'fav', label: t('favorites') },
      { id: 'online', label: t('onlineOnly') },
    ],
    scope,
    (id) => {
      scope = id as typeof scope;
      renderList();
    },
  );
  scopeEl.classList.add('segmented', 'scope-switch');
  const filterBar = h('div', { class: 'live-filterbar' }, catBtn, scopeEl);

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
        h(
          'div',
          { class: 'live-list-col' },
          h('div', { class: 'live-list-head' }, h('div', { class: 'live-search-wrap' }, icon('search', 'search-ic'), search), checkBtn),
          filterBar,
          summary,
          listScroll,
        ),
        h('aside', { class: 'live-monitor-col' }, monitor),
      ),
    );
  } else {
    el = h(
      'section',
      { class: 'live live-compact' },
      screenHeader(t('liveTv'), { actions: [checkBtn, iconBtn('guide', t('tvGuide'), () => app.push('guide'))] }),
      monitor,
      filterBar,
      summary,
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
        // Ouvert depuis l'accueil / la recherche : la chaîne demandée démarre dans le moniteur.
        const asked = params.channelId ? (cat.get(params.channelId) as Channel | undefined) : undefined;
        if (asked && asked.kind === 'live') startPreview(asked);
        // Xtream : pas de lecture automatique, pour laisser la vérification des chaînes
        // se faire d'abord (elle est suspendue pendant la lecture).
        else if (wide && last && !cat.isXtream) startPreview(last);
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
      window.clearTimeout(summaryTimer);
      offHealth();
      cancelPending();
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

