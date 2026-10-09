import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, CACHE } from './paths.ts';

export const WORK = path.join(CACHE, 'work');
fs.mkdirSync(WORK, { recursive: true });

/** Run the mapshaper CLI. Arguments are passed through verbatim. */
export function mapshaper(...args: string[]) {
  execFileSync(path.join(ROOT, 'node_modules/.bin/mapshaper'), ['-quiet', ...args], { stdio: 'inherit' });
}

export const readJSON = <T = any>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8'));
export function writeJSON(file: string, value: unknown, pretty = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, pretty ? 1 : 0) + (pretty ? '\n' : ''));
  const kb = fs.statSync(file).size / 1024;
  console.log(`  → ${path.relative(ROOT, file)} (${kb > 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb.toFixed(0) + ' kB'})`);
}

export const slug = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function step(name: string) { console.log('\n▸ ' + name); }
