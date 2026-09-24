import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { groupChannels, parseM3U } from './m3u';

describe('parseM3U', () => {
  it('lit les attributs, le groupe et le nom', () => {
    const list = parseM3U(
      [
        '#EXTM3U',
        '#EXTINF:-1 tvg-id="tf1.fr" tvg-logo="http://x/tf1.png" group-title="France",TF1 HD',
        'http://srv/live/1.m3u8',
        '#EXTINF:-1 group-title="Sport, Live",beIN Sports 1',
        '#EXTVLCOPT:http-user-agent=VLC',
        'http://srv/live/2.ts',
      ].join('\r\n'),
    );
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      name: 'TF1 HD',
      group: 'France',
      logo: 'http://x/tf1.png',
      tvgId: 'tf1.fr',
      url: 'http://srv/live/1.m3u8',
      kind: 'live',
    });
    // Virgule dans un attribut entre guillemets
    expect(list[1].group).toBe('Sport, Live');
    expect(list[1].name).toBe('beIN Sports 1');
  });

  it('gère #EXTGRP, les entrées sans #EXTINF et devine le type', () => {
    const list = parseM3U(
      ['#EXTINF:0,Film', '#EXTGRP:Cinéma', 'http://srv/movie/u/p/9.mp4', 'http://srv/brut.m3u8'].join('\n'),
    );
    expect(list[0]).toMatchObject({ group: 'Cinéma', kind: 'movie' });
    expect(list[1]).toMatchObject({ name: 'http://srv/brut.m3u8', group: 'Sans catégorie' });
  });

  it('analyse la playlist du dépôt', () => {
    const text = readFileSync(join(__dirname, '..', '..', 'list.m3u'), 'utf8');
    const list = parseM3U(text);
    expect(list.length).toBeGreaterThan(100);
    const groups = groupChannels(list);
    expect(groups.has('16/16 - Saison 1')).toBe(true);
    expect(list[0].kind).toBe('series');
    expect(new Set(list.map((c) => c.id)).size).toBe(list.length);
  });
});
