import type { Channel, Show } from './types';
import { backgroundDelay } from './idle';

/**
 * Versions linguistiques : chez les fournisseurs IPTV, un même film ou une même série
 * existe souvent plusieurs fois, dans des catégories différentes (« FR| FILMS »,
 * « AR| AFLAM », « EN| MOVIES », « VOSTFR »…). Les fichiers eux-mêmes (MP4/MKV) n'exposent
 * pas leurs pistes au navigateur : changer de langue, c'est changer de version.
 */

const LANGS: [RegExp, string][] = [
  [/\b(vostfr|vost|vosta)\b/, 'VOSTFR'],
  [/\b(fr|fra|fre|french|francais|vf|vff|vfq|vfi|truefrench|france|fran)\b/, 'Français'],
  [/\b(ar|ara|arabic|arabe|aflam|arab|maghreb|masr|egypt|khaleeji|gulf|tn|tunisie|ma|maroc|dz|algerie)\b/, 'العربية'],
  [/\b(en|eng|english|vo|us|uk|usa|anglais)\b/, 'English'],
  [/\b(es|esp|spanish|espanol|latino|latin|castellano)\b/, 'Español'],
  [/\b(de|ger|german|deutsch)\b/, 'Deutsch'],
  [/\b(it|ita|italian|italiano)\b/, 'Italiano'],
  [/\b(tr|tur|turkish|turk|turkce)\b/, 'Türkçe'],
  [/\b(pt|por|portuguese|portugues|brazil|br)\b/, 'Português'],
  [/\b(nl|dutch|nederlands)\b/, 'Nederlands'],
  [/\b(ru|rus|russian)\b/, 'Русский'],
  [/\b(hi|hindi|india|indian|bollywood)\b/, 'हिन्दी'],
  [/\b(multi|multisub|multilang)\b/, 'Multi'],
];

function words(s: string): string {
  return (
    ' ' +
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[|_\-\[\]().:,/\\+]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() +
    ' '
  );
}

function langIn(s: string): string | undefined {
  const w = words(s);
  for (const [re, name] of LANGS) if (re.test(w)) return name;
  return undefined;
}

// Caches : ces fonctions sont appelées pour chaque élément à chaque écran (grilles,
// recherche, fiches) ; sur une box TV, les expressions régulières coûtent cher.
const groupLang = new Map<string, string | undefined>();
const itemLang = new WeakMap<object, string | undefined>();
const itemKey = new WeakMap<object, string>();

function langOfGroup(group: string): string | undefined {
  if (groupLang.has(group)) return groupLang.get(group);
  const l = langIn(group);
  groupLang.set(group, l);
  return l;
}

/** Langue d'une version, déduite de sa catégorie puis des étiquettes de son titre. */
export function languageOf(item: { name: string; group: string }): string | undefined {
  if (itemLang.has(item)) return itemLang.get(item);
  const l = computeLanguage(item);
  itemLang.set(item, l);
  return l;
}

function computeLanguage(item: { name: string; group: string }): string | undefined {
  const g = langOfGroup(item.group);
  if (g) return g;
  if (!item.name) return undefined;
  // Étiquettes du titre : « [FR] », « (VOSTFR) », « FR - Titre », « Titre - VF ».
  const tags: string[] = [];
  item.name.replace(/\[([^\]]+)\]|\(([^)]+)\)/g, (_m, a, b) => (tags.push(a || b), ''));
  const parts = item.name.split(/\s[-|:]\s|\|/);
  if (parts.length > 1) tags.push(parts[0], parts[parts.length - 1]);
  for (const tg of tags) {
    if (/^\d{4}$/.test(tg.trim())) continue;
    const l = langIn(tg);
    if (l) return l;
  }
  return undefined;
}

const NOISE = /\b(vostfr|vost|vosta|fr|fra|fre|french|francais|vf|vff|vfq|vfi|truefrench|ar|ara|arabic|arabe|en|eng|english|vo|es|esp|spanish|latino|de|ger|german|it|ita|italian|tr|tur|turkish|pt|por|nl|ru|hi|hindi|multi|multisub|4k|uhd|fhd|hd|sd|hdr|hevc|x265|x264|h264|h265|bluray|web|webrip|webdl|dvdrip|hdrip|brrip|cam|ts|remux|imax|extended|unrated|dubbed|sub|subbed|new|nouveau|exclu)\b/g;

/**
 * Clé de regroupement : titre nettoyé des étiquettes de langue et de qualité + année.
 * « FR - Oppenheimer (2023) 4K » et « AR| Oppenheimer 2023 » donnent la même clé.
 */
export function titleKey(item: { name: string; year?: string }): string {
  const cached = itemKey.get(item);
  if (cached !== undefined) return cached;
  const k = computeTitleKey(item);
  itemKey.set(item, k);
  return k;
}

function computeTitleKey(item: { name: string; year?: string }): string {
  let s = words(item.name.replace(/\[[^\]]*\]/g, ' '));
  let year = item.year || '';
  s = s.replace(/\b((19|20)\d{2})\b/g, (m) => {
    if (!year) year = m;
    return ' ';
  });
  s = s.replace(NOISE, ' ').replace(/[^a-z0-9؀-ۿЀ-ӿ]+/g, '');
  return s.length < 2 ? '' : s + '|' + year;
}

