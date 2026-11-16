import type { MatchResponse, ScoreboardResponse } from '../types';

let apiBase = '/api';

/** Point the app's data calls at another proxy prefix (the DSH plugin mount). */
export function setApiBase(prefix: string) {
  apiBase = prefix.replace(/\/+$/, '') || '/api';
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, headers: { accept: 'application/json' } });
  if (!response.ok) {
    let detail = '';
    try {
      const body = (await response.json()) as { error?: string; detail?: string };
      detail = body.detail || body.error || '';
    } catch {
      detail = response.statusText;
    }
    throw new Error(detail || `请求失败 (${response.status})`);
  }
  return (await response.json()) as T;
}

export function fetchScoreboard(date: string, signal?: AbortSignal) {
  return getJson<ScoreboardResponse>(`${apiBase}/scoreboard?date=${encodeURIComponent(date)}`, signal);
}

export function fetchMatch(id: string, signal?: AbortSignal) {
  return getJson<MatchResponse>(`${apiBase}/match?id=${encodeURIComponent(id)}`, signal);
}
