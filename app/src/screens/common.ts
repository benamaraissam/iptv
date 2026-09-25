import type { Channel } from '../types';
import { app } from '../app';
import { h, clear } from '../ui/dom';
import { icon, logoMark, type IconName } from '../ui/icons';
import { openModal } from '../ui/components';
import { focusEl } from '../navigation';
import { currentProgram } from '../epg';
import { hasGoodImage } from '../imgcache';
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

const GROUP_ICONS: [RegExp, IconName][] = [
  [/sport|foot|bein|match|racing/i, 'sports'],
  [/news|info|actu/i, 'news'],
  [/kid|enfant|jeunesse|cartoon|dessin/i, 'kids'],
  [/music|musique|clip/i, 'music'],
  [/movie|film|cin[eé]/i, 'movie'],
  [/s[eé]rie/i, 'series'],
  [/doc/i, 'info'],
  [/radio/i, 'radio'],
  [/drama|sci-?fi|action|com[eé]d|thrill|horr|romance|crime|aventure|adventure|animation/i, 'movie'],
];

/** Icône d'une catégorie de chaînes, devinée d'après son nom. */
export function groupIcon(name: string): IconName {
  for (const [re, ic] of GROUP_ICONS) if (re.test(name)) return ic;
  return 'live';
}

/**
 * Bouton « Catégorie » (icône, nom, nombre) ouvrant le sélecteur de catégorie.
 * Utilisé par la TV en direct, les films et les séries.
 */
export function categoryButton(o: {
  groups: string[];
  selected: string | null;
  countOf: (g: string | null) => number;
  onChange: (g: string | null) => void;
}): { el: HTMLElement; set(g: string | null): void } {
  let group = o.selected;
  const label = h('span', { class: 'cat-btn-label' });
  const count = h('span', { class: 'cat-btn-count' });
  const ic = h('span', { class: 'cat-btn-icon' });
  const render = () => {
    clear(ic);
    ic.appendChild(icon(group === null ? 'grid' : app.isLocked(group) ? 'lock' : groupIcon(group)));
    label.textContent = group === null ? t('allCategories') : group;
    count.textContent = String(o.countOf(group));
  };
  const el = h(
    'button',
    {
      type: 'button',
      class: 'cat-btn focusable',
      on: {
        click: async () => {
          const choice = await pickCategory(o.groups, group, o.countOf);
          if (choice === undefined) return;
          if (choice !== null && !(await app.unlock(choice))) return;
          group = choice;
          render();
          o.onChange(group);
          focusEl(el);
        },
      },
    },
    ic,
    h('span', { class: 'cat-btn-text' }, h('span', { class: 'cat-btn-caption', text: t('category') }), label),
    count,
    icon('down', 'cat-btn-chevron'),
  );
  render();
  return {
    el,
    set(g) {
      group = g;
      render();
    },
  };
}

/**
 * Sélecteur de catégorie : panneau (TV) ou feuille (mobile) avec recherche.
 * Résout la catégorie choisie, null pour « Toutes », undefined si annulé.
 */
function pickCategory(groups: string[], selected: string | null, countOf: (g: string | null) => number): Promise<string | null | undefined> {
  return new Promise((resolve) => {
    let result: string | null | undefined;
    const list = h('div', { class: 'picker-list scroll' });
    const input = h('input', { class: 'input picker-search focusable', type: 'search', placeholder: t('searchCategory') });
    const item = (g: string | null) => {
      const locked = g !== null && app.isLocked(g);
      const on = g === selected;
      return h(
        'button',
        {
          type: 'button',
          class: 'picker-item focusable' + (on ? ' selected' : ''),
          'data-autofocus': on || undefined,
          on: {
            click: () => {
              result = g;
              close();
            },
          },
        },
        h('span', { class: 'picker-ic' }, icon(g === null ? 'grid' : locked ? 'lock' : groupIcon(g))),
        h('span', { class: 'picker-name', text: g === null ? t('allCategories') : g }),
        h('span', { class: 'picker-count', text: String(countOf(g)) }),
        on ? icon('check', 'picker-check') : null,
      );
    };
    const render = () => {
      clear(list);
      const q = input.value.trim().toLowerCase();
      if (!q) list.appendChild(item(null));
      const shown = groups.filter((g) => !q || g.toLowerCase().indexOf(q) !== -1);
      for (const g of shown) list.appendChild(item(g));
      if (!shown.length) list.appendChild(h('p', { class: 'muted picker-empty', text: t('noResults') }));
    };
    input.addEventListener('input', render);
    render();
    const panel = h(
      'div',
      { class: 'sheet picker' },
      h('div', { class: 'picker-head' }, h('h3', { class: 'sheet-title', text: t('categories') }), h('span', { class: 'muted picker-total', text: groups.length + ' ' + t('categories').toLowerCase() })),
      groups.length > 6 ? h('div', { class: 'picker-search-wrap' }, icon('search', 'search-ic'), input) : null,
      list,
    );
    const close = openModal(panel, () => resolve(result), 'modal-sheet modal-picker');
    const sel = list.querySelector<HTMLElement>('.picker-item.selected') || list.querySelector<HTMLElement>('.picker-item');
    if (sel) focusEl(sel);
  });
}

/**
 * Tri stable : les éléments dont l'image est affichable passent devant.
 * `img` renvoie le lien de l'image ; un lien connu comme cassé compte comme « pas d'image ».
 */
export function imageFirst<T>(list: T[], img: (x: T) => string | undefined | null): T[] {
  const withImg: T[] = [];
  const without: T[] = [];
  for (const x of list) (hasGoodImage(img(x)) ? withImg : without).push(x);
  return withImg.concat(without);
}

/** Précharge la fiche d'un film / d'une série quand on s'y arrête (survol, focus, appui). */
export function prefetchOnIntent(el: HTMLElement, item: import('../types').Channel | import('../types').Show): HTMLElement {
  let timer: number | undefined;
  const go = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => app.catalog && app.catalog.prefetch(item), 220);
  };
  const cancel = () => window.clearTimeout(timer);
  el.addEventListener('mouseenter', go);
  el.addEventListener('focus', go);
  el.addEventListener('touchstart', () => app.catalog && app.catalog.prefetch(item), { passive: true } as any);
  el.addEventListener('mouseleave', cancel);
  el.addEventListener('blur', cancel);
  return el;
}
