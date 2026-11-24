// Local release preparation only: no repository mutation, upload or publication.
import { readFileSync, readdirSync, lstatSync, mkdirSync, mkdtempSync, copyFileSync, writeFileSync } from 'node:fs';
import { resolve, relative, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'plugin/package.json'), 'utf8'));
assert.match(pkg.version, /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/);
assert.equal(pkg.license, 'MIT');
assert.equal(pkg.name, 'dsh-plugin-touchline');
const version = pkg.version;
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });
const archive = join(dist, `${pkg.name}-${version}.tgz`);
const hash = data => createHash('sha256').update(data).digest('hex');
const packageEntries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split(/\r?\n/);
const allowedPackage = /^package\/(?:index\.js|client\.js|package\.json|README\.md|LICENSE|icon\.svg|cordis\.patch\.yml|locale\/(?:en|zh)\.json|host\/sources\/[a-z]+\.js)$/;
for (const entry of packageEntries) {
  assert.match(entry, allowedPackage, `Unexpected install package entry: ${entry}`);
  const packed = execFileSync('tar', ['-xOf', archive, entry], { maxBuffer: 10 * 1024 * 1024 });
  assert.equal(hash(packed), hash(readFileSync(join(root, 'plugin', entry.slice(8)))), `Stale package file: ${entry}`);
}
for (const file of ['index.js', 'client.js', 'package.json', 'LICENSE', 'README.md', 'cordis.patch.yml']) {
  assert.ok(packageEntries.includes(`package/${file}`), `Missing install file: ${file}`);
}
assert.equal(hash(readFileSync(join(root, 'LICENSE'))), hash(readFileSync(join(root, 'plugin/LICENSE'))));

// Explicit roots and extensions: never copy user data or local runtime state.
const roots = ['.github', 'docs', 'plugin', 'public', 'scripts', 'server', 'src', 'tests'];
const files = ['.gitignore', 'README.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'LICENSE',
  'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html'];
const generated = new Set(['plugin/client.js', 'public/replay.js']);
const extensions = /\.(?:md|mjs|js|mts|ts|tsx|css|html|json|yml|yaml|svg)$/;
function visit(dir) {
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const file = `${dir}/${entry.name}`;
    assert.ok(!entry.isSymbolicLink(), `Source symlink requires review: ${file}`);
    if (entry.isDirectory()) {
      assert.ok(!/^(?:node_modules|data|tmp|dist|\.git|\.codex|\.agents)$/.test(entry.name), `Unexpected source directory: ${file}`);
      visit(file);
    } else if (!generated.has(file) && (extensions.test(file) || entry.name === 'LICENSE')) {
      assert.ok(!entry.name.startsWith('.env'), `Environment file excluded: ${file}`);
      files.push(file);
    }
  }
}
roots.forEach(visit);
files.sort();
const sensitive = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|\bAKIA[A-Z0-9]{16}\b/;
const manifest = files.map(file => {
  const source = join(root, file);
  assert.ok(lstatSync(source).isFile(), `Not a regular source file: ${file}`);
  const data = readFileSync(source);
  assert.ok(!sensitive.test(data.toString('utf8')), `Potential credential; review ${file}`);
  return { path: file, bytes: data.length, sha256: hash(data) };
});
for (const file of ['plugin/src/skin.tsx', 'plugin/src/skin.css', 'src/lib/engine.ts', 'plugin/build.mjs', 'package-lock.json']) {
  assert.ok(files.includes(file), `Missing build source: ${file}`);
}
mkdirSync(join(root, 'tmp'), { recursive: true });
const stage = mkdtempSync(join(root, 'tmp', 'release-source-'));
for (const file of files) {
  const dest = join(stage, file);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(root, file), dest);
}
const sourceName = `touchline-source-${version}.tar.gz`;
execFileSync('tar', ['-czf', join(dist, sourceName), '-C', stage, '.']);
const manifestName = `source-manifest-${version}.json`;
writeFileSync(join(dist, manifestName), JSON.stringify({ version, files: manifest }, null, 2) + '\n');
const outputs = [`${pkg.name}-${version}.tgz`, sourceName, manifestName];
writeFileSync(join(dist, `SHA256SUMS-${version}.txt`), outputs.map(name => `${hash(readFileSync(join(dist, name)))}  ${name}`).join('\n') + '\n');
console.log(`PASS: ${packageEntries.length} install files match source; ${files.length} source files archived.`);
console.log(`Release files: ${relative(root, dist)}; source staging: ${relative(root, stage)} (ignored).`);
