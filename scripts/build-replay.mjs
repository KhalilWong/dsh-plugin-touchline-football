/**
 * Bundle the replay page script: src/replay/main.ts → public/replay.js.
 * No React, no CSS import — the page ships its own inline styles.
 */
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

await build({
  entryPoints: [path.join(root, 'src/replay/main.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  outfile: path.join(root, 'public/replay.js'),
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});

console.log('✓ public/replay.js');
