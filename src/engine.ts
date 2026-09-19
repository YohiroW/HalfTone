import { createNoise2D } from "simplex-noise";
import type { Project, Layer, Field, Blend } from "./model";
export const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
export function seeded(seed: number) {
  let a = seed | 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function mix(a: number, b: number, mode: Blend, w: number) {
  const v =
    mode === "replace"
      ? b
      : mode === "add"
        ? a + b
        : mode === "multiply"
          ? a * b
          : mode === "max"
            ? Math.max(a, b)
            : Math.min(a, b);
  return clamp(a + (v - a) * w);
}
export function sampler(f: Field, p: Pick<Project, "width" | "height">) {
  const noise = createNoise2D(seeded(f.seed)),
    unit = Math.min(p.width, p.height),
    theta = (f.angle * Math.PI) / 180;
  return (x: number, y: number) => {
    const u = (x - f.x * p.width) / unit,
      v = (y - f.y * p.height) / unit;
    const dir = u * Math.cos(theta) + v * Math.sin(theta),
      dist = Math.hypot(u, v),
      scale = Math.max(0.01, f.scale);
    let t = 1;
    if (f.kind === "linear") t = clamp(0.5 + dir / scale);
    if (f.kind === "radial") t = clamp(1 - dist / scale);
    if (f.kind === "waves")
      t =
        0.5 +
        0.5 * Math.sin(2 * Math.PI * ((dir * f.frequency) / scale + f.phase));
    if (f.kind === "rings")
      t =
        0.5 +
        0.5 * Math.cos(2 * Math.PI * ((dist * f.frequency) / scale + f.phase));
    if (f.kind === "noise") {
      let sum = 0,
        total = 0;
      for (let i = 0; i < f.detail; i++) {
        const w = 2 ** -i;
        sum += noise((u / scale) * 2 ** i, (v / scale) * 2 ** i) * w;
        total += w;
      }
      t = clamp(0.5 + (0.5 * sum) / total);
    }
    return f.invert ? 1 - t : t;
  };
}
export function layerSampler(l: Layer, p: Project) {
  const fs = l.fields
    .filter((f) => f.enabled)
    .map((f) => ({ f, fn: sampler(f, p) }));
  return (x: number, y: number) => {
    let t = 0;
    fs.forEach(({ f, fn }, i) => {
      t =
        i === 0
          ? clamp(fn(x, y) * f.strength)
          : mix(t, fn(x, y), f.blend, f.strength);
    });
    return Math.pow(t, l.gamma);
  };
}
export interface Instance {
  x: number;
  y: number;
  size: number;
  rotation: number;
}
// Address randomness by grid cell, not iteration order: expanding the bounds
// or adjusting another channel must not reshuffle existing cells.
export function cellRandom(
  seed: number,
  i: number,
  j: number,
  channel: number,
) {
  let h =
    seed ^
    Math.imul(i, 0x9e3779b1) ^
    Math.imul(j, 0x85ebca77) ^
    Math.imul(channel + 1, 0xc2b2ae3d);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export interface Geometry {
  layer: Layer;
  points: Instance[];
}
function bounds(l: Layer, p: Project) {
  const a = (l.angle * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a),
    cx = p.width / 2,
    cy = p.height / 2;
  const q = [
    [0, 0],
    [p.width, 0],
    [0, p.height],
    [p.width, p.height],
  ].map(([x, y]) => {
    x -= cx;
    y -= cy;
    return [x * c + y * s, -x * s + y * c];
  });
  const jitter = l.jitter?.enabled ? l.jitter : null;
  const pad =
      (l.max * (1 + (jitter?.size ?? 0)) * Math.SQRT2) / 2 +
      l.spacing * (jitter?.position ?? 0),
    dy = l.spacing * (l.grid === "hex" ? Math.sqrt(3) / 2 : 1);
  return {
    c,
    s,
    cx,
    cy,
    dy,
    i0:
      Math.floor(
        (Math.min(...q.map((a) => a[0])) - pad - l.offsetX) / l.spacing,
      ) - 1,
    i1:
      Math.ceil(
        (Math.max(...q.map((a) => a[0])) + pad - l.offsetX) / l.spacing,
      ) + 1,
    j0:
      Math.floor((Math.min(...q.map((a) => a[1])) - pad - l.offsetY) / dy) - 1,
    j1: Math.ceil((Math.max(...q.map((a) => a[1])) + pad - l.offsetY) / dy) + 1,
  };
}
export function estimate(p: Project) {
  return p.layers.reduce((n, l) => {
    if (!l.visible || l.kind === "image") return n;
    const b = bounds(l, p);
    return n + (b.i1 - b.i0 + 1) * (b.j1 - b.j0 + 1);
  }, 0);
}
export function generate(p: Project): Geometry[] {
  const count = estimate(p);
  if (count > 50000)
    throw Error("候选单元超过 50,000 个，请增大网格间距或减少可见图层。");
  return p.layers
    .filter((l): l is Layer => l.visible && l.kind !== "image")
    .map((l) => {
      const b = bounds(l, p),
        sample = layerSampler(l, p),
        points: Instance[] = [];
      if (!l.fields.some((f) => f.enabled)) return { layer: l, points };
      for (let j = b.j0; j <= b.j1; j++)
        for (let i = b.i0; i <= b.i1; i++) {
          const x0 =
              (i + (l.grid === "hex" && Math.abs(j % 2) === 1 ? 0.5 : 0)) *
                l.spacing +
              l.offsetX,
            y0 = j * b.dy + l.offsetY;
          const baseX = b.cx + x0 * b.c - y0 * b.s,
            baseY = b.cy + x0 * b.s + y0 * b.c;
          const jitter = l.jitter?.enabled ? l.jitter : null;
          const random = (channel: number) =>
            cellRandom(jitter?.seed ?? 0, i, j, channel);
          const distance = jitter
            ? Math.sqrt(random(0)) * jitter.position * l.spacing
            : 0;
          const direction = jitter ? random(1) * Math.PI * 2 : 0;
          const x = baseX + Math.cos(direction) * distance,
            y = baseY + Math.sin(direction) * distance;
          // Sample the original grid to preserve the authored field composition.
          const t = sample(baseX, baseY),
            size =
              Math.sqrt(l.min * l.min + t * (l.max * l.max - l.min * l.min)) *
              (jitter ? 1 + (random(2) * 2 - 1) * jitter.size : 1),
            pad = (size * Math.SQRT2) / 2;
          if (
            size > 0.001 &&
            x + pad >= 0 &&
            y + pad >= 0 &&
            x - pad <= p.width &&
            y - pad <= p.height
          )
            points.push({
              x,
              y,
              size,
              rotation: jitter?.rotation
                ? (random(3) * 2 - 1) * jitter.rotation
                : 0,
            });
        }
      return { layer: l, points };
    });
}
