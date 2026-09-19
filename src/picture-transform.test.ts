import { describe, it, expect } from "vitest";
import {
  blank,
  pictureLayer,
  fitPicture,
  type Asset,
  type PictureLayer,
} from "./model";
import { resizeHandles, resizePicture } from "./picture-transform";
const asset: Asset = {
  id: "p",
  name: "p.png",
  kind: "png",
  width: 200,
  height: 100,
  data: "",
};
const setup = () => ({ ...pictureLayer(asset, blank()), scaleX: 1, scaleY: 1 });
const handle = (id: string) => resizeHandles.find((h) => h.id === id)!;
function anchor(l: PictureLayer, id: string) {
  const h = handle(id),
    angle = (l.rotation * Math.PI) / 180,
    x = (-h.x * asset.width * l.scaleX) / 2,
    y = (-h.y * asset.height * l.scaleY) / 2;
  return {
    x: l.x + x * Math.cos(angle) - y * Math.sin(angle),
    y: l.y + x * Math.sin(angle) + y * Math.cos(angle),
  };
}
describe("picture resize handles", () => {
  it("side handles change only the corresponding dimension", () => {
    const l = setup(),
      r = { ...l, ...resizePicture(l, asset, handle("e"), 50, 0) };
    expect(r.scaleX).toBe(1.25);
    expect(r.scaleY).toBe(1);
    expect(r.x).toBe(625);
    expect(anchor(r, "e")).toEqual(anchor(l, "e"));
    const n = { ...l, ...resizePicture(l, asset, handle("n"), 0, -50) };
    expect(n.scaleX).toBe(1);
    expect(n.scaleY).toBe(1.5);
    expect(anchor(n, "n")).toEqual(anchor(l, "n"));
  });
  it("corners preserve current aspect, including a previously stretched picture", () => {
    const l = { ...setup(), scaleY: 2 },
      r = { ...l, ...resizePicture(l, asset, handle("se"), 50, 50) };
    expect(r.scaleY / r.scaleX).toBe(2);
    expect(r.scaleX).toBe(1.25);
    expect(anchor(r, "se")).toEqual(anchor(l, "se"));
  });
  it("shift on a side preserves aspect and anchors the opposite midpoint", () => {
    const l = setup(),
      r = { ...l, ...resizePicture(l, asset, handle("w"), -100, 0, true) };
    expect(r.scaleX).toBe(1.5);
    expect(r.scaleY).toBe(1.5);
    expect(anchor(r, "w")).toEqual(anchor(l, "w"));
  });
  it("every opposite anchor is fixed at arbitrary rotations", () => {
    for (const angle of [0, 30, 90, -125])
      for (const h of resizeHandles) {
        const l = { ...setup(), rotation: angle },
          r = { ...l, ...resizePicture(l, asset, h, 37, -21) };
        expect(anchor(r, h.id).x).toBeCloseTo(anchor(l, h.id).x, 9);
        expect(anchor(r, h.id).y).toBeCloseTo(anchor(l, h.id).y, 9);
      }
  });
  it("crossing the anchor does not flip or collapse the picture", () => {
    const l = setup(),
      r = { ...l, ...resizePicture(l, asset, handle("se"), -9999, -9999) };
    expect(r.scaleX).toBeGreaterThan(0);
    expect(r.scaleY).toBeGreaterThan(0);
    expect(r.scaleX / r.scaleY).toBeCloseTo(1);
    expect(anchor(r, "se").x).toBeCloseTo(anchor(l, "se").x);
  });
  it("fit keeps a stretched aspect ratio", () => {
    const l = { ...setup(), scaleY: 2 },
      fit = fitPicture(l, asset, blank());
    expect(fit.scaleY! / fit.scaleX!).toBe(2);
    expect(asset.width * fit.scaleX!).toBe(1200);
    expect(asset.height * fit.scaleY!).toBe(1200);
  });
});
