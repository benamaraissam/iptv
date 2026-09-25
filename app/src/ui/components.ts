import { h, detach, clear } from './dom';
import { hasGoodImage, markBadImage } from '../imgcache';
import { proxied } from '../http';
import { icon, type IconName } from './icons';
import { focusEl, focusFirst, getNavRoot, setNavRoot } from '../navigation';
import { t } from '../i18n';

// ───────────── Boutons ─────────────

export interface BtnOpts {
  icon?: IconName;
  variant?: 'primary' | 'glass' | 'ghost' | 'icon' | 'gradient' | 'light';
  onClick?: (e: Event) => void;
  cls?: string;
  title?: string;
  autofocus?: boolean;
}

export function btn(label: string | null, o: BtnOpts = {}): HTMLButtonElement {
  return h(
    'button',
    {
      type: 'button',
      class: 'btn btn-' + (o.variant || 'glass') + ' focusable' + (o.cls ? ' ' + o.cls : ''),
      title: o.title || (label ? undefined : undefined),
      'aria-label': o.title,
      'data-autofocus': o.autofocus || undefined,
      on: o.onClick ? { click: o.onClick } : undefined,
    },
    o.icon ? icon(o.icon) : null,
    label ? h('span', { text: label }) : null,
  );
}

export function iconBtn(name: IconName, title: string, onClick: (e: Event) => void, cls = ''): HTMLButtonElement {
  return btn(null, { icon: name, variant: 'icon', title, onClick, cls });
}

// ───────────── En-tête d'écran ─────────────

export function screenHeader(
  title: string,
  o: { back?: () => void; actions?: (Node | null)[]; cls?: string } = {},
): HTMLElement {
  return h(
    'header',
    { class: 'screen-header' + (o.cls ? ' ' + o.cls : '') },
    o.back ? iconBtn('back', t('close'), o.back, 'back-btn') : null,
    h('h1', { class: 'screen-title', text: title }),
    h('div', { class: 'header-actions' }, o.actions || []),
  );
}

// ───────────── Puces de filtre ─────────────

export interface ChipOption {
  id: string;
  label: string;
}

export function chips(options: ChipOption[], selected: string, onSelect: (id: string) => void): HTMLElement {
  const row = h('div', { class: 'chips', role: 'tablist' });
  for (const o of options) {
    const c = h('button', {
      type: 'button',
      role: 'tab',
      class: 'chip focusable' + (o.id === selected ? ' selected' : ''),
      'data-id': o.id,
      text: o.label,
      on: {
        click: () => {
          const prev = row.querySelector('.chip.selected');
          if (prev) prev.classList.remove('selected');
          c.classList.add('selected');
          onSelect(o.id);
        },
      },
    });
    row.appendChild(c);
  }
  return row;
}

// ───────────── Images avec repli ─────────────

const GRADIENTS = [
  ['#1d3b8f', '#5b2ca8'],
  ['#0f5f8f', '#1d3b8f'],
  ['#5b2ca8', '#a13a8f'],
  ['#1b6b6b', '#1d3b8f'],
  ['#7a3b1d', '#5b2ca8'],
  ['#223066', '#0f5f8f'],
];

function hashStr(s: string): number {
  let x = 0;
  for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(x);
}

