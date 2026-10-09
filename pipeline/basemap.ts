/**
 * Physical basemap from Natural Earth 1:10m (public domain).
 * Land is dissolved from admin-1 so that every later clip (territories, regions) shares the exact same coastline.
 */
import path from 'node:path';
import { CACHE, OUT, BBOX } from './paths.ts';
import { mapshaper, step, WORK } from './lib.ts';

const NE = (name: string) => path.join(CACHE, 'ne', name, name + '.shp');
const bbox = `bbox=${BBOX.join(',')}`;
const out = (name: string) => path.join(OUT, 'base', name);

export const LAND = path.join(WORK, 'land.json');
export const ADM1 = path.join(WORK, 'adm1.json');

export function buildBasemap() {
  step('basemap · Natural Earth 1:10m');
  mapshaper('-i', NE('ne_10m_admin_1_states_provinces'), '-clip', bbox, '-simplify', '15%', 'keep-shapes',
    '-filter-fields', 'adm1_code,name,admin', '-o', ADM1, 'format=geojson', 'precision=0.0001',
    '-dissolve2', '-filter-slivers', 'min-area=1km2', '-o', LAND, 'format=geojson', 'precision=0.0001');
  mapshaper('-i', LAND, '-o', out('land.json'), 'format=geojson', 'precision=0.0001');
  mapshaper('-i', NE('ne_10m_lakes'), '-clip', bbox, '-filter', 'scalerank<=8', '-simplify', '20%', 'keep-shapes',
    '-filter-fields', 'name,scalerank', '-o', out('lakes.json'), 'format=geojson', 'precision=0.0001');
  mapshaper('-i', NE('ne_10m_rivers_lake_centerlines'), '-clip', bbox, '-filter', 'featurecla!="Lake Centerline"',
    '-simplify', '25%', '-filter-fields', 'name,scalerank', '-o', out('rivers.json'), 'format=geojson', 'precision=0.0001');
  mapshaper('-i', NE('ne_10m_bathymetry_K_200'), NE('ne_10m_bathymetry_J_1000'), NE('ne_10m_bathymetry_I_2000'), 'combine-files',
    '-merge-layers', 'force', '-clip', bbox, '-simplify', '10%', 'keep-shapes', '-filter-slivers', 'min-area=20km2',
    '-filter-fields', 'depth', '-o', out('bathymetry.json'), 'format=geojson', 'precision=0.001');
  console.log('  → public/data/base/{land,lakes,rivers,bathymetry}.json');
}
