/**
 * A MapLibre custom layer that draws every polity's ground for the current year, and animates changes as a tide:
 * gained ground fills outward from the old border in order of distance, lost ground ebbs back toward what remains.
 * The border is not a separate line that jumps ahead — it is derived each frame from the coverage being shown, so
 * the ribbon, the ink hairline and the halo travel with the fill.
 */
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MLMap } from 'maplibre-gl';
import { program, Target, sampler, FULLSCREEN_VS, type GL, type Program } from '../gl';
import * as S from './shaders';
import type { Piece, TerritoryData, Standing, Mesh } from './TerritoryData';

export type Theme = { own: number[]; ownDeep: number[]; ink: number[]; line: number[]; gleam: number[]; neighbourAlpha: number };
export const DEFAULT_THEME: Theme = {
  own: [0.56, 0.12, 0.1], ownDeep: [0.36, 0.05, 0.05], ink: [0.1, 0.08, 0.06], line: [0.9, 0.72, 0.42], gleam: [1.0, 0.84, 0.58], neighbourAlpha: 0.2,
};

const STANDING_CLASS: Record<Standing, number> = { direct: 1, vassal: 2, autonomy: 3, other: -1 };
const FIELD_MAX = 1536;

type State = { pieces: Piece[]; key: string; classes: Map<number, number> };
type Transition = { from: State; to: State; t0: number; duration: number; field?: Field };
type Field = { bbox: [number, number, number, number]; w: number; h: number; max: [number, number]; tide: boolean };

export class TerritoryLayer implements CustomLayerInterface {
  readonly id: string;
  readonly type = 'custom' as const;
  readonly renderingMode = '2d' as const;
  theme = DEFAULT_THEME;

  private map!: MLMap;
  private gl!: GL;
  private progs!: Record<string, Program>;
  private vao!: WebGLVertexArrayObject;
  private buffers = new Map<number, { buf: WebGLBuffer; count: number }>();
  private t!: Record<string, Target>;
  private palette!: WebGLTexture;
  private slots = new Map<number, number>();   // polity → neighbour class id (4..255)
  private seeds: { g: Target; l: Target } | null = null;

  private shown: State = { pieces: [], key: '', classes: new Map() };
  private tr: Transition | null = null;
  private lastMatrix = '';

  private landBuf: { buf: WebGLBuffer; count: number } | null = null;

  constructor(private data: TerritoryData, private land: Mesh, id = 'territory') { this.id = id; }

  /* ---------------- state ---------------- */

  private year = 0;
  private opts = { dependents: true, compare: null as number | null, muted: false };
  private compareState: State | null = null;

  /**
   * Display options. `dependents: false` draws vassals and autonomies as ordinary neighbours; `compare` shows the
   * difference from a baseline year (gains, losses, ground held throughout); `muted` quiets the protagonist's fill
   * so overlays (communities) can be read on it.
   */
  setOptions(o: Partial<TerritoryLayer['opts']>) {
    const prev = this.opts;
    this.opts = { ...prev, ...o };
    if (prev.dependents !== this.opts.dependents) { const y = this.year; this.year = -1; this.shown = { pieces: [], key: '', classes: new Map() }; this.tr = null; this.setYear(y); }
    this.compareState = this.opts.compare === null ? null : this.state(this.data.at(this.opts.compare));
    this.lastMatrix = '';
    this.map?.triggerRepaint();
  }

  /** Show a year. With a duration, changes animate as a tide; without, they snap. */
  setYear(year: number, duration = 0) {
    this.year = year;
    if (this.opts.compare !== null) duration = 0;
    const next = this.state(this.data.at(year));
    const current = this.tr ? this.tr.to : this.shown;
    if (next.key === current.key) return;
    if (this.tr) this.shown = this.tr.to;     // a new change interrupts: settle the old one first
    this.tr = duration > 0 && this.shown.key ? { from: this.shown, to: next, t0: performance.now(), duration } : null;
    if (!this.tr) this.shown = next;
    this.uploadPalette();
    this.map?.triggerRepaint();
  }

