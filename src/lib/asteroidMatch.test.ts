import { describe, expect, it } from 'vitest';
import { matchAsteroidWord } from './asteroidMatch';
import { foldForSound, soundsLike } from './wordMatch';

const WORDS = ['SUN', 'MOON', 'ICE', 'ZAP', 'THUNDER', 'PHOENIX', 'CRYSTAL', 'SHIELD', 'VOLCANO', 'ROBOT', 'ORBIT'];

describe('a word said clearly', () => {
  it('hits exactly that word', () => {
    expect(matchAsteroidWord('thunder', WORDS)).toBe('THUNDER');
    expect(matchAsteroidWord('MOON', WORDS)).toBe('MOON');
  });

  it('hits nothing that is not on screen', () => {
    expect(matchAsteroidWord('dragon', WORDS)).toBeNull();
    expect(matchAsteroidWord('', WORDS)).toBeNull();
  });
});

describe('a word the accent bent', () => {
  it('still hits it', () => {
    expect(matchAsteroidWord('tunder', WORDS)).toBe('THUNDER');
    expect(matchAsteroidWord('thunda', WORDS)).toBe('THUNDER');
    expect(matchAsteroidWord('feenix', WORDS)).toBe('PHOENIX');
    expect(matchAsteroidWord('sheeld', WORDS)).toBe('SHIELD');
    expect(matchAsteroidWord('kristal', WORDS)).toBe('CRYSTAL');
    expect(matchAsteroidWord('volcano', WORDS)).toBe('VOLCANO');
    expect(matchAsteroidWord('volkano', WORDS)).toBe('VOLCANO');
  });

  it('hits the three-letter words by how they are usually written', () => {
    expect(matchAsteroidWord('son', WORDS)).toBe('SUN');
    expect(matchAsteroidWord('eyes', WORDS)).toBe('ICE');
    expect(matchAsteroidWord('zab', WORDS)).toBe('ZAP');
  });

  it('only counts those aliases while the word is actually falling', () => {
    expect(matchAsteroidWord('son', ['MOON', 'ROBOT'])).toBeNull();
    expect(matchAsteroidWord('eyes', ['MOON', 'ROBOT'])).toBeNull();
  });
});

describe('a word that is simply another word', () => {
  it('does not hit a similar-looking one', () => {
    expect(matchAsteroidWord('robin', ['ROBOT'])).toBeNull();
    expect(matchAsteroidWord('moan', ['MOON'])).toBe('MOON');
    expect(matchAsteroidWord('orbital', ['ORBIT'])).toBeNull();
    expect(matchAsteroidWord('sand', ['SUN'])).toBeNull();
  });

  it('will not guess between two words that are equally close', () => {
    // "plans" is one letter from both; firing on either would destroy a rock the player did not call.
    expect(matchAsteroidWord('plans', ['PLANE', 'PLANT'])).toBeNull();
  });

  it('prefers the closer of two candidates', () => {
    expect(matchAsteroidWord('plane', ['PLANE', 'PLANT'])).toBe('PLANE');
    expect(matchAsteroidWord('planee', ['PLANE', 'PLANT'])).toBe('PLANE');
  });
});

describe('sounds-like matching', () => {
  it('folds the sounds an accent swaps', () => {
    expect(foldForSound('Phoenix')).toBe('foeniks');
    expect(foldForSound('Thunder')).toBe('tunda');
    expect(foldForSound('thunda')).toBe(foldForSound('thunder'));
    expect(foldForSound('city')).toBe(foldForSound('sity'));
    expect(foldForSound('Cameroon')).toBe(foldForSound('Kameroon'));
  });

  it('does not let folding turn a different word into the same one', () => {
    expect(soundsLike('Lagoon', 'Lagos')).toBe(false);
    expect(soundsLike('Niger', 'Nigeria')).toBe(false);
  });

  it('gives short words no room and long words a little', () => {
    expect(soundsLike('cat', 'car')).toBe(false);
    expect(soundsLike('nigeria', 'naijeria')).toBe(true);
    expect(soundsLike('niger', 'nigeria')).toBe(false);
  });
});

describe('the game’s own word list', () => {
  // Copied from AsteroidDefenseGame's WORDS. If one of these ever sounds like
  // another, shouting one could destroy the other.
  const GAME_WORDS = [
    'SUN', 'MOON', 'STAR', 'ROCK', 'FIRE', 'ICE', 'ZAP', 'BOOM',
    'JUMP', 'FLASH', 'LASER', 'COMET', 'ORBIT', 'PLANET', 'ROBOT',
    'ENGINE', 'SHIELD', 'TIGER', 'RIVER', 'THUNDER', 'CRYSTAL',
    'DRAGON', 'PHOENIX', 'GALAXY', 'MAGNET', 'PIRATE', 'VOLCANO',
  ];

  it('has no two words that could be mistaken for each other', () => {
    const clashes: string[] = [];
    for (const a of GAME_WORDS) {
      for (const b of GAME_WORDS) {
        if (a !== b && soundsLike(a, b)) clashes.push(`${a} ~ ${b}`);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('hits each word when every word is on screen at once', () => {
    for (const word of GAME_WORDS) expect(matchAsteroidWord(word.toLowerCase(), GAME_WORDS)).toBe(word);
  });

  it('hits each word when it is said with an accent, with every word on screen', () => {
    const accented: Record<string, string> = {
      THUNDER: 'thunda', PHOENIX: 'feenix', CRYSTAL: 'kristal', SHIELD: 'sheeld', VOLCANO: 'volkano',
      PLANET: 'planit', DRAGON: 'dragan', MAGNET: 'magnit', PIRATE: 'pirate', GALAXY: 'galaksi',
      ENGINE: 'engin', TIGER: 'taiga', RIVER: 'riva', LASER: 'lasa', ROBOT: 'robot',
    };
    for (const [word, said] of Object.entries(accented)) expect(matchAsteroidWord(said, GAME_WORDS)).toBe(word);
  });
});
