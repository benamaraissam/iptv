import { describe, expect, it } from 'vitest';
import { dedupeVersions, languageOf, titleKey, VersionIndex, versionLabels } from './versions';

const mv = (id: string, name: string, group: string, year?: string): any => ({ id, name, group, year, kind: 'movie', url: '' });

describe('versions linguistiques', () => {
  it('regroupe le même titre malgré les étiquettes de langue et de qualité', () => {
    expect(titleKey(mv('a', 'FR - Oppenheimer (2023) 4K', ''))).toBe(titleKey(mv('b', 'Oppenheimer 2023', '')));
    expect(titleKey(mv('a', 'Oppenheimer (2023) [VOSTFR]', ''))).toBe('oppenheimer|2023');
    expect(titleKey(mv('a', 'Oppenheimer (2023)', ''))).not.toBe(titleKey(mv('b', 'Oppenheimer 2 (2025)', '')));
  });

  it('déduit la langue de la catégorie puis du titre', () => {
    expect(languageOf({ name: 'Oppenheimer', group: 'FR| FILMS 4K' })).toBe('Français');
    expect(languageOf({ name: 'Oppenheimer', group: 'AR| AFLAM' })).toBe('العربية');
    expect(languageOf({ name: '[VOSTFR] Oppenheimer', group: 'Action' })).toBe('VOSTFR');
    expect(languageOf({ name: 'Oppenheimer', group: 'Action' })).toBeUndefined();
  });

  it('liste les autres versions, année tolérante quand elle manque', () => {
    const a = mv('a', 'Das Wunder von Marseille', 'DE| FILME');
    const b = mv('b', 'Das Wunder von Marseille (2018)', 'FR| FILMS');
    const c = mv('c', 'Das Wunder von Marseille (2001)', 'EN| MOVIES');
    const idx = new VersionIndex<any>(() => [a, b, c]);
    expect(idx.of(b).map((x) => x.id)).toEqual(['b', 'a']);
    expect(idx.of(a).map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(versionLabels([b, a])).toEqual(['Français', 'Deutsch']);
  });

  it('distingue deux versions de même langue par leur catégorie', () => {
    expect(versionLabels([mv('a', 'X', 'FR| FILMS'), mv('b', 'X', 'FR| FILMS 4K')])).toEqual(['Français · FR| FILMS', 'Français · FR| FILMS 4K']);
  });
});

describe('dedupeVersions', () => {
  const L = (name: string, group: string) => ({ name, group });
  it('une seule carte par titre, dans la langue préférée, à la place de la première', () => {
    const r = dedupeVersions(
      [L('Oppenheimer (2023)', 'EN| MOVIES'), L('Dune', 'FR| FILMS'), L('FR - Oppenheimer 4K', 'FR| FILMS'), L('AR| Oppenheimer 2023', 'AR| AFLAM')],
      'Français',
    );
    expect(r.map((x) => x.name)).toEqual(['FR - Oppenheimer 4K', 'Dune']);
  });
  it('garde séparés deux films de même titre et d’années différentes', () => {
    const r = dedupeVersions([L('Avatar (2009)', 'FR| FILMS'), L('Avatar (2022)', 'EN| MOVIES'), L('Avatar', 'AR| AFLAM')]);
    expect(r.map((x) => x.name)).toEqual(['Avatar (2009)', 'Avatar (2022)']);
  });
  it('sans langue préférée, la première version reste', () => {
    const r = dedupeVersions([L('Lupin', 'EN| SERIES'), L('Lupin', 'FR| SERIES')]);
    expect(r.map((x) => x.group)).toEqual(['EN| SERIES']);
  });
});

describe('titleKey : formes courantes chez les fournisseurs', () => {
  it('ignore plateforme, saison et article de tête', () => {
    const k = titleKey({ name: 'House of the Dragon' }).split('|')[0];
    for (const n of ['NF - House of the Dragon', 'HBO: House of the Dragon', 'House of the Dragon S01', 'House of the Dragon - Saison 2', 'The House of the Dragon', '|FR| House of the Dragon (VF)', 'AR - House Of The Dragon [MULTI] 4K'])
      expect(titleKey({ name: n }).split('|')[0]).toBe(k);
  });
  it('garde les titres qui commencent par un mot de plateforme', () => {
    expect(titleKey({ name: 'Mad Max' }).split('|')[0]).toBe('madmax');
    expect(titleKey({ name: 'Sky High' }).split('|')[0]).toBe('skyhigh');
  });
});
