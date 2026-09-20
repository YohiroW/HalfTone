import { describe, expect, it } from "vitest";
import { distanceField, contourWeight } from "./contour";

describe("contour distance and fade", () => {
  it("measures axis and diagonal distance from opaque pixels", () => {
    const alpha = new Uint8ClampedArray(5 * 5 * 4);
    alpha[(2 * 5 + 2) * 4 + 3] = 255;
    const d = distanceField(alpha, 5, 5);
    expect(d[12]).toBe(0);
    expect(d[14]).toBe(2);
    expect(d[6]).toBeCloseTo(Math.SQRT2);
    expect(d[0]).toBeCloseTo(2 * Math.SQRT2);
  });
  it("has bounded fade and rejects empty masks even with no feather", () => {
    expect(contourWeight(10, 10, 40)).toBe(1);
    expect(contourWeight(30, 10, 40)).toBe(0.5);
    expect(contourWeight(50, 10, 40)).toBe(0);
    expect(contourWeight(11, 10, 0)).toBe(0);
    const empty = distanceField(new Uint8ClampedArray(16), 2, 2);
    expect([...empty].every((d) => contourWeight(d, 10, 0) === 0)).toBe(true);
  });
});
