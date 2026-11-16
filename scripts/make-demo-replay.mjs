#!/usr/bin/env node
/**
 * Build a synthetic replay so the replay page works without downloading any
 * external data. Everything is generated here: no provider data, no licensing.
 *
 *   node scripts/make-demo-replay.mjs [--seconds 120] [--fps 10]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

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

const args = { seconds: 120, fps: 10 };
for (let i = 2; i < process.argv.length; i += 1) {
  if (process.argv[i] === '--seconds') args.seconds = Number(process.argv[++i]);
  else if (process.argv[i] === '--fps') args.fps = Number(process.argv[++i]);
}

const round = (value) => Math.round(value * 100) / 100;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const frames = [];
const total = Math.round(args.seconds * args.fps);
for (let f = 0; f < total; f += 1) {
  const t = f / args.fps;
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

const replay = {
  id: 'demo',
  title: `合成演示 · ${args.seconds} 秒`,
  source: 'synthetic',
  fps: args.fps,
  duration: args.seconds,
  teams: [
    { id: 'demo-home', name: 'Demo Home', abbr: 'HOM', color: '#3b7dd8' },
    { id: 'demo-away', name: 'Demo Away', abbr: 'AWY', color: '#d8733b' },
  ],
  players,
  hasBall: true,
  frames,
};

const outDir = path.join(root, 'data/replay');
await mkdir(outDir, { recursive: true });
const file = path.join(outDir, 'demo.json');
await writeFile(file, JSON.stringify(replay));
console.log(`✓ ${file}`);
console.log(`  ${total} 帧 · ${args.seconds} 秒 · ${args.fps} fps · ${(JSON.stringify(replay).length / 1024).toFixed(0)} KB`);
