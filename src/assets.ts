import DOMPurify from "dompurify";
import { uid, type Asset } from "./model";
const tags = [
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "title",
  "desc",
];
const attrs = [
  "xmlns",
  "viewBox",
  "width",
  "height",
  "x",
  "y",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x1",
  "x2",
  "y1",
  "y2",
  "points",
  "d",
  "transform",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "fill-rule",
  "clip-rule",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
  "preserveAspectRatio",
];
const paints = [
  "fill",
  "stroke",
  "fill-opacity",
  "stroke-opacity",
  "opacity",
  "stroke-width",
  "fill-rule",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
];
export function cleanSvg(raw: string): {
  data: string;
  width: number;
  height: number;
} {
  const doc = new DOMParser().parseFromString(raw, "image/svg+xml"),
    root = doc.documentElement;
  if (doc.querySelector("parsererror") || root.localName !== "svg")
    throw Error("Invalid SVG file.");
  const unsupported = new Set<string>();
  for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
    if (!tags.includes(el.localName)) unsupported.add(el.localName);
    for (const at of Array.from(el.attributes)) {
      if (
        at.name.startsWith("on") ||
        ["href", "xlink:href"].includes(at.name) ||
        /url\s*\(/i.test(at.value)
      )
        unsupported.add(at.name);
    }
    const style = el.getAttribute("style");
    if (style) {
      for (const pair of style.split(";")) {
        if (!pair.trim()) continue;
        const split = pair.indexOf(":"),
          key = pair.slice(0, split).trim(),
          val = pair.slice(split + 1).trim();
        if (!paints.includes(key)) unsupported.add("style:" + key);
        else el.setAttribute(key, val);
      }
      el.removeAttribute("style");
    }
    if (el.hasAttribute("class")) unsupported.add("CSS class");
  }
  if (unsupported.size)
    throw Error(
      "SVG contains unsupported content: " +
        [...unsupported].join("、") +
        ". Convert text to outlines and export as basic paths.",
    );
  const view = root
    .getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  let width: number, height: number;
  if (view) {
    if (
      view.length !== 4 ||
      !view.every(Number.isFinite) ||
      view[2] <= 0 ||
      view[3] <= 0
    )
      throw Error("Invalid SVG viewBox.");
    width = view[2];
    height = view[3];
  } else {
    const w = root.getAttribute("width") || "",
      h = root.getAttribute("height") || "";
    if (!/^\d+(\.\d+)?(px)?$/.test(w) || !/^\d+(\.\d+)?(px)?$/.test(h))
      throw Error("SVG needs a valid viewBox or pixel dimensions.");
    width = parseFloat(w);
    height = parseFloat(h);
    root.setAttribute("viewBox", "0 0 " + width + " " + height);
  }
  if (!width || !height || width > 100000 || height > 100000)
    throw Error("SVG dimensions are out of range.");
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  if (!root.hasAttribute("fill")) root.setAttribute("fill", "currentColor");
  for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
    for (const key of ["fill", "stroke"])
      if (el.hasAttribute(key)) {
        const v = el.getAttribute(key)!.trim();
        if (v !== "none") {
          el.setAttribute(key, "currentColor");
          if (v === "transparent") el.setAttribute(key + "-opacity", "0");
        }
      }
  }
  const data = DOMPurify.sanitize(new XMLSerializer().serializeToString(root), {
    ALLOWED_TAGS: tags,
    ALLOWED_ATTR: attrs,
    USE_PROFILES: undefined,
  });
  if (!data.includes("<svg")) throw Error("SVG contains no usable shapes.");
  return { data, width, height };
}
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(Error("Could not decode the pattern image."));
    im.src = src;
  });
}
export function svgUrl(data: string) {
  return URL.createObjectURL(new Blob([data], { type: "image/svg+xml" }));
}
export async function readAsset(file: File): Promise<Asset> {
  if (file.size > 5 * 1024 * 1024)
    throw Error("Each pattern asset must be smaller than 5 MB.");
  if (/\.svg$/i.test(file.name)) {
    const parsed = cleanSvg(await file.text());
    return { id: uid(), name: file.name, kind: "svg", ...parsed };
  }
  if (!/\.png$/i.test(file.name))
    throw Error("Choose an SVG or transparent PNG file.");
  const data = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const im = await loadImage(data);
  if (im.width * im.height > 16000000)
    throw Error("PNG assets must not exceed 16 megapixels.");
  return {
    id: uid(),
    name: file.name,
    kind: "png",
    data,
    width: im.width,
    height: im.height,
  };
}
export async function readPicture(file: File): Promise<Asset> {
  if (!/\.(png|jpe?g|webp)$/i.test(file.name))
    throw Error("Choose a PNG, JPEG or WebP image.");
  if (file.size > 20 * 1024 * 1024)
    throw Error("Images must be smaller than 20 MB.");
  const url = URL.createObjectURL(file);
  try {
    const im = await loadImage(url);
    if (im.width * im.height > 16000000)
      throw Error("Images must not exceed 16 megapixels.");
    // Canonical PNG retains color/alpha and freezes animated sources to one frame.
    const c = document.createElement("canvas");
    c.width = im.width;
    c.height = im.height;
    c.getContext("2d")!.drawImage(im, 0, 0);
    const data = c.toDataURL("image/png");
    if (data.length > 32 * 1024 * 1024)
      throw Error(
        "The decoded image is too large. Reduce its resolution first.",
      );
    return {
      id: uid(),
      name: file.name,
      kind: "png",
      purpose: "picture",
      data,
      width: im.width,
      height: im.height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function assetImage(a: Asset, color: string) {
  let src = a.data,
    object = false;
  if (a.kind === "svg") {
    const doc = new DOMParser().parseFromString(
      a.data.replaceAll("currentColor", color),
      "image/svg+xml",
    );
    doc.documentElement.setAttribute("width", String(a.width));
    doc.documentElement.setAttribute("height", String(a.height));
    src = svgUrl(new XMLSerializer().serializeToString(doc.documentElement));
    object = true;
  }
  try {
    return await loadImage(src);
  } finally {
    if (object) URL.revokeObjectURL(src);
  }
}
export async function cropAsset(a: Asset): Promise<Asset> {
  const im = await assetImage(a, "#ffffff"),
    factor = Math.min(1, 1024 / Math.max(a.width, a.height)),
    w = Math.max(1, Math.round(a.width * factor)),
    h = Math.max(1, Math.round(a.height * factor));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(im, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (px[(y * w + x) * 4 + 3] > 0) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  if (x1 < 0)
    throw Error("This asset is fully transparent and cannot be trimmed.");
  return {
    ...a,
    crop: {
      x: (x0 / w) * a.width,
      y: (y0 / h) * a.height,
      w: ((x1 - x0 + 1) / w) * a.width,
      h: ((y1 - y0 + 1) / h) * a.height,
    },
  };
}
export function assetBox(a: Asset) {
  return a.crop || { x: 0, y: 0, w: a.width, h: a.height };
}
