import type { Channel, Program } from './types';
import { fetchText } from './http';

/** « 20240426140000 +0200 » → timestamp ms. */
export function parseXmltvDate(s: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/.exec(s.trim());
  if (!m) return NaN;
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  if (!m[7]) return utc;
  const sign = m[7][0] === '-' ? -1 : 1;
  const offset = sign * (parseInt(m[7].slice(1, 3), 10) * 60 + parseInt(m[7].slice(3, 5), 10));
  return utc - offset * 60000;
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&amp;/g, '&');
}

/**
 * Analyse un guide XMLTV en ne gardant que les chaînes demandées
 * et une fenêtre de temps limitée (les fichiers font souvent plusieurs Mo).
 */
export function parseXmltv(
  xml: string,
  wanted: Set<string>,
  from: number,
  to: number,
): Map<string, Program[]> {
  const out = new Map<string, Program[]>();
  const re = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const attrs = m[1];
    const ch = /channel="([^"]*)"/.exec(attrs);
    if (!ch || !wanted.has(ch[1])) continue;
    const start = parseXmltvDate((/start="([^"]*)"/.exec(attrs) || [])[1] || '');
    const end = parseXmltvDate((/stop="([^"]*)"/.exec(attrs) || [])[1] || '');
    if (!(end > from && start < to)) continue;
    const title = /<title[^>]*>([\s\S]*?)<\/title>/.exec(m[2]);
    const desc = /<desc[^>]*>([\s\S]*?)<\/desc>/.exec(m[2]);
    let list = out.get(ch[1]);
    if (!list) out.set(ch[1], (list = []));
    list.push({
      title: title ? decodeEntities(title[1]).trim() : '—',
      desc: desc ? decodeEntities(desc[1]).trim() : undefined,
      start,
      end,
    });
  }
  out.forEach((list) => list.sort((a, b) => a.start - b.start));
  return out;
}

export function currentProgram(list: Program[] | undefined, at = Date.now()): Program | undefined {
  if (!list) return undefined;
  for (const p of list) if (p.start <= at && p.end > at) return p;
  return undefined;
}

export function nextProgram(list: Program[] | undefined, at = Date.now()): Program | undefined {
  if (!list) return undefined;
  for (const p of list) if (p.start > at) return p;
  return undefined;
}

type Fetcher = (ch: Channel) => Promise<Program[]>;

/**
 * Source unique de programmes TV : EPG court Xtream (à la demande, par chaîne)
 * ou guide XMLTV global pour les playlists M3U.
 */
export class EpgStore {
  private cache = new Map<string, { at: number; list: Program[] }>();
  private pending = new Map<string, Promise<Program[]>>();
  private queue: (() => void)[] = [];
  private running = 0;
  private xmltv: Promise<Map<string, Program[]>> | null = null;

  constructor(
    private channels: Channel[],
    private xtreamFetch?: Fetcher,
    private xmltvUrl?: string,
    /** Xtream : guide complet (plusieurs jours, avec replay) pour l'écran Guide TV. */
    private xtreamFull?: Fetcher,
  ) {}

  get available(): boolean {
    return !!this.xtreamFetch || !!this.xmltvUrl;
  }

  /** Programmes déjà en mémoire (synchrone, pour l'affichage immédiat). */
  peek(ch: Channel): Program[] | undefined {
    const c = this.cache.get(ch.id);
    return c ? c.list : undefined;
  }

  async programs(ch: Channel, full = false): Promise<Program[]> {
    const key = full && this.xtreamFull ? ch.id + '|full' : ch.id;
    const c = this.cache.get(key);
    if (c && Date.now() - c.at < 10 * 60000) return c.list;
    const p = this.pending.get(key);
    if (p) return p;
    const job = this.load(ch, full)
      .catch(() => [] as Program[])
      .then((list) => {
        this.cache.set(key, { at: Date.now(), list });
        // Le guide complet sert aussi pour « en cours ».
        if (key !== ch.id && !this.cache.get(ch.id)) this.cache.set(ch.id, { at: Date.now(), list });
        this.pending.delete(key);
        return list;
      });
    this.pending.set(key, job);
    return job;
  }

  private async load(ch: Channel, full: boolean): Promise<Program[]> {
    const fetcher = full && this.xtreamFull ? this.xtreamFull : this.xtreamFetch;
    if (fetcher && ch.streamId) {
      await this.slot();
      try {
        return await fetcher(ch);
      } finally {
        this.release();
      }
    }
    if (this.xmltvUrl && ch.tvgId) {
      const all = await this.loadXmltv();
      return all.get(ch.tvgId) || [];
    }
    return [];
  }

  private loadXmltv(): Promise<Map<string, Program[]>> {
    if (!this.xmltv) {
      const wanted = new Set<string>();
      for (const c of this.channels) if (c.tvgId) wanted.add(c.tvgId);
      const now = Date.now();
      this.xmltv = fetchText(this.xmltvUrl!)
        .then((xml) => parseXmltv(xml, wanted, now - 6 * 3600000, now + 3 * 86400000))
        .catch(() => new Map<string, Program[]>());
    }
    return this.xmltv;
  }

  // Limite à 4 requêtes simultanées pour ne pas saturer le serveur.
  private slot(): Promise<void> {
    if (this.running < 4) {
      this.running++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push(() => (this.running++, resolve())));
  }

  private release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) next();
  }
}
