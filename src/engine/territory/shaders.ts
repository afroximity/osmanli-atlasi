/**
 * Shaders of the territory renderer. Pipeline per frame (see TerritoryLayer):
 *
 *   masks     polygons → class id per pixel, for the state we leave (P) and the state we go to (N)
 *   field     once per transition, in world space: jump-flooded distance to the protagonist's ground in P (gains)
 *             and in N (losses), so new ground fills in order of distance from the old border
 *   current   P/N + field + progress → the class shown now, protagonist coverage, and the "front" gleam
 *   blur      coverage blurred twice: a hairline blur for an anti-aliased edge, a wide one for the border ribbon
 *   shade     fills, hatching, ribbon, ink line, halo and neighbour borders, drawn under the relief
 */

export const POLY_VS = `#version 300 es
in vec2 a_pos;
uniform mat4 u_matrix;
void main() { gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0); }`;

/** Writes a class id (0–255) into the red channel. */
export const CLASS_FS = `#version 300 es
precision mediump float;
uniform float u_class;
out vec4 o;
void main() { o = vec4(u_class / 255.0, 0.0, 0.0, 1.0); }`;

/** World-space protagonist mask: colorMask picks which channel (R = before, G = after). */
export const ONE_FS = `#version 300 es
precision mediump float;
out vec4 o;
void main() { o = vec4(1.0); }`;

export const JFA_INIT_FS = `#version 300 es
precision highp float;
uniform sampler2D u_mask;
uniform int u_channel;
out uvec2 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 m = texelFetch(u_mask, p, 0);
  o = (u_channel == 0 ? m.r : m.g) > 0.5 ? uvec2(p) : uvec2(65535u);
}`;

export const JFA_STEP_FS = `#version 300 es
precision highp float;
precision highp usampler2D;
uniform usampler2D u_seed;
uniform int u_step;
out uvec2 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy), size = textureSize(u_seed, 0);
  uvec2 best = uvec2(65535u);
  float bd = 1e20;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    ivec2 q = p + ivec2(i, j) * u_step;
    if (q.x < 0 || q.y < 0 || q.x >= size.x || q.y >= size.y) continue;
    uvec2 s = texelFetch(u_seed, q, 0).xy;
    if (s.x == 65535u) continue;
    float d = distance(vec2(s), vec2(p));
    if (d < bd) { bd = d; best = s; }
  }
  o = best;
}`;

const ENC = `
vec2 enc(float x) { x = clamp(x, 0.0, 1.0) * 255.0; return vec2(floor(x) / 255.0, fract(x)); }
float dec(vec2 v) { return v.x + v.y / 255.0; }`;

/** Distances of changed pixels to the opposite state's ground, normalised by the field diagonal (for the max). */
export const DIST_FS = `#version 300 es
precision highp float;
precision highp usampler2D;
uniform sampler2D u_mask;
uniform usampler2D u_seedG, u_seedL;
out vec4 o;
${ENC}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 m = texelFetch(u_mask, p, 0);
  float diag = length(vec2(textureSize(u_mask, 0)));
  float g = 0.0, l = 0.0;
  if (m.g > 0.5 && m.r < 0.5) { uvec2 s = texelFetch(u_seedG, p, 0).xy; if (s.x != 65535u) g = distance(vec2(s), vec2(p)) / diag; }
  if (m.r > 0.5 && m.g < 0.5) { uvec2 s = texelFetch(u_seedL, p, 0).xy; if (s.x != 65535u) l = distance(vec2(s), vec2(p)) / diag; }
  o = vec4(enc(g), enc(l));
}`;

/** 2×2 max reduction of encoded distances. */
export const REDUCE_FS = `#version 300 es
precision highp float;
uniform sampler2D u_src;
out vec4 o;
${ENC}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) * 2, s = textureSize(u_src, 0) - 1;
  float g = 0.0, l = 0.0;
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
    vec4 v = texelFetch(u_src, min(p + ivec2(i, j), s), 0);
    g = max(g, dec(v.rg)); l = max(l, dec(v.ba));
  }
  o = vec4(enc(g), enc(l));
}`;

const NOISE = `
float h21(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 q) {
  vec2 i = floor(q), f = fract(q); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 q) { return vnoise(q) * 0.55 + vnoise(q * 2.3 + 7.1) * 0.3 + vnoise(q * 5.1 + 3.3) * 0.15; }`;

/**
 * The state shown now. A gained pixel switches when the tide from the old border reaches it; a lost pixel when
 * the ebb toward the remaining border passes it. Everything else crossfades at mid-transition.
 */
