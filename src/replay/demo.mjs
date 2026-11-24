const SLOTS = [
  [5, 50],
  [18, 18],
  [16, 38],
  [16, 62],
  [18, 82],
  [38, 16],
  [36, 38],
  [36, 62],
  [38, 84],
  [66, 34],
  [66, 66],
];

const round = (value) => Math.round(value * 100) / 100;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function makeDemo(seconds = 30, fps = 10) {
  const frames = [];
  const total = Math.round(seconds * fps);
  for (let f = 0; f < total; f += 1) {
    const t = f / fps;
    const ballX = 50 + 32 * Math.sin(t * 0.11);
    const ballY = 50 + 22 * Math.sin(t * 0.07 + 1);
    const shift = (ballX - 50) * 0.22;

    const place = (slotIndex, side, wobblePhase) => {
      const [sx, sy] = SLOTS[slotIndex];
      const baseX = side === 'home' ? sx : 100 - sx;
      const drift = side === 'home' ? shift : -shift;
      const wobbleX = Math.sin(t * 0.5 + wobblePhase) * 1.4;
      const wobbleY = Math.cos(t * 0.43 + wobblePhase) * 1.8;
      return [clamp(baseX + drift + wobbleX, 2, 98), clamp(sy + (ballY - 50) * 0.08 + wobbleY, 2, 98)];
    };

    for (let i = 0; i < 11; i += 1) {
      const [x, y] = place(i, 'home', i * 0.7);
      frames.push(round(x), round(y));
    }
    for (let i = 0; i < 11; i += 1) {
      const [x, y] = place(i, 'away', i * 0.9 + 1.3);
      frames.push(round(x), round(y));
    }
    frames.push(round(ballX), round(ballY));
  }

  const players = [
    ...Array.from({ length: 11 }, (_, i) => ({
      id: `home-${i}`,
      name: `H${i + 1}`,
      jersey: String(i + 1),
      teamId: 'demo-home',
    })),
    ...Array.from({ length: 11 }, (_, i) => ({
      id: `away-${i}`,
      name: `A${i + 1}`,
      jersey: String(i + 1),
      teamId: 'demo-away',
    })),
  ];

  return {
    id: 'demo',
    title: `合成演示 · ${seconds} 秒`,
    source: 'synthetic',
    fps: fps,
    duration: seconds,
    teams: [
      { id: 'demo-home', name: 'Demo Home', abbr: 'HOM', color: '#3b7dd8' },
      { id: 'demo-away', name: 'Demo Away', abbr: 'AWY', color: '#d8733b' },
    ],
    players,
    hasBall: true,
    frames,
  };
}