function splitKey(k: string): [string, string] {
  const i = k.lastIndexOf('|');
  return [k.slice(0, i), k.slice(i + 1)];
}

/** Tranche de travail en arrière-plan : assez courte pour ne pas retarder une touche. */
const WARM_CHUNK = 600;
const warmedUpTo = new WeakMap<object, number>();
const warming = new WeakSet<object>();

/**
 * Préchauffe langue et clé de titre de toute une liste, par tranches entre deux images :
 * les écrans qui en ont besoin pour chaque élément (grilles, recherche, fiches) deviennent
 * instantanés. Reprend là où il s'était arrêté si la liste a grandi (catalogue progressif).
 */
export function warmVersions(list: { name: string; group: string; year?: string }[]): void {
  if (warming.has(list)) return;
  warming.add(list);
  const step = () => {
    const from = warmedUpTo.get(list) || 0;
    const to = Math.min(list.length, from + WARM_CHUNK);
    for (let i = from; i < to; i++) {
      languageOf(list[i]);
      titleKey(list[i]);
    }
    warmedUpTo.set(list, to);
    if (to < list.length) window.setTimeout(step, backgroundDelay());
    else warming.delete(list);
  };
  window.setTimeout(step, 0);
}

/**
 * Nombre de titres par langue. Immédiat quand les listes sont préchauffées ; sinon calculé
 * par tranches, et `onReady` est appelé à la fin (les puces de langue s'affichent alors).
 */
export function languageCounts(lists: { name: string; group: string }[][], onReady: (counts: Record<string, number>) => void): void {
  const counts: Record<string, number> = {};
  const ready = lists.every((l) => (warmedUpTo.get(l) || 0) >= l.length);
  let li = 0;
  let i = 0;
  const step = (budget: number) => {
    while (li < lists.length) {
      const list = lists[li];
      const to = Math.min(list.length, i + budget);
      for (; i < to; i++) {
        const l = languageOf(list[i]);
        if (l) counts[l] = (counts[l] || 0) + 1;
      }
      if (i < list.length) return false;
      li++;
      i = 0;
    }
    return true;
  };
  if (ready) {
    step(Infinity);
    onReady(counts);
    return;
  }
  const tick = () => {
    if (step(WARM_CHUNK * 2)) onReady(counts);
    else window.setTimeout(tick, 0);
  };
  tick();
}

export class VersionIndex<T extends Channel | Show> {
  private map = new Map<string, T[]>();
  /** Nombre d'éléments déjà indexés (l'index se complète par tranches ou à la demande). */
  private built = 0;
  private warming = false;
  constructor(private readonly items: () => T[]) {}

  private add(upTo: number): void {
    const items = this.items();
    for (let i = this.built; i < upTo; i++) {
      const x = items[i];
      const k = titleKey(x);
      if (!k) continue;
      const [title] = splitKey(k);
      const list = this.map.get(title);
      if (list) list.push(x);
      else this.map.set(title, [x]);
    }
    this.built = Math.max(this.built, upTo);
  }

  /** Complète l'index en arrière-plan, par tranches. */
  warm(): void {
    if (this.warming) return;
    this.warming = true;
    const step = () => {
      const n = this.items().length;
      this.add(Math.min(n, this.built + WARM_CHUNK));
      if (this.built < this.items().length) window.setTimeout(step, backgroundDelay());
      else this.warming = false;
    };
    window.setTimeout(step, 0);
  }

  private build(): Map<string, T[]> {
    if (this.built < this.items().length) this.add(this.items().length);
    return this.map;
  }

  /** Vrai quand tout le catalogue est indexé (sinon `of` devrait attendre `whenReady`). */
  ready(): boolean {
    return this.built >= this.items().length;
  }

  /** Appelle `fn` dès que l'index est complet (tout de suite s'il l'est déjà). */
  whenReady(fn: () => void): void {
    if (this.ready()) return fn();
    this.warm();
    const poll = () => (this.ready() ? fn() : window.setTimeout(poll, 100));
    window.setTimeout(poll, 100);
  }

  /** Toutes les versions du même titre (l'élément lui-même inclus, en premier). */
  of(item: T, wait = true): T[] {
    const k = titleKey(item);
    if (!k) return [item];
    const [title, year] = splitKey(k);
    // Index encore en construction : on ne bloque pas l'interface pour le finir
    // (des dizaines de milliers de titres) ; l'appelant réessaie via whenReady.
    const list = (wait ? this.build() : this.map).get(title) || [];
    // Même titre, et même année quand les deux la connaissent.
    const others = list.filter((x) => {
      if (x === item) return false;
      const y = splitKey(titleKey(x))[1];
      return !year || !y || y === year;
    });
    return others.length ? [item].concat(others) : [item];
  }
}

/** Libellés distincts pour un choix de version : langue, complétée par la catégorie si besoin. */
export function versionLabels(list: { name: string; group: string }[]): string[] {
  const langs = list.map((v) => languageOf(v) || v.group);
  const counts: Record<string, number> = {};
  for (const l of langs) counts[l] = (counts[l] || 0) + 1;
  return list.map((v, i) => (counts[langs[i]] > 1 && langs[i] !== v.group ? langs[i] + ' · ' + v.group : langs[i]));
}
