import type { Screen } from '../app';
import { app } from '../app';
import type { Channel, Playable } from '../types';
import type { Action } from '../platform';
import { isTV } from '../platform';
import { h, clear, pagedList } from '../ui/dom';
import { icon } from '../ui/icons';
import { art, btn, chooseOption, iconBtn } from '../ui/components';
import { channelNumber } from './common';
import { focusEl } from '../navigation';
import { currentProgram } from '../epg';
import * as store from '../storage';
import { formatDuration, formatTime, t } from '../i18n';

interface Params {
  item: Playable;
  queue: Playable[];
  index: number;
  resume: boolean;
}

/** 20. Lecteur plein écran. */
export function player(params: Params): Screen {
  const engine = app.engine;
  const video = engine.video;
  const cat = app.catalog!;
  const pid = cat.playlist.id;
  const item = params.item;
  const isLive = item.kind === 'live';
  const queue = params.queue;
  let index = params.index;

  const el = h('section', { class: 'player' });
  el.appendChild(video);

  // ───── Haut ─────
  const title = h('div', { class: 'pl-title', text: item.title });
  const subtitle = h('div', { class: 'pl-sub', text: item.subtitle || '' });
  const top = h(
    'div',
    { class: 'pl-top' },
    iconBtn('back', t('close'), () => app.back(), 'pl-back'),
    h('div', { class: 'pl-heading' }, title, subtitle),
    h(
      'div',
      { class: 'pl-badges' },
      isLive ? h('span', { class: 'badge live-badge', text: t('live') }) : null,
      !isTV ? iconBtn('fullscreen', 'Plein écran', () => toggleFullscreen(el)) : null,
    ),
  );

  // ───── Bas ─────
  const fill = h('i', { class: 'seek-fill' });
  const knob = h('b', { class: 'seek-knob' });
  const seekbar = h('button', { type: 'button', class: 'seekbar focusable', 'aria-label': 'Position' }, h('span', { class: 'seek-track' }, fill, knob));
  const time = h('div', { class: 'pl-time' });
  const playBtn = h('button', { type: 'button', class: 'pl-play focusable', on: { click: () => engine.togglePause() } });
  const extras = h('div', { class: 'pl-extras' });

  const hasQueue = queue.length > 1;
  const controls = h(
    'div',
    { class: 'pl-controls' },
    h('div', { class: 'pl-left' }, time),
    h(
      'div',
      { class: 'pl-center' },
      hasQueue ? iconBtn('prev', 'Précédent', () => go(-1), 'pl-skip') : null,
      playBtn,
      hasQueue ? iconBtn('next', 'Suivant', () => go(1), 'pl-skip') : null,
    ),
    extras,
  );
  const bottom = h('div', { class: 'pl-bottom' }, !isLive ? seekbar : null, controls);
  const spinner = h('div', { class: 'pl-spinner' }, h('div', { class: 'spinner' }));
  const errorBox = h('div', { class: 'pl-error hidden' });
  const numEntry = h('div', { class: 'pl-num hidden' });
  el.appendChild(h('div', { class: 'pl-overlay' }, top, bottom));

  // ───── Direct : liste des chaînes en barre latérale gauche (avec les contrôles) ─────
  const side = isLive && queue.length > 1 ? buildChannelSidebar() : null;
  let sideHover = false;
  function buildChannelSidebar(): HTMLElement {
    const scroller = h('div', { class: 'pl-side-list scroll' });
    const inner = h('div');
    scroller.appendChild(inner);
    const row = (q: Playable, i: number) => {
      const ch = cat.get(q.id) as Channel | undefined;
      const prog = h('div', { class: 'ps-prog', text: q.subtitle || '' });
      if (ch && cat.epg.available) {
        const set = (l: import('../types').Program[]) => {
          const p = currentProgram(l);
          if (p) prog.textContent = p.title;
        };
        const cached = cat.epg.peek(ch);
        if (cached) set(cached);
        else cat.epg.programs(ch).then(set, () => undefined);
      }
      return h(
        'button',
        {
          type: 'button',
          class: 'ps-row focusable' + (i === index ? ' current' : ''),
          on: {
            click: (ev: Event) => {
              ev.stopPropagation();
              if (i !== index) jump(i);
            },
          },
        },
        h('span', { class: 'ps-num', text: ch ? channelNumber(ch) : String(i + 1) }),
        h('div', { class: 'ps-logo' }, art(q.poster, q.title, 'contain')),
        h('div', { class: 'ps-text' }, h('div', { class: 'ps-name', text: q.title }), prog),
        i === index ? h('span', { class: 'ch-eq' }, h('i'), h('i'), h('i')) : null,
      );
    };
    const pager = pagedList(scroller, inner, queue, row, 40);
    pager.renderUntil(index);
    const aside = h(
      'aside',
      { class: 'pl-side' },
      h('div', { class: 'pl-side-head' }, h('span', { class: 'pl-side-title', text: t('channels') }), h('span', { class: 'pl-side-count', text: String(queue.length) })),
      scroller,
    );
    // En entrant dans la liste (télécommande), on arrive sur la chaîne en cours.
    aside.addEventListener('focusin', (ev) => {
      const from = (ev as FocusEvent).relatedTarget as Node | null;
      if (from && aside.contains(from)) return;
      const cur = inner.querySelector<HTMLElement>('.current');
      if (cur && ev.target !== cur) focusEl(cur);
    });
    aside.addEventListener('mouseenter', () => (sideHover = true));
    aside.addEventListener('mouseleave', () => (sideHover = false));
    // Chaîne en cours visible (au premier affichage).
    window.setTimeout(() => {
      const cur = inner.querySelector<HTMLElement>('.current');
      if (cur) scroller.scrollTop = Math.max(0, cur.offsetTop - scroller.clientHeight / 3);
    }, 0);
    return aside;
  }
  if (side) {
    el.appendChild(side);
    el.classList.add('has-side');
  }
  // Bouton « Retour » toujours visible (souris / tactile), même quand les contrôles sont masqués.
  el.appendChild(
    h(
      'button',
      {
        type: 'button',
        class: 'pl-exit',
        'aria-label': t('back'),
        on: {
          click: (ev: Event) => {
            ev.stopPropagation();
            app.back();
          },
        },
      },
      icon('back'),
      h('span', { text: t('back') }),
    ),
  );
  el.appendChild(spinner);
  el.appendChild(errorBox);

  // ───── Statistiques de lecture (source lente ou appareil ?) ─────
  const statsBox = h('div', { class: 'pl-stats hidden' });
  el.appendChild(statsBox);
  let statsTimer: number | undefined;
  const renderStats = () => {
    const st = engine.stats();
    clear(statsBox);
    const row = (label: string, value: string, warn = false) =>
      statsBox.appendChild(h('div', { class: 'st-row' + (warn ? ' warn' : '') }, h('span', { text: label }), h('b', { text: value })));
    const sec = (ms?: number) => (ms === undefined ? '—' : (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + ' s');
    const d = diagnose(st);
    statsBox.appendChild(h('div', { class: 'st-verdict st-' + d.level }, h('i'), h('span', { text: d.text })));
    row(t('stStartup'), st.startupMs !== undefined ? sec(st.startupMs) : t('stWaiting') + ' ' + sec(st.waitingMs), (st.startupMs || st.waitingMs) > 5000);
    if (st.manifestMs !== undefined) row(t('stServer'), sec(st.manifestTtfbMs) + ' / ' + sec(st.manifestMs), (st.manifestMs || 0) > 2000);
    if (st.fragMs !== undefined && st.fragDurationMs) {
      row(t('stSegment'), sec(st.fragMs) + ' ' + t('stFor') + ' ' + sec(st.fragDurationMs), st.fragMs > st.fragDurationMs * 0.8);
    }
    if (st.bandwidthKbps !== undefined) {
      row(t('stSpeed'), fmtKbps(st.bandwidthKbps) + (st.levelKbps ? ' (' + t('stNeeded') + ' ' + fmtKbps(st.levelKbps) + ')' : ''), !!st.levelKbps && st.bandwidthKbps < st.levelKbps * 1.2);
    }
    row(t('stBuffer'), st.bufferSec.toFixed(1) + ' s', st.bufferSec < 2 && st.startupMs !== undefined);
    if (st.width) row(t('stResolution'), st.width + '×' + st.height);
    row(t('stRebuffers'), String(st.rebuffers), st.rebuffers > 2);
    row(t('stEngine'), st.engine + (st.dropped ? ' · ' + st.dropped + ' ' + t('stDropped') : ''));
  };
  const toggleStats = () => {
    const show = statsBox.classList.contains('hidden');
    statsBox.classList.toggle('hidden', !show);
    window.clearInterval(statsTimer);
    if (show) {
      renderStats();
      statsTimer = window.setInterval(renderStats, 1000);
    }
  };
  el.appendChild(numEntry);

  // ───── Pistes ─────
  const renderExtras = () => {
    clear(extras);
    const add = (ic: 'episodes' | 'audio' | 'subtitles' | 'quality' | 'info', label: string, fn: () => void) =>
      extras.appendChild(h('button', { type: 'button', class: 'pl-extra focusable', on: { click: fn } }, icon(ic), h('span', { text: label })));
    if (item.kind === 'episode' && hasQueue) add('episodes', t('episodes'), pickEpisode);
    add('info', t('stats'), toggleStats);
    if (isLive && hasQueue && !side) add('episodes', t('channels'), pickEpisode);
    const audio = engine.audioTracks();
    if (audio.list.length > 1) {
      add('audio', t('audio'), async () => {
        const id = await chooseOption(t('audio'), audio.list, audio.current);
        if (id !== null) engine.setAudio(id);
      });
    }
    const subs = engine.subtitleTracks();
    if (subs.list.length) {
      add('subtitles', t('subtitles'), async () => {
        const id = await chooseOption(t('subtitles'), [{ id: '-1', label: t('off') }].concat(subs.list), subs.current);
        if (id !== null) engine.setSubtitle(id);
      });
    }
    const levels = engine.levels();
    if (levels.list.length > 1) {
      add('quality', t('quality'), async () => {
        const id = await chooseOption(t('quality'), [{ id: '-1', label: t('auto') }].concat(levels.list.slice().reverse()), levels.current);
        if (id !== null) engine.setLevel(id);
      });
    }
  };

  const pickEpisode = async () => {
    const id = await chooseOption(
      isLive ? t('channels') : t('episodes'),
      queue.map((q, i) => ({ id: String(i), label: isLive ? pad3(i + 1) + '  ' + q.title : q.subtitle || q.title })),
      String(index),
    );
    if (id !== null && parseInt(id, 10) !== index) jump(parseInt(id, 10));
  };

  // ───── État ─────
  const updatePlay = () => {
    clear(playBtn);
    playBtn.appendChild(icon(video.paused ? 'play' : 'pause'));
  };
  const updateTime = () => {
    if (isLive) {
      time.textContent = formatTime(Date.now());
      return;
    }
    const d = video.duration;
    const c = video.currentTime;
    const pct = isFinite(d) && d > 0 ? (c / d) * 100 : 0;
    fill.style.width = pct + '%';
    knob.style.left = pct + '%';
    time.textContent = formatDuration(c) + ' / ' + (isFinite(d) ? formatDuration(d) : '--:--');
  };

  const saveProgress = () => {
    const d = isFinite(video.duration) ? video.duration : 0;
    if (!isLive && d > 0 && video.currentTime > 0) store.recordHistory(pid, item, video.currentTime, d);
  };

  const onEnded = () => {
    // Un direct ne « se termine » pas : coupure du flux → on se reconnecte.
    if (isLive) {
      engine.load(item.url);
      return;
    }
    saveProgress();
    if (item.kind === 'episode' && store.getSettings().autoplayNext && index < queue.length - 1) go(1);
    else app.back();
  };
  const onWaiting = () => el.classList.add('buffering');
  const onPlaying = () => {
    el.classList.remove('buffering');
    errorBox.classList.add('hidden');
  };
  const listeners: [string, () => void][] = [
    ['play', updatePlay],
    ['pause', updatePlay],
    ['timeupdate', updateTime],
    ['durationchange', updateTime],
    ['ended', onEnded],
    ['waiting', onWaiting],
    ['playing', onPlaying],
    ['canplay', onPlaying],
  ];
  for (const [evt, fn] of listeners) video.addEventListener(evt, fn);

  engine.onTracks = renderExtras;
  engine.onError = (kind) => {
    el.classList.remove('buffering');
    clear(errorBox);
    errorBox.appendChild(icon('offline'));
    errorBox.appendChild(h('p', { text: kind === 'network' ? t('streamUnreachable') : t('unsupported') }));
    errorBox.appendChild(btn(t('retry'), { variant: 'primary', icon: 'refresh', onClick: () => start(true) }));
    errorBox.classList.remove('hidden');
    showOverlay(true);
    focusEl(errorBox.querySelector<HTMLElement>('button'));
  };

  // Programme en cours pour le direct.
  if (isLive) {
    const ch = cat.get(item.id) as Channel | undefined;
    if (ch && cat.epg.available) {
      cat.epg.programs(ch).then((list) => {
        const p = currentProgram(list);
        if (p) subtitle.textContent = p.title + ' · ' + formatTime(p.start) + ' – ' + formatTime(p.end);
      });
    }
  }

  // ───── Affichage des contrôles ─────
  let hideTimer: number | undefined;
  const showOverlay = (sticky = false) => {
    el.classList.add('show-ui');
    window.clearTimeout(hideTimer);
    if (!sticky) hideTimer = window.setTimeout(hideOverlay, 5000);
    if (!el.contains(document.activeElement) || document.activeElement === el) focusEl(playBtn);
  };
  const hideOverlay = () => {
    if (!errorBox.classList.contains('hidden') || video.paused) return;
    // On parcourt la liste des chaînes : on ne la ferme pas sous le curseur / le focus.
    if (side && (sideHover || side.contains(document.activeElement))) {
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(hideOverlay, 5000);
      return;
    }
    el.classList.remove('show-ui');
    (document.activeElement as HTMLElement | null)?.blur?.();
  };
  el.addEventListener('click', (e) => {
    if (e.target === video || e.target === el || (e.target as HTMLElement).classList.contains('pl-overlay')) {
      if (el.classList.contains('show-ui')) hideOverlay();
      else showOverlay();
    }
  });
  el.addEventListener('mousemove', () => showOverlay());

  // Clic / glisser sur la barre de progression.
  const seekTo = (clientX: number) => {
    const r = seekbar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    if (isFinite(video.duration)) video.currentTime = ratio * video.duration;
    updateTime();
  };
  seekbar.addEventListener('click', (e) => seekTo((e as MouseEvent).clientX));
  seekbar.addEventListener('touchmove', (e) => {
    const tch = (e as TouchEvent).touches[0];
    if (tch) seekTo(tch.clientX);
  });

  // ───── Navigation dans la file ─────
  const jump = (i: number) => {
    saveProgress();
    app.play(queue[i], { queue, index: i });
  };
  const go = (delta: number) => {
    if (queue.length < 2) return;
    jump((index + delta + queue.length) % queue.length);
  };

  let digits = '';
  let digitTimer: number | undefined;
  const onDigit = (d: string) => {
    digits = (digits + d).slice(-4);
    numEntry.textContent = digits;
    numEntry.classList.remove('hidden');
    window.clearTimeout(digitTimer);
    digitTimer = window.setTimeout(() => {
      numEntry.classList.add('hidden');
      const target = parseInt(digits, 10) - 1;
      digits = '';
      if (target >= 0 && target < queue.length && target !== index) jump(target);
    }, 1400);
  };

  // ───── Démarrage ─────
  let saveTimer: number | undefined;
  const start = (force = false) => {
    errorBox.classList.add('hidden');
    el.classList.add('buffering');
    let startAt = 0;
    if (params.resume && !isLive) {
      const prog = store.getProgress(pid, item.id);
      if (prog && prog.dur > 0 && prog.pos > 30 && prog.pos / prog.dur < 0.95) startAt = prog.pos;
    }
    if (isLive || item.kind === 'catchup') store.recordHistory(pid, item, 0, 0);
    engine.quality = store.getSettings().quality;
    // Venant de l'aperçu de la TV en direct : le flux tourne déjà, on ne le relance pas.
    if (!force && isLive && engine.isPlaying(item.url)) {
      el.classList.remove('buffering');
      engine.play();
    } else engine.load(item.url, startAt);
    updatePlay();
    updateTime();
    renderExtras();
  };
  start();
  saveTimer = window.setInterval(() => {
    saveProgress();
    if (isLive) updateTime();
  }, 10000);

  const screen: Screen = {
    el,
    chrome: 'none',
    onShow: () => {
      showOverlay();
      el.focus();
    },
    destroy: () => {
      window.clearInterval(statsTimer);
      saveProgress();
      window.clearInterval(saveTimer);
      window.clearTimeout(hideTimer);
      window.clearTimeout(digitTimer);
      for (const [evt, fn] of listeners) video.removeEventListener(evt, fn);
      engine.onTracks = () => undefined;
      engine.onError = () => undefined;
      engine.stop();
      exitFullscreen();
    },
    onKey: (action: Action, e: KeyboardEvent) => {
      const uiVisible = el.classList.contains('show-ui');
      const onSeekbar = document.activeElement === seekbar;
      switch (action) {
        case 'chup':
          go(1);
          return true;
        case 'chdown':
          go(-1);
          return true;
        case 'up':
        case 'down':
          if (!uiVisible && isLive) {
            go(action === 'up' ? 1 : -1);
            return true;
          }
          showOverlay();
          return false;
        case 'left':
        case 'right':
          if (!isLive && (!uiVisible || onSeekbar)) {
            engine.seekBy(action === 'left' ? -10 : 10);
            updateTime();
            showOverlay();
            if (!uiVisible) focusEl(seekbar);
            return true;
          }
          if (!uiVisible) {
            showOverlay();
            return true;
          }
          showOverlay();
          return false;
        case 'enter':
          if (!uiVisible) {
            showOverlay();
            return true;
          }
          showOverlay();
          return false;
        case 'playpause':
        case 'play':
        case 'pause':
          engine.togglePause();
          showOverlay();
          return true;
        case 'blue':
          toggleStats();
          return true;
        case 'stop':
          app.back();
          return true;
        case 'digit':
          if (!isLive) return false;
          onDigit(String(e.keyCode >= 96 ? e.keyCode - 96 : e.keyCode - 48));
          return true;
        default:
          return false;
      }
    },
  };
  el.setAttribute('tabindex', '-1');
  return screen;
}

function pad3(n: number): string {
  return n < 10 ? '00' + n : n < 100 ? '0' + n : String(n);
}

function toggleFullscreen(el: HTMLElement): void {
  const d = document as any;
  if (d.fullscreenElement || d.webkitFullscreenElement) return exitFullscreen();
  const v = el.querySelector('video') as any;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => undefined);
  else if ((el as any).webkitRequestFullscreen) (el as any).webkitRequestFullscreen();
  else if (v && v.webkitEnterFullscreen) v.webkitEnterFullscreen();
}

