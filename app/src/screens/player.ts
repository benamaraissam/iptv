import type { Screen } from '../app';
import { app } from '../app';
import type { Channel, Playable } from '../types';
import type { Action } from '../platform';
import { isTV } from '../platform';
import { h, clear } from '../ui/dom';
import { icon } from '../ui/icons';
import { btn, chooseOption, iconBtn } from '../ui/components';
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
  el.appendChild(spinner);
  el.appendChild(errorBox);
  el.appendChild(numEntry);

  // ───── Pistes ─────
  const renderExtras = () => {
    clear(extras);
    const add = (ic: 'episodes' | 'audio' | 'subtitles' | 'quality', label: string, fn: () => void) =>
      extras.appendChild(h('button', { type: 'button', class: 'pl-extra focusable', on: { click: fn } }, icon(ic), h('span', { text: label })));
    if (item.kind === 'episode' && hasQueue) add('episodes', t('episodes'), pickEpisode);
    if (isLive && hasQueue) add('episodes', t('channels'), pickEpisode);
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
