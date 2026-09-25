import { describe, expect, it } from 'vitest';
import { languageOf, titleKey, VersionIndex, versionLabels } from './versions';

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
