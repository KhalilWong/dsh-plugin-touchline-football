/**
 * Data source registry.
 *
 * One adapter per live-data provider. The host plugin takes the source id from
 * its row config (`source: 'espn'`) and falls back to ESPN, so a fork can add
 * its own feed without touching the routes or the browser half.
 *
 * An adapter is a plain ES module exporting:
 *
 *   export const id;                       // stable id, used in config
 *   export const capabilities = { coordinates: boolean };
 *   export const label;                    // human name for docs/UI
 *   export async function getScoreboard(date) // { date, count, liveCount, matches[] }
 *   export async function getMatch(matchId)    // normalized MatchResponse
 *
 * Optional, for sources that carry per-frame tracking:
 *
 *   export async function getFrameStream(matchId) // AsyncIterable<Frame>
 *
 * Frame shape: { t: seconds, ball: {x,y}, players: [{ id?, name?, teamId?, x, y }] }
 * with x/y in 0..100 pitch units. The engine can consume it through
 * `MatchEngine.applyFrame()`. No public source is known to provide live frames,
 * so this is a seam for a licensed or self-built tracker, not a shipped feature.
 */
import * as espn from './espn.js';

const SOURCES = new Map([[espn.id, espn]]);

/** @param {string | undefined} id */
export function getSource(id) {
  return (id && SOURCES.get(id)) || SOURCES.get('espn');
}

export function listSources() {
  return [...SOURCES.values()].map((source) => ({
    id: source.id,
    label: source.label ?? source.id,
    capabilities: source.capabilities ?? { coordinates: false },
  }));
}
