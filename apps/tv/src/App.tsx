import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { BackHandler, useTVEventHandler } from '@amazon-devices/react-native-kepler';
import type { GameMode, RelayToTv } from '@huddle/protocol';
import { LABEL, newGame, reduce, results, score, segment, type Game } from './game';
import { useRelay } from './net';
import { playUrl } from './audio';
import { BootCamp, Caption, Confirm, Countdown, Debug, FreeThrow, Lobby, Results } from './screens';
import { C } from './ui';

export const App = () => {
  const [g, dispatch] = useReducer(reduce, undefined, newGame);
  const [now, setNow] = useState(Date.now());
  const [confirm, setConfirm] = useState(false);
  const [debug, setDebug] = useState(false);
  const [coach, setCoach] = useState('');
  const [caption, setCaption] = useState('');
  const gRef = useRef(g);
  gRef.current = g;

  const onMessage = useCallback((m: RelayToTv) => {
    if (m.type === 'player_joined') dispatch({ type: 'joined', id: m.playerId, name: m.name, color: m.color, slot: m.slot });
    else if (m.type === 'player_left') dispatch({ type: 'left', id: m.playerId, gone: m.gone });
    else if (m.type === 'event') {
      dispatch({ type: 'event', id: m.playerId, event: m.event, now: Date.now() });
      const p = gRef.current.players[m.playerId];
      if (p && m.event.kind === 'shot' && m.event.score >= 90) callout('swish', `Swish! ${m.event.score} for ${p.name}!`);
      if (p && m.event.kind === 'rep' && (p.reps[m.event.exercise]?.good ?? 0) + (p.reps[m.event.exercise]?.partial ?? 0) === 9)
        callout('ten_reps', `10 ${LABEL[m.event.exercise].toLowerCase()}, ${p.name}!`);
    } else if (m.type === 'coach_line') {
      if (gRef.current.phase === 'RESULTS') setCoach(m.text); else setCaption(m.text);
      if (m.audioUrl) playUrl(m.audioUrl);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const net = useRelay(onMessage);
  const lastCallout = useRef(0);
  const callout = (key: string, text: string) => {
    if (Date.now() - lastCallout.current < 3000) return; // keep mid-round callouts from stacking up
    lastCallout.current = Date.now();
    net.send({ type: 'callout', key, text });
  };

  // TV clock drives countdowns, round timers and phase transitions (T3).
  useEffect(() => {
    const i = setInterval(() => { const t = Date.now(); setNow(t); dispatch({ type: 'tick', now: t }); }, 250);
    return () => clearInterval(i);
  }, []);

  // Captions fade after 6 s.
  useEffect(() => {
    if (!caption) return;
    const t = setTimeout(() => setCaption(''), 6000);
    return () => clearTimeout(t);
  }, [caption]);

  // Broadcast game_state on every transition (T1); Boot Camp exercise changes count as transitions.
  const seg = g.phase === 'ROUND' && g.mode === 'boot_camp' ? segment(now - g.phaseStart) : null;
  const exercise = seg?.exercise ?? undefined;
  const stateKey = `${g.phase}|${g.mode}|${g.round}|${exercise}|${net.room?.code}`;
  useEffect(() => {
    net.send({
      type: 'game_state', state: g.phase, mode: g.mode, round: g.round, exercise,
      scores: Object.values(g.players).map((p) => ({ playerId: p.id, name: p.name, score: score(p, g.mode) })),
    });
    if (seg && !seg.exercise && seg.next) callout('next_up', `Rest up! Next: ${LABEL[seg.next]}`);
    if (g.phase === 'RESULTS' && g.mode) {
      setCoach('');
      net.send({
        type: 'round_summary', mode: g.mode,
        players: results(g).map((p) => ({ name: p.name, score: p.score, rank: p.rank, best: p.best, weakest: p.weakest?.slice(0, 24), reps: g.mode === 'boot_camp' ? p.good + p.partial : undefined })),
      });
    }
  }, [stateKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Boot Camp "10 seconds left" callout.
  const lastTen = seg?.exercise && seg.remaining <= 10_000 ? `${g.round}|${seg.exercise}` : '';
  useEffect(() => { if (lastTen) callout('last_ten', 'Ten seconds left, push it!'); }, [lastTen]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = (mode: GameMode) => {
    if (!Object.values(g.players).some((p) => p.connected)) return setCaption('Scan the QR code with a phone to join first!');
    setCaption('');
    dispatch({ type: 'start', mode, now: Date.now() });
  };

  // Back: in a round -> confirm dialog; results -> lobby; lobby -> default (exit app). (T6)
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const phase = gRef.current.phase;
      if (phase === 'LOBBY') return false;
      if (phase === 'RESULTS') { dispatch({ type: 'lobby' }); return true; }
      setConfirm((c) => !c);
      return true;
    });
    return () => sub.remove();
  }, []);

  useTVEventHandler((evt) => {
    if (evt?.eventType === 'menu' && evt.eventKeyAction !== 0) setDebug((d) => !d);
  });

  // Layout is authored on a 1920x1080 canvas and scaled to the device's logical size (the VVD reports 960x540).
  const win = useWindowDimensions();
  const k = Math.min(win.width / 1920, win.height / 1080);
  return (
    <View style={styles.fill}>
    <View style={[styles.root, { left: (win.width - 1920) / 2, top: (win.height - 1080) / 2, transform: [{ scale: k }] }]}>
      {g.phase === 'LOBBY' && <Lobby g={g} net={net} onStart={start} />}
      {g.phase === 'COUNTDOWN' && <Countdown g={g} now={now} />}
      {g.phase === 'ROUND' && g.mode === 'free_throw' && <FreeThrow g={g} now={now} />}
      {g.phase === 'ROUND' && g.mode === 'boot_camp' && <BootCamp g={g} now={now} />}
      {g.phase === 'RESULTS' && <Results g={g} coach={coach} onAgain={() => start(g.mode!)} onLobby={() => dispatch({ type: 'lobby' })} />}
      {caption && g.phase !== 'RESULTS' ? <Caption text={caption} top={g.phase === 'ROUND'} /> : null}
      {confirm && (g.phase === 'ROUND' || g.phase === 'COUNTDOWN') && (
        <Confirm onYes={() => { setConfirm(false); dispatch({ type: 'lobby' }); }} onNo={() => setConfirm(false)} />
      )}
      {debug && <Debug g={g} net={net} />}
    </View>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: C.bg },
  root: { position: 'absolute', width: 1920, height: 1080, backgroundColor: C.bg },
});
