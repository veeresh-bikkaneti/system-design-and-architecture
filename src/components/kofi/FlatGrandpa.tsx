import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

/**
 * The flat 2D animated grandpa for the Ko-fi bench — drawn from the
 * owner's design reference (docs/kofi-grandpa-reference.jpg): flat cap,
 * big round white mustache, peach skin, tan blazer with a white shirt
 * and dark tie, dark trousers, oversized shoes, grey mug with two steam
 * curls. One drawing in every state (the earlier Three.js figure was
 * rejected by the owner — "potato head" — and a flat character can
 * actually hold the reference's likeness at widget size).
 *
 * He walks in from the left of his frame in profile, crosses in front of
 * the bench, and sits; once seated he idles (breathing, blinks, steam),
 * and the once-per-load refill follows: the mug arm rises, a kettle
 * pours, the mug settles back. All motion is CSS keyframes on the SVG
 * groups; the phase machine below only sequences walk → sit → seated →
 * refill and reports `onSeated` exactly once.
 *
 * Under reduced motion there is no walk and no refill: he renders in
 * the seated pose from the start and `onSeated` fires immediately.
 *
 * Phase timings (kept in sync with the keyframes below):
 * walk 2.2s · sit 0.5s · refill starts 0.35s after the sit · refill 3.6s.
 */

const WALK_MS = 2200;
const SIT_MS = 500;
const REFILL_DELAY_MS = 350;
const REFILL_MS = 3600;

/**
 * The refill is once per page load — module scope, so an offline→online
 * remount of the figure cannot replay it. A real page load gets a fresh
 * module and plays it again. It latches when the sit lands and the
 * refill is scheduled, so a mount that unmounts mid-walk does not burn it.
 */
let hasPlayedRefill = false;

type Phase = 'walking' | 'sitting' | 'seated' | 'refilling';

const INK = '#2b2320';

const FIGURE_CSS = `
.fg-x-walking { animation: fg-walk-x 2.2s linear both; }
@keyframes fg-walk-x {
  from { transform: translateX(-178px); }
  to { transform: translateX(0); }
}
.fg-bob-on { animation: fg-bob-k 0.46s ease-in-out infinite; }
@keyframes fg-bob-k {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2.6px); }
}
.fg-leg-swing { transform-box: fill-box; transform-origin: 50% 0; animation: fg-swing 0.46s ease-in-out infinite alternate; }
.fg-leg-swing-b { animation-direction: alternate-reverse; }
@keyframes fg-swing {
  from { transform: rotate(17deg); }
  to { transform: rotate(-17deg); }
}
.fg-fade { transition: opacity 0.3s ease; }
.fg-upper { transition: transform 0.5s ease; transform-box: fill-box; transform-origin: 50% 100%; }
.fg-upper-sat { transform: translateY(4px) rotate(1.5deg); }
.fg-mugarm { transform-box: fill-box; transform-origin: 12% 8%; }
.fg-breathing { transform-box: fill-box; transform-origin: 50% 100%; animation: fg-breath 4.2s ease-in-out infinite; }
@keyframes fg-breath {
  0%, 100% { transform: scaleY(1); }
  50% { transform: scaleY(1.018); }
}
.fg-lid { transform-box: fill-box; transform-origin: 50% 0; animation: fg-blink 5.4s linear infinite; }
@keyframes fg-blink {
  0%, 91%, 100% { transform: scaleY(0); }
  94%, 97% { transform: scaleY(1); }
}
.fg-steam { opacity: 0.55; animation: fg-steam-k 2.8s ease-in-out infinite; }
.fg-steam2 { animation-delay: 1.4s; }
@keyframes fg-steam-k {
  0% { opacity: 0; transform: translateY(2px); }
  35% { opacity: 0.85; }
  100% { opacity: 0; transform: translateY(-3.5px); }
}
.fg-kettle { transform-box: fill-box; transform-origin: 30% 70%; opacity: 0; }
.fg-stream { opacity: 0; }
.fg-refilling .fg-mugarm { animation: fg-mug-raise 3.6s ease-in-out both; }
@keyframes fg-mug-raise {
  0%, 14% { transform: rotate(0deg); }
  30%, 64% { transform: rotate(-17deg) translateY(-2px); }
  82%, 100% { transform: rotate(0deg); }
}
.fg-refilling .fg-kettle { animation: fg-kettle-k 3.6s ease-in-out both; }
@keyframes fg-kettle-k {
  0%, 10% { opacity: 0; transform: translate(62px, -46px) rotate(0deg); }
  20% { opacity: 1; transform: translate(52px, -40px) rotate(0deg); }
  34%, 60% { opacity: 1; transform: translate(52px, -40px) rotate(-19deg); }
  72% { opacity: 1; transform: translate(52px, -40px) rotate(0deg); }
  86%, 100% { opacity: 0; transform: translate(62px, -46px) rotate(0deg); }
}
.fg-refilling .fg-stream { animation: fg-stream-k 3.6s linear both; }
@keyframes fg-stream-k {
  0%, 36% { opacity: 0; }
  42%, 58% { opacity: 0.95; }
  64%, 100% { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .fg-root * { animation: none !important; transition: none !important; }
}
`;