export const CURRENT_FS = `#version 300 es
precision highp float;
precision highp usampler2D;
in vec2 v_uv;
uniform sampler2D u_P, u_N, u_L;
uniform usampler2D u_seedG, u_seedL;
uniform bool u_tide;
uniform mat3 u_screenToMerc;
uniform vec4 u_field;        // mercator min.xy, size.xy
uniform vec2 u_fieldSize;    // texels
uniform vec2 u_max;          // max gain / loss distance, texels
uniform float u_t;           // transition progress 0..1
uniform bool u_compare;      // baseline comparison: P is the baseline year
out vec4 o;
${NOISE}
bool own(int c) { return c >= 1 && c <= 3; }
void main() {
  int cp = int(texture(u_P, v_uv).r * 255.0 + 0.5);
  int cn = int(texture(u_N, v_uv).r * 255.0 + 0.5);
  int c = u_t < 0.5 ? cp : cn;
  float front = 0.0;
  bool gain = own(cn) && !own(cp), loss = own(cp) && !own(cn);
  if (u_compare) {
    // blue carries the baseline class so the shade pass can tell gains, losses and ground held throughout
    bool land = texture(u_L, v_uv).r > 0.5;
    o = vec4(float(cn) / 255.0, own(cn) || own(cp) ? 1.0 : 0.0, float(cp) / 255.0, own(cn) || own(cp) || !land ? 1.0 : 0.0);
    return;
  }
  if (u_tide && (gain || loss)) {
    vec2 merc = (u_screenToMerc * vec3(v_uv * 2.0 - 1.0, 1.0)).xy;
    vec2 f = (merc - u_field.xy) / u_field.zw * u_fieldSize;
    ivec2 ft = clamp(ivec2(f), ivec2(0), ivec2(u_fieldSize) - 1);
    float wob = (fbm(merc * 1400.0) - 0.5) * 0.16;
    float at;
    if (gain) {
      uvec2 s = texelFetch(u_seedG, ft, 0).xy;
      float d = s.x == 65535u ? u_max.x : distance(vec2(s), f);
      at = clamp(d / max(u_max.x, 1.0), 0.0, 1.0) * 0.86 + 0.07 + wob;
    } else {
      uvec2 s = texelFetch(u_seedL, ft, 0).xy;
      float d = s.x == 65535u ? u_max.y : distance(vec2(s), f);
      at = (1.0 - clamp(d / max(u_max.y, 1.0), 0.0, 1.0)) * 0.86 + 0.07 + wob;
    }
    c = u_t >= at ? cn : cp;
    front = exp(-pow((u_t - at) / 0.035, 2.0)) * (gain ? 1.0 : 0.6);
  }
  // alpha: the border field — held ground, or sea. Its edge is the land border only, never the coast.
  bool land = texture(u_L, v_uv).r > 0.5;
  o = vec4(float(c) / 255.0, own(c) ? 1.0 : 0.0, front, own(c) || !land ? 1.0 : 0.0);
}`;

