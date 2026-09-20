import { defaultJitter, type Project } from "./model";
import { cleanSvg, loadImage } from "./assets";
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open("halftone-studio", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("projects");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function saveLocal(p: Project) {
  const d = await db();
  try {
    await new Promise<void>((res, rej) => {
      const tx = d.transaction("projects", "readwrite");
      tx.objectStore("projects").put(p, "latest");
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  } finally {
    d.close();
  }
}
export async function loadLocal(): Promise<Project | undefined> {
  const d = await db();
  try {
    return await new Promise((res, rej) => {
      const r = d.transaction("projects").objectStore("projects").get("latest");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  } finally {
    d.close();
  }
}
function check(ok: unknown, msg: string): asserts ok {
  if (!ok) throw Error("工程无效：" + msg);
}
const number = (n: unknown, a: number, b: number) =>
  typeof n === "number" && Number.isFinite(n) && n >= a && n <= b;
const color = (v: unknown) =>
  typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
export async function validateProject(input: unknown): Promise<Project> {
  const p = structuredClone(input) as Project;
  check(p && p.version === 1 && p.generator === "1", "不支持的工程版本");
  check(typeof p.name === "string" && p.name.length < 300, "名称");
  check(
    number(p.width, 64, 4096) &&
      number(p.height, 64, 4096) &&
      Number.isInteger(p.width) &&
      Number.isInteger(p.height),
    "画布尺寸",
  );
  check(color(p.background) && typeof p.transparent === "boolean", "背景");
  check(
    Array.isArray(p.layers) &&
      p.layers.length <= 8 &&
      Array.isArray(p.assets) &&
      p.assets.length <= 32,
    "图层或素材数量",
  );
  const ids = new Set<string>();
  const id = (s: unknown) => {
    check(
      typeof s === "string" && s.length < 100 && !ids.has(s),
      "重复或无效 ID",
    );
    ids.add(s);
  };
  for (const a of p.assets) {
    id(a.id);
    check(typeof a.name === "string" && a.name.length < 300, "素材名称");
    check(
      typeof a.data === "string" &&
        a.data.length <= (a.purpose === "picture" ? 32 : 8) * 1024 * 1024,
      "素材大小",
    );
    check(
      number(a.width, 1, 100000) && number(a.height, 1, 100000),
      "素材尺寸",
    );
    if (a.kind === "svg") {
      const cleaned = cleanSvg(a.data);
      a.data = cleaned.data;
      check(
        cleaned.width === a.width && cleaned.height === a.height,
        "SVG 尺寸不匹配",
      );
    } else {
      check(
        a.kind === "png" && a.data.startsWith("data:image/png;base64,"),
        "素材格式",
      );
      const im = await loadImage(a.data);
      check(
        im.width === a.width &&
          im.height === a.height &&
          im.width * im.height <= 16000000,
        "PNG 尺寸",
      );
    }
    if (a.crop)
      check(
        number(a.crop.x, 0, a.width) &&
          number(a.crop.y, 0, a.height) &&
          number(a.crop.w, 0.001, a.width - a.crop.x + 0.001) &&
          number(a.crop.h, 0.001, a.height - a.crop.y + 0.001),
        "裁切范围",
      );
  }
  for (const l of p.layers) {
    if (l.kind === undefined) Object.assign(l, { kind: "dots" });
    check(l.kind === "dots" || l.kind === "image", "图层类型");
    if (l.kind === "image") {
      const legacy = l as typeof l & { scale?: number };
      if (
        l.scaleX === undefined &&
        l.scaleY === undefined &&
        legacy.scale !== undefined
      ) {
        l.scaleX = legacy.scale;
        l.scaleY = legacy.scale;
      }
      delete legacy.scale;
      id(l.id);
      check(
        typeof l.name === "string" &&
          l.name.length < 300 &&
          typeof l.visible === "boolean",
        "图片图层",
      );
      check(
        number(l.opacity, 0, 1) &&
          ["normal", "multiply", "screen"].includes(l.blend),
        "图片外观",
      );
      check(
        p.assets.some(
          (a) =>
            a.id === l.assetId && a.kind === "png" && a.purpose === "picture",
        ),
        "缺失原色图片素材",
      );
      check(
        number(l.x, -1000000, 1000000) &&
          number(l.y, -1000000, 1000000) &&
          number(l.scaleX, 0.0001, 10000) &&
          number(l.scaleY, 0.0001, 10000) &&
          number(l.rotation, -180, 180),
        "图片摆放",
      );
      check(
        typeof l.locked === "boolean" && typeof l.exportEnabled === "boolean",
        "图片图层开关",
      );
      continue;
    }
    if (l.attachment !== undefined) {
      const a = l.attachment;
      check(
        a && typeof a.pictureId === "string" && a.pictureId.length < 100,
        "轮廓绑定图片",
      );
      check(
        ["inside", "halo"].includes(a.mode) &&
          number(a.spread, 0, 300) &&
          number(a.feather, 0, 300),
        "轮廓参数",
      );
      if (a.offsetX === undefined) a.offsetX = 0;
      if (a.offsetY === undefined) a.offsetY = 0;
      check(
        number(a.offsetX, -4096, 4096) && number(a.offsetY, -4096, 4096),
        "轮廓偏移",
      );
      // Missing targets are retained so undo/relink never becomes a full-canvas pattern.
      check(
        !p.layers.some((v) => v.id === a.pictureId && v.kind !== "image"),
        "轮廓目标必须是图片",
      );
    }
    // Existing v1 projects predate jitter; preserve their exact appearance.
    if (l.jitter === undefined) l.jitter = defaultJitter();
    check(l.jitter && typeof l.jitter.enabled === "boolean", "随机扰动开关");
    check(
      number(l.jitter.position, 0, 1) &&
        number(l.jitter.rotation, 0, 180) &&
        number(l.jitter.size, 0, 1),
      "随机扰动幅度",
    );
    check(
      number(l.jitter.seed, 0, 2147483647) && Number.isInteger(l.jitter.seed),
      "随机扰动种子",
    );
    id(l.id);
    check(
      typeof l.name === "string" &&
        l.name.length < 300 &&
        typeof l.visible === "boolean",
      "图层",
    );
    check(
      color(l.color) &&
        number(l.opacity, 0, 1) &&
        ["normal", "multiply", "screen"].includes(l.blend),
      "图层外观",
    );
    check(
      ["circle", "square", "diamond", "custom"].includes(l.shape) &&
        ["square", "hex"].includes(l.grid),
      "单元或网格",
    );
    if (l.shape === "custom")
      check(
        p.assets.some((a) => a.id === l.assetId),
        "缺失图案素材",
      );
    for (const [key, min, max] of [
      ["spacing", 4, 200],
      ["angle", -180, 180],
      ["offsetX", -2000, 2000],
      ["offsetY", -2000, 2000],
      ["min", 0, 400],
      ["max", 0, 400],
      ["rotation", -180, 180],
      ["gamma", 0.1, 4],
    ] as const)
      check(number(l[key], min, max), "网格参数 " + key);
    check(l.min <= l.max, "最小尺寸大于最大尺寸");
    check(Array.isArray(l.fields) && l.fields.length <= 8, "生成场数量");
    for (const f of l.fields) {
      id(f.id);
      check(
        ["uniform", "linear", "radial", "waves", "rings", "noise"].includes(
          f.kind,
        ) && ["replace", "add", "multiply", "max", "min"].includes(f.blend),
        "生成场类型",
      );
      check(
        typeof f.enabled === "boolean" && typeof f.invert === "boolean",
        "生成场开关",
      );
      for (const [key, min, max] of [
        ["strength", 0, 1],
        ["angle", -180, 180],
        ["x", 0, 1],
        ["y", 0, 1],
        ["scale", 0.05, 3],
        ["frequency", 0.1, 12],
        ["phase", 0, 1],
        ["seed", 0, 2147483647],
        ["detail", 1, 6],
      ] as const)
        check(number(f[key], min, max), "生成场参数 " + key);
      check(Number.isInteger(f.detail) && Number.isInteger(f.seed), "噪声参数");
    }
  }
  return structuredClone(p);
}