export function FlatGrandpa({ onSeated }: { onSeated: () => void }) {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(reduceMotion ? 'seated' : 'walking');
  const seatedFired = useRef(false);
  const onSeatedRef = useRef(onSeated);
  onSeatedRef.current = onSeated;

  useEffect(() => {
    if (reduceMotion) {
      // Reduced motion: no walk, no refill — he is seated from the
      // start, so the cloud may appear at once.
      if (!seatedFired.current) {
        seatedFired.current = true;
        onSeatedRef.current();
      }
      return;
    }
    let live = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setPhase('sitting'), WALK_MS));
    timers.push(
      setTimeout(() => {
        if (!live) return;
        setPhase('seated');
        if (!seatedFired.current) {
          seatedFired.current = true;
          onSeatedRef.current();
        }
        if (!hasPlayedRefill) {
          hasPlayedRefill = true;
          timers.push(
            setTimeout(() => {
              if (!live) return;
              setPhase('refilling');
              timers.push(setTimeout(() => live && setPhase('seated'), REFILL_MS));
            }, REFILL_DELAY_MS),
          );
        }
      }, WALK_MS + SIT_MS),
    );
    return () => {
      live = false;
      timers.forEach(clearTimeout);
    };
  }, [reduceMotion]);

  const walking = phase === 'walking';
  const sat = phase !== 'walking';

  return (
    <div
      className={`fg-root relative aspect-[230/160] w-full ${phase === 'refilling' ? 'fg-refilling' : ''}`}
      data-phase={phase}
    >
      <style>{FIGURE_CSS}</style>
      <svg viewBox="0 0 230 160" className="h-auto w-full" aria-hidden="true" focusable="false">
        {/* ground shadow */}
        <ellipse cx="120" cy="148" rx="102" ry="6" fill="#1c1917" opacity="0.1" />
        {/* tree, to his left */}
        <path d="M29 147 L35 84 L45 84 L51 147 Z" fill="#6b4a2f" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
        <circle cx="40" cy="48" r="29" fill="#43765f" stroke={INK} strokeWidth="2.4" />
        <circle cx="17" cy="64" r="16" fill="#55856c" stroke={INK} strokeWidth="2.4" />
        <circle cx="63" cy="62" r="18" fill="#386552" stroke={INK} strokeWidth="2.4" />
        {/* bench: back slats, seat, legs (he sits in front of the back) */}
        <rect x="98" y="80" width="126" height="10" rx="3" fill="#9c6b3d" stroke={INK} strokeWidth="2.4" />
        <rect x="98" y="95" width="126" height="10" rx="3" fill="#8a5a33" stroke={INK} strokeWidth="2.4" />
        <rect x="94" y="113" width="130" height="9" rx="3" fill="#9c6b3d" stroke={INK} strokeWidth="2.4" />
        <rect x="104" y="122" width="8" height="25" fill="#4a3a30" stroke={INK} strokeWidth="2" />
        <rect x="206" y="122" width="8" height="25" fill="#4a3a30" stroke={INK} strokeWidth="2" />

        {/* grandpa: hip at local (0,0) = frame (140,112); floor at local y +35 */}
        <g transform="translate(148 112)">
          <g className={walking ? 'fg-x-walking' : undefined}>
            <g className={walking ? 'fg-bob-on' : undefined}>
              {/* seated legs (fade in as he sits) */}
              <g className="fg-fade" opacity={sat ? 1 : 0}>
                <path d="M-3 0 L41 1 L42 9 L-2 9 Z" fill="#17140f" />
                <path d="M36 8 L44 8 L44 29 L36 29 Z" fill="#17140f" />
                <path d="M32 29 L52 29 C55 29 55 35 52 35 L32 35 C29 35 29 29 32 29 Z" fill="#17140f" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
                <path d="M-2 2 L44 3 L45 11 L-1 11 Z" fill="#2e2a26" />
                <path d="M39 10 L47 10 L47 29 L39 29 Z" fill="#2e2a26" />
                <path d="M35 29 L55 29 C58 29 58 35 55 35 L35 35 C32 35 32 29 35 29 Z" fill="#17140f" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
              </g>
              {/* walking legs (swing while he crosses, fade out as he sits) */}
              <g className="fg-fade" opacity={walking ? 1 : 0}>
                <g transform="translate(-3 0)">
                  <g className={walking ? 'fg-leg-swing fg-leg-swing-b' : undefined}>
                    <path d="M-6 0 L5 0 L4 18 L6 28 L2 28 L-1 18 Z" fill="#17140f" />
                    <path d="M0 28 L13 28 C16 28 16 34 13 34 L-2 34 C-4 34 -4 28 0 28 Z" fill="#17140f" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
                  </g>
                </g>
                <g>
                  <g className={walking ? 'fg-leg-swing' : undefined}>
                    <path d="M-6 0 L5 0 L4 18 L6 28 L2 28 L-1 18 Z" fill="#262320" />
                    <path d="M0 28 L13 28 C16 28 16 34 13 34 L-2 34 C-4 34 -4 28 0 28 Z" fill="#17140f" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
                  </g>
                </g>
              </g>

              {/* upper body: drops a few px as he sits */}
              <g className={`fg-upper ${sat ? 'fg-upper-sat' : ''}`}>
                {/* far arm, behind the torso */}
                <path d="M-4 -30 C-12 -20 -13 -8 -9 2" fill="none" stroke="#a87f45" strokeWidth="8" strokeLinecap="round" />
                <circle cx="-9" cy="4" r="4" fill="#f49c4a" stroke={INK} strokeWidth="2" />
                {/* torso: tan blazer, white shirt, dark tie */}
                <g className={sat ? 'fg-breathing' : undefined}>
                  <path d="M-16 6 C-18 -12 -16 -29 -8 -36 C-1 -40 11 -40 16 -36 C21 -32 21 -14 19 6 Z" fill="#c69a5b" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
                  <path d="M6 -38 L16 -36 L15 -9 L6 -13 Z" fill="#ffffff" />
                  <path d="M9.5 -37 L13.5 -37 L12.5 -17 L10 -21 Z" fill="#26221f" />
                </g>
                {/* head, in profile facing right */}
                <g transform="translate(3 -58) scale(1.18)">
                  <ellipse cx="-9" cy="4" rx="6.5" ry="10" transform="rotate(8 -9 4)" fill="#fbfaf7" stroke={INK} strokeWidth="2.2" />
                  <path d="M-12 -13 C-3 -19 7 -18 10 -10 L20 -2 C22 1 19 4 15 4 L15 8 C17 11 14 14 11 13 C10 18 4 21 -3 19 C-11 16 -14 8 -13 -2 C-13 -7 -13 -11 -12 -13 Z" fill="#f49c4a" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
                  <path d="M-7 10 C-3 3 9 2 14 7 C17 12 12 18 4 18 C-3 18 -9 14 -7 10 Z" fill="#fbfaf7" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
                  <circle cx="5" cy="-3" r="2.3" fill={INK} />
                  <rect className="fg-lid" x="1.5" y="-6.5" width="7" height="7" fill="#f49c4a" />
                  <path d="M-14 -11 C-14 -23 -4 -29 5 -28 C13 -27 16 -21 15 -13 L9 -10 C1 -13 -8 -13 -14 -11 Z" fill="#3a2e28" stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
                  <path d="M11 -12 L25 -9 C27 -8.5 26 -5.5 23 -5.8 L10 -8 Z" fill="#2c231e" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
                  <circle cx="0" cy="-28" r="2.2" fill="#2c231e" />
                </g>
                {/* mug arm: shoulder pivot at (10,-32) */}
                <g transform="translate(10 -32)">
                  <g className="fg-mugarm">
                    <path d="M-2 -3 C6 -1 10 6 9 14 L1 16 C-1 8 -2 3 -2 -3 Z" fill="#c69a5b" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
                    <path d="M2 13 C9 17 16 18 22 16 L23 22 C16 24 8 22 1 19 Z" fill="#c69a5b" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
                    <circle cx="25" cy="20" r="4.2" fill="#f49c4a" stroke={INK} strokeWidth="2" />
                    <g transform="translate(25 13)">
                      <rect x="0" y="0" width="15" height="13" rx="2.5" fill="#9a9a96" stroke={INK} strokeWidth="2.4" />
                      <rect x="1.5" y="1.5" width="12" height="3" rx="1.5" fill="#5d4a36" />
                      <path d="M15 3 C20 3 20 10 15 10" fill="none" stroke="#767672" strokeWidth="2.6" />
                      <path className="fg-steam" d="M4 -3 C2 -7 6 -9 4 -13" fill="none" stroke="#cfc9c0" strokeWidth="2" strokeLinecap="round" />
                      <path className="fg-steam fg-steam2" d="M10 -3 C8 -7 12 -9 10 -13" fill="none" stroke="#cfc9c0" strokeWidth="2" strokeLinecap="round" />
                    </g>
                  </g>
                </g>
              </g>
            </g>
          </g>
          {/* kettle + pour stream (refill only; positions are hip-local) */}
          <g className="fg-kettle" transform="translate(52 -40)">
            <path d="M4 0 C6 -7 15 -7 17 0" fill="none" stroke="#8f8f8a" strokeWidth="2.6" />
            <path d="M0 0 L20 0 L23 16 C23 20 20 22 17 22 L3 22 C0 22 -2 20 -2 16 Z" fill="#b9b9b4" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
            <path d="M1 4 L-8 12 L-3 15 L2 9 Z" fill="#8f8f8a" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
            <circle cx="10" cy="-1" r="2.5" fill="#8f8f8a" />
          </g>
          <path className="fg-stream" d="M43 -26 L37 -15" stroke="#38bdf8" strokeWidth="2.4" strokeDasharray="3.5 2.5" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}
