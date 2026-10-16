// TV-side game state machine (T1–T5). Pure: no React, no network — unit tested with Vitest.
import { rank } from '@huddle/scoring';
import { TIP_TEXT, type Exercise, type GameEvent, type GameMode, type GameStateName, type TipKey } from '@huddle/protocol';

export const SHOTS_PER_ROUND = 5;
export const FT_LIMIT_MS = 90_000;
export const COUNTDOWN_MS = 3_000;
export const EXERCISE_MS = 40_000;
export const REST_MS = 10_000;
export const CIRCUIT: Exercise[] = ['squat', 'jumping_jack', 'high_knees'];
export const BOOT_CAMP_MS = CIRCUIT.length * EXERCISE_MS + (CIRCUIT.length - 1) * REST_MS;
export const LABEL: Record<Exercise | GameMode, string> = {
  squat: 'Squats', jumping_jack: 'Jumping Jacks', high_knees: 'High Knees', free_throw: 'Free Throw', boot_camp: 'Boot Camp',
};

export type Shot = { score: number; tip: TipKey; components: Partial<Record<TipKey, number>> };
export type Player = {
  id: string; name: string; color: string; slot: number; connected: boolean;
  shots: Shot[]; good: number; partial: number; reps: Partial<Record<Exercise, { good: number; partial: number }>>;
};
export type Game = { phase: GameStateName; mode: GameMode | null; round: number; phaseStart: number; players: Record<string, Player> };

export const newGame = (): Game => ({ phase: 'LOBBY', mode: null, round: 0, phaseStart: 0, players: {} });

export type Action =
  | { type: 'joined'; id: string; name: string; color: string; slot: number }
  | { type: 'left'; id: string; gone?: boolean }
  | { type: 'event'; id: string; event: GameEvent; now: number }
  | { type: 'start'; mode: GameMode; now: number }
  | { type: 'lobby' }
  | { type: 'tick'; now: number };

const fresh = (p: Player): Player => ({ ...p, shots: [], good: 0, partial: 0, reps: {} });

/** Which part of the Boot Camp circuit we're in, `elapsed` ms after the round started. */
export function segment(elapsed: number) {
  for (let i = 0, t = 0; i < CIRCUIT.length; i++) {
    if (elapsed < t + EXERCISE_MS) return { exercise: CIRCUIT[i] as Exercise | null, next: CIRCUIT[i], index: i, remaining: t + EXERCISE_MS - elapsed };
    t += EXERCISE_MS;
    if (i < CIRCUIT.length - 1 && elapsed < t + REST_MS) return { exercise: null, next: CIRCUIT[i + 1], index: i, remaining: t + REST_MS - elapsed };
    t += REST_MS;
  }
  return { exercise: null, next: null, index: CIRCUIT.length, remaining: 0 };
}

export const score = (p: Player, mode: GameMode | null) =>
  mode === 'free_throw' ? p.shots.reduce((a, s) => a + s.score, 0) : p.good * 10 + p.partial * 4;

export function reduce(g: Game, a: Action): Game {
  switch (a.type) {
    case 'joined': {
      // A new player in a slot replaces whoever held it before (the relay freed it).
      const players = Object.fromEntries(Object.entries(g.players).filter(([id, p]) => p.slot !== a.slot || id === a.id));
      const prev = players[a.id];
      players[a.id] = prev ? { ...prev, connected: true, name: a.name } : fresh({ id: a.id, name: a.name, color: a.color, slot: a.slot, connected: true } as Player);
      return { ...g, players };
    }
    case 'left': {
      if (!g.players[a.id]) return g;
      const { [a.id]: p, ...rest } = g.players;
      return { ...g, players: a.gone ? rest : { ...g.players, [a.id]: { ...p, connected: false } } };
    }
    case 'start': {
      const players = Object.fromEntries(Object.entries(g.players).map(([id, p]) => [id, fresh(p)]));
      return { phase: 'COUNTDOWN', mode: a.mode, round: g.round + 1, phaseStart: a.now, players };
    }
    case 'lobby':
      return { ...g, phase: 'LOBBY', mode: null };
    case 'event': {
      const p = g.players[a.id];
      if (!p || g.phase !== 'ROUND') return g;
      const e = a.event;
      if (e.kind === 'shot' && g.mode === 'free_throw' && p.shots.length < SHOTS_PER_ROUND)
        return { ...g, players: { ...g.players, [a.id]: { ...p, shots: [...p.shots, { score: e.score, tip: e.tip, components: e.components }] } } };
      if (e.kind === 'rep') return rep(g, a.id, e, a.now);
      return g;
    }
    case 'tick': {
      const elapsed = a.now - g.phaseStart;
      if (g.phase === 'COUNTDOWN' && elapsed >= COUNTDOWN_MS) return { ...g, phase: 'ROUND', phaseStart: a.now };
      if (g.phase !== 'ROUND') return g;
      const live = Object.values(g.players).filter((p) => p.connected);
      const ftDone = g.mode === 'free_throw' && (elapsed >= FT_LIMIT_MS || (live.length > 0 && live.every((p) => p.shots.length >= SHOTS_PER_ROUND)));
      const bcDone = g.mode === 'boot_camp' && elapsed >= BOOT_CAMP_MS;
      return ftDone || bcDone ? { ...g, phase: 'RESULTS', phaseStart: a.now } : g;
    }
  }
}

/** Boot Camp rep: only counts for the exercise currently on the clock (not during rests). */
function rep(g: Game, id: string, e: Extract<GameEvent, { kind: 'rep' }>, now: number): Game {
  const p = g.players[id];
  if (!p || g.phase !== 'ROUND' || g.mode !== 'boot_camp' || segment(now - g.phaseStart).exercise !== e.exercise) return g;
  const r = p.reps[e.exercise] ?? { good: 0, partial: 0 };
  const good = e.quality === 'good';
  return { ...g, players: { ...g.players, [id]: {
    ...p, good: p.good + (good ? 1 : 0), partial: p.partial + (good ? 0 : 1),
    reps: { ...p.reps, [e.exercise]: { good: r.good + (good ? 1 : 0), partial: r.partial + (good ? 0 : 1) } },
  } } };
}

export const totalReps = (p: Player) => p.good + p.partial;

export function results(g: Game) {
  return rank(Object.values(g.players).map((p) => ({ ...p, score: score(p, g.mode) }))).map((p) => {
    if (g.mode === 'free_throw') {
      const best = p.shots.length ? Math.max(...p.shots.map((s) => s.score)) : 0;
      const tips = p.shots.map((s) => s.tip);
      const weakest = tips.sort((a, b) => tips.filter((t) => t === b).length - tips.filter((t) => t === a).length)[0];
      return { ...p, highlight: `Best shot ${best}`, weakest: weakest ? TIP_TEXT[weakest] : undefined, best: best ? `${best} point shot` : undefined };
    }
    const n = totalReps(p);
    const worst = CIRCUIT.slice().sort((a, b) => (p.reps[b]?.partial ?? 0) - (p.reps[a]?.partial ?? 0))[0];
    const top = CIRCUIT.slice().sort((a, b) => (p.reps[b]?.good ?? 0) - (p.reps[a]?.good ?? 0))[0];
    return { ...p, highlight: `${n} reps · ${n ? Math.round((p.good / n) * 100) : 0}% good form`,
      weakest: p.reps[worst]?.partial ? `full range on ${LABEL[worst].toLowerCase()}` : undefined, best: p.reps[top]?.good ? LABEL[top] : undefined };
  });
}
