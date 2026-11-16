/**
 * Adapter skeleton — copy this file to `my-source.js`, register it in
 * `./index.js`, then set `source: 'my-source'` in the plugin row config.
 *
 * Only wire up feeds you are allowed to use. Scraping an app's private API
 * (懂球帝, 直播吧, SofaScore, FotMob, …) breaks their terms of service and will
 * break this project as soon as they change a field.
 */

export const id = 'my-source';
export const label = 'My Source';

/** Set to false when the feed has no pitch coordinates (scores/events only). */
export const capabilities = { coordinates: true };

/**
 * Matches for one day.
 * @param {string} date YYYYMMDD
 * @returns {Promise<{ date: string, count: number, liveCount: number, matches: any[] }>}
 *   Each match: { id, date, leagueName, status: { state: 'pre'|'in'|'post',
 *   displayClock, clock, ... }, home: Team, away: Team } where Team is
 *   { id, name, shortName, abbr, color, score }.
 */
export async function getScoreboard(date) {
  throw new Error(`my-source has no implementation (${date})`);
}

/**
 * One match, normalized to the shape the client already knows.
 * See `espn.js` for the full normalizer and `src/types.ts` for the type.
 */
export async function getMatch(matchId) {
  throw new Error(`my-source has no implementation (${matchId})`);
}
