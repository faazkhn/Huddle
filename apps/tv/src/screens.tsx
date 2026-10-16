import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { TIP_TEXT, type GameMode } from '@huddle/protocol';
import { COUNTDOWN_MS, LABEL, SHOTS_PER_ROUND, FT_LIMIT_MS, results, score, segment, type Game, type Player, type Shot } from './game';
import type { Net } from './net';
import { latencyStats } from './net';
import { Button, C, DemoAvatar, LiveAvatar, PlayerTag, QR, SAFE } from './ui';

const bySlot = (g: Game) => Object.values(g.players).sort((a, b) => a.slot - b.slot);
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.ceil((ms % 60000) / 1000) % 60).padStart(2, '0')}`;

export function Lobby({ g, net, onStart }: { g: Game; net: Net; onStart: (m: GameMode) => void }) {
  const players = bySlot(g);
  const anyone = players.some((p) => p.connected);
  return (
    <View style={[s.screen, SAFE]}>
      <View style={s.row}>
        <View style={s.joinCard}>
          <Text style={s.logo}>Huddle</Text>
          {net.room ? (
            <>
              <QR qr={net.room.qr} size={360} />
              <Text style={s.code} accessibilityLabel={`Room code ${net.room.code.split('').join(' ')}`}>{net.room.code}</Text>
              <Text style={s.muted}>Scan with your phone camera</Text>
              <Text style={s.small} numberOfLines={1}>{net.room.joinUrl}</Text>
            </>
          ) : (
            <Text style={s.body}>{net.connected ? 'Creating room…' : 'Connecting to Huddle…'}</Text>
          )}
          <Text style={s.small}>🔒 Video never leaves the phones.</Text>
        </View>
        <View style={s.slots}>
          {[0, 1, 2, 3].map((slot) => {
            const p = players.find((x) => x.slot === slot);
            return (
              <View key={slot} style={[s.slot, p && { borderColor: p.color }]}>
                {p ? (
                  <>
                    <LiveAvatar id={p.id} slot={p.slot} size={430} dim={!p.connected} />
                    <PlayerTag name={p.name} slot={p.slot} color={p.color} />
                    {!p.connected && <Text style={s.muted}>Reconnecting…</Text>}
                  </>
                ) : (
                  <Text style={s.empty}>P{slot + 1}{'\n'}Waiting…</Text>
                )}
              </View>
            );
          })}
        </View>
      </View>
      <View style={s.modes}>
        <Button label="🏀 Free Throw" sub="5 shots · form scored 0–100" onPress={() => onStart('free_throw')} preferred style={s.mode} />
        <Button label="💪 Boot Camp" sub="Squats · Jacks · High knees" onPress={() => onStart('boot_camp')} style={s.mode} />
        <Text style={[s.muted, { flex: 1 }]}>{anyone ? 'Pick a game with the remote' : 'Scan the QR to join — then pick a game'}</Text>
      </View>
    </View>
  );
}

export function Countdown({ g, now }: { g: Game; now: number }) {
  const n = Math.max(1, Math.ceil((COUNTDOWN_MS - (now - g.phaseStart)) / 1000));
  return (
    <View style={[s.screen, s.center]}>
      <Text style={s.title}>{LABEL[g.mode!]}</Text>
      <Text style={s.count} accessibilityLiveRegion="assertive">{n}</Text>
      <Text style={s.body}>{g.mode === 'free_throw' ? 'Get your shooting stance ready!' : 'Up first: Squats'}</Text>
    </View>
  );
}

/** Cosmetic ball arc: swishes into the hoop when the shot scores >= 70, clanks off the rim otherwise. */
function Ball({ shot }: { shot?: Shot }) {
  const p = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!shot) return;
    p.setValue(0);
    Animated.timing(p, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }).start();
  }, [shot, p]);
  const made = (shot?.score ?? 0) >= 70;
  const translateX = p.interpolate({ inputRange: [0, 1], outputRange: [made ? 0 : -60, made ? 0 : 60] });
  const translateY = p.interpolate({ inputRange: [0, 0.45, 0.75, 1], outputRange: [380, -40, made ? 20 : 0, made ? 120 : 380] });
  const opacity = p.interpolate({ inputRange: [0, 0.02, 0.9, 1], outputRange: [0, 1, 1, 0] });
  return <Animated.View style={[s.ball, { opacity, transform: [{ translateX }, { translateY }] }]} />;
}

function Hoop() {
  return (
    <View style={s.hoop}>
      <View style={s.board}><View style={s.boardBox} /></View>
      <View style={s.rim} />
      <View style={s.net} />
    </View>
  );
}

export function FreeThrow({ g, now }: { g: Game; now: number }) {
  const left = Math.max(0, FT_LIMIT_MS - (now - g.phaseStart));
  return (
    <View style={[s.screen, SAFE]}>
      <View style={s.header}>
        <Text style={s.title}>🏀 Free Throw</Text>
        <Text style={s.timer}>{clock(left)}</Text>
      </View>
      <View style={s.lanes}>
        {bySlot(g).map((p) => {
          const last = p.shots[p.shots.length - 1];
          return (
            <View key={p.id} style={[s.lane, { borderColor: p.color }]}>
              <Hoop />
              <Ball shot={last} />
              <LiveAvatar id={p.id} slot={p.slot} size={290} dim={!p.connected} />
              <PlayerTag name={p.name} slot={p.slot} color={p.color} />
              <Text style={[s.shotScore, { color: last && last.score >= 70 ? C.ok : C.fg }]}>{last ? last.score : '–'}</Text>
              <Text style={s.tip} numberOfLines={1}>{last ? (last.score >= 90 ? 'Perfect form!' : TIP_TEXT[last.tip]) : 'Shoot when ready'}</Text>
              <View style={s.dots}>
                {Array.from({ length: SHOTS_PER_ROUND }, (_, i) => (
                  <View key={i} style={[s.dot, i < p.shots.length && { backgroundColor: p.shots[i].score >= 70 ? C.ok : C.muted }]} />
                ))}
              </View>
              <Text style={s.total}>Total {score(p, 'free_throw')}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function BootCamp({ g, now }: { g: Game; now: number }) {
  const seg = segment(now - g.phaseStart);
  if (!seg.exercise) {
    return (
      <View style={[s.screen, s.center]}>
        <Text style={s.muted}>Rest · up next</Text>
        <Text style={s.title}>{seg.next ? LABEL[seg.next] : 'Done!'}</Text>
        {seg.next && <DemoAvatar exercise={seg.next} size={380} />}
        <Text style={[s.count, { fontSize: 180 }]}>{Math.ceil(seg.remaining / 1000)}</Text>
      </View>
    );
  }
  return (
    <View style={[s.screen, SAFE]}>
      <View style={s.header}>
        <View style={s.rowCenter}>
          <DemoAvatar exercise={seg.exercise} size={200} />
          <View>
            <Text style={s.muted}>Exercise {seg.index + 1} of 3</Text>
            <Text style={s.title}>{LABEL[seg.exercise]}</Text>
          </View>
        </View>
        <Text style={[s.timer, seg.remaining <= 10_000 && { color: C.accent }]}>{Math.ceil(seg.remaining / 1000)}s</Text>
      </View>
      <View style={s.lanes}>
        {bySlot(g).map((p: Player) => {
          const r = p.reps[seg.exercise!] ?? { good: 0, partial: 0 };
          return (
            <View key={p.id} style={[s.lane, { borderColor: p.color }]}>
              <LiveAvatar id={p.id} slot={p.slot} size={400} dim={!p.connected} />
              <PlayerTag name={p.name} slot={p.slot} color={p.color} />
              <Text style={s.reps}>{r.good + r.partial}</Text>
              <Text style={s.muted}>reps · {r.good} good form</Text>
              <Text style={s.total}>Score {score(p, 'boot_camp')}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function Results({ g, coach, onAgain, onLobby }: { g: Game; coach: string; onAgain: () => void; onLobby: () => void }) {
  const ranked = results(g);
  return (
    <View style={[s.screen, SAFE]}>
      <Text style={s.title}>{ranked[0] ? `🏆 ${ranked[0].name} wins ${LABEL[g.mode!]}!` : 'Round over'}</Text>
      <View style={s.podium}>
        {ranked.map((p) => (
          <View key={p.id} style={[s.result, { borderColor: p.color }, p.rank === 1 && s.winner]}>
            <Text style={s.rank}>#{p.rank}</Text>
            <PlayerTag name={p.name} slot={p.slot} color={p.color} />
            <Text style={s.resultScore}>{p.score}</Text>
            <Text style={s.muted}>{g.mode === 'boot_camp' ? p.highlight : `${p.highlight} · ${p.shots.length} shots`}</Text>
          </View>
        ))}
      </View>
      <View style={s.coachBox}>
        <Text style={s.coachLabel}>🎙️ Coach</Text>
        <Text style={s.coachText}>{coach || 'Coach is reviewing the tape…'}</Text>
      </View>
      <View style={s.modes}>
        <Button label="Play again" onPress={onAgain} preferred style={s.mode} />
        <Button label="Change game" onPress={onLobby} style={s.mode} />
      </View>
    </View>
  );
}

export function Confirm({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  return (
    <View style={s.overlay}>
      <View style={s.dialog}>
        <Text style={s.title}>Quit this round?</Text>
        <Text style={s.body}>Scores from this round will be lost.</Text>
        <View style={s.modes}>
          <Button label="Keep playing" onPress={onNo} preferred />
          <Button label="Quit to lobby" onPress={onYes} />
        </View>
      </View>
    </View>
  );
}

export function Caption({ text, top }: { text: string; top?: boolean }) {
  return (
    <View style={[s.caption, top && s.captionTop]} accessibilityLiveRegion="polite">
      <Text style={s.captionText}>🎙️ {text}</Text>
    </View>
  );
}

export function Debug({ g, net }: { g: Game; net: Net }) {
  const st = latencyStats();
  return (
    <View style={s.debug}>
      <Text style={s.debugText}>relay {net.connected ? 'connected' : 'DOWN'} · room {net.room?.code ?? '-'}</Text>
      {bySlot(g).map((p) => (
        <Text key={p.id} style={s.debugText}>
          P{p.slot + 1} {p.name}: latency p50 {Math.round(st[p.id]?.p50 ?? 0)} ms · p95 {Math.round(st[p.id]?.p95 ?? 0)} ms · n={st[p.id]?.n ?? 0}
        </Text>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  row: { flex: 1, flexDirection: 'row', gap: 48 },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  logo: { color: C.accent, fontSize: 72, fontWeight: '900', letterSpacing: -2 },
  joinCard: { width: 520, backgroundColor: C.panel, borderRadius: 32, padding: 32, alignItems: 'center', gap: 14 },
  code: { color: C.fg, fontSize: 88, fontWeight: '900', letterSpacing: 18 },
  slots: { flex: 1, flexDirection: 'row', gap: 24 },
  slot: { flex: 1, backgroundColor: C.panel, borderRadius: 32, borderWidth: 6, borderColor: C.panel2, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 12 },
  empty: { color: C.muted, fontSize: 36, textAlign: 'center', fontWeight: '700' },
  modes: { flexDirection: 'row', alignItems: 'center', gap: 32, marginTop: 32 },
  mode: { minWidth: 460 },
  title: { color: C.fg, fontSize: 64, fontWeight: '900' },
  body: { color: C.fg, fontSize: 36 },
  muted: { color: C.muted, fontSize: 30 },
  small: { color: C.muted, fontSize: 28 },
  count: { color: C.accent, fontSize: 300, fontWeight: '900' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  timer: { color: C.fg, fontSize: 96, fontWeight: '900' },
  lanes: { flex: 1, flexDirection: 'row', gap: 24 },
  lane: { flex: 1, backgroundColor: C.panel, borderRadius: 32, borderTopWidth: 10, alignItems: 'center', paddingVertical: 12, gap: 4, overflow: 'hidden' },
  shotScore: { fontSize: 80, fontWeight: '900', lineHeight: 88 },
  tip: { color: C.accent, fontSize: 32, fontWeight: '700' },
  dots: { flexDirection: 'row', gap: 12, marginTop: 4 },
  dot: { width: 26, height: 26, borderRadius: 13, borderWidth: 3, borderColor: C.muted },
  total: { color: C.fg, fontSize: 32, fontWeight: '700' },
  reps: { color: C.fg, fontSize: 140, fontWeight: '900', lineHeight: 150 },
  hoop: { alignItems: 'center', height: 120 },
  board: { width: 180, height: 90, borderWidth: 6, borderColor: '#fff', borderRadius: 8, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 8 },
  boardBox: { width: 60, height: 40, borderWidth: 4, borderColor: '#ff6b35' },
  rim: { width: 110, height: 12, borderRadius: 6, backgroundColor: '#ff6b35', marginTop: -6 },
  net: { width: 80, height: 34, borderLeftWidth: 3, borderRightWidth: 3, borderBottomWidth: 3, borderColor: '#ddd', borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  ball: { position: 'absolute', top: 70, width: 56, height: 56, borderRadius: 28, backgroundColor: '#f28c28', borderWidth: 3, borderColor: '#7a3a00', zIndex: 5 },
  podium: { flexDirection: 'row', gap: 24, marginTop: 32 },
  result: { flex: 1, backgroundColor: C.panel, borderRadius: 32, borderTopWidth: 10, padding: 28, gap: 10 },
  winner: { backgroundColor: C.panel2, transform: [{ scale: 1.04 }] },
  rank: { color: C.accent, fontSize: 56, fontWeight: '900' },
  resultScore: { color: C.fg, fontSize: 96, fontWeight: '900' },
  coachBox: { backgroundColor: C.panel, borderRadius: 24, padding: 28, marginTop: 32, borderLeftWidth: 10, borderLeftColor: C.accent },
  coachLabel: { color: C.accent, fontSize: 30, fontWeight: '800' },
  coachText: { color: C.fg, fontSize: 40, fontWeight: '600', marginTop: 8 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center' },
  dialog: { backgroundColor: C.panel, borderRadius: 32, padding: 56, gap: 16, alignItems: 'center' },
  caption: { position: 'absolute', left: 96, right: 96, bottom: 54, backgroundColor: 'rgba(0,0,0,0.85)', borderRadius: 20, padding: 20, borderLeftWidth: 10, borderLeftColor: C.accent },
  captionTop: { top: 40, bottom: undefined, left: 600, right: 600, padding: 14 },
  captionText: { color: C.fg, fontSize: 40, fontWeight: '700' },
  debug: { position: 'absolute', top: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.8)', padding: 16, borderRadius: 12 },
  debugText: { color: '#7CFC00', fontSize: 24, fontFamily: 'monospace' },
});
