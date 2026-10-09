/**
 * Builds every runtime data file under public/data from data/ (editorial) and .cache/ (downloaded sources).
 *
 *   npm run data:fetch   # once: Natural Earth + Cliopatria into .cache/
 *   npm run data         # all steps, or name some: npm run data -- territories
 */
import { buildBasemap } from './basemap.ts';
import { buildTerritories } from './territories.ts';
import { buildRegions } from './regions.ts';

const steps: Record<string, () => void> = { basemap: buildBasemap, territories: buildTerritories, regions: buildRegions };
const wanted = process.argv.slice(2);
const t0 = Date.now();
for (const [name, run] of Object.entries(steps)) if (!wanted.length || wanted.includes(name)) run();
console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
