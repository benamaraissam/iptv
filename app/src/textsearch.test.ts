import { describe, expect, it } from 'vitest';
import { editDistance, rankSearch, tokenize } from './textsearch';

const titles = [
  'Le Seigneur des Anneaux : Le Retour du Roi',
  'Le Seigneur des Anneaux : La Communauté de l’Anneau',
  'Spider-Man',
  'Spider-Man: No Way Home',
  'Oppenheimer (2023)',
  'FR - Fast & Furious 7 [4K]',
  'Avatar',
  'Avatar : La Voie de l’eau',
  'The Last Horizon',
  'Das Wunder von Marseille',
  'Interstellar',
  'Inception',
].map((name, i) => ({ id: String(i), name }));

const names = (q: string, limit = 5) => rankSearch(titles, q, limit).map((x) => x.name);

describe('recherche tolérante', () => {
  it('ignore accents, tirets, étiquettes', () => {
    expect(tokenize('FR - Fast & Furious 7 [4K]')).toEqual(['fast', 'furious', '7']);
    expect(names('fast furious')[0]).toBe('FR - Fast & Furious 7 [4K]');
    expect(names('communaute anneau')[0]).toContain('Communauté');
  });

  it('accepte les mots oubliés et le désordre', () => {
    expect(names('seigneur anneaux').slice(0, 2)).toEqual(expect.arrayContaining(['Le Seigneur des Anneaux : Le Retour du Roi', 'Le Seigneur des Anneaux : La Communauté de l’Anneau']));
    expect(names('anneaux retour')[0]).toBe('Le Seigneur des Anneaux : Le Retour du Roi');
    expect(names('marseille wunder')[0]).toBe('Das Wunder von Marseille');
  });

  it('tolère les fautes de frappe', () => {
    expect(editDistance('oppenhiemer', 'oppenheimer', 2)).toBe(1);
    expect(names('oppenhiemer')[0]).toBe('Oppenheimer (2023)');
    expect(names('spidreman')[0]).toBe('Spider-Man');
    expect(names('intersteller')[0]).toBe('Interstellar');
    expect(names('avatr')[0]).toBe('Avatar');
  });

  it('classe le titre exact avant les suites', () => {
    expect(names('avatar')[0]).toBe('Avatar');
    expect(names('spiderman')[0]).toBe('Spider-Man');
    expect(names('spider man no way')[0]).toBe('Spider-Man: No Way Home');
  });

  it('ne renvoie pas n’importe quoi', () => {
    expect(names('zzzz')).toEqual([]);
    expect(names('le').every((n) => /\ble\b/i.test(n))).toBe(true);
  });
});
