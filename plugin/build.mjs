/**
 * Build the browser half of the Touchline skin.
 *
 * The skin is plain DOM + the existing canvas engine, so the bundle is small:
 * esbuild emits CommonJS with React external, and the result is wrapped in the
 * browser module-loader envelope the Web GUI expects.
 *
 * Usage: node plugin/build.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(here, 'package.json'), 'utf8'));
mkdirSync(resolve(here, '../dist'), { recursive: true });
copyFileSync(resolve(here, '../LICENSE'), resolve(here, 'LICENSE'));

const result = await build({
  entryPoints: [resolve(here, 'src/skin.tsx')],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  loader: { '.css': 'text' },
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});

const code = result.outputFiles[0].text;
const wrapped = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(pkg.name)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${code.replace(/^/gm, '    ')}
    return module.exports;
  },
});
`;
writeFileSync(resolve(here, 'client.js'), wrapped);
console.log(`client bundle: ${Math.round(wrapped.length / 1024)} KiB`);
