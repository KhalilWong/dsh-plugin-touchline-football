/**
 * Standalone-site shim: the ESPN normalizer lives with the DSH plugin's data
 * sources so the two surfaces cannot drift apart. The Express server only
 * needs the two entry points below.
 */
export { getMatch, getScoreboard } from '../plugin/host/sources/espn.js';
