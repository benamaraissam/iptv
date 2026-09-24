import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildM3UShows, splitSeason } from './catalog';
import { parseEpgUrl, parseM3U } from './m3u';
import { currentProgram, parseXmltv, parseXmltvDate } from './epg';

describe('splitSeason', () => {
  it('sépare le nom de la série et le numéro de saison', () => {
    expect(splitSeason('Awled Moufida - Season 2')).toEqual({ name: 'Awled Moufida', season: 2 });
    expect(splitSeason('16/16 - Saison 1')).toEqual({ name: '16/16', season: 1 });
    expect(splitSeason('Show S3')).toEqual({ name: 'Show', season: 3 });
  });

  it('ne coupe pas un titre qui finit par « s » + chiffre', () => {
    expect(splitSeason('Beats 2')).toEqual({ name: 'Beats 2', season: 1 });
    expect(splitSeason('Documentaires')).toEqual({ name: 'Documentaires', season: 1 });
  });
});

describe('buildM3UShows', () => {
  it('regroupe les saisons d’une même série', () => {
    const text = readFileSync(join(__dirname, '..', '..', 'list.m3u'), 'utf8');
    const episodes = parseM3U(text).filter((c) => c.kind === 'series');
    const shows = buildM3UShows(episodes);
    const names = shows.map((s) => s.name);
    expect(names).toContain('Macha3er');
    // « Macha3er - Season 1 » et « Season 2 » ne font qu'une série.
    expect(names.filter((n) => n === 'Macha3er')).toHaveLength(1);
    expect(shows.length).toBeLessThan(new Set(episodes.map((e) => e.group)).size);
  });
});

describe('EPG', () => {
  it('lit l’URL XMLTV de l’en-tête M3U', () => {
    expect(parseEpgUrl('#EXTM3U url-tvg="http://epg/guide.xml"\n#EXTINF:-1,A\nhttp://a')).toBe('http://epg/guide.xml');
    expect(parseEpgUrl('#EXTINF:-1,A\nhttp://a')).toBeUndefined();
  });

  it('convertit les dates XMLTV avec fuseau', () => {
    expect(parseXmltvDate('20240426140000 +0200')).toBe(Date.UTC(2024, 3, 26, 12, 0, 0));
    expect(parseXmltvDate('20240426140000')).toBe(Date.UTC(2024, 3, 26, 14, 0, 0));
  });

  it('ne garde que les chaînes et la fenêtre demandées', () => {
    const xml = `<tv>
      <programme start="20240426120000 +0000" stop="20240426130000 +0000" channel="tf1.fr"><title lang="fr">Journal &amp; Météo</title><desc>Infos</desc></programme>
      <programme start="20240426130000 +0000" stop="20240426140000 +0000" channel="tf1.fr"><title><![CDATA[Film]]></title></programme>
      <programme start="20240426120000 +0000" stop="20240426130000 +0000" channel="autre"><title>Ignoré</title></programme>
      <programme start="20240420120000 +0000" stop="20240420130000 +0000" channel="tf1.fr"><title>Trop ancien</title></programme>
    </tv>`;
    const from = Date.UTC(2024, 3, 26, 0, 0, 0);
    const map = parseXmltv(xml, new Set(['tf1.fr']), from, from + 86400000);
    expect(map.has('autre')).toBe(false);
    const list = map.get('tf1.fr')!;
    expect(list.map((p) => p.title)).toEqual(['Journal & Météo', 'Film']);
    expect(list[0].desc).toBe('Infos');
    expect(currentProgram(list, Date.UTC(2024, 3, 26, 13, 30))!.title).toBe('Film');
  });
});
