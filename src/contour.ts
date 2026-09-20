import type { Project, Layer, PictureLayer } from "./model";
import type { Geometry } from "./engine";
import { loadImage } from "./assets";

export function attachmentPicture(p: Project, l: Layer) {
  return p.layers.find(
    (v): v is PictureLayer =>
      v.kind === "image" && v.id === l.attachment?.pictureId,
  );
}

// Offsets are in artboard pixels, independent of source rotation and scale.
export function contourPosition(pic: PictureLayer, l: Layer) {
  return {
    x: pic.x + (l.attachment?.offsetX ?? 0),
    y: pic.y + (l.attachment?.offsetY ?? 0),
  };
}

// Two-pass chamfer distance, measured in raster pixels. Empty masks stay infinite.
export function distanceField(alpha: Uint8ClampedArray, w: number, h: number) {
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++)
    d[i] = alpha[i * 4 + 3] >= 128 ? 0 : Infinity;
  const diagonal = Math.SQRT2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x) d[i] = Math.min(d[i], d[i - 1] + 1);
      if (y) {
        d[i] = Math.min(d[i], d[i - w] + 1);
        if (x) d[i] = Math.min(d[i], d[i - w - 1] + diagonal);
        if (x + 1 < w) d[i] = Math.min(d[i], d[i - w + 1] + diagonal);
      }
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (x + 1 < w) d[i] = Math.min(d[i], d[i + 1] + 1);
      if (y + 1 < h) {
        d[i] = Math.min(d[i], d[i + w] + 1);
        if (x) d[i] = Math.min(d[i], d[i + w - 1] + diagonal);
        if (x + 1 < w) d[i] = Math.min(d[i], d[i + w + 1] + diagonal);
      }
    }
  return d;
}

export function contourWeight(
  distance: number,
  spread: number,
  feather: number,
) {
  if (!Number.isFinite(distance)) return 0;
  if (distance <= spread) return 1;
  if (feather <= 0) return 0;
  const t = Math.min(1, (distance - spread) / feather);
  return 1 - t * t * (3 - 2 * t);
}

const distances = new Map<
  string,
  Promise<{
    data: Float32Array;
    w: number;
    h: number;
    scale: number;
    pad: number;
  }>
>();
async function prepareDistance(p: Project, l: Layer) {
  const pic = attachmentPicture(p, l)!;
  const position = contourPosition(pic, l);
  const a = p.assets.find((a) => a.id === pic.assetId);
  if (!a) throw Error("绑定图片素材缺失");
  const pad = Math.ceil(
    l.attachment!.spread + l.attachment!.feather + l.max * 2,
  );
  const key = JSON.stringify([
    a.data,
    p.width,
    p.height,
    position.x,
    position.y,
    pic.scaleX,
    pic.scaleY,
    pic.rotation,
    pad,
  ]);
  if (!distances.has(key)) {
    const pending = (async () => {
      const im = await loadImage(a.data);
      const scale = Math.min(
        1,
        2048 / Math.max(p.width + pad * 2, p.height + pad * 2),
      );
      const c = document.createElement("canvas");
      c.width = Math.ceil((p.width + pad * 2) * scale);
      c.height = Math.ceil((p.height + pad * 2) * scale);
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.scale(scale, scale);
      ctx.translate(pad + position.x, pad + position.y);
      ctx.rotate((pic.rotation * Math.PI) / 180);
      ctx.scale(pic.scaleX, pic.scaleY);
      ctx.drawImage(im, -a.width / 2, -a.height / 2, a.width, a.height);
      const data = distanceField(
        ctx.getImageData(0, 0, c.width, c.height).data,
        c.width,
        c.height,
      );
      return { data, w: c.width, h: c.height, scale, pad };
    })();
    if (distances.size >= 3) distances.delete(distances.keys().next().value!);
    distances.set(key, pending);
    pending.catch(() => {
      if (distances.get(key) === pending) distances.delete(key);
    });
  }
  return distances.get(key)!;
}

// Applied by both export and preview; geometry generation remains synchronous.
export async function attachGeometry(
  p: Project,
  geometry: Geometry[],
): Promise<Geometry[]> {
  return Promise.all(
    geometry.map(async (g) => {
      const config = g.layer.attachment;
      if (!config) return g;
      if (!attachmentPicture(p, g.layer)) return { ...g, points: [] };
      if (config.mode === "inside") return g;
      const { data, w, h, scale, pad } = await prepareDistance(p, g.layer);
      const points = g.points
        .map((point) => {
          const x = (point.x + pad) * scale - 0.5;
          const y = (point.y + pad) * scale - 0.5;
          const ix = Math.floor(x),
            iy = Math.floor(y);
          let distance = Infinity;
          if (ix >= 0 && iy >= 0 && ix + 1 < w && iy + 1 < h) {
            const i = iy * w + ix,
              fx = x - ix,
              fy = y - iy;
            // Avoid Infinity * 0 for completely transparent inputs.
            if (Number.isFinite(data[i]))
              distance =
                ((data[i] * (1 - fx) + data[i + 1] * fx) * (1 - fy) +
                  (data[i + w] * (1 - fx) + data[i + w + 1] * fx) * fy) /
                scale;
          }
          return {
            ...point,
            size:
              point.size *
              Math.sqrt(contourWeight(distance, config.spread, config.feather)),
          };
        })
        .filter((point) => point.size > 0.001);
      return { ...g, points };
    }),
  );
}