export function initials(raw: string): string {
  const name = raw ? String(raw) : '';
  const words = name
    .replace(/[^\wÀ-￿]+/g, ' ')
    .split(' ')
    .filter((w) => /^[^\d_]/.test(w));
  if (words.length === 0) return name.trim().slice(0, 2).toUpperCase() || '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Visuel : image distante, ou dégradé + initiales si absente / en erreur. */
export function art(src: string | undefined, name: string, cls = '', onFail?: () => void): HTMLElement {
  const g = GRADIENTS[hashStr(name) % GRADIENTS.length];
  const box = h('div', {
    class: 'art ' + cls,
    style: 'background-image:linear-gradient(135deg,' + g[0] + ',' + g[1] + ')',
  });
  const fallback = h('span', { class: 'art-initials', text: initials(name) });
  box.appendChild(fallback);
  // Lien déjà connu comme cassé : on n'essaie même pas (pas de clignotement).
  if (src && hasGoodImage(src)) {
    let retried = false;
    const fail = () => {
      // Un échec isolé (serveur d'images saturé, coupure) ne suffit pas : on réessaie une fois,
      // via le proxy en développement (pas de blocage « hotlink » ni de CORS).
      if (!retried) {
        retried = true;
        window.setTimeout(() => (img.src = proxied(src) !== src ? proxied(src) : src + (src.indexOf('?') === -1 ? '?' : '&') + '_r=1'), 1500);
        return;
      }
      detach(img);
      markBadImage(src);
      if (onFail) onFail();
      else sendToBack(box);
    };
    const img = h('img', {
      alt: '',
      loading: 'lazy',
      referrerpolicy: 'no-referrer',
      on: {
        // Image vide de 1 × 1 pixel (fréquent dans les playlists) = pas d'image.
        // 0 × 0 correspond à un SVG sans taille : c'est une vraie image.
        load: () => (img.naturalWidth === 1 && img.naturalHeight === 1 ? ((retried = true), fail()) : box.classList.add('loaded')),
        error: fail,
      },
    });
    img.src = src;
    box.appendChild(img);
  }
  return box;
}

const SORTED_PARENTS = /(^| )(rail-track|poster-grid|channel-grid)( |$)/;

/**
 * L'image d'une carte n'a pas pu s'afficher : la carte passe en fin de rangée / de grille,
 * pour que les éléments avec une vraie image restent devant. (Pas pour le Top 10 numéroté,
 * ni pour l'élément qui a le focus.)
 */
export function sendToBack(box: HTMLElement): void {
  let node: HTMLElement | null = box.parentElement;
  while (node && !node.classList.contains('card') && !node.classList.contains('ch-row')) node = node.parentElement;
  if (!node || node.classList.contains('card-top') || node === document.activeElement) return;
  const parent = node.parentElement;
  if (!parent) return;
  const list = parent.classList.contains('ch-row') ? null : parent;
  if (list && (SORTED_PARENTS.test(list.className) || (list.parentElement && list.parentElement.classList.contains('ch-list')) || list.classList.contains('ch-list'))) {
    list.appendChild(node);
  }
}

// ───────────── Cartes ─────────────

export interface CardData {
  title: string;
  sub?: string;
  image?: string;
  /** 0..1 : barre de progression (Continuer à regarder). */
  progress?: number;
  badge?: string;
  fav?: boolean;
  locked?: boolean;
  /** Si l'image manque ou est cassée : cherche une autre image (ex. fiche détaillée). */
  resolveImage?: () => Promise<string | undefined>;
}

export function card(
  d: CardData,
  shape: 'poster' | 'landscape' | 'channel' | 'square',
  onClick: () => void,
  attrs: Record<string, string> = {},
): HTMLElement {
  const artCls = shape === 'channel' ? 'contain' : '';
  let media: HTMLElement;
  const el = h(
    'button',
    { type: 'button', class: 'card card-' + shape + ' focusable', on: { click: onClick } },
    (media = h(
      'div',
      { class: 'card-media' },
      rescuableArt(d.image, d.title, artCls, d.resolveImage, () => sendToBack(media)),
      d.badge ? h('span', { class: 'badge', text: d.badge }) : null,
      d.fav ? h('span', { class: 'card-fav' }, icon('heart')) : null,
      d.locked ? h('span', { class: 'card-lock' }, icon('lock')) : null,
      d.progress !== undefined ? h('div', { class: 'progress' }, h('i', { style: 'width:' + Math.round(d.progress * 100) + '%' })) : null,
    )),
    h('div', { class: 'card-title', text: d.title }),
    d.sub ? h('div', { class: 'card-sub', text: d.sub }) : null,
  );
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

/**
 * Visuel avec image de secours : si l'image manque ou échoue (après réessai), `resolve`
 * fournit une autre image (ex. affiche de la fiche détaillée) qui remplace le visuel.
 * Sans image de secours possible, `giveUp` est appelé (la carte passe en fin de rangée).
 * Utilisé par TOUTES les cartes : rangées, grilles, Top 10.
 */
export function rescuableArt(
  image: string | undefined,
  title: string,
  cls: string,
  resolve?: () => Promise<string | undefined>,
  giveUp?: () => void,
): HTMLElement {
  let tried = false;
  const rescue = (box: HTMLElement) => {
    if (tried || !resolve) {
      if (giveUp) giveUp();
      return;
    }
    tried = true;
    resolve().then(
      (url) => {
        if (url && hasGoodImage(url) && box.parentNode) {
          box.parentNode.replaceChild(art(url, title, cls, giveUp), box);
        } else if (giveUp) giveUp();
      },
      () => giveUp && giveUp(),
    );
  };
  const box: HTMLElement = art(image, title, cls, () => rescue(box));
  if (!hasGoodImage(image)) rescue(box);
  return box;
}

/** Rangée horizontale défilante avec titre et « Tout voir ». */
export function rail(title: string, items: HTMLElement[], onSeeAll?: () => void): HTMLElement | null {
  if (!items.length) return null;
  return h(
    'section',
    { class: 'rail' },
    h(
      'div',
      { class: 'section-head' },
      h('h2', { text: title }),
      onSeeAll ? h('button', { type: 'button', class: 'see-all focusable', on: { click: onSeeAll } }, icon('chevron')) : null,
    ),
    h('div', { class: 'rail-track' }, items),
  );
}

// ───────────── Lignes de liste ─────────────

export interface RowData {
  title: string;
  sub?: string;
  image?: string;
  imageShape?: 'square' | 'landscape' | 'round';
  progress?: number;
  num?: string;
  right?: Node | null;
  /** Chevron « › » à l'intérieur de la ligne. */
  chevron?: boolean;
}

export function listRow(d: RowData, onClick: () => void, attrs: Record<string, string> = {}): HTMLElement {
  const el = h(
    'div',
    { class: 'list-row' },
    h(
      'button',
      { type: 'button', class: 'list-main focusable', on: { click: onClick } },
      d.num ? h('span', { class: 'row-num', text: d.num }) : null,
      d.image !== undefined || d.imageShape
        ? h(
            'div',
            { class: 'row-media ' + (d.imageShape || 'square') },
            art(d.image, d.title, d.imageShape === 'square' ? 'contain' : ''),
            d.progress !== undefined ? h('div', { class: 'progress' }, h('i', { style: 'width:' + Math.round(d.progress * 100) + '%' })) : null,
          )
        : null,
      h('div', { class: 'row-text' }, h('div', { class: 'row-title', text: d.title }), d.sub ? h('div', { class: 'row-sub', text: d.sub }) : null),
      d.chevron ? icon('chevron', 'row-chevron') : null,
    ),
    d.right || null,
  );
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

export function heartBtn(on: boolean, onToggle: () => boolean): HTMLButtonElement {
  const b = h('button', {
    type: 'button',
    class: 'heart-btn focusable' + (on ? ' on' : ''),
    'aria-label': t('addToList'),
    on: {
      click: (e: Event) => {
        e.stopPropagation();
        b.classList.toggle('on', onToggle());
      },
    },
  });
  b.appendChild(icon('heart'));
  return b;
}

// ───────────── États vides / erreurs ─────────────

export function emptyState(ic: IconName, title: string, text: string, action?: HTMLElement): HTMLElement {
  return h(
    'div',
    { class: 'empty-state' },
    h('div', { class: 'empty-icon' }, icon(ic)),
    h('h3', { text: title }),
    h('p', { text: text }),
    action || null,
  );
}

// ───────────── Réglages ─────────────

export function toggleSwitch(checked: boolean, onChange: (v: boolean) => void): HTMLButtonElement {
  const b = h('button', {
    type: 'button',
    role: 'switch',
    class: 'switch focusable' + (checked ? ' on' : ''),
    'aria-checked': String(checked),
    on: {
      click: () => {
        const v = !b.classList.contains('on');
        b.classList.toggle('on', v);
        b.setAttribute('aria-checked', String(v));
        onChange(v);
      },
    },
  });
  b.appendChild(h('i'));
  return b;
}

export function settingRow(
  ic: IconName | null,
  label: string,
  o: { value?: string; toggle?: HTMLElement; onClick?: () => void; danger?: boolean } = {},
): HTMLElement {
  const content = [
    ic ? h('span', { class: 'set-icon' }, icon(ic)) : null,
    h('span', { class: 'set-label', text: label }),
    o.value !== undefined ? h('span', { class: 'set-value', text: o.value }) : null,
    o.onClick ? icon('chevron', 'set-chevron') : null,
  ];
  if (o.toggle) {
    return h('div', { class: 'set-row' + (o.danger ? ' danger' : '') }, content, o.toggle);
  }
  return h(
    'button',
    { type: 'button', class: 'set-row focusable' + (o.danger ? ' danger' : ''), on: o.onClick ? { click: o.onClick } : undefined },
    content,
  );
}

export function settingGroup(title: string | null, rows: (HTMLElement | null)[]): HTMLElement {
  return h('section', { class: 'set-group' }, title ? h('h2', { class: 'set-group-title', text: title }) : null, h('div', { class: 'set-card' }, rows));
}

// ───────────── Modales ─────────────

let modalStack: { el: HTMLElement; prevRoot: HTMLElement; prevFocus: Element | null; onClose?: () => void }[] = [];

export function openModal(content: HTMLElement, onClose?: () => void, cls = ''): () => void {
  const el = h('div', { class: 'modal ' + cls }, h('div', { class: 'modal-backdrop', on: { click: () => close() } }), content);
  const entry = { el, prevRoot: getNavRoot(), prevFocus: document.activeElement, onClose };
  modalStack.push(entry);
  document.body.appendChild(el);
  setNavRoot(el);
  focusFirst(el);
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    detach(el);
    modalStack = modalStack.filter((m) => m !== entry);
    setNavRoot(entry.prevRoot);
    if (entry.prevFocus) focusEl(entry.prevFocus as HTMLElement);
    if (onClose) onClose();
  }
  (el as any).__close = close;
  return close;
}

export function hasModal(): boolean {
  return modalStack.length > 0;
}

export function closeTopModal(): void {
  const top = modalStack[modalStack.length - 1];
  if (top) (top.el as any).__close();
}

/** Liste de choix (audio, sous-titres, qualité, langue...). */
export function chooseOption(title: string, options: ChipOption[], selected: string): Promise<string | null> {
  return new Promise((resolve) => {
    let result: string | null = null;
    const list = h('div', { class: 'sheet-list' });
    const sheet = h('div', { class: 'sheet' }, h('h3', { class: 'sheet-title', text: title }), list);
    const close = openModal(sheet, () => resolve(result), 'modal-sheet');
    for (const o of options) {
      list.appendChild(
        h(
          'button',
          {
            type: 'button',
            class: 'sheet-item focusable' + (o.id === selected ? ' selected' : ''),
            'data-autofocus': o.id === selected || undefined,
            on: {
              click: () => {
                result = o.id;
                close();
              },
            },
          },
          h('span', { text: o.label }),
          o.id === selected ? icon('check') : null,
        ),
      );
    }
    const auto = list.querySelector<HTMLElement>('[data-autofocus]');
    if (auto) focusEl(auto);
  });
}

/** Pavé de saisie du code PIN (4 chiffres), utilisable au doigt et à la télécommande. */
export function askPin(title: string, check?: (pin: string) => boolean): Promise<string | null> {
  return new Promise((resolve) => {
    let value = '';
    let result: string | null = null;
    const dots = h('div', { class: 'pin-dots' });
    const error = h('p', { class: 'pin-error' });
    const renderDots = () => {
      clear(dots);
      for (let i = 0; i < 4; i++) dots.appendChild(h('i', { class: i < value.length ? 'on' : '' }));
    };
    const press = (d: string) => {
      if (d === 'del') value = value.slice(0, -1);
      else if (value.length < 4) value += d;
      error.textContent = '';
      renderDots();
      if (value.length === 4) {
        if (!check || check(value)) {
          result = value;
          close();
        } else {
          error.textContent = t('wrongPin');
          value = '';
          window.setTimeout(renderDots, 250);
        }
      }
    };
    const pad = h('div', { class: 'pin-pad' });
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'x', '0', 'del'].forEach((k) => {
      if (k === 'x') return pad.appendChild(h('span'));
      const b = h('button', { type: 'button', class: 'pin-key focusable', on: { click: () => press(k) } });
      if (k === 'del') b.appendChild(icon('back'));
      else b.textContent = k;
      pad.appendChild(b);
    });
    renderDots();
    const box = h('div', { class: 'dialog pin-dialog' }, h('div', { class: 'dialog-icon' }, icon('lock')), h('h3', { text: title }), dots, error, pad);
    const onKey = (e: KeyboardEvent) => {
      const code = e.keyCode;
      const digit = code >= 48 && code <= 57 ? code - 48 : code >= 96 && code <= 105 ? code - 96 : -1;
      if (digit >= 0) {
        e.preventDefault();
        e.stopPropagation();
        press(String(digit));
      } else if (code === 8) {
        e.preventDefault();
        press('del');
      }
    };
    document.addEventListener('keydown', onKey, true);
    const close = openModal(box, () => {
      document.removeEventListener('keydown', onKey, true);
      resolve(result);
    });
    focusEl(pad.querySelector<HTMLElement>('.pin-key'));
  });
}

export function confirmDialog(title: string, okLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    let ok = false;
    const box = h(
      'div',
      { class: 'dialog' },
      h('h3', { text: title }),
      h(
        'div',
        { class: 'dialog-actions' },
        btn(t('cancel'), { onClick: () => close(), autofocus: true }),
        btn(okLabel, {
          variant: 'primary',
          onClick: () => {
            ok = true;
            close();
          },
        }),
      ),
    );
    const close = openModal(box, () => resolve(ok));
  });
}
