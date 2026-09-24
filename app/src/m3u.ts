import type { Channel, ChannelKind } from './types';

const ATTR_RE = /([\w-]+)="([^"]*)"/g;

/** Hash court et stable (djb2) pour identifier une chaîne par son URL. */
export function hashId(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

function guessKind(url: string, group: string): ChannelKind {
  const u = url.toLowerCase();
  if (u.indexOf('/movie/') !== -1 || /\.(mp4|mkv|avi)(\?|$)/.test(u)) return 'movie';
  if (u.indexOf('/series/') !== -1 || /saison|season/i.test(group)) return 'series';
  return 'live';
}

/**
 * Analyse une playlist M3U / M3U8 étendue (#EXTM3U / #EXTINF).
 * Tolère les fichiers sans en-tête, les fins de ligne Windows et
 * les directives intermédiaires (#EXTVLCOPT, #EXTGRP...).
 */
export function parseM3U(text: string): Channel[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const channels: Channel[] = [];
  let pending: { name: string; attrs: Record<string, string>; group?: string } | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.indexOf('#EXTINF') === 0) {
      const attrs: Record<string, string> = {};
      // Le nom est après la dernière virgule hors guillemets.
      let inQuotes = false;
      let commaAt = -1;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') inQuotes = !inQuotes;
        else if (c === ',' && !inQuotes) commaAt = i;
      }
      const head = commaAt === -1 ? line : line.slice(0, commaAt);
      const name = commaAt === -1 ? '' : line.slice(commaAt + 1).trim();
      let m: RegExpExecArray | null;
      ATTR_RE.lastIndex = 0;
      while ((m = ATTR_RE.exec(head))) attrs[m[1].toLowerCase()] = m[2];
      pending = { name, attrs };
      continue;
    }

    if (line.indexOf('#EXTGRP:') === 0) {
      if (pending) pending.group = line.slice(8).trim();
      continue;
    }

    if (line[0] === '#') continue;

    // Ligne d'URL
    const url = line;
    const attrs = pending ? pending.attrs : {};
    const group = attrs['group-title'] || (pending && pending.group) || 'Sans catégorie';
    const name = (pending && pending.name) || attrs['tvg-name'] || url;
    channels.push({
      id: hashId(url + '|' + name),
      name,
      url,
      logo: attrs['tvg-logo'] || undefined,
      group,
      tvgId: attrs['tvg-id'] || undefined,
      kind: guessKind(url, group),
    });
    pending = null;
  }

  return channels;
}

/** Regroupe les chaînes par catégorie, en conservant l'ordre d'apparition. */
export function groupChannels(channels: Channel[]): Map<string, Channel[]> {
  const groups = new Map<string, Channel[]>();
  for (const ch of channels) {
    let list = groups.get(ch.group);
    if (!list) {
      list = [];
      groups.set(ch.group, list);
    }
    list.push(ch);
  }
  return groups;
}
