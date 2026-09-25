/**
 * Recherche tolérante dans le catalogue (170 000 titres) :
 * - accents, majuscules, ponctuation et étiquettes (« FR - », « 4K », « [VOSTFR] ») ignorés ;
 * - un mot oublié ne gêne pas (« seigneur anneaux » trouve « Le Seigneur des Anneaux ») ;
 * - l'ordre des mots est libre, les petits mots (le, la, the, of…) sont facultatifs ;
 * - une faute de frappe par mot est tolérée (« oppenhiemer », « spidreman ») ;
 * - « spiderman » trouve « Spider-Man » (comparaison sans espaces).
 * Les résultats sont classés par pertinence (titre exact > début de titre > mots dans
 * l'ordre > mots dans le désordre > approximations).
 */

const STOP: Record<string, true> = {};
for (const w of 'le la les l un une des du de d et ou a au aux en the a an of and or in on to et y el los las de del der die das und il lo gli i'.split(' ')) STOP[w] = true;

const TAGS = /\b(vostfr|vost|vosta|vf|vff|vfq|vfi|truefrench|multi|multisub|4k|uhd|fhd|hd|sd|hdr|hevc|x265|x264|h264|h265|bluray|webrip|webdl|dvdrip|hdrip|brrip|remux)\b/g;

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9؀-ۿЀ-ӿ]+/g, ' ')
    .trim();
}

const LANG_CODE = /^(fr|ar|en|es|de|it|tr|pt|nl|ru|hi|vo|vf|uk|us|multi)$/;

export function tokenize(s: string): string[] {
  const n = normalize(s.replace(/\[[^\]]*\]/g, ' ')).replace(TAGS, ' ');
  const words = n.split(' ').filter((w) => w.length > 0);
  // Code de langue en tête ou en queue (« FR - Titre », « Titre - AR ») : ce n'est pas le titre.
  if (words.length > 1 && LANG_CODE.test(words[0])) words.shift();
  if (words.length > 1 && LANG_CODE.test(words[words.length - 1])) words.pop();
  return words;
}

interface Entry {
  tokens: string[];
  /** Titre normalisé, mots séparés par un espace. */
  text: string;
  /** Titre sans espaces, pour « spiderman » ↔ « spider man ». */
  compact: string;
}

const indexes = new WeakMap<object, Entry[]>();

function indexOf<T extends { name: string }>(list: T[]): Entry[] {
  let idx = indexes.get(list);
  if (!idx || idx.length !== list.length) {
    idx = new Array(list.length);
    for (let i = 0; i < list.length; i++) {
      const tokens = tokenize(list[i].name);
      const text = tokens.join(' ');
      idx[i] = { tokens, text, compact: text.replace(/ /g, '') };
    }
    indexes.set(list, idx);
  }
  return idx;
}

/** Construit l'index à l'avance (au chargement du catalogue), pour une première recherche instantanée. */
export function prepareSearch<T extends { name: string }>(list: T[]): void {
  indexOf(list);
}

/** Distance d'édition bornée (Damerau-Levenshtein, transpositions comprises) ; retourne max+1 au-delà. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const la = a.length;
  const lb = b.length;
  let prev2: number[] = [];
  let prev: number[] = [];
  for (let j = 0; j <= lb; j++) prev.push(j);
  for (let i = 1; i <= la; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[lb];
}

function allowedTypos(word: string): number {
  return word.length >= 8 ? 2 : word.length >= 4 ? 1 : 0;
}

/**
 * Score d'un titre pour une requête (0 = pas de correspondance).
 * Chaque mot significatif de la requête doit se retrouver dans le titre : tel quel,
 * en début de mot, ou à une faute près. Les petits mots ne comptent que s'ils sont là.
 */
