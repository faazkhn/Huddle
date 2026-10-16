import React, { useEffect, useReducer, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from '@amazon-devices/react-native-svg';
import { BONES, puppet } from '@huddle/scoring';
import { meta, SPRITES } from './assets/avatar';
import type { Exercise } from '@huddle/protocol';
import { simPlayer, toLandmarks } from '../../../fixtures/synth';
import { usePose } from './net';

export const C = {
  bg: '#0b1020', panel: '#151c38', panel2: '#1f2850', fg: '#f4f6ff', muted: '#9aa3c7', accent: '#ffb000', ok: '#2ecc71',
};
// 10-foot UI: 5% safe-area margins on a 1920x1080 canvas, body text >= 28.
export const SAFE = { paddingHorizontal: 96, paddingVertical: 54 };

/** Human-like cutout avatar (Blender-rendered sprites rigged to the 33 landmarks; x, y in image-height units). */
export function Avatar({ lm, slot, size = 300, dim = false }: { lm?: number[]; slot: number; size?: number; dim?: boolean }) {
  const w = size * 0.75, h = size;
  if (!lm) return <View style={{ width: w, height: h }} />;
  const sprites = SPRITES[slot % SPRITES.length];
  const z = h * 1.2; // zoom on the body (centred at y = 0.55); raised arms may overflow the box, which reads naturally
  return (
    <View style={{ width: w, height: h, opacity: dim ? 0.3 : 1 }}>
      {puppet(lm, meta).map((p, i) => (
        <Image
          key={i}
          source={sprites[p.part]}
          resizeMode="stretch"
          style={{ position: 'absolute', left: (p.cx - 0.5) * z + w / 2 - (p.w * z) / 2, top: (p.cy - 0.55) * z + h / 2 - (p.h * z) / 2, width: p.w * z, height: p.h * z, transform: [{ rotate: `${p.angle}rad` }] }}
        />
      ))}
    </View>
  );
}

/** White stick-figure pictogram for the Boot Camp "coach" demo. */
function Pictogram({ lm, size }: { lm: number[]; size: number }) {
  const w = size * 0.75, h = size;
  const X = (i: number) => (lm[i * 3] - 0.5) * h + w / 2;
  const Y = (i: number) => lm[i * 3 + 1] * h;
  const head = Math.max(10, Math.hypot(X(11) - X(12), Y(11) - Y(12)) * 0.45);
  return (
    <Svg width={w} height={h}>
      {BONES.map(([a, b]) => (
        <Line key={`${a}-${b}`} x1={X(a)} y1={Y(a)} x2={X(b)} y2={Y(b)} stroke="#fff" strokeWidth={size / 28} strokeLinecap="round" />
      ))}
      <Line x1={(X(11) + X(12)) / 2} y1={(Y(11) + Y(12)) / 2} x2={X(0)} y2={Y(0) + head} stroke="#fff" strokeWidth={size / 28} strokeLinecap="round" />
      <Circle cx={X(0)} cy={Y(0)} r={head} fill="#fff" />
    </Svg>
  );
}

export function LiveAvatar({ id, slot, size, dim }: { id: string; slot: number; size?: number; dim?: boolean }) {
  return <Avatar lm={usePose(id)} slot={slot} size={size} dim={dim} />;
}

/** The "coach" demonstrating an exercise — the same synthetic motion the scoring tests use. */
export function DemoAvatar({ exercise, size = 300 }: { exercise: Exercise; size?: number }) {
  const [sim] = useState(() => simPlayer(1, 3));
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const i = setInterval(force, 50);
    return () => clearInterval(i);
  }, []);
  const lm = toLandmarks(sim({ state: 'ROUND', mode: 'boot_camp', exercise }, Date.now()), () => 0.5, { noise: 0 });
  return <Pictogram lm={lm} size={size} />;
}

export function QR({ qr, size }: { qr: { size: number; bits: string }; size: number }) {
  let d = '';
  for (let i = 0; i < qr.bits.length; i++) if (qr.bits[i] === '1') d += `M${(i % qr.size) + 4} ${Math.floor(i / qr.size) + 4}h1v1h-1z`;
  const n = qr.size + 8;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${n} ${n}`}>
      <Rect x={0} y={0} width={n} height={n} fill="#fff" />
      <Path d={d} fill="#000" />
    </Svg>
  );
}

/** Focusable D-pad button with a large focus ring. */
export function Button({ label, sub, onPress, preferred, style }: { label: string; sub?: string; onPress: () => void; preferred?: boolean; style?: ViewStyle }) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      hasTVPreferredFocus={preferred}
      accessibilityRole="button"
      accessibilityLabel={sub ? `${label}. ${sub}` : label}
      style={[s.btn, focused && s.btnFocus, style]}>
      <Text style={[s.btnText, focused && { color: '#111' }]}>{label}</Text>
      {sub ? <Text style={[s.btnSub, focused && { color: '#222' }]}>{sub}</Text> : null}
    </Pressable>
  );
}

export function PlayerTag({ name, slot, color }: { name: string; slot: number; color: string }) {
  return (
    <View style={s.tag}>
      <View style={[s.swatch, { backgroundColor: color }]} />
      <Text style={s.tagText} numberOfLines={1}>P{slot + 1} · {name}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  btn: { backgroundColor: C.panel2, borderRadius: 24, paddingVertical: 24, paddingHorizontal: 40, borderWidth: 6, borderColor: 'transparent' },
  btnFocus: { backgroundColor: C.accent, borderColor: '#fff', transform: [{ scale: 1.06 }] },
  btnText: { color: C.fg, fontSize: 40, fontWeight: '800' },
  btnSub: { color: C.muted, fontSize: 28, marginTop: 6 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  swatch: { width: 32, height: 32, borderRadius: 8 },
  tagText: { color: C.fg, fontSize: 32, fontWeight: '700', maxWidth: 340 },
});
