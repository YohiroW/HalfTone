import { type Project, type Layer, type Asset } from "./model";
import { type Geometry } from "./engine";
import { assetImage, assetBox, loadImage } from "./assets";
const pictures = new Map<string, Promise<HTMLImageElement>>();
function picture(data: string) {
  if (!pictures.has(data)) {
    if (pictures.size >= 16) pictures.delete(pictures.keys().next().value!);
    pictures.set(
      data,
      loadImage(data).catch((e) => {
        pictures.delete(data);
        throw e;
      }),
    );
  }
  return pictures.get(data)!;
}
const cache = new Map<string, HTMLCanvasElement>();
async function stamp(a: Asset, color: string, resolution: number) {
  const b = assetBox(a),
    side = Math.max(
      1,
      Math.min(8192, Math.ceil(resolution * (a.kind === "svg" ? 3 : 1))),
    ),
    key = JSON.stringify([a.id, a.data, a.crop, color, side]);
  if (cache.has(key)) return cache.get(key)!;
  const im = await assetImage(a, color),
    c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil((side * b.w) / Math.max(b.w, b.h)));
  c.height = Math.max(1, Math.ceil((side * b.h) / Math.max(b.w, b.h)));
  const ctx = c.getContext("2d")!;
  ctx.drawImage(im, b.x, b.y, b.w, b.h, 0, 0, c.width, c.height);
  if (a.kind === "png") {
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  if (cache.size >= 24) cache.delete(cache.keys().next().value!);
  cache.set(key, c);
  return c;
}
export async function paint(
  canvas: HTMLCanvasElement,
  p: Project,
  geometry: Geometry[],
  width: number,
  height: number,
  forExport = false,
) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, width, height);
  if (!p.transparent) {
    ctx.fillStyle = p.background;
    ctx.fillRect(0, 0, width, height);
  }
  const sx = width / p.width,
    sy = height / p.height,
    temp = document.createElement("canvas");
  temp.width = width;
  temp.height = height;
  const t = temp.getContext("2d")!;
  const byId = new Map(geometry.map((g) => [g.layer.id, g]));
  for (const l of p.layers) {
    if (!l.visible) continue;
    if (l.kind === "image") {
      if (forExport && !l.exportEnabled) continue;
      const a = p.assets.find((a) => a.id === l.assetId);
      if (!a) throw Error("图片素材缺失");
      const im = await picture(a.data);
      ctx.save();
      ctx.setTransform(sx, 0, 0, sy, 0, 0);
      ctx.globalAlpha = l.opacity;
      ctx.globalCompositeOperation =
        l.blend === "normal" ? "source-over" : l.blend;
      ctx.translate(l.x, l.y);
      ctx.rotate((l.rotation * Math.PI) / 180);
      ctx.scale(l.scaleX, l.scaleY);
      ctx.drawImage(im, -a.width / 2, -a.height / 2, a.width, a.height);
      ctx.restore();
      continue;
    }
    const points = byId.get(l.id)?.points ?? [];
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.clearRect(0, 0, width, height);
    t.setTransform(sx, 0, 0, sy, 0, 0);
    t.fillStyle = l.color;
    const a = p.assets.find((a) => a.id === l.assetId),
      im =
        l.shape === "custom" && a
          ? await stamp(
              a,
              l.color,
              l.max *
                (1 + (l.jitter?.enabled ? l.jitter.size : 0)) *
                Math.max(sx, sy),
            )
          : null;
    if (l.shape === "custom" && !im) continue;
    if (im && a) {
      const b = assetBox(a),
        long = Math.max(b.w, b.h);
      for (const point of points) {
        t.save();
        t.translate(point.x, point.y);
        t.rotate(((l.rotation + point.rotation) * Math.PI) / 180);
        const w = (point.size * b.w) / long,
          h = (point.size * b.h) / long;
        t.drawImage(im, -w / 2, -h / 2, w, h);
        t.restore();
      }
    } else {
      t.beginPath();
      for (const pt of points) {
        const s = pt.size / 2;
        if (l.shape === "circle") {
          t.moveTo(pt.x + s, pt.y);
          t.arc(pt.x, pt.y, s, 0, Math.PI * 2);
        } else {
          const angle = ((l.rotation + pt.rotation) * Math.PI) / 180;
          const raw =
            l.shape === "diamond"
              ? [
                  [0, -s],
                  [s, 0],
                  [0, s],
                  [-s, 0],
                ]
              : [
                  [-s, -s],
                  [s, -s],
                  [s, s],
                  [-s, s],
                ];
          raw.forEach(([x, y], i) => {
            const xx = pt.x + x * Math.cos(angle) - y * Math.sin(angle),
              yy = pt.y + x * Math.sin(angle) + y * Math.cos(angle);
            if (i) t.lineTo(xx, yy);
            else t.moveTo(xx, yy);
          });
          t.closePath();
        }
      }
      t.fill();
    }
    ctx.globalAlpha = l.opacity;
    ctx.globalCompositeOperation =
      l.blend === "normal" ? "source-over" : l.blend;
    ctx.drawImage(temp, 0, 0);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}
