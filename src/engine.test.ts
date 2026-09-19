import { describe, it, expect } from "vitest";
import { blank, field, layer, preset } from "./model";
import { generate, mix, sampler, layerSampler, estimate } from "./engine";
describe("deterministic geometry", () => {
  it("repeats seed and changes when seed changes", () => {
    const p = preset(3);
    const a = generate(p);
    expect(generate(p)).toEqual(a);
    p.layers[0].fields[0].seed++;
    expect(generate(p)[0].points).not.toEqual(a[0].points);
  });
  it("all presets fit the generation budget", () => {
    for (let i = 0; i < 7; i++) {
      const p = preset(i);
      expect(estimate(p)).toBeLessThan(50000);
      expect(
        generate(p).reduce((n, l) => n + l.points.length, 0),
      ).toBeGreaterThan(100);
    }
  });
  it("hex grid is equidistant and differs from square", () => {
    const p = blank(),
      l = p.layers[0];
    l.fields = [field("uniform")];
    l.spacing = 24;
    const square = generate(p)[0].points;
    l.grid = "hex";
    const hex = generate(p)[0].points;
    expect(hex.length).toBeGreaterThan(square.length);
    const mid = hex.find((q) => q.x > 300 && q.y > 300)!;
    const distances = hex
      .filter((q) => q !== mid)
      .map((q) => Math.hypot(q.x - mid.x, q.y - mid.y))
      .sort((a, b) => a - b);
    for (let i = 0; i < 6; i++) expect(distances[i]).toBeCloseTo(24);
  });
  it("preserves areas at half strength", () => {
    const p = blank(),
      l = p.layers[0];
    l.min = 0;
    l.max = 20;
    l.fields = [{ ...field("uniform"), strength: 0.5 }];
    expect(generate(p)[0].points[0].size ** 2).toBeCloseTo(200);
  });
  it("empty and hidden fields produce no points", () => {
    const p = blank();
    p.layers[0].fields = [];
    expect(generate(p)[0].points).toEqual([]);
    p.layers[0].visible = false;
    expect(generate(p)).toEqual([]);
  });
  it("rejects excessive geometry", () => {
    const p = blank();
    p.width = 4096;
    p.height = 4096;
    p.layers[0].spacing = 4;
    expect(() => generate(p)).toThrow("50,000");
  });
  it("rotated grids cover all corners", () => {
    const p = blank();
    p.width = 1100;
    p.height = 260;
    const l = p.layers[0];
    l.angle = 47;
    l.spacing = 20;
    l.fields = [field("uniform")];
    const points = generate(p)[0].points;
    for (const [x, y] of [
      [0, 0],
      [1100, 0],
      [0, 260],
      [1100, 260],
    ])
      expect(
        Math.min(...points.map((q) => Math.hypot(q.x - x, q.y - y))),
      ).toBeLessThan(22);
  });
});
describe("fields and blending", () => {
  it("has defined weighted blend behavior", () => {
    expect(mix(0.2, 0.8, "replace", 0.5)).toBeCloseTo(0.5);
    expect(mix(0.2, 0.8, "add", 0.5)).toBeCloseTo(0.6);
    expect(mix(0.2, 0.8, "multiply", 1)).toBeCloseTo(0.16);
    expect(mix(0.2, 0.8, "max", 1)).toBe(0.8);
    expect(mix(0.2, 0.8, "min", 1)).toBe(0.2);
    expect(mix(0.8, 0.8, "add", 1)).toBe(1);
  });
  it("radial center and invert are complementary", () => {
    const p = blank(),
      f = field("radial");
    expect(sampler(f, p)(600, 600)).toBe(1);
    f.invert = true;
    expect(sampler(f, p)(600, 600)).toBe(0);
  });
  it("field order is significant", () => {
    const p = blank(),
      l = layer();
    l.fields = [
      { ...field("uniform"), strength: 0.2 },
      { ...field("uniform"), strength: 0.5, blend: "add" },
    ];
    expect(layerSampler(l, p)(0, 0)).toBeCloseTo(0.7);
    l.fields.reverse();
    expect(layerSampler(l, p)(0, 0)).toBeCloseTo(0.6);
    l.fields[1].blend = "multiply";
    expect(layerSampler(l, p)(0, 0)).toBeCloseTo(0.5);
  });
  it("all field types stay finite in wide canvases", () => {
    const p = blank();
    p.width = 4096;
    p.height = 64;
    for (const kind of [
      "uniform",
      "linear",
      "radial",
      "waves",
      "rings",
      "noise",
    ] as const) {
      const fn = sampler(field(kind), p);
      for (const [x, y] of [
        [0, 0],
        [2000, 32],
        [4096, 64],
      ]) {
        const t = fn(x, y);
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(1);
      }
    }
  });
});
