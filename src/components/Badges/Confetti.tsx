import './badges.css';

const CONFETTI_COLORS = [
  '#f59e0b',
  '#f97316',
  '#fbbf24',
  '#10b981',
  '#ef4444',
  '#ec4899',
  '#14b8a6',
];

/**
 * A lightweight CSS-only confetti burst. Deterministic pseudo-random layout
 * so it renders identically on every mount (no hydration concerns).
 */
export function Confetti({ count = 40 }: { count?: number }) {
  const pieces = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + ((i * 7919) % 100) / 100;
    const distance = 80 + ((i * 37) % 90);
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance - 60;
    const rotation = ((i * 53) % 360) - 180;
    const size = 6 + ((i * 13) % 6);
    const delay = ((i * 29) % 300) / 1000;
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    const round = i % 3 === 0;
    return { dx, dy, rotation, size, delay, color, round, key: i };
  });

  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.key}
          className="confetti__piece"
          style={{
            ['--dx' as string]: `${p.dx}px`,
            ['--dy' as string]: `${p.dy}px`,
            ['--rot' as string]: `${p.rotation}deg`,
            ['--delay' as string]: `${p.delay}s`,
            width: `${p.size}px`,
            height: `${p.size * (p.round ? 1 : 0.6)}px`,
            backgroundColor: p.color,
            borderRadius: p.round ? '50%' : '1px',
          }}
        />
      ))}
    </div>
  );
}
