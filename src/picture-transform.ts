import type { Asset, PictureLayer } from "./model";

export const resizeHandles = [
  { id: "nw", x: -1, y: -1, label: "左上角" },
  { id: "n", x: 0, y: -1, label: "上边" },
  { id: "ne", x: 1, y: -1, label: "右上角" },
  { id: "e", x: 1, y: 0, label: "右边" },
  { id: "se", x: 1, y: 1, label: "右下角" },
  { id: "s", x: 0, y: 1, label: "下边" },
  { id: "sw", x: -1, y: 1, label: "左下角" },
  { id: "w", x: -1, y: 0, label: "左边" },
] as const;
export type ResizeHandle = (typeof resizeHandles)[number];

/** Delta is measured in artboard coordinates; the opposite handle stays fixed. */
export function resizePicture(
  l: PictureLayer,
  a: Asset,
  h: ResizeHandle,
  dx: number,
  dy: number,
  keepRatio = false,
): Partial<PictureLayer> {
  const theta = (l.rotation * Math.PI) / 180,
    c = Math.cos(theta),
    s = Math.sin(theta);
  const localX = dx * c + dy * s,
    localY = -dx * s + dy * c;
  const width = a.width * l.scaleX,
    height = a.height * l.scaleY;
  const minW = Math.max(0.5, a.width * 0.0001),
    minH = Math.max(0.5, a.height * 0.0001);
  const maxW = Math.min(1000000, a.width * 10000),
    maxH = Math.min(1000000, a.height * 10000);
  const clamp = (n: number, min: number, max: number) =>
    Math.max(min, Math.min(max, n));
  let w = width,
    hgt = height;
  if (keepRatio || (h.x !== 0 && h.y !== 0)) {
    const factor =
      h.x !== 0 && h.y !== 0
        ? ((width + h.x * localX) * width + (height + h.y * localY) * height) /
          (width * width + height * height)
        : h.x !== 0
          ? (width + h.x * localX) / width
          : (height + h.y * localY) / height;
    const bounded = clamp(
      factor,
      Math.max(minW / width, minH / height),
      Math.min(maxW / width, maxH / height),
    );
    w = width * bounded;
    hgt = height * bounded;
  } else {
    if (h.x !== 0) w = clamp(width + h.x * localX, minW, maxW);
    if (h.y !== 0) hgt = clamp(height + h.y * localY, minH, maxH);
  }
  const shiftX = (h.x * (w - width)) / 2,
    shiftY = (h.y * (hgt - height)) / 2;
  return {
    x: l.x + shiftX * c - shiftY * s,
    y: l.y + shiftX * s + shiftY * c,
    scaleX: w / a.width,
    scaleY: hgt / a.height,
  };
}
export function resizeCursor(h: ResizeHandle, rotation: number) {
  const angle = (Math.atan2(h.y, h.x) * 180) / Math.PI + rotation;
  return ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"][
    ((Math.round(angle / 45) % 4) + 4) % 4
  ];
}