function exitFullscreen(): void {
  const d = document as any;
  try {
    if (d.fullscreenElement && d.exitFullscreen) d.exitFullscreen().catch(() => undefined);
    else if (d.webkitFullscreenElement && d.webkitExitFullscreen) d.webkitExitFullscreen();
  } catch {
    /* ignore */
  }
}

function fmtKbps(k: number): string {
  return k >= 1000 ? (k / 1000).toFixed(1) + ' Mb/s' : k + ' kb/s';
}

/** Verdict lisible : d'où vient la lenteur. */
function diagnose(st: import('../player').PlaybackStats): { level: 'ok' | 'warn' | 'bad'; text: string } {
  if (st.startupMs === undefined) {
    if (st.waitingMs < 4000) return { level: 'warn', text: t('dgLoading') };
    if (st.manifestMs === undefined && st.engine === 'hls.js') return { level: 'bad', text: t('dgNoAnswer') };
    return { level: 'bad', text: t('dgSlowStart') };
  }
  if ((st.manifestMs || 0) > 2000) return { level: 'bad', text: t('dgSlowServer') };
  if (st.fragMs && st.fragDurationMs && st.fragMs > st.fragDurationMs * 0.8) return { level: 'bad', text: t('dgSlowDownload') };
  if (st.levelKbps && st.bandwidthKbps && st.bandwidthKbps < st.levelKbps * 1.2) return { level: 'warn', text: t('dgTight') };
  if (st.rebuffers > 2) return { level: 'warn', text: t('dgRebuffer') };
  return { level: 'ok', text: t('dgOk') };
}
