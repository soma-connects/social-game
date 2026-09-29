import { describe, expect, it } from 'vitest';
import { CHALLENGE_STYLES, fallbackFor, pickChallengeStyle } from './challengeStyles';
import { ROOM_VIBES, type RoomVibeId } from './roomVibes';

const vibes = Object.keys(ROOM_VIBES) as RoomVibeId[];

describe('every room has its own menu', () => {
  it('has styles for every vibe there is', () => {
    for (const vibe of vibes) expect(CHALLENGE_STYLES[vibe]?.length).toBeGreaterThanOrEqual(3);
  });

  it('gives each style everything the round needs', () => {
    for (const vibe of vibes) {
      for (const style of CHALLENGE_STYLES[vibe]) {
        expect(style.id).toBeTruthy();
        expect(style.label.length).toBeGreaterThan(3);
        expect(style.brief.length).toBeGreaterThan(20);
        expect(style.fallbacks.length).toBeGreaterThanOrEqual(2);
        for (const line of style.fallbacks) expect(line).toContain('{name}');
      }
    }
  });

  it('has unique ids within a vibe', () => {
    for (const vibe of vibes) {
      const ids = CHALLENGE_STYLES[vibe].map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('asks each kind of room about what that room is about', () => {
    const ids = (vibe: RoomVibeId) => CHALLENGE_STYLES[vibe].map((s) => s.id);
    expect(ids('bros_hangout')).toContain('bro_code');
    expect(ids('anime_squad')).toContain('tier_list');
    expect(ids('getting_to_know')).toContain('guess_about_them');
    expect(ids('roast_room')).toContain('roast_battle');
    // The getting-to-know room is about two people talking about each other,
    // so several of its styles are about the other person.
    const aboutOther = CHALLENGE_STYLES.getting_to_know.filter((s) => s.fallbacks.some((f) => f.includes('{other}')));
    expect(aboutOther.length).toBeGreaterThanOrEqual(2);
  });

  it('does not hand a bro-code dilemma to the anime room, or anime trivia to the bros', () => {
    const anime = CHALLENGE_STYLES.anime_squad.map((s) => s.id);
    const bros = CHALLENGE_STYLES.bros_hangout.map((s) => s.id);
    expect(anime).not.toContain('bro_code');
    expect(bros).not.toContain('anime_trivia');
  });
});

describe('picking a style for a round', () => {
  it('never repeats the style just used', () => {
    for (const vibe of vibes) {
      for (const previous of CHALLENGE_STYLES[vibe].map((s) => s.id)) {
        for (const r of [0, 0.3, 0.6, 0.99]) {
          expect(pickChallengeStyle(vibe, previous, () => r).id).not.toBe(previous);
        }
      }
    }
  });

  it('is drawn from the room’s own menu', () => {
    for (const vibe of vibes) {
      const ids = CHALLENGE_STYLES[vibe].map((s) => s.id);
      for (const r of [0, 0.5, 0.999]) expect(ids).toContain(pickChallengeStyle(vibe, null, () => r).id);
    }
  });

  it('reaches every style eventually', () => {
    const seen = new Set<string>();
    for (let i = 0; i < CHALLENGE_STYLES.bros_hangout.length; i++) {
      seen.add(pickChallengeStyle('bros_hangout', null, () => i / CHALLENGE_STYLES.bros_hangout.length).id);
    }
    expect(seen.size).toBe(CHALLENGE_STYLES.bros_hangout.length);
  });

  it('falls back to the classic menu for a vibe it has never heard of', () => {
    const style = pickChallengeStyle('nonsense' as RoomVibeId, null, () => 0);
    expect(CHALLENGE_STYLES.classic_party.map((s) => s.id)).toContain(style.id);
  });
});

describe('the offline fallback', () => {
  it('names the player on the spot and somebody else in the room', () => {
    const style = CHALLENGE_STYLES.getting_to_know.find((s) => s.id === 'guess_about_them')!;
    const line = fallbackFor(style, 'Ada', ['Ben'], () => 0);
    expect(line).toContain('Ada');
    expect(line).toContain('Ben');
    expect(line).not.toMatch(/\{name\}|\{other\}/);
  });

  it('copes with nobody else being there', () => {
    const style = CHALLENGE_STYLES.roast_room.find((s) => s.id === 'roast_battle')!;
    expect(fallbackFor(style, 'Ada', [], () => 0)).toContain('somebody here');
  });
});
