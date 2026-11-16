#!/usr/bin/env node
/**
 * Download an open tracking sample and convert it into a replay file.
 *
 *   node scripts/fetch-open-data.mjs --game 1 --minutes 15 --fps 10
 *   node scripts/fetch-open-data.mjs --from ./data/raw/sample-game-1
 *
 * Default source: Metrica Sports' official sample games 1/2 (CSV,
 * 25 fps player and ball tracking + events); see upstream terms and
 * docs/data-sources.md. Nothing here is committed: raw CSVs and converted
 * replays live under `data/` (gitignored).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertSample } from './lib/metrica.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const REPO = 'metrica-sports/sample-data';
const MIRRORS = [
  'https://raw.githubusercontent.com/' + REPO + '/master/data',
];

function parseArgs(argv) {
  const args = { game: 1, minutes: 15, fps: 10 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--full') args.full = true;
    else if (arg === '--game') args.game = Number(next());
    else if (arg === '--minutes') args.minutes = Number(next());
    else if (arg === '--fps') args.fps = Number(next());
    else if (arg === '--from') args.from = next();
    else if (arg === '--mirror') args.mirror = next();
    else if (arg === '--out') args.out = next();
    else if (arg === '--help' || arg === '-h') args.help = true;
  }
  return args;
}

const FILES = (game) => [
  `Sample_Game_${game}/Sample_Game_${game}_RawTrackingData_Home_Team.csv`,
  `Sample_Game_${game}/Sample_Game_${game}_RawTrackingData_Away_Team.csv`,
  `Sample_Game_${game}/Sample_Game_${game}_RawEventsData.csv`,
];

async function download(url, dest) {
  const response = await fetch(url, { signal: AbortSignal.timeout(180000), headers: { 'user-agent': 'Touchline/1.0 (+open-source)' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 1024) throw new Error(`suspiciously small (${buffer.length} B) ${url}`);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buffer);
  return buffer.length;
}

async function ensureRaw(args) {
  const dir = args.from ? path.resolve(args.from) : path.join(root, 'data/raw', `sample-game-${args.game}`);
  const files = FILES(args.game);
  const locals = files.map((file) => path.join(dir, path.basename(file)));

  if (args.from) {
    for (const file of locals) await readFile(file);
    return { dir, files: locals };
  }

  const mirrors = args.mirror ? [args.mirror.replace(/\/+$/, ''), ...MIRRORS] : MIRRORS;
  for (let i = 0; i < files.length; i += 1) {
    let done = false;
    const errors = [];
    for (const mirror of mirrors) {
      const url = `${mirror}/${files[i]}`;
      try {
        const size = await download(url, locals[i]);
        console.log(`  ✓ ${path.basename(locals[i])} (${(size / 1048576).toFixed(1)} MB) ← ${new URL(url).host}`);
        done = true;
        break;
      } catch (error) {
        errors.push(`${new URL(url).host}: ${error.message}`);
      }
    }
    if (!done) {
      throw new Error(
        `无法下载 ${files[i]}\n  ` +
          errors.join('\n  ') +
          `\n\n如果你的网络访问 GitHub 受限（公司证书、代理），可以手动下载这三个 CSV，再执行：\n` +
          `  node scripts/fetch-open-data.mjs --from <包含这三个 CSV 的目录> --game ${args.game}`,
      );
    }
  }
  return { dir, files: locals };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`用法: node scripts/fetch-open-data.mjs [--game 1] [--minutes 15] [--fps 10] [--from DIR] [--mirror URL]
  --game     Metrica CSV 样本场次（1/2；第 3 场 EPTS 格式暂不支持）
  --full     转换完整比赛（含补时，优先于 --minutes）
  --minutes  截取前多少分钟，默认 15
  --fps      输出帧率，默认 10（源数据 25 fps）
  --from     使用本地已下载的三个 CSV 目录，跳过下载
  --mirror   显式指定镜像前缀（默认仅使用官方仓库 raw.githubusercontent.com）`);
    return;
  }

  if (![1, 2].includes(args.game)) throw new Error('CSV importer supports game 1 or 2 only');
  if (!(args.fps > 0 && args.fps <= 25) || !(args.minutes > 0 && args.minutes <= 120)) throw new Error('fps must be 0 < fps <= 25; minutes must be 0 < minutes <= 120');
  console.log(`准备样本：game ${args.game}`);
  const raw = await ensureRaw(args);
  const [homeCsv, awayCsv, eventsCsv] = await Promise.all(
    raw.files.map((file) => readFile(file, 'utf8')),
  );

  const id = `metrica-sample-${args.game}${args.full ? '-full' : ''}`;
  const replay = convertSample({
    homeCsv,
    awayCsv,
    eventsCsv,
    id,
    title: `Metrica 样本 · 第 ${args.game} 场（${args.full ? '整场' : `前 ${args.minutes} 分钟`}）`,
    full: args.full,
    fps: args.fps,
    minutes: args.minutes,
    teams: [
      { id: 'home', name: 'Home', abbr: 'HOM', color: '#3b7dd8' },
      { id: 'away', name: 'Away', abbr: 'AWY', color: '#d8733b' },
    ],
  });

  const outDir = args.out ? path.resolve(args.out) : path.join(root, 'data/replay');
  const outFile = path.join(outDir, `${id}.json`);
  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, JSON.stringify(replay));

  const mb = (JSON.stringify(replay).length / 1048576).toFixed(1);
  console.log(`✓ ${outFile}`);
  console.log(
    `  ${replay.players.length} 名球员 · ${Math.round(replay.duration)} 秒 · ${replay.fps} fps · ${mb} MB · 球${replay.hasBall ? '有' : '无'}坐标`,
  );
  console.log('  打开 http://127.0.0.1:8787/replay 选择这场回放');
}

main().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
});
