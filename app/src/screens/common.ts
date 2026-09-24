import type { Channel } from '../types';
import { app } from '../app';
import { h } from '../ui/dom';
import { logoMark } from '../ui/icons';
import { currentProgram } from '../epg';
import { formatTime, t } from '../i18n';

let clockTimer: number | undefined;

/** Heure affichée en haut à droite sur TV (mise à jour globale, sans fuite). */
export function clock(): HTMLElement {
  const el = h('span', { class: 'clock', text: formatTime(Date.now()) });
  if (!clockTimer) {
    clockTimer = window.setInterval(() => {
      const nodes = document.querySelectorAll('.clock');
      const now = formatTime(Date.now());
      for (let i = 0; i < nodes.length; i++) nodes[i].textContent = now;
    }, 15000);
  }
  return el;
}

/** Marque + heure (en-têtes des écrans TV). */
export function brandClock(): HTMLElement {
  return h('div', { class: 'brand-clock' }, logoMark(20), h('span', { class: 'brand brand-sm' }, 'Stream', h('b', null, 'Pro')), clock());
}

export function channelNumber(ch: Channel): string {
  const i = app.catalog ? app.catalog.live.indexOf(ch) : -1;
  const n = i + 1;
  return n < 10 ? '00' + n : n < 100 ? '0' + n : String(n);
}

/** Remplit `el` avec le programme en cours dès qu'il est connu. */
export function fillNow(el: HTMLElement, ch: Channel, fallback: string): void {
  const cat = app.catalog;
  el.textContent = fallback;
  if (!cat || !cat.epg.available) return;
  const set = (list?: import('../types').Program[]) => {
    const p = currentProgram(list);
    if (p) el.textContent = t('liveNow') + ' · ' + p.title;
  };
  const cached = cat.epg.peek(ch);
  if (cached) return set(cached);
  cat.epg.programs(ch).then(set, () => undefined);
}
