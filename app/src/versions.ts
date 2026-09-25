import type { Channel, Show } from './types';

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

/** Langue d'une version, déduite de sa catégorie puis des étiquettes de son titre. */
export function languageOf(item: { name: string; group: string }): string | undefined {
  const g = langIn(item.group);
  if (g) return g;
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

export class VersionIndex<T extends Channel | Show> {
  private map: Map<string, T[]> | null = null;
  constructor(private readonly items: () => T[]) {}

  private build(): Map<string, T[]> {
    if (!this.map) {
      this.map = new Map();
      for (const x of this.items()) {
        const k = titleKey(x);
        if (!k) continue;
        const [title] = splitKey(k);
        const list = this.map.get(title);
        if (list) list.push(x);
        else this.map.set(title, [x]);
      }
    }
    return this.map;
  }

  /** Toutes les versions du même titre (l'élément lui-même inclus, en premier). */
  of(item: T): T[] {
    const k = titleKey(item);
    if (!k) return [item];
    const [title, year] = splitKey(k);
    const list = this.build().get(title) || [];
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