/** Separable 9-tap gaussian on the green channel (coverage); blue (front) rides along. */
export const BLUR_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
uniform vec2 u_dir;          // texel step in uv
out vec4 o;
void main() {
  const float w[5] = float[5](0.2270270270, 0.1945945946, 0.1216216216, 0.0540540541, 0.0162162162);
  vec4 s = texture(u_src, v_uv) * w[0];
  for (int i = 1; i < 5; i++) {
    s += texture(u_src, v_uv + u_dir * float(i)) * w[i];
    s += texture(u_src, v_uv - u_dir * float(i)) * w[i];
  }
  o = s;
}`;

/**
 * Final colour, premultiplied, drawn under the hillshade so relief reads through every fill.
 * Protagonist: wash + deeper ribbon along the inside of the border + ink hairline + soft outer halo.
 * Dependants: lighter wash with hatching. Neighbours: faint tint and a thin ink border.
 */
export const SHADE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_C, u_A, u_B, u_L, u_palette;
uniform vec2 u_px;           // one device pixel in uv
uniform float u_dpr;
uniform vec3 u_own, u_ownDeep, u_ink, u_line, u_gleam;
uniform bool u_compare;
uniform float u_muted;
out vec4 o;
int cls(vec2 uv) { return int(texture(u_C, uv).r * 255.0 + 0.5); }
bool land(vec2 uv) { return texture(u_L, uv).r > 0.5; }
bool own(int c) { return c >= 1 && c <= 3; }
void main() {
  vec4 C = texture(u_C, v_uv), A = texture(u_A, v_uv), B = texture(u_B, v_uv);
  int c = int(C.r * 255.0 + 0.5);
  bool here = land(v_uv);
  float cov = A.g;             // anti-aliased protagonist coverage (for the fill)
  float edgeF = A.a;           // anti-aliased border field: held ground or sea
  float wideF = B.a;           // wide blur of the border field: < 1 near a land border
  float wideOwn = B.g;         // wide blur of coverage: > 0 just outside the border
  float front = u_compare ? 0.0 : max(C.b, B.b * 0.8);
  vec2 fc = gl_FragCoord.xy / u_dpr;
  int cp = int(C.b * 255.0 + 0.5);

  vec3 col = vec3(0.0); float a = 0.0;
  if (c >= 4) { vec4 t = texelFetch(u_palette, ivec2(c, 0), 0); col = t.rgb; a = t.a; }

  // thin ink between polities, on land only (coasts are the basemap's)
  vec2 dx = vec2(u_px.x, 0.0), dy = vec2(0.0, u_px.y);
  int n[4] = int[4](cls(v_uv + dx), cls(v_uv - dx), cls(v_uv + dy), cls(v_uv - dy));
  bool l4[4] = bool[4](land(v_uv + dx), land(v_uv - dx), land(v_uv + dy), land(v_uv - dy));
  float polityEdge = 0.0, innerEdge = 0.0;
  for (int i = 0; i < 4; i++) {
    if (!here || !l4[i] || n[i] == c) continue;
    if (own(c) && own(n[i])) innerEdge = 1.0;
    else if (!own(c) && !own(n[i])) polityEdge = 1.0;
  }
  if (polityEdge > 0.0) { col = mix(col, u_ink, 0.7); a = max(a, 0.55); }

  if (u_compare && cov > 0.0) {
    // toprak hareketleri: gold where gained, hatched crimson where lost, quiet where held throughout
    bool was = own(cp), is = own(c);
    vec3 base = is && !was ? vec3(0.85, 0.62, 0.3) : u_own;
    float wash = is && !was ? 0.72 : is ? 0.26 : 0.12;
    if (was && !is) wash += mod(fc.x + fc.y, 6.0) < 1.6 ? 0.6 : 0.0;
    float ribbon = smoothstep(0.985, 0.6, wideF);
    wash = mix(wash, wash + 0.25, ribbon);
    col = mix(col, base, cov);
    a = mix(a, wash, cov);
  } else if (cov > 0.0) {
    float wash = c == 2 ? 0.14 : c == 3 ? 0.3 : 0.5;
    vec3 base = mix(u_own, vec3(0.23, 0.2, 0.17), u_muted);
    // dependants: hatching in screen space, so it stays fine at every zoom
    if (c == 2) wash += mod(fc.x + fc.y, 7.0) < 2.0 ? 0.45 : 0.0;
    if (c == 3) wash += mod(fc.x - fc.y, 6.0) < 1.3 ? 0.3 : 0.0;
    // ribbon: a deeper band hugging the inside of every land border, like a hand-painted wash
    float ribbon = smoothstep(0.985, 0.6, wideF);
    base = mix(base, mix(u_ownDeep, vec3(0.16, 0.14, 0.12), u_muted), ribbon);
    wash = mix(wash, c == 1 ? 0.88 : 0.6, ribbon);
    // dashed line where direct rule meets a dependant
    if (innerEdge > 0.0 && mod(fc.x + fc.y, 8.0) < 4.5) { base = mix(base, u_line, 0.7); wash = max(wash, 0.8); }
    col = mix(col, base, cov);
    a = mix(a, wash, cov);
  }
  // soft shadow just outside the border, on land
  float halo = here ? (1.0 - cov) * smoothstep(0.0, 0.45, wideOwn) * 0.5 : 0.0;
  col = mix(col, vec3(0.03, 0.02, 0.015), halo / max(a + halo, 1e-3));
  a = a + halo * (1.0 - a);
  // gilt hairline exactly on the land border
  float line = 1.0 - clamp(abs(edgeF - 0.5) / max(fwidth(edgeF) * 1.1, 1e-3), 0.0, 1.0);
  line *= step(0.02, A.g + wideOwn);          // only borders of the protagonist
  col = mix(col, u_line, line * 0.92);
  a = max(a, line * 0.92);
  // the moving front carries a little warm light
  col = mix(col, u_gleam, front * 0.45);
  a = max(a, front * 0.45);
  o = vec4(col * a, a);
}`;
