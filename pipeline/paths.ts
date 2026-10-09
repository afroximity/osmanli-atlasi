import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Editorial source data, edited by hand and versioned. */
export const DATA = path.join(ROOT, 'data');
/** Downloaded third-party datasets (Natural Earth, Cliopatria). Not versioned; `npm run data:fetch` fills it. */
export const CACHE = path.join(ROOT, '.cache');
/** Built artifacts the app loads at runtime. */
export const OUT = path.join(ROOT, 'public', 'data');

/** The atlas frame: everything outside is clipped away. [west, south, east, north] */
export const BBOX = [-25, -2, 75, 62] as const;
