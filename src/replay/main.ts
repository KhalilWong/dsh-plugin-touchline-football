/**
 * Replay page: plays a converted tracking file through the same 2D engine the
 * live window uses, but with per-frame positions from `applyFrame()`.
 *
 * Input: `data/replay/<id>.json` (see src/replay/format.ts), listed by
 * `GET /api/replay/list`. This page only reads local files — no provider calls.
 */
import { MatchEngine, registerTeamColor } from '../lib/engine';
import { clockLabel, createReplayMatch, frameAt, frameCount, replayEnd, advanceReplay, type ReplayFile } from './format';

interface Entry {
  id: string;
  title: string;
  duration: number;
  fps: number;
  hasBall: boolean;
}

const canvas = document.querySelector<HTMLCanvasElement>('#pitch')!;
const painter = canvas.getContext('2d')!;
const titleEl = document.querySelector<HTMLElement>('#title')!;
const sourceEl = document.querySelector<HTMLElement>('#source')!;
const clockEl = document.querySelector<HTMLElement>('#clock')!;
const playEl = document.querySelector<HTMLButtonElement>('#play')!;
const seekEl = document.querySelector<HTMLInputElement>('#seek')!;
const pickEl = document.querySelector<HTMLSelectElement>('#pick')!;
const statusEl = document.querySelector<HTMLElement>('#status')!;

let engine = new MatchEngine();
let replay: ReplayFile | null = null;
let index = 0;
let playing = false;
let speed = 1;
let last = performance.now();
let width = 1;
let height = 1;

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  width = Math.max(1, window.innerWidth);
  height = Math.max(1, window.innerHeight);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
}

function draw(now: number) {
  const dt = Math.max(0, (now - last) / 1000);
  last = now;
  requestAnimationFrame(draw);
  if (!replay || document.hidden) return;

  const total = frameCount(replay);
  if (playing) {
    index = advanceReplay(replay, index, dt, speed);
    if (index >= replayEnd(replay)) {
      playing = false;
      playEl.textContent = '▶';
    }
  }
  const frame = frameAt(replay, index);
  engine.applyFrame(frame);
  engine.draw(painter, width, height, { showNames: false });

  const label = clockLabel(replay, index);
  clockEl.textContent = label;
  if (document.activeElement !== seekEl) seekEl.value = String(Math.floor(index));
  statusEl.textContent = `${Math.floor(index)} / ${total} 帧 · ${replay.fps} fps`;
}

function toggle() {
  if (!replay) return;
  if (!playing && index >= replayEnd(replay)) index = 0;
  last = performance.now();
  playing = !playing;
  playEl.textContent = playing ? '❚❚' : '▶';
}

function load(entry: Entry) {
  statusEl.textContent = '加载中…';
  return fetch(`/data/replay/${encodeURIComponent(entry.id)}.json`)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<ReplayFile>;
    })
    .then((file) => {
      replay = file;
      index = 0;
      last = performance.now();
      playing = true;
      playEl.textContent = '❚❚';
      engine = new MatchEngine();
      engine.setMatch(createReplayMatch(file));
      registerTeamColor(file.teams[0].id, file.teams[0].color);
      registerTeamColor(file.teams[1].id, file.teams[1].color);
      titleEl.textContent = file.title;
      sourceEl.textContent = `${file.source} · ${file.players.length} 名球员 · 球${file.hasBall ? '有' : '无'}坐标`;
      seekEl.max = String(Math.max(1, replayEnd(file)));
      seekEl.value = '0';
    })
    .catch((error) => {
      statusEl.textContent = `加载失败：${error.message}`;
    });
}

async function boot() {
  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { last = performance.now(); });
  playEl.addEventListener('click', toggle);
  seekEl.addEventListener('input', () => {
    last = performance.now();
    index = Number(seekEl.value);
  });
  document.addEventListener('keydown', (event) => {
    if (!replay) return;
    if (event.code === 'Space') {
      event.preventDefault();
      toggle();
    }
    if (event.code === 'ArrowRight') index = Math.min(frameCount(replay!) - 1, index + 25);
    if (event.code === 'ArrowLeft') index = Math.max(0, index - 25);
  });
  pickEl.addEventListener('change', () => {
    const entry = entries.find((item) => item.id === pickEl.value);
    if (entry) void load(entry);
  });
  for (const button of document.querySelectorAll<HTMLButtonElement>('.speeds button')) {
    button.addEventListener('click', () => {
      last = performance.now();
      speed = Number(button.dataset.speed) || 1;
      for (const other of document.querySelectorAll<HTMLButtonElement>('.speeds button')) {
        other.setAttribute('aria-pressed', String(other === button));
      }
    });
  }

  requestAnimationFrame(draw);

  const response = await fetch('/api/replay/list');
  const entries = ((await response.json()) as { replays?: Entry[] }).replays ?? [];
  if (!entries.length) {
    statusEl.textContent = '没有回放文件。先运行 npm run replay:demo 或 npm run data:fetch';
    return;
  }
  for (const entry of entries) {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = `${entry.title}（${Math.round(entry.duration)}s）`;
    pickEl.append(option);
  }
  pickEl.value = entries[0].id;
  void load(entries[0]);
}

void boot();
