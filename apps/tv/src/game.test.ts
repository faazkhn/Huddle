import { describe, expect, it } from 'vitest';
import { BOOT_CAMP_MS, COUNTDOWN_MS, EXERCISE_MS, FT_LIMIT_MS, REST_MS, newGame, reduce, results, segment, type Action, type Game } from './game';

const run = (actions: Action[], g: Game = newGame()) => actions.reduce(reduce, g);
const join = (id: string, slot: number): Action => ({ type: 'joined', id, name: id, color: '#fff', slot });
const shot = (id: string, score: number, now = 5000): Action => ({ type: 'event', id, now, event: { kind: 'shot', score, tip: 'elbow_in', components: {} } });
const repA = (id: string, now: number, good = true): Action => ({ type: 'event', id, now, event: { kind: 'rep', exercise: 'squat', quality: good ? 'good' : 'partial' } });

describe('game state machine', () => {
  it('LOBBY -> COUNTDOWN -> ROUND -> RESULTS for free throw when everyone has 5 shots', () => {
    let g = run([join('maya', 0), join('dad', 1), { type: 'start', mode: 'free_throw', now: 0 }]);
    expect(g.phase).toBe('COUNTDOWN');
    g = run([{ type: 'tick', now: COUNTDOWN_MS }], g);
    expect(g.phase).toBe('ROUND');
    g = run([...Array(5)].flatMap(() => [shot('maya', 90), shot('dad', 60)]), g);
    g = run([shot('maya', 100)], g); // 6th shot ignored
    g = run([{ type: 'tick', now: COUNTDOWN_MS + 1000 }], g);
    expect(g.phase).toBe('RESULTS');
    const r = results(g);
    expect(r.map((p) => [p.id, p.score, p.rank])).toEqual([['maya', 450, 1], ['dad', 300, 2]]);
  });

  it('free throw ends after 90 s even if shots are missing; disconnected players do not block', () => {
    let g = run([join('a', 0), join('b', 1), { type: 'start', mode: 'free_throw', now: 0 }, { type: 'tick', now: COUNTDOWN_MS }]);
    g = run([...Array(5)].map(() => shot('a', 80)), g);
    g = run([{ type: 'left', id: 'b' }, { type: 'tick', now: COUNTDOWN_MS + 10 }], g);
    expect(g.phase).toBe('RESULTS');
    g = run([{ type: 'start', mode: 'free_throw', now: 0 }, { type: 'tick', now: COUNTDOWN_MS }, { type: 'tick', now: COUNTDOWN_MS + FT_LIMIT_MS }], g);
    expect(g.phase).toBe('RESULTS');
  });

  it('boot camp scores good x10 + partial x4, only for the exercise on the clock', () => {
    let g = run([join('kid', 0), { type: 'start', mode: 'boot_camp', now: 0 }, { type: 'tick', now: COUNTDOWN_MS }]);
    const t0 = COUNTDOWN_MS;
    g = run([repA('kid', t0 + 1000), repA('kid', t0 + 2000, false), repA('kid', t0 + EXERCISE_MS + 1000)], g); // last one is during rest
    expect(results(g)[0].score).toBe(14);
    g = run([{ type: 'tick', now: t0 + BOOT_CAMP_MS - 1 }], g);
    expect(g.phase).toBe('ROUND');
    g = run([{ type: 'tick', now: t0 + BOOT_CAMP_MS }], g);
    expect(g.phase).toBe('RESULTS');
  });

  it('segments the circuit: 3 x 40 s with 10 s rests', () => {
    expect(segment(0)).toMatchObject({ exercise: 'squat', remaining: EXERCISE_MS });
    expect(segment(EXERCISE_MS + 1)).toMatchObject({ exercise: null, next: 'jumping_jack' });
    expect(segment(EXERCISE_MS + REST_MS)).toMatchObject({ exercise: 'jumping_jack' });
    expect(segment(BOOT_CAMP_MS)).toMatchObject({ exercise: null, next: null });
  });

  it('reconnect keeps stats; a new player in a freed slot replaces the old one', () => {
    let g = run([join('a', 0), { type: 'start', mode: 'free_throw', now: 0 }, { type: 'tick', now: COUNTDOWN_MS }, shot('a', 70), { type: 'left', id: 'a' }]);
    expect(g.players.a.connected).toBe(false);
    g = run([join('a', 0)], g);
    expect(g.players.a).toMatchObject({ connected: true, shots: [{ score: 70 }] });
    g = run([join('z', 0)], g);
    expect(Object.keys(g.players)).toEqual(['z']);
    g = run([{ type: 'left', id: 'z', gone: true }], g);
    expect(g.players).toEqual({});
  });

  it('ties share rank on the results screen (T5)', () => {
    let g = run([join('a', 0), join('b', 1), join('c', 2), { type: 'start', mode: 'free_throw', now: 0 }, { type: 'tick', now: COUNTDOWN_MS }]);
    g = run([shot('a', 80), shot('b', 80), shot('c', 50)], g);
    expect(results(g).map((p) => p.rank)).toEqual([1, 1, 3]);
  });
});
