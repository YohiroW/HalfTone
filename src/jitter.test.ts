import { describe, it, expect } from "vitest";
import { blank, field } from "./model";
import { generate, cellRandom } from "./engine";
function setup() {
  const p = blank();
  p.width = 320;
  p.height = 320;
  p.layers[0].fields = [field("uniform")];
  p.layers[0].spacing = 32;
  p.layers[0].min = 12;
  p.layers[0].max = 12;
  return p;
}
describe("per-cell random perturbation", () => {
  it("disabled and zero amplitudes preserve original instances", () => {
    const p = setup(),
      original = generate(p);
    p.layers[0].jitter = {
      enabled: true,
      position: 0,
      rotation: 0,
      size: 0,
      seed: 999,
    };
    expect(generate(p)[0].points).toEqual(original[0].points);
    p.layers[0].jitter = {
      enabled: false,
      position: 1,
      rotation: 180,
      size: 1,
      seed: 5,
    };
    expect(generate(p)[0].points).toEqual(original[0].points);
  });
  it("rotation changes only orientation and stays within its range", () => {
    const p = setup(),
      base = generate(p)[0].points;
    p.layers[0].jitter.enabled = true;
    p.layers[0].jitter.rotation = 70;
    const pts = generate(p)[0].points;
    expect(pts.map(({ rotation, ...rest }) => rest)).toEqual(
      base.map(({ rotation, ...rest }) => rest),
    );
    expect(new Set(pts.map((x) => x.rotation)).size).toBeGreaterThan(10);
    for (const q of pts) expect(Math.abs(q.rotation)).toBeLessThanOrEqual(70);
  });
  it("repeats exactly, changes with seed, and preserves other channels", () => {
    const p = setup();
    p.layers[0].jitter = {
      enabled: true,
      position: 0.5,
      rotation: 90,
      size: 0.4,
      seed: 123,
    };
    const a = generate(p)[0].points;
    expect(generate(p)[0].points).toEqual(a);
    p.layers[0].jitter.rotation = 0;
    expect(generate(p)[0].points.map(({ rotation, ...rest }) => rest)).toEqual(
      a.map(({ rotation, ...rest }) => rest),
    );
    p.layers[0].jitter.seed++;
    expect(generate(p)[0].points).not.toEqual(a);
  });
  it("position is bounded by spacing and scale by its percentage", () => {
    const p = setup();
    p.layers[0].jitter = {
      enabled: true,
      position: 0.25,
      rotation: 0,
      size: 0.5,
      seed: 93,
    };
    for (const q of generate(p)[0].points) {
      const bx = 160 + Math.round((q.x - 160) / 32) * 32,
        by = 160 + Math.round((q.y - 160) / 32) * 32;
      expect(Math.hypot(q.x - bx, q.y - by)).toBeLessThanOrEqual(8);
      expect(q.size).toBeGreaterThanOrEqual(6);
      expect(q.size).toBeLessThanOrEqual(18);
    }
  });
  it("expanding generation bounds does not reshuffle shared cells", () => {
    const p = setup();
    p.layers[0].jitter = {
      enabled: true,
      position: 0,
      rotation: 180,
      size: 0.5,
      seed: 98,
    };
    const a = generate(p)[0].points;
    p.layers[0].max = 60;
    const b = generate(p)[0].points;
    for (const q of a) {
      const same = b.find((v) => v.x === q.x && v.y === q.y)!;
      expect(same.rotation).toBe(q.rotation);
      expect(same.size / 60).toBeCloseTo(q.size / 12);
    }
  });
  it("cell hash handles negative indices and independent channels", () => {
    for (const i of [-100, -1, 0, 1, 100]) {
      const values = Array.from({ length: 4 }, (_, c) =>
        cellRandom(618, i, -i, c),
      );
      expect(new Set(values).size).toBe(4);
      for (const v of values) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }
  });
});
