export type FieldKind =
  "uniform" | "linear" | "radial" | "waves" | "rings" | "noise";
export type Blend = "replace" | "add" | "multiply" | "max" | "min";
export interface Field {
  id: string;
  kind: FieldKind;
  enabled: boolean;
  strength: number;
  blend: Blend;
  invert: boolean;
  angle: number;
  x: number;
  y: number;
  scale: number;
  frequency: number;
  phase: number;
  seed: number;
  detail: number;
}
export interface Asset {
  id: string;
  name: string;
  kind: "svg" | "png";
  data: string;
  width: number;
  height: number;
  purpose?: "picture";
  crop?: { x: number; y: number; w: number; h: number };
}
export interface Jitter {
  enabled: boolean;
  position: number;
  rotation: number;
  size: number;
  seed: number;
}
export const defaultJitter = (): Jitter => ({
  enabled: false,
  position: 0,
  rotation: 45,
  size: 0,
  seed: 618,
});
export interface Layer {
  kind: "dots";
  id: string;
  name: string;
  visible: boolean;
  color: string;
  opacity: number;
  blend: "normal" | "multiply" | "screen";
  shape: "circle" | "square" | "diamond" | "custom";
  assetId?: string;
  grid: "square" | "hex";
  spacing: number;
  angle: number;
  offsetX: number;
  offsetY: number;
  min: number;
  max: number;
  rotation: number;
  gamma: number;
  jitter: Jitter;
  fields: Field[];
}
export interface PictureLayer {
  kind: "image";
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blend: "normal" | "multiply" | "screen";
  assetId: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  locked: boolean;
  exportEnabled: boolean;
}
export type ProjectLayer = Layer | PictureLayer;
export function dotLayer(p: Project, id: string): Layer {
  const l = p.layers.find((l) => l.id === id);
  if (!l || l.kind === "image") throw Error("找不到网点图层");
  return l;
}
export function pictureLayer(asset: Asset, p: Project): PictureLayer {
  return {
    kind: "image",
    id: uid(),
    name: asset.name,
    visible: true,
    opacity: 1,
    blend: "normal",
    assetId: asset.id,
    x: p.width / 2,
    y: p.height / 2,
    scaleX: Math.min(p.width / asset.width, p.height / asset.height),
    scaleY: Math.min(p.width / asset.width, p.height / asset.height),
    rotation: 0,
    locked: false,
    exportEnabled: true,
  };
}
export function fitPicture(
  l: PictureLayer,
  asset: Asset,
  p: Project,
  cover = false,
): Partial<PictureLayer> {
  const angle = (l.rotation * Math.PI) / 180,
    c = Math.abs(Math.cos(angle)),
    s = Math.abs(Math.sin(angle));
  const aspect = l.scaleY / l.scaleX;
  const height = asset.height * aspect;
  const scale = cover
    ? Math.max(
        (p.width * c + p.height * s) / asset.width,
        (p.width * s + p.height * c) / height,
      )
    : Math.min(
        p.width / (asset.width * c + height * s),
        p.height / (asset.width * s + height * c),
      );
  return {
    x: p.width / 2,
    y: p.height / 2,
    scaleX: scale,
    scaleY: scale * aspect,
  };
}
export interface Project {
  version: 1;
  generator: "1";
  name: string;
  width: number;
  height: number;
  background: string;
  transparent: boolean;
  layers: ProjectLayer[];
  assets: Asset[];
}
export const uid = () => crypto.randomUUID();
export const labels: Record<FieldKind, string> = {
  uniform: "均匀",
  linear: "线性渐变",
  radial: "径向渐变",
  waves: "平行波",
  rings: "同心波",
  noise: "噪声",
};
export function field(kind: FieldKind = "radial"): Field {
  return {
    id: uid(),
    kind,
    enabled: true,
    strength: 1,
    blend: "replace",
    invert: false,
    angle: 0,
    x: 0.5,
    y: 0.5,
    scale: 0.7,
    frequency: 3,
    phase: 0,
    seed: 618,
    detail: 3,
  };
}
export function layer(): Layer {
  return {
    id: uid(),
    name: "网点图层",
    kind: "dots",
    visible: true,
    color: "#ed754b",
    opacity: 1,
    blend: "normal",
    shape: "circle",
    grid: "square",
    spacing: 22,
    angle: 0,
    offsetX: 0,
    offsetY: 0,
    min: 0,
    max: 22,
    rotation: 0,
    gamma: 1,
    jitter: defaultJitter(),
    fields: [field()],
  };
}
export function blank(): Project & { layers: Layer[] } {
  return {
    version: 1,
    generator: "1",
    name: "未命名作品",
    width: 1200,
    height: 1200,
    background: "#f4efdf",
    transparent: false,
    layers: [{ ...layer(), color: "#252c29" }],
    assets: [],
  };
}
export const presets = [
  "双色潮汐",
  "渐变网点",
  "径向聚集",
  "噪声云团",
  "波纹律动",
  "错角干涉",
  "星形实验",
];
export function preset(index = 0): Project & { layers: Layer[] } {
  const p = blank();
  p.name = presets[index];
  const a = p.layers[0] as Layer;
  a.color = "#ef754c";
  if (index === 0) {
    a.fields = [
      { ...field("rings"), x: 0.32, y: 0.55, frequency: 2.1, scale: 1.2 },
      { ...field("noise"), blend: "multiply", strength: 0.38 },
    ];
    a.spacing = 20;
    a.max = 24;
    const b = layer();
    b.name = "墨绿 / 波纹";
    b.color = "#234d43";
    b.blend = "multiply";
    b.angle = 30;
    b.spacing = 23;
    b.max = 23;
    b.fields = [
      { ...field("rings"), x: 0.7, y: 0.45, frequency: 1.6, scale: 1.2 },
    ];
    a.name = "珊瑚 / 波纹";
    p.layers.push(b);
  }
  if (index === 1) {
    a.fields = [{ ...field("linear"), angle: 135 }];
    a.angle = 15;
  }
  if (index === 2) {
    a.fields = [field("radial")];
    a.grid = "hex";
    a.color = "#234d43";
  }
  if (index === 3) {
    a.fields = [{ ...field("noise"), scale: 0.42, detail: 4 }];
    a.color = "#536bc0";
    a.max = 27;
  }
  if (index === 4) {
    a.fields = [{ ...field("waves"), angle: 35, frequency: 3 }];
    a.shape = "diamond";
    a.max = 25;
  }
  if (index === 5) {
    a.fields = [{ ...field("uniform"), strength: 0.65 }];
    a.spacing = 20;
    a.max = 19;
    const b = structuredClone(a);
    b.id = uid();
    b.name = "墨绿 / 旋转";
    b.color = "#234d43";
    b.angle = 12;
    b.blend = "multiply";
    b.fields[0].id = uid();
    p.layers.push(b);
  }
  if (index === 6) {
    const id = uid();
    p.assets.push({
      id,
      name: "四芒星.svg",
      kind: "svg",
      width: 100,
      height: 100,
      data: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="currentColor" d="M50 0Q56 44 100 50Q56 56 50 100Q44 56 0 50Q44 44 50 0Z"/></svg>',
    });
    a.shape = "custom";
    a.assetId = id;
    a.spacing = 32;
    a.max = 40;
    a.fields = [{ ...field("noise"), scale: 0.5 }];
  }
  return p;
}