  get animating() { return !!this.tr; }
  pieces() { return (this.tr ? this.tr.to : this.shown).pieces; }

  private state(pieces: Piece[]): State {
    const classes = new Map<number, number>();
    for (const p of pieces) {
      const st = !this.opts.dependents && p.standing !== 'direct' ? 'other' : p.standing;
      classes.set(p.geom, STANDING_CLASS[st] > 0 ? STANDING_CLASS[st] : this.slot(p.polity));
    }
    return { pieces, classes, key: pieces.map(p => p.geom + ':' + classes.get(p.geom)).join(',') };
  }

  private slot(polity: number) {
    let s = this.slots.get(polity);
    if (s === undefined) {
      if (this.slots.size >= 252) this.slots.clear();
      s = 4 + this.slots.size;
      this.slots.set(polity, s);
    }
    return s;
  }

  private uploadPalette() {
    if (!this.gl) return;
    const px = new Uint8Array(256 * 4);
    for (const [polity, s] of this.slots) {
      const t = this.data.polities[polity].tint;
      px.set([t[0], t[1], t[2], Math.round(this.theme.neighbourAlpha * 255)], s * 4);
    }
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, this.palette);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
  }

  /* ---------------- lifecycle ---------------- */

  onAdd(map: MLMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.gl = gl as GL;
    const P = (vs: string, fs: string, n: string) => program(this.gl, vs, fs, n);
    this.progs = {
      cls: P(S.POLY_VS, S.CLASS_FS, 'class'), one: P(S.POLY_VS, S.ONE_FS, 'one'),
      init: P(FULLSCREEN_VS, S.JFA_INIT_FS, 'jfa-init'), jfa: P(FULLSCREEN_VS, S.JFA_STEP_FS, 'jfa'),
      dist: P(FULLSCREEN_VS, S.DIST_FS, 'dist'), reduce: P(FULLSCREEN_VS, S.REDUCE_FS, 'reduce'),
      current: P(FULLSCREEN_VS, S.CURRENT_FS, 'current'), blur: P(FULLSCREEN_VS, S.BLUR_FS, 'blur'), shade: P(FULLSCREEN_VS, S.SHADE_FS, 'shade'),
    };
    this.vao = this.gl.createVertexArray()!;
    const G = this.gl, T = (f: 'rgba8' | 'rg16ui', filter?: number) => new Target(G, f, filter);
    this.t = {
      P: T('rgba8', G.NEAREST), N: T('rgba8', G.NEAREST), C: T('rgba8', G.NEAREST), L: T('rgba8', G.NEAREST),
      a1: T('rgba8'), a2: T('rgba8'), b1: T('rgba8'), b2: T('rgba8'),
      fmask: T('rgba8', G.NEAREST), g1: T('rg16ui'), g2: T('rg16ui'), l1: T('rg16ui'), l2: T('rg16ui'),
      dist: T('rgba8', G.NEAREST), r1: T('rgba8', G.NEAREST), r2: T('rgba8', G.NEAREST),
    };
    this.palette = G.createTexture()!;
    G.bindTexture(G.TEXTURE_2D, this.palette);
    G.texParameteri(G.TEXTURE_2D, G.TEXTURE_MIN_FILTER, G.NEAREST);
    G.texParameteri(G.TEXTURE_2D, G.TEXTURE_MAG_FILTER, G.NEAREST);
    this.uploadPalette();
    const buf = G.createBuffer()!;
    G.bindBuffer(G.ARRAY_BUFFER, buf);
    G.bufferData(G.ARRAY_BUFFER, this.land.vertices, G.STATIC_DRAW);
    this.landBuf = { buf, count: this.land.vertices.length / 2 };
  }

  onRemove() {
    const { gl } = this;
    for (const b of this.buffers.values()) gl.deleteBuffer(b.buf);
    if (this.landBuf) gl.deleteBuffer(this.landBuf.buf);
    for (const t of Object.values(this.t)) t.dispose();
    gl.deleteTexture(this.palette);
    gl.deleteVertexArray(this.vao);
  }

  /* ---------------- drawing ---------------- */

  private buffer(geom: number) {
    if (geom === -1) return this.landBuf!;
    let b = this.buffers.get(geom);
    if (!b) {
      const { gl } = this, m = this.data.mesh(geom), buf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, m.vertices, gl.STATIC_DRAW);
      b = { buf, count: m.vertices.length / 2 };
      this.buffers.set(geom, b);
    }
    return b;
  }

  private drawPieces(prog: Program, pieces: Piece[], matrix: Float32Array, classOf?: (p: Piece) => number) {
    const { gl } = this, loc = prog.attrib('a_pos');
    prog.use();
    gl.uniformMatrix4fv(prog.u('u_matrix'), false, matrix);
    gl.bindVertexArray(this.vao);
    gl.enableVertexAttribArray(loc);
    for (const p of pieces) {
      if (classOf) gl.uniform1f(prog.u('u_class'), classOf(p));
      const b = this.buffer(p.geom);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.buf);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, b.count);
    }
  }

  private fullscreen(prog: Program, target: Target | null) {
    const { gl } = this;
    if (target) target.bind();
    gl.bindVertexArray(this.vao);
    gl.disableVertexAttribArray(0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** World-space distance fields for the protagonist's gains and losses of one transition. */
  private buildField(tr: Transition) {
    const { gl } = this;
    const own = (s: State) => s.pieces.filter(p => s.classes.get(p.geom)! <= 3);
    const before = own(tr.from), after = own(tr.to);
    const bk = new Set(before.map(p => p.geom + ':' + tr.from.classes.get(p.geom))), ak = new Set(after.map(p => p.geom + ':' + tr.to.classes.get(p.geom)));
    const changed = [...before.filter(p => !ak.has(p.geom + ':' + tr.from.classes.get(p.geom))), ...after.filter(p => !bk.has(p.geom + ':' + tr.to.classes.get(p.geom)))];
    if (!changed.length) return { bbox: [0, 0, 1, 1], w: 1, h: 1, max: [1, 1], tide: false } as Field;

    let b = [1, 1, 0, 0];
    for (const p of changed) { const m = this.data.mesh(p.geom).bbox; b = [Math.min(b[0], m[0]), Math.min(b[1], m[1]), Math.max(b[2], m[2]), Math.max(b[3], m[3])]; }
    const pad = Math.max(b[2] - b[0], b[3] - b[1]) * 0.06;
    const bbox: Field['bbox'] = [b[0] - pad, b[1] - pad, b[2] - b[0] + 2 * pad, b[3] - b[1] + 2 * pad];
    const scale = FIELD_MAX / Math.max(bbox[2], bbox[3]);
    const w = Math.ceil(bbox[2] * scale), h = Math.ceil(bbox[3] * scale);
    // mercator bbox → clip
    const ortho = new Float32Array([2 / bbox[2], 0, 0, 0, 0, 2 / bbox[3], 0, 0, 0, 0, 1, 0, -1 - 2 * bbox[0] / bbox[2], -1 - 2 * bbox[1] / bbox[3], 0, 1]);

    const t = this.t;
    t.fmask.size(w, h); t.fmask.clear();
    gl.disable(gl.BLEND);
    gl.colorMask(true, false, false, false); this.drawPieces(this.progs.one, before, ortho);
    gl.colorMask(false, true, false, false); this.drawPieces(this.progs.one, after, ortho);
    gl.colorMask(true, true, true, true);

    const flood = (channel: number, a: Target, b2: Target) => {
      a.size(w, h); b2.size(w, h);
      const init = this.progs.init.use();
      sampler(gl, init, 'u_mask', 0, t.fmask.tex);
      gl.uniform1i(init.u('u_channel'), channel);
      this.fullscreen(init, a);
      let src = a, dst = b2;
      const jfa = this.progs.jfa.use();
      for (let step = 1 << Math.ceil(Math.log2(Math.max(w, h)) - 1); step >= 1; step >>= 1) {
        sampler(gl, jfa, 'u_seed', 0, src.tex);
        gl.uniform1i(jfa.u('u_step'), step);
        this.fullscreen(jfa, dst);
        [src, dst] = [dst, src];
      }
      return src;
    };
    const seedG = flood(0, t.g1, t.g2), seedL = flood(1, t.l1, t.l2);

    // the longest distance any changed pixel travels sets the tide's speed
    t.dist.size(w, h);
    const dist = this.progs.dist.use();
    sampler(gl, dist, 'u_mask', 0, t.fmask.tex); sampler(gl, dist, 'u_seedG', 1, seedG.tex); sampler(gl, dist, 'u_seedL', 2, seedL.tex);
    this.fullscreen(dist, t.dist);
    let src = t.dist, dst = t.r1, rw = w, rh = h;
    const red = this.progs.reduce.use();
    while (rw > 16 || rh > 16) {
      rw = Math.ceil(rw / 2); rh = Math.ceil(rh / 2);
      dst.size(rw, rh);
      sampler(gl, red, 'u_src', 0, src.tex);
      this.fullscreen(red, dst);
      src = dst; dst = dst === t.r1 ? t.r2 : t.r1;
    }
    src.bind();
    const px = new Uint8Array(rw * rh * 4);
    gl.readPixels(0, 0, rw, rh, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let mg = 0, ml = 0;
    for (let i = 0; i < px.length; i += 4) { mg = Math.max(mg, px[i] / 255 + px[i + 1] / 255 / 255); ml = Math.max(ml, px[i + 2] / 255 + px[i + 3] / 255 / 255); }
    const diag = Math.hypot(w, h);
    this.seeds = { g: seedG, l: seedL };
    return { bbox, w, h, max: [Math.max(mg * diag, 1), Math.max(ml * diag, 1)], tide: true } as Field;
  }

  prerender(gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput) {
    const G = gl as GL, W = G.drawingBufferWidth, H = G.drawingBufferHeight, t = this.t;
    const matrix = new Float32Array(args.defaultProjectionData.mainMatrix as ArrayLike<number>);
    const now = performance.now();
    const tr = this.tr;
    let p = 1;
    if (tr) {
      if (!tr.field) tr.field = this.buildField(tr);
      p = Math.min(1, (now - tr.t0) / tr.duration);
      if (p >= 1) { this.shown = tr.to; this.tr = null; }
    }
    const to = this.tr ? this.tr.to : this.shown, from = this.compareState ?? (this.tr ? this.tr.from : this.shown);

    G.disable(G.BLEND);
    G.disable(G.DEPTH_TEST);
    G.disable(G.STENCIL_TEST);
    G.disable(G.CULL_FACE);
    G.colorMask(true, true, true, true);

    // class masks (re-drawn when the camera or the state changes)
    const resized = [t.P, t.N, t.C, t.L, t.a1, t.a2].map(x => x.size(W, H)).some(Boolean);
    [t.b1, t.b2].forEach(x => x.size(W / 2, H / 2));
    const mkey = Array.from(matrix).join(',') + from.key + '|' + to.key;
    if (resized || mkey !== this.lastMatrix) {
      this.lastMatrix = mkey;
      for (const [target, s] of [[t.P, from], [t.N, to]] as const) {
        target.clear();
        this.drawPieces(this.progs.cls, s.pieces, matrix, q => s.classes.get(q.geom)!);
      }
      t.L.clear();
      this.drawPieces(this.progs.one, [{ geom: -1, polity: -1, standing: 'other' }], matrix);
    }

    // what is shown now
    const cur = this.progs.current.use();
    sampler(G, cur, 'u_P', 0, t.P.tex); sampler(G, cur, 'u_N', 1, t.N.tex); sampler(G, cur, 'u_L', 4, t.L.tex);
    const f = this.tr?.field;
    G.uniform1i(cur.u('u_tide'), f?.tide ? 1 : 0);
    if (f?.tide) {
      sampler(G, cur, 'u_seedG', 2, this.seeds!.g.tex); sampler(G, cur, 'u_seedL', 3, this.seeds!.l.tex);
      G.uniformMatrix3fv(cur.u('u_screenToMerc'), false, screenToMerc(matrix));
      G.uniform4f(cur.u('u_field'), ...f.bbox);
      G.uniform2f(cur.u('u_fieldSize'), f.w, f.h);
      G.uniform2f(cur.u('u_max'), f.max[0], f.max[1]);
    } else {
      // integer samplers must still point at integer textures
      sampler(G, cur, 'u_seedG', 2, t.g1.tex); sampler(G, cur, 'u_seedL', 3, t.l1.tex);
    }
    G.uniform1f(cur.u('u_t'), this.tr ? easeInOut(p) : 1);
    G.uniform1i(cur.u('u_compare'), this.compareState ? 1 : 0);
    this.fullscreen(cur, t.C);

    // coverage blurs: hairline (full res) and ribbon (half res)
    const dpr = W / this.map.getCanvas().clientWidth || 1;
    // radius = device pixels between taps (9 taps reach ±4 radii)
    const blur = (src: Target, a: Target, b: Target, radius: number) => {
      const bl = this.progs.blur.use();
      sampler(G, bl, 'u_src', 0, src.tex); G.uniform2f(bl.u('u_dir'), radius / W, 0); this.fullscreen(bl, a);
      sampler(G, bl, 'u_src', 0, a.tex); G.uniform2f(bl.u('u_dir'), 0, radius / H); this.fullscreen(bl, b);
    };
    blur(t.C, t.a1, t.a2, 0.45 * dpr);
    blur(t.C, t.b1, t.b2, 3.2 * dpr);
    if (this.tr) this.map.triggerRepaint();
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext) {
    const G = gl as GL, t = this.t, th = this.theme;
    G.viewport(0, 0, G.drawingBufferWidth, G.drawingBufferHeight);
    const sh = this.progs.shade.use();
    sampler(G, sh, 'u_C', 0, t.C.tex); sampler(G, sh, 'u_A', 1, t.a2.tex); sampler(G, sh, 'u_B', 2, t.b2.tex); sampler(G, sh, 'u_palette', 3, this.palette); sampler(G, sh, 'u_L', 4, t.L.tex);
    G.uniform2f(sh.u('u_px'), 1 / t.C.w, 1 / t.C.h);
    G.uniform1f(sh.u('u_dpr'), G.drawingBufferWidth / this.map.getCanvas().clientWidth || 1);
    G.uniform3fv(sh.u('u_own'), th.own); G.uniform3fv(sh.u('u_ownDeep'), th.ownDeep);
    G.uniform3fv(sh.u('u_ink'), th.ink); G.uniform3fv(sh.u('u_line'), th.line); G.uniform3fv(sh.u('u_gleam'), th.gleam);
    G.uniform1i(sh.u('u_compare'), this.compareState ? 1 : 0);
    G.uniform1f(sh.u('u_muted'), this.opts.muted ? 1 : 0);
    G.enable(G.BLEND);
    G.blendFunc(G.ONE, G.ONE_MINUS_SRC_ALPHA);
    G.bindVertexArray(this.vao);
    G.drawArrays(G.TRIANGLES, 0, 3);
    G.bindVertexArray(null);
  }
}

const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

/** Clip-space xy → mercator xy, as a 3×3 affine (the map is never pitched). */
function screenToMerc(m: Float32Array) {
  const proj = (x: number, y: number) => {
    const cx = m[0] * x + m[4] * y + m[12], cy = m[1] * x + m[5] * y + m[13], cw = m[3] * x + m[7] * y + m[15];
    return [cx / cw, cy / cw];
  };
  const o = proj(0, 0), ex = proj(1, 0), ey = proj(0, 1);
  // forward affine: clip = A·merc + o
  const a = ex[0] - o[0], c = ey[0] - o[0], b = ex[1] - o[1], d = ey[1] - o[1], det = a * d - b * c;
  const ia = d / det, ib = -b / det, ic = -c / det, id = a / det;
  // column-major mat3: merc = A⁻¹·(clip − o)
  return new Float32Array([ia, ib, 0, ic, id, 0, -(ia * o[0] + ic * o[1]), -(ib * o[0] + id * o[1]), 1]);
}