const esc = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const num = (n: number) => String(+n.toFixed(5));
export async function exportSvg(p: Project, geometry: Geometry[]) {
  const defs: string[] = [],
    groups: string[] = [];
  const byId = new Map(geometry.map((g) => [g.layer.id, g]));
  for (const [index, l] of p.layers.entries()) {
    if (!l.visible) continue;
    if (l.kind === "image") {
      if (!l.exportEnabled) continue;
      const a = p.assets.find((a) => a.id === l.assetId);
      if (!a) throw Error("图片素材缺失");
      groups.push(
        '<g aria-label="' +
          esc(l.name) +
          '" opacity="' +
          l.opacity +
          '" style="mix-blend-mode:' +
          l.blend +
          '"><image href="' +
          esc(a.data) +
          '" x="' +
          -a.width / 2 +
          '" y="' +
          -a.height / 2 +
          '" width="' +
          a.width +
          '" height="' +
          a.height +
          '" transform="translate(' +
          num(l.x) +
          " " +
          num(l.y) +
          ") rotate(" +
          num(l.rotation) +
          ") scale(" +
          num(l.scaleX) +
          " " +
          num(l.scaleY) +
          ')"/></g>',
      );
      continue;
    }
    const points = byId.get(l.id)?.points ?? [];
    const id = "unit-" + index,
      a = p.assets.find((a) => a.id === l.assetId);
    let content = "",
      box = "-0.5 -0.5 1 1";
    if (l.shape === "circle")
      content = '<circle r="0.5" fill="' + l.color + '"/>';
    if (l.shape === "square")
      content =
        '<rect x="-0.5" y="-0.5" width="1" height="1" fill="' + l.color + '"/>';
    if (l.shape === "diamond")
      content = '<path d="M0 -.5 .5 0 0 .5 -.5 0Z" fill="' + l.color + '"/>';
    if (l.shape === "custom" && a) {
      const b = assetBox(a),
        long = Math.max(b.w, b.h);
      if (a.kind === "svg") {
        const d = new DOMParser().parseFromString(
          a.data.replaceAll("currentColor", l.color),
          "image/svg+xml",
        );
        const root = d.documentElement;
        root.setAttribute("x", "0");
        root.setAttribute("y", "0");
        root.setAttribute("width", String(a.width));
        root.setAttribute("height", String(a.height));
        content =
          '<g transform="scale(' +
          1 / long +
          ") translate(" +
          (-b.x - b.w / 2) +
          " " +
          (-b.y - b.h / 2) +
          ')">' +
          new XMLSerializer().serializeToString(root) +
          "</g>";
      } else {
        const img = await stamp(a, l.color, Math.max(b.w, b.h));
        content =
          '<image x="' +
          -b.w / long / 2 +
          '" y="' +
          -b.h / long / 2 +
          '" width="' +
          b.w / long +
          '" height="' +
          b.h / long +
          '" href="' +
          img.toDataURL("image/png") +
          '"/>';
      }
    }
    defs.push(
      '<symbol id="' +
        id +
        '" viewBox="' +
        box +
        '" overflow="visible">' +
        content +
        "</symbol>",
    );
    const uses = points
      .map(
        (pt) =>
          '<use href="#' +
          id +
          '" x="-0.5" y="-0.5" width="1" height="1" transform="translate(' +
          num(pt.x) +
          " " +
          num(pt.y) +
          ") rotate(" +
          num(l.rotation + pt.rotation) +
          ") scale(" +
          num(pt.size) +
          ')"/>',
      )
      .join("");
    groups.push(
      '<g aria-label="' +
        esc(l.name) +
        '" opacity="' +
        l.opacity +
        '" style="mix-blend-mode:' +
        l.blend +
        '">' +
        uses +
        "</g>",
    );
  }
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' +
    p.width +
    '" height="' +
    p.height +
    '" viewBox="0 0 ' +
    p.width +
    " " +
    p.height +
    '" style="isolation:isolate"><title>' +
    esc(p.name) +
    '</title><defs><clipPath id="artboard"><rect width="' +
    p.width +
    '" height="' +
    p.height +
    '"/></clipPath>' +
    defs.join("") +
    '</defs><g clip-path="url(#artboard)">' +
    (!p.transparent
      ? '<rect width="' +
        p.width +
        '" height="' +
        p.height +
        '" fill="' +
        p.background +
        '"/>'
      : "") +
    groups.join("") +
    "</g></svg>"
  );
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportPng(p: Project, g: Geometry[], scale: number) {
  const w = p.width * scale,
    h = p.height * scale;
  if (w > 8192 || h > 8192 || w * h > 16000000)
    throw Error("导出尺寸超出限制。");
  const c = document.createElement("canvas");
  await paint(c, p, g, w, h, true);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
  if (!blob) throw Error("PNG 导出失败。");
  return blob;
}
