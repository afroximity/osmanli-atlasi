/**
 * Lead images of the Wikipedia articles behind rulers, people and events (Wikimedia Commons), resolved at runtime
 * through the Wikipedia API and preloaded during the prologue.
 */
import { create } from 'zustand';
import { content } from './load';

export type ImageKind = 'sultan' | 'person' | 'event';
type Images = Record<ImageKind, Record<string, string>>;
export const useImages = create<Images>(() => ({ sultan: {}, person: {}, event: {} }));

const SIZE: Record<ImageKind, number> = { sultan: 520, person: 360, event: 720 };
const titlesOf = (kind: ImageKind): [string, string][] =>
  (kind === 'sultan' ? content.rulers : kind === 'person' ? content.people : content.events)
    .filter(x => x.wikipedia).map(x => [x.id, x.wikipedia!]);

async function resolve(titles: string[], size: number) {
  const out: Record<string, string> = {};
  for (let i = 0; i < titles.length; i += 45) {
    const batch = titles.slice(i, i + 45);
    const url = 'https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=thumbnail&redirects=1&format=json&origin=*'
      + `&pithumbsize=${size}&titles=${encodeURIComponent(batch.join('|'))}`;
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 7000);
    const j = await fetch(url, { signal: ctl.signal }).then(r => r.json()).finally(() => clearTimeout(to));
    const q = j.query || {}, alias: Record<string, string> = {}, byTitle: Record<string, string> = {};
    for (const n of [...(q.normalized || []), ...(q.redirects || [])]) alias[n.from] = n.to;
    for (const p of Object.values<any>(q.pages || {})) if (p.thumbnail) byTitle[p.title] = p.thumbnail.source;
    for (const t of batch) { let x = t; for (let k = 0; alias[x] && k < 4; k++) x = alias[x]; if (byTitle[x]) out[t] = byTitle[x]; }
  }
  return out;
}
const preload = (u: string) => new Promise<boolean>(r => { const i = new Image(); i.onload = () => r(true); i.onerror = () => r(false); i.src = u; });

/** Resolve and preload one kind; reports (done, total, ok). Never throws — offline means monograms. */
export async function loadImages(kind: ImageKind, progress: (done: number, total: number, ok: number) => void) {
  const pairs = titlesOf(kind);
  try {
    const urls = await resolve([...new Set(pairs.map(p => p[1]))], SIZE[kind]);
    const todo = pairs.filter(([, t]) => urls[t]);
    let n = 0, ok = 0;
    progress(0, todo.length, 0);
    await Promise.all(todo.map(async ([id, t]) => {
      const good = await preload(urls[t]);
      n++;
      if (good) { ok++; useImages.setState(s => ({ [kind]: { ...s[kind], [id]: urls[t] } }) as Partial<Images>); }
      progress(n, todo.length, ok);
    }));
    return ok;
  } catch {
    progress(1, 1, 0);
    return -1;
  }
}
