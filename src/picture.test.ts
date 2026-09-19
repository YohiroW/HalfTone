import { describe, it, expect } from "vitest";
import {
  blank,
  pictureLayer,
  fitPicture,
  type Asset,
  type Project,
} from "./model";
import { generate, estimate } from "./engine";
const asset: Asset = {
  id: "photo",
  name: "photo.png",
  kind: "png",
  purpose: "picture",
  data: "",
  width: 800,
  height: 400,
};
describe("picture placement", () => {
  it("centers and contains without changing the artboard", () => {
    const p = blank(),
      l = pictureLayer(asset, p);
    expect(l.x).toBe(600);
    expect(l.y).toBe(600);
    expect(l.scaleX).toBe(1.5);
    expect(l.exportEnabled).toBe(true);
    expect(p.width).toBe(1200);
  });
  it("contain stays inside canvas even after rotation", () => {
    const p = blank();
    p.height = 700;
    const l = pictureLayer(asset, p);
    for (const angle of [0, 30, 90, 137]) {
      l.rotation = angle;
      const fitted = fitPicture(l, asset, p),
        a = (angle * Math.PI) / 180,
        w =
          (asset.width * Math.abs(Math.cos(a)) +
            asset.height * Math.abs(Math.sin(a))) *
          fitted.scaleX!,
        h =
          (asset.width * Math.abs(Math.sin(a)) +
            asset.height * Math.abs(Math.cos(a))) *
          fitted.scaleX!;
      expect(w).toBeLessThanOrEqual(p.width + 1e-8);
      expect(h).toBeLessThanOrEqual(p.height + 1e-8);
    }
  });
  it("cover contains every canvas corner in image space", () => {
    const p = blank();
    p.height = 700;
    const l = pictureLayer(asset, p);
    for (const angle of [0, 30, 90, 137]) {
      l.rotation = angle;
      const f = fitPicture(l, asset, p, true),
        a = (angle * Math.PI) / 180;
      for (const [x, y] of [
        [0, 0],
        [1200, 0],
        [0, 700],
        [1200, 700],
      ]) {
        const dx = x - f.x!,
          dy = y - f.y!;
        expect(
          Math.abs(dx * Math.cos(a) + dy * Math.sin(a)),
        ).toBeLessThanOrEqual((asset.width * f.scaleX!) / 2 + 1e-8);
        expect(
          Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)),
        ).toBeLessThanOrEqual((asset.height * f.scaleX!) / 2 + 1e-8);
      }
    }
  });
  it("image layers do not create or count grid geometry", () => {
    const p: Project = blank(),
      old = estimate(p);
    p.layers.push(pictureLayer(asset, p));
    expect(estimate(p)).toBe(old);
    expect(generate(p)).toHaveLength(1);
    p.layers = p.layers.filter((l) => l.kind === "image");
    expect(generate(p)).toEqual([]);
    expect(estimate(p)).toBe(0);
  });
});
