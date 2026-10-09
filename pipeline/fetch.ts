/**
 * Downloads the third-party sources into .cache/ (skips what is already there).
 *   Natural Earth 1:10m (public domain) · Seshat Cliopatria (CC BY 4.0)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CACHE } from './paths.ts';

const NE = [
  'cultural/ne_10m_admin_1_states_provinces', 'physical/ne_10m_lakes', 'physical/ne_10m_rivers_lake_centerlines',
  'physical/ne_10m_bathymetry_K_200', 'physical/ne_10m_bathymetry_J_1000', 'physical/ne_10m_bathymetry_I_2000',
];
const CLIOPATRIA = 'https://github.com/Seshat-Global-History-Databank/cliopatria/raw/main/cliopatria.geojson.zip';

async function download(url: string, file: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}
const unzip = (zip: string, dir: string) => execFileSync('unzip', ['-oq', zip, '-d', dir]);

fs.mkdirSync(path.join(CACHE, 'ne'), { recursive: true });
for (const layer of NE) {
  const name = path.basename(layer), dir = path.join(CACHE, 'ne', name);
  if (fs.existsSync(path.join(dir, name + '.shp'))) continue;
  console.log('Natural Earth', name);
  const zip = dir + '.zip';
  await download(`https://naciscdn.org/naturalearth/10m/${layer}.zip`, zip);
  unzip(zip, dir);
}
const clio = path.join(CACHE, 'cliopatria.geojson');
if (!fs.existsSync(clio)) {
  console.log('Cliopatria');
  const zip = path.join(CACHE, 'cliopatria.zip'), tmp = path.join(CACHE, 'cliopatria');
  await download(CLIOPATRIA, zip);
  unzip(zip, tmp);
  const file = fs.readdirSync(tmp).find(f => f.endsWith('.geojson'));
  if (!file) throw new Error('no .geojson in the Cliopatria archive');
  fs.renameSync(path.join(tmp, file), clio);
  fs.rmSync(tmp, { recursive: true });
}
console.log('sources ready in .cache/');