function score(e: Entry, q: string[], qCompact: string, qText: string): number {
  if (!e.tokens.length) return 0;
  if (e.text === qText) return 1000;
  let s = 0;
  if (e.text.indexOf(qText) === 0) s = 800;
  else if (e.text.indexOf(' ' + qText) !== -1) s = 600;
  else if (qText.length >= 4 && e.text.indexOf(qText) !== -1) s = 500;
  else if (qCompact.length >= 4 && e.compact.indexOf(qCompact) !== -1) s = 550;
  if (s) return s - Math.min(100, e.tokens.length * 4);

  // Mot par mot, dans n'importe quel ordre. Les petits mots ne sont facultatifs que
  // s'il y a d'autres mots dans la requête.
  let total = 0;
  let matched = 0;
  let lastPos = -1;
  let inOrder = true;
  let significant = 0;
  for (const w of q) if (!STOP[w]) significant++;
  for (const w of q) {
    const stop = significant > 0 && STOP[w] === true;
    let best = 0;
    let bestPos = -1;
    for (let i = 0; i < e.tokens.length; i++) {
      const tk = e.tokens[i];
      let v = 0;
      if (tk === w) v = 100;
      else if (tk.indexOf(w) === 0) v = 70 + Math.round((20 * w.length) / tk.length);
      else if (!stop && w.length >= 3 && tk.indexOf(w) > 0) v = 40;
      else if (!stop) {
        // Faute de frappe : on ne calcule la distance que si le début ou la fin coïncide
        // (la quasi-totalité des fautes gardent l'un des deux), ce qui élimine 90 % des mots.
        const max = allowedTypos(w);
        if (max && Math.abs(tk.length - w.length) <= max && (tk.charCodeAt(0) === w.charCodeAt(0) || tk.charCodeAt(tk.length - 1) === w.charCodeAt(w.length - 1))) {
          const d = editDistance(w, tk, max);
          if (d <= max) v = 60 - d * 20;
        }
      }
      if (v > best) {
        best = v;
        bestPos = i;
      }
    }
    if (!best && !stop && w.length >= 5) {
      // « spidreman » ↔ « spider man » : faute de frappe sur deux mots collés.
      const max = allowedTypos(w);
      for (let i = 0; i < e.tokens.length - 1 && !best; i++) {
        const pair = e.tokens[i] + e.tokens[i + 1];
        if (Math.abs(pair.length - w.length) <= max && editDistance(w, pair, max) <= max) {
          best = 50;
          bestPos = i;
        }
      }
    }
    if (!best) {
      if (stop) continue;
      return 0;
    }
    matched++;
    total += best;
    if (bestPos <= lastPos) inOrder = false;
    lastPos = bestPos;
  }
  if (!matched) return 0;
  // Moyenne des mots trouvés, bonus si dans l'ordre, léger malus pour les titres longs.
  return Math.round(total / matched) * 4 + (inOrder ? 40 : 0) - Math.min(60, e.tokens.length * 3);
}

export interface Ranked<T> {
  item: T;
  score: number;
}

/** Résultats classés par pertinence. `boost` départage les scores égaux (note, image…). */
export function rankSearch<T extends { name: string }>(list: T[], query: string, limit = 60, boost?: (x: T) => number): T[] {
  const q = tokenize(query);
  if (!q.length) return [];
  const qText = q.join(' ');
  const qCompact = qText.replace(/ /g, '');
  const idx = indexOf(list);
  const out: Ranked<T>[] = [];
  for (let i = 0; i < list.length; i++) {
    const s = score(idx[i], q, qCompact, qText);
    if (s > 0) out.push({ item: list[i], score: s * 1000 + (boost ? boost(list[i]) : 0) });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit).map((r) => r.item);
}

/** Filtre simple (sans classement) pour une liste déjà triée : garde ce qui correspond. */
export function matchesQuery<T extends { name: string }>(list: T[], query: string): T[] {
  const q = tokenize(query);
  if (!q.length) return list;
  const qText = q.join(' ');
  const qCompact = qText.replace(/ /g, '');
  const idx = indexOf(list);
  const out: T[] = [];
  for (let i = 0; i < list.length; i++) if (score(idx[i], q, qCompact, qText) > 0) out.push(list[i]);
  return out;
}
