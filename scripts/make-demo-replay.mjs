#!/usr/bin/env node
/**
 * Build a synthetic replay so the replay page works without downloading any
 * external data. Everything is generated here: no provider data, no licensing.
 *
 *   node scripts/make-demo-replay.mjs [--seconds 120] [--fps 10]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { makeDemo } from '../src/replay/demo.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const args = { seconds: 120, fps: 10 };
for (let i = 2; i < process.argv.length; i += 1) {
  if (process.argv[i] === '--seconds') args.seconds = Number(process.argv[++i]);
  else if (process.argv[i] === '--fps') args.fps = Number(process.argv[++i]);
}

const replay = makeDemo(args.seconds, args.fps);
const outDir = path.join(root, 'data/replay');
await mkdir(outDir, { recursive: true });
const file = path.join(outDir, 'demo.json');
await writeFile(file, JSON.stringify(replay));
console.log(`✓ ${file}`);
console.log(`  ${Math.round(replay.duration * replay.fps)} 帧 · ${args.seconds} 秒 · ${args.fps} fps · ${(JSON.stringify(replay).length / 1024).toFixed(0)} KB`);
