import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  FilePlus2,
  FolderOpen,
  Grid2X2,
  Layers,
  Maximize,
  Minus,
  MousePointer2,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  Shapes,
  Shuffle,
  Sparkles,
  Trash2,
  Undo2,
  Redo2,
  Upload,
  X,
  Move,
  Crosshair,
} from "lucide-react";
import {
  type Project,
  type Layer,
  type PictureLayer,
  pictureLayer,
  fitPicture,
  dotLayer,
  type Field,
  type Asset,
  type FieldKind,
  blank,
  layer,
  field,
  preset,
  presets,
  uid,
  labels,
} from "./model";
import { generate, estimate, type Geometry, clamp } from "./engine";
import { paint, exportSvg, exportPng, download } from "./render";
import {
  readPicture,
  readAsset,
  cropAsset,
  assetBox,
  assetImage,
} from "./assets";
import { loadLocal, saveLocal, validateProject } from "./storage";
import "./style.css";
import {
  resizeHandles,
  resizePicture,
  resizeCursor,
  type ResizeHandle,
} from "./picture-transform";

const fieldIcons: Record<FieldKind, string> = {
  uniform: "●",
  linear: "◩",
  radial: "◉",
  waves: "≋",
  rings: "◎",
  noise: "░",
};
function IconButton({
  title,
  onClick,
  children,
  disabled = false,
  className = "",
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      className={"icon-button " + className}
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
const EditContext = React.createContext({ begin: () => {}, end: () => {} });
function Range({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
  suffix?: string;
}) {
  const { begin, end } = React.useContext(EditContext);
  return (
    <div className="range-control">
      <div className="control-heading">
        <label>{label}</label>
        <div className="number-wrap">
          <input
            aria-label={label}
            type="number"
            value={+value.toFixed(3)}
            min={min}
            max={max}
            step={step}
            onFocus={begin}
            onBlur={end}
            onChange={(e) => {
              if (
                e.target.value !== "" &&
                Number.isFinite(e.target.valueAsNumber)
              )
                onChange(clamp(e.target.valueAsNumber, min, max));
            }}
          />
          <span>{suffix}</span>
        </div>
      </div>
      <input
        aria-label={label + " 滑块"}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={
          {
            "--progress": ((value - min) / (max - min)) * 100 + "%",
          } as React.CSSProperties
        }
        onPointerDown={begin}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={begin}
        onKeyUp={end}
        onChange={(e) => onChange(+e.target.value)}
      />
    </div>
  );
}
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Record<string, string>;
}) {
  return (
    <label className="select-row">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {Object.entries(options).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function App() {
  const [project, setProject] = useState<Project>(() => preset(0)),
    projectRef = useRef(project);
  const [selected, setSelected] = useState(project.layers[0].id),
    [fieldId, setFieldId] = useState<string | null>(null);
  const [ready, setReady] = useState(false),
    [saveStatus, setSaveStatus] = useState("正在恢复…"),
    [notice, setNotice] = useState(""),
    [modal, setModal] = useState<"presets" | "export" | null>(null),
    [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [viewport, setViewport] = useState({ width: 800, height: 800 }),
    [tool, setTool] = useState<"select" | "pan">("select");
  const [pngScale, setPngScale] = useState(1),
    [historyVersion, setHistoryVersion] = useState(0),
    [ms, setMs] = useState(0),
    [renderError, setRenderError] = useState("");
  const undoStack = useRef<Project[]>([]),
    redoStack = useRef<Project[]>([]),
    transaction = useRef<Project | null>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    stage = useRef<HTMLDivElement>(null),
    workspace = useRef<HTMLDivElement>(null),
    assetInput = useRef<HTMLInputElement>(null),
    projectInput = useRef<HTMLInputElement>(null),
    pictureInput = useRef<HTMLInputElement>(null),
    pictureReplace = useRef<string | null>(null),
    geometryCache = useRef(new Map<string, Geometry>());
  const begin = () => {
    if (!transaction.current) transaction.current = projectRef.current;
  };
  const end = () => {
    if (transaction.current && transaction.current !== projectRef.current) {
      undoStack.current.push(transaction.current);
      undoStack.current = undoStack.current.slice(-60);
      redoStack.current = [];
      setHistoryVersion((v) => v + 1);
    }
    transaction.current = null;
  };
  const apply = useCallback((mutate: (p: Project) => void) => {
    const before = projectRef.current,
      next: Project = {
        ...structuredClone({ ...before, assets: [] }),
        // Image payloads are immutable strings. Clone mutable metadata only,
        // so dragging a full-resolution picture does not copy/stringify MBs.
        assets: before.assets.map((a) => ({
          ...a,
          ...(a.crop ? { crop: { ...a.crop } } : {}),
        })),
      };
    mutate(next);
    const samePayloads =
      before.assets.length === next.assets.length &&
      before.assets.every((a, i) => a.data === next.assets[i].data);
    const metadata = (p: Project) => ({
      ...p,
      assets: p.assets.map(({ data, ...a }) => a),
    });
    if (
      samePayloads &&
      JSON.stringify(metadata(before)) === JSON.stringify(metadata(next))
    )
      return;
    if (!transaction.current) {
      undoStack.current.push(before);
      undoStack.current = undoStack.current.slice(-60);
      redoStack.current = [];
      setHistoryVersion((v) => v + 1);
    }
    projectRef.current = next;
    setProject(next);
  }, []);
  const replace = (next: Project) =>
    apply((p) => {
      Object.assign(p, next);
    });
  const undo = () => {
    end();
    const prev = undoStack.current.pop();
    if (prev) {
      redoStack.current.push(projectRef.current);
      projectRef.current = prev;
      setProject(prev);
      setHistoryVersion((v) => v + 1);
    }
  };
  const redo = () => {
    end();
    const next = redoStack.current.pop();
    if (next) {
      undoStack.current.push(projectRef.current);
      projectRef.current = next;
      setProject(next);
      setHistoryVersion((v) => v + 1);
    }
  };
  const notify = (s: string) => setNotice(s);
  const current =
    project.layers.find((l) => l.id === selected) || project.layers[0];
  const active = current?.kind === "dots" ? current : undefined;
  const activePicture = current?.kind === "image" ? current : undefined;
  const pictureAsset = project.assets.find(
    (a) => a.id === activePicture?.assetId,
  );
  const setPicture = (patch: Partial<PictureLayer>) => {
    if (activePicture)
      apply((p) =>
        Object.assign(
          p.layers.find((l) => l.id === activePicture.id)!,
          patch,
        ),
      );
  };
  const activeField = active?.fields.find((f) => f.id === fieldId);
  const asset = project.assets.find((a) => a.id === active?.assetId);
  const setLayer = (patch: Partial<Layer>) => {
    if (active) apply((p) => Object.assign(dotLayer(p, active!.id), patch));
  };
  const setField = (patch: Partial<Field>) => {
    if (activeField)
      apply((p) =>
        Object.assign(
          dotLayer(p, active!.id).fields.find((f) => f.id === activeField.id)!,
          patch,
        ),
      );
  };
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const stored = await loadLocal();
        if (stored) {
          const valid = await validateProject(stored);
          if (live) {
            projectRef.current = valid;
            setProject(valid);
            setSelected(valid.layers[0]?.id || "");
          }
        }
      } catch (e) {
        if (live) notify("无法恢复自动保存：" + (e as Error).message);
      } finally {
        if (live) setReady(true);
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    setSaveStatus("保存中…");
    let live = true;
    const timer = setTimeout(
      () =>
        saveLocal(project)
          .then(() => {
            if (live) setSaveStatus("已在本机保存");
          })
          .catch(() => {
            if (live) {
              setSaveStatus("自动保存失败");
              notify("本地存储不可用，请使用“保存工程”下载备份。");
            }
          }),
      600,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [project, ready]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const el = workspace.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) =>
      setViewport({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if (e.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [historyVersion]);
  const geometryResult = useMemo(() => {
    try {
      if (estimate(project) > 50000)
        throw Error("超过 50,000 个候选单元。请增大间距或隐藏部分图层。");
      const result: Geometry[] = [];
      const nextCache = new Map<string, Geometry>();
      for (const l of project.layers.filter(
        (l): l is Layer => l.visible && l.kind === "dots",
      )) {
        const key = JSON.stringify([
          project.width,
          project.height,
          l.grid,
          l.spacing,
          l.angle,
          l.offsetX,
          l.offsetY,
          l.min,
          l.max,
          l.gamma,
          l.fields,
          l.jitter,
        ]);
        const cached = geometryCache.current.get(key);
        const g = cached
          ? { layer: l, points: cached.points }
          : generate({ ...project, layers: [l] })[0];
        result.push(g);
        nextCache.set(key, g);
      }
      geometryCache.current = nextCache;
      return { geometry: result, error: "" };
    } catch (e) {
      return { geometry: [], error: (e as Error).message };
    }
  }, [project]);
  const count = geometryResult.geometry.reduce(
    (n, g) => n + g.points.length,
    0,
  );
  const fit = Math.min(
      (viewport.width - 104) / project.width,
      (viewport.height - 220) / project.height,
      1,
    ),
    displayScale = Math.max(0.03, fit) * zoom;
  const displayWidth = project.width * displayScale,
    displayHeight = project.height * displayScale;
  useEffect(() => {
    let cancelled = false;
    const timer = requestAnimationFrame(() => {
      (async () => {
        const start = performance.now(),
          off = document.createElement("canvas"),
          ratio = Math.min(window.devicePixelRatio || 1, 2),
          scale = Math.min(
            1,
            2000 / Math.max(displayWidth * ratio, displayHeight * ratio),
          );
        try {
          await paint(
            off,
            project,
            geometryResult.geometry,
            Math.max(1, Math.round(displayWidth * ratio * scale)),
            Math.max(1, Math.round(displayHeight * ratio * scale)),
          );
          if (!cancelled && canvas.current) {
            const c = canvas.current;
            c.width = off.width;
            c.height = off.height;
            c.getContext("2d")!.drawImage(off, 0, 0);
            setMs(performance.now() - start);
            setRenderError("");
          }
        } catch (e) {
          if (!cancelled) setRenderError((e as Error).message);
        }
      })();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(timer);
    };
  }, [project, geometryResult, displayWidth, displayHeight]);
  const addLayer = () => {
    if (project.layers.length >= 8) return;
    const l = layer();
    l.name = "图层 " + (project.layers.length + 1);
    apply((p) => p.layers.push(l));
    setSelected(l.id);
    setFieldId(null);
  };
  const duplicateLayer = () => {
    if (!current || project.layers.length >= 8) return;
    const l = structuredClone(current);
    l.id = uid();
    l.name += " 副本";
    if (l.kind === "dots") l.fields.forEach((f) => (f.id = uid()));
    apply((p) =>
      p.layers.splice(p.layers.findIndex((x) => x.id === current.id) + 1, 0, l),
    );
    setSelected(l.id);
    setFieldId(null);
  };
  const reorderLayer = (id: string, delta: number) =>
    apply((p) => {
      const i = p.layers.findIndex((l) => l.id === id),
        j = i + delta;
      if (j >= 0 && j < p.layers.length)
        [p.layers[i], p.layers[j]] = [p.layers[j], p.layers[i]];
    });
  const addField = (kind: FieldKind) => {
    if (!active || active.fields.length >= 8) return;
    const f = field(kind);
    if (active.fields.length) {
      f.blend = "multiply";
      f.strength = 0.5;
    }
    apply((p) => dotLayer(p, active!.id).fields.push(f));
    setFieldId(f.id);
  };
  const reorderField = (id: string, delta: number) =>
    apply((p) => {
      const fs = dotLayer(p, active!.id).fields,
        i = fs.findIndex((f) => f.id === id),
        j = i + delta;
      if (j >= 0 && j < fs.length) [fs[i], fs[j]] = [fs[j], fs[i]];
    });
  const loadPattern = async (file: File) => {
    if (!active) return;
    const layerId = active!.id;
    setBusy(true);
    try {
      if (project.assets.length >= 32) throw Error("工程最多保留 32 个素材。");
      const a = await readAsset(file);
      apply((p) => {
        p.assets.push(a);
        const l = p.layers.find((l) => l.id === layerId);
        if (l?.kind === "dots") {
          l.assetId = a.id;
          l.shape = "custom";
        }
      });
      notify("已导入 " + a.name + " · 使用图层颜色");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const loadPicture = async (file: File) => {
    const replaceId = pictureReplace.current;
    setBusy(true);
    try {
      const a = await readPicture(file),
        p = projectRef.current;
      if (p.assets.length >= 32) throw Error("工程最多保留 32 个素材。");
      if (
        p.assets.reduce((n, a) => n + a.data.length, 0) + a.data.length >
        48 * 1024 * 1024
      )
        throw Error("工程素材总量超过 48 MB，请缩小图片后再导入。");
      if (!replaceId && p.layers.length >= 8)
        throw Error("工程最多 8 个图层。");
      const target = replaceId
        ? p.layers.find((l) => l.id === replaceId)
        : null;
      if (replaceId && target?.kind !== "image")
        throw Error("待替换的图片图层已不存在。");
      const l = pictureLayer(a, p);
      apply((next) => {
        next.assets.push(a);
        if (replaceId) {
          const old = next.layers.find(
            (l) => l.id === replaceId,
          )! as PictureLayer;
          const previous = next.assets.find((a) => a.id === old.assetId)!;
          // Keep the existing display rectangle and placement on replacement.
          old.scaleX = (old.scaleX * previous.width) / a.width;
          old.scaleY = (old.scaleY * previous.height) / a.height;
          old.assetId = a.id;
        } else next.layers.push(l);
      });
      setSelected(replaceId || l.id);
      setFieldId(null);
      notify(
        "已" + (replaceId ? "替换" : "添加") + "图片图层 · 保留原色与透明度",
      );
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
      pictureReplace.current = null;
    }
  };
  const crop = async () => {
    if (!asset) return;
    setBusy(true);
    try {
      const cropped = await cropAsset(asset);
      apply((p) => {
        const index = p.assets.findIndex((a) => a.id === asset.id);
        p.assets[index] = cropped;
      });
      notify("已裁去透明留白；引用该素材的图层同步更新。");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const saveFile = () =>
    download(
      new Blob([JSON.stringify(project, null, 2)], {
        type: "application/json",
      }),
      project.name + ".halftone.json",
    );
  const openProject = async (file: File) => {
    setBusy(true);
    try {
      if (file.size > 64 * 1024 * 1024) throw Error("工程文件不能超过 64 MB。");
      const next = await validateProject(JSON.parse(await file.text()));
      replace(next);
      setSelected(next.layers[0]?.id || "");
      setFieldId(null);
      setPan({ x: 0, y: 0 });
      setZoom(1);
      notify("工程已打开");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const exportFile = async (format: "svg" | "png") => {
    setBusy(true);
    try {
      if (geometryResult.error) throw Error(geometryResult.error);
      if (format === "svg")
        download(
          new Blob([await exportSvg(project, geometryResult.geometry)], {
            type: "image/svg+xml",
          }),
          project.name + ".svg",
        );
      else
        download(
          await exportPng(project, geometryResult.geometry, pngScale),
          project.name + ".png",
        );
      notify("已导出 " + format.toUpperCase());
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const startResize = (
    e: React.PointerEvent<HTMLButtonElement>,
    handle: ResizeHandle,
  ) => {
    if (
      !activePicture ||
      activePicture.locked ||
      !pictureAsset ||
      tool !== "select" ||
      e.button !== 0
    )
      return;
    e.preventDefault();
    e.stopPropagation();
    begin();
    const el = e.currentTarget,
      initial = activePicture,
      asset = pictureAsset,
      start = { x: e.clientX, y: e.clientY },
      viewScale = displayScale;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) =>
      apply((p) => {
        const l = p.layers.find((l) => l.id === initial.id);
        if (l?.kind === "image")
          Object.assign(
            l,
            resizePicture(
              initial,
              asset,
              handle,
              (ev.clientX - start.x) / viewScale,
              (ev.clientY - start.y) / viewScale,
              ev.shiftKey,
            ),
          );
      });
    const cleanup = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", finish);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("lostpointercapture", finish);
      window.removeEventListener("keydown", key);
    };
    const finish = () => {
      cleanup();
      end();
    };
    const cancel = () => {
      cleanup();
      if (transaction.current) {
        projectRef.current = transaction.current;
        setProject(transaction.current);
        transaction.current = null;
      }
      if (el.hasPointerCapture(e.pointerId))
        el.releasePointerCapture(e.pointerId);
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        cancel();
      }
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", finish);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("lostpointercapture", finish);
    window.addEventListener("keydown", key);
  };
  const pointerStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const el = e.currentTarget;
    if (
      tool === "select" &&
      activePicture?.visible &&
      !activePicture.locked &&
      pictureAsset &&
      stage.current?.contains(e.target as Node)
    ) {
      const rect = stage.current!.getBoundingClientRect(),
        px = (e.clientX - rect.left) / displayScale,
        py = (e.clientY - rect.top) / displayScale;
      const angle = (activePicture.rotation * Math.PI) / 180,
        dx = px - activePicture.x,
        dy = py - activePicture.y;
      const localX = dx * Math.cos(angle) + dy * Math.sin(angle),
        localY = -dx * Math.sin(angle) + dy * Math.cos(angle);
      if (
        Math.abs(localX) <= (pictureAsset.width * activePicture.scaleX) / 2 &&
        Math.abs(localY) <= (pictureAsset.height * activePicture.scaleY) / 2
      ) {
        e.preventDefault();
        begin();
        el.setPointerCapture(e.pointerId);
        const initial = activePicture,
          start = { x: e.clientX, y: e.clientY };
        const move = (ev: PointerEvent) =>
          apply((p) => {
            const l = p.layers.find((l) => l.id === initial.id);
            if (l?.kind === "image") {
              l.x = clamp(
                initial.x + (ev.clientX - start.x) / displayScale,
                -1000000,
                1000000,
              );
              l.y = clamp(
                initial.y + (ev.clientY - start.y) / displayScale,
                -1000000,
                1000000,
              );
            }
          });
        const up = () => {
          end();
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerup", up);
          el.removeEventListener("pointercancel", up);
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerup", up);
        el.addEventListener("pointercancel", up);
        return;
      }
    }
    if (
      tool === "select" &&
      activeField &&
      ["radial", "rings"].includes(activeField.kind) &&
      stage.current?.contains(e.target as Node)
    ) {
      e.preventDefault();
      begin();
      el.setPointerCapture(e.pointerId);
      const fieldKey = activeField.id,
        layerKey = active!.id;
      const change = (ev: PointerEvent | React.PointerEvent) => {
        const r = stage.current!.getBoundingClientRect();
        apply((p) => {
          const f = dotLayer(p, layerKey).fields.find((f) => f.id === fieldKey);
          if (f) {
            f.x = clamp((ev.clientX - r.left) / r.width);
            f.y = clamp((ev.clientY - r.top) / r.height);
          }
        });
      };
      change(e);
      const move = (ev: PointerEvent) => change(ev),
        up = () => {
          end();
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerup", up);
          el.removeEventListener("pointercancel", up);
        };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
      return;
    }
    if (tool === "pan" || e.button === 1) {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      const start = { x: e.clientX, y: e.clientY },
        initial = pan;
      const move = (ev: PointerEvent) =>
          setPan({
            x: initial.x + ev.clientX - start.x,
            y: initial.y + ev.clientY - start.y,
          }),
        up = () => {
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerup", up);
          el.removeEventListener("pointercancel", up);
        };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    }
  };
  const canPng = (scale: number) =>
    project.width * scale <= 8192 &&
    project.height * scale <= 8192 &&
    project.width * project.height * scale * scale <= 16000000;
  return (
    <EditContext.Provider value={{ begin, end }}>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark">
              {Array.from({ length: 9 }, (_, i) => (
                <i key={i} />
              ))}
            </div>
            <span>
              half<span className="brand-light">tone</span>
              <sup>STUDIO</sup>
            </span>
          </div>
          <div className="header-divider" />
          <div className="project-title">
            <input
              aria-label="工程名称"
              value={project.name}
              onFocus={begin}
              onBlur={end}
              maxLength={100}
              onChange={(e) =>
                apply((p) => {
                  p.name = e.target.value;
                })
              }
            />
            <ChevronDown size={13} />
          </div>
          <span className="local-label">
            <span className="status-dot" />
            {saveStatus}
          </span>
          <div className="header-actions">
            <IconButton
              title="新建工程"
              onClick={() => {
                const p = blank();
                replace(p);
                setSelected(p.layers[0].id);
                setFieldId(null);
              }}
            >
              <FilePlus2 size={17} />
            </IconButton>
            <IconButton
              title="打开工程"
              onClick={() => projectInput.current?.click()}
            >
              <FolderOpen size={17} />
            </IconButton>
            <IconButton title="保存工程" onClick={saveFile}>
              <Save size={17} />
            </IconButton>
            <span className="separator" />
            <IconButton
              title="撤销 Ctrl+Z"
              onClick={undo}
              disabled={!undoStack.current.length}
            >
              <Undo2 size={17} />
            </IconButton>
            <IconButton
              title="重做 Ctrl+Shift+Z"
              onClick={redo}
              disabled={!redoStack.current.length}
            >
              <Redo2 size={17} />
            </IconButton>
            <button
              className="button subtle"
              onClick={() => setModal("presets")}
            >
              <Grid2X2 size={15} />
              预设库
            </button>
            <button
              className="button primary"
              onClick={() => setModal("export")}
            >
              <Download size={15} />
              导出作品
            </button>
          </div>
        </header>
        <div className="main-layout">
          <aside className="left-panel">
            <div className="panel-label">
              <span>COMPOSITION</span>
              <span>01</span>
            </div>
            <div className="section-heading">
              <h2>图层</h2>
              <select
                className="add-layer-select"
                aria-label="添加图层"
                value=""
                disabled={busy || project.layers.length >= 8}
                onChange={(e) => {
                  if (e.target.value === "image") {
                    pictureReplace.current = null;
                    pictureInput.current?.click();
                  } else addLayer();
                }}
              >
                <option value="" disabled>
                  ＋ 添加图层
                </option>
                <option value="dots">网点图层</option>
                <option value="image">图片图层</option>
              </select>
            </div>
            <div className="layer-stack">
              {[...project.layers].reverse().map((l, reverseIndex) => (
                <div
                  key={l.id}
                  className={
                    "layer-card " + (current?.id === l.id ? "selected" : "")
                  }
                  onClick={() => {
                    setSelected(l.id);
                    setFieldId(null);
                  }}
                >
                  <div
                    className="layer-thumb"
                    style={
                      {
                        "--ink": l.kind === "dots" ? l.color : "#ccc",
                      } as React.CSSProperties
                    }
                  >
                    {l.kind === "image" ? (
                      <img
                        alt=""
                        src={
                          project.assets.find((a) => a.id === l.assetId)?.data
                        }
                      />
                    ) : (
                      <div
                        className={
                          l.shape === "diamond"
                            ? "diamond-pattern"
                            : "dot-pattern"
                        }
                      />
                    )}
                  </div>
                  <div className="layer-info">
                    <strong>{l.name}</strong>
                    <span>
                      {l.kind === "image"
                        ? "图片 · " +
                          (l.locked ? "已锁定 · " : "") +
                          (l.exportEnabled ? "参与导出" : "仅供预览")
                        : `${l.fields.length} 个生成场 · ${l.grid === "hex" ? "交错" : "方形"}网格`}
                    </span>
                  </div>
                  <IconButton
                    title={l.visible ? "隐藏图层" : "显示图层"}
                    onClick={() =>
                      apply((p) => {
                        p.layers.find((a) => a.id === l.id)!.visible =
                          !l.visible;
                      })
                    }
                  >
                    {l.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                  </IconButton>
                  <div className="layer-order">
                    <IconButton
                      title="上移图层"
                      disabled={reverseIndex === 0}
                      onClick={() => reorderLayer(l.id, 1)}
                    >
                      <ArrowUp size={11} />
                    </IconButton>
                    <IconButton
                      title="下移图层"
                      disabled={reverseIndex === project.layers.length - 1}
                      onClick={() => reorderLayer(l.id, -1)}
                    >
                      <ArrowDown size={11} />
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>
            <div className="layer-bottom">
              <span>{project.layers.length} / 8 图层</span>
              <div>
                <IconButton
                  title="复制图层"
                  onClick={duplicateLayer}
                  disabled={!current || project.layers.length >= 8}
                >
                  <Copy size={14} />
                </IconButton>
                <IconButton
                  title="删除图层"
                  onClick={() => {
                    if (current)
                      apply((p) => {
                        p.layers = p.layers.filter((l) => l.id !== current!.id);
                      });
                    setFieldId(null);
                  }}
                  disabled={!current}
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
            </div>
            <div className="panel-divider" />
            <div className="panel-label">
              <span>FIELD STACK</span>
              <span>02</span>
            </div>
            <div className="section-heading">
              <h2>生成场</h2>
              <span className="badge">{active?.fields.length || 0} / 8</span>
            </div>
            <p className="section-description">
              {activePicture
                ? "图片保留原色，可在右侧调整摆放。选择网点图层编辑生成场。"
                : "层叠明暗，塑造每一个网点。"}
            </p>
            <div className="field-stack">
              {active &&
                [...active.fields].reverse().map((f, i) => (
                  <div
                    key={f.id}
                    className={
                      "field-card " +
                      (activeField?.id === f.id ? "selected" : "")
                    }
                    onClick={() => setFieldId(f.id)}
                  >
                    <div className={"field-glyph " + f.kind}>
                      {fieldIcons[f.kind]}
                    </div>
                    <div className="field-info">
                      <strong>{labels[f.kind]}</strong>
                      <span>
                        {i === active.fields.length - 1
                          ? "基础场"
                          : {
                              replace: "替换",
                              add: "相加",
                              multiply: "相乘",
                              max: "最大值",
                              min: "最小值",
                            }[f.blend]}{" "}
                        · {Math.round(f.strength * 100)}%
                      </span>
                    </div>
                    <IconButton
                      title={f.enabled ? "停用生成场" : "启用生成场"}
                      onClick={() =>
                        apply((p) => {
                          dotLayer(p, active!.id).fields.find(
                            (a) => a.id === f.id,
                          )!.enabled = !f.enabled;
                        })
                      }
                    >
                      {f.enabled ? <Eye size={13} /> : <EyeOff size={13} />}
                    </IconButton>
                  </div>
                ))}
            </div>
            {active && (
              <div className="add-field">
                <Plus size={14} />
                <select
                  aria-label="添加生成场"
                  value=""
                  disabled={active.fields.length >= 8}
                  onChange={(e) => addField(e.target.value as FieldKind)}
                >
                  <option value="" disabled>
                    添加生成场
                  </option>
                  {Object.entries(labels).map(([key, v]) => (
                    <option key={key} value={key}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="left-spacer" />
            <button
              className="inspiration-card"
              onClick={() => setModal("presets")}
            >
              <div>
                <Sparkles size={17} />
                <ArrowUpRight size={15} />
              </div>
              <strong>从一个灵感开始</strong>
              <span>探索预设，找到新的图案可能。</span>
              <div className="mini-patterns">
                <i />
                <i />
                <i />
              </div>
            </button>
            <div className="left-footer">
              <span className="status-dot" /> 本地创作 · 无需上传云端
            </div>
          </aside>
          <main
            className={"workspace " + (tool === "pan" ? "pan-tool" : "")}
            ref={workspace}
            onPointerDown={pointerStart}
          >
            <div className="workspace-title">
              <span className="eyebrow">PATTERN PLAYGROUND</span>
              <h1>
                让秩序，生长出变化<span>。</span>
              </h1>
            </div>
            <div
              className="canvas-centered"
              style={{
                transform: "translate(" + pan.x + "px," + pan.y + "px)",
              }}
            >
              <div className="artboard-meta" style={{ width: displayWidth }}>
                <span>{project.name || "未命名作品"}</span>
                <span>
                  {project.width} × {project.height}
                </span>
              </div>
              <div
                ref={stage}
                className={"artboard " + (project.transparent ? "checker" : "")}
                style={{ width: displayWidth, height: displayHeight }}
              >
                <canvas ref={canvas} aria-label="图案实时预览" />
                {activePicture?.visible && pictureAsset && (
                  <div className="image-selection-clip">
                    <div
                      className={
                        "image-selection " +
                        (activePicture.locked ? "locked" : "")
                      }
                      style={{
                        left: activePicture.x * displayScale,
                        top: activePicture.y * displayScale,
                        width:
                          pictureAsset.width *
                          activePicture.scaleX *
                          displayScale,
                        height:
                          pictureAsset.height *
                          activePicture.scaleY *
                          displayScale,
                        transform: `translate(-50%,-50%) rotate(${activePicture.rotation}deg)`,
                      }}
                    >
                      {!activePicture.locked &&
                        tool === "select" &&
                        resizeHandles.map((h) => (
                          <button
                            key={h.id}
                            className="image-resize-handle"
                            aria-label={"缩放图片：" + h.label}
                            title={
                              h.x && h.y
                                ? "拖动等比缩放 · Esc 取消"
                                : "拖动调整" +
                                  (h.x ? "宽度" : "高度") +
                                  " · Shift 等比缩放 · Esc 取消"
                            }
                            style={{
                              left: (h.x + 1) * 50 + "%",
                              top: (h.y + 1) * 50 + "%",
                              cursor: resizeCursor(h, activePicture.rotation),
                            }}
                            onPointerDown={(e) => startResize(e, h)}
                            onKeyDown={(e) => {
                              const directions: Record<
                                string,
                                [number, number]
                              > = {
                                ArrowLeft: [-1, 0],
                                ArrowRight: [1, 0],
                                ArrowUp: [0, -1],
                                ArrowDown: [0, 1],
                              };
                              const d = directions[e.key];
                              if (!d) return;
                              e.preventDefault();
                              e.stopPropagation();
                              begin();
                              setPicture(
                                resizePicture(
                                  activePicture,
                                  pictureAsset,
                                  h,
                                  d[0] * (e.shiftKey ? 10 : 1),
                                  d[1] * (e.shiftKey ? 10 : 1),
                                  e.shiftKey,
                                ),
                              );
                            }}
                            onKeyUp={end}
                            onBlur={end}
                          />
                        ))}
                    </div>
                  </div>
                )}
                {activeField &&
                  ["radial", "rings"].includes(activeField.kind) &&
                  tool === "select" && (
                    <div
                      className="field-handle"
                      style={{
                        left: activeField.x * 100 + "%",
                        top: activeField.y * 100 + "%",
                      }}
                    >
                      <Crosshair size={24} />
                    </div>
                  )}
                {(geometryResult.error || renderError) && (
                  <div className="canvas-error">
                    <strong>暂时无法预览</strong>
                    <p>{geometryResult.error || renderError}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="canvas-toolbar">
              <IconButton
                title="选择 / 拖动生成场中心"
                className={tool === "select" ? "active" : ""}
                onClick={() => setTool("select")}
              >
                <MousePointer2 size={17} />
              </IconButton>
              <IconButton
                title="平移画布"
                className={tool === "pan" ? "active" : ""}
                onClick={() => setTool("pan")}
              >
                <Move size={17} />
              </IconButton>
              <span className="separator" />
              <IconButton
                title="缩小"
                onClick={() => setZoom((z) => Math.max(0.25, z / 1.25))}
              >
                <Minus size={16} />
              </IconButton>
              <span className="zoom-value">
                {Math.round(displayScale * 100)}%
              </span>
              <IconButton
                title="放大"
                onClick={() => setZoom((z) => Math.min(5, z * 1.25))}
              >
                <Plus size={16} />
              </IconButton>
              <span className="separator" />
              <IconButton
                title="适应窗口"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
              >
                <Maximize size={16} />
              </IconButton>
            </div>
            <div className="workspace-caption">
              <span>PROCEDURAL BY DESIGN</span>
              <span>
                自由定义形状，探索无限组合 <ArrowUpRight size={12} />
              </span>
            </div>
          </main>
          <aside className="right-panel">
            <div className="inspector-title">
              <Settings2 size={16} />
              <h2>
                {activePicture
                  ? "图片图层属性"
                  : activeField
                    ? "生成场属性"
                    : "图层属性"}
              </h2>
              {activeField && (
                <IconButton
                  title="返回图层属性"
                  onClick={() => setFieldId(null)}
                >
                  <X size={14} />
                </IconButton>
              )}
            </div>
            <div className="inspector-scroll">
              {activePicture && pictureAsset ? (
                <PictureInspector
                  layer={activePicture}
                  asset={pictureAsset}
                  project={project}
                  change={setPicture}
                  busy={busy}
                  replace={() => {
                    pictureReplace.current = activePicture.id;
                    pictureInput.current?.click();
                  }}
                />
              ) : activeField && active ? (
                <>
                  <section>
                    <div className="property-heading">
                      <span>
                        {fieldIcons[activeField.kind]}{" "}
                        {labels[activeField.kind]}
                      </span>
                      <div className="inline-actions">
                        <IconButton
                          title="复制生成场"
                          disabled={active.fields.length >= 8}
                          onClick={() => {
                            const f = { ...activeField, id: uid() };
                            apply((p) =>
                              dotLayer(p, active!.id).fields.push(f),
                            );
                            setFieldId(f.id);
                          }}
                        >
                          <Copy size={14} />
                        </IconButton>
                        <IconButton
                          title="删除生成场"
                          onClick={() => {
                            apply((p) => {
                              const l = dotLayer(p, active!.id);
                              l.fields = l.fields.filter(
                                (f) => f.id !== activeField.id,
                              );
                            });
                            setFieldId(null);
                          }}
                        >
                          <Trash2 size={14} />
                        </IconButton>
                      </div>
                    </div>
                    <Select
                      label="类型"
                      value={activeField.kind}
                      onChange={(v) => setField({ kind: v as FieldKind })}
                      options={labels}
                    />
                    <Select
                      label="场混合"
                      value={activeField.blend}
                      onChange={(v) => setField({ blend: v as Field["blend"] })}
                      options={{
                        replace: "替换",
                        add: "相加",
                        multiply: "相乘",
                        max: "最大值",
                        min: "最小值",
                      }}
                    />
                    <Range
                      label="强度"
                      value={activeField.strength}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(v) => setField({ strength: v })}
                    />
                    <label className="check-row">
                      <span>反相</span>
                      <input
                        type="checkbox"
                        checked={activeField.invert}
                        onChange={(e) => setField({ invert: e.target.checked })}
                      />
                    </label>
                    <div className="field-reorder">
                      <button
                        className="button subtle"
                        disabled={active.fields.at(-1)?.id === activeField.id}
                        onClick={() => reorderField(activeField.id, 1)}
                      >
                        <ArrowUp size={13} />
                        上移
                      </button>
                      <button
                        className="button subtle"
                        disabled={active.fields[0]?.id === activeField.id}
                        onClick={() => reorderField(activeField.id, -1)}
                      >
                        <ArrowDown size={13} />
                        下移
                      </button>
                    </div>
                  </section>
                  {activeField.kind !== "uniform" && (
                    <section>
                      <div className="property-heading">
                        <span>场分布</span>
                        <Crosshair size={14} />
                      </div>
                      <Range
                        label="中心 X"
                        value={activeField.x}
                        min={0}
                        max={1}
                        step={0.01}
                        onChange={(v) => setField({ x: v })}
                      />
                      <Range
                        label="中心 Y"
                        value={activeField.y}
                        min={0}
                        max={1}
                        step={0.01}
                        onChange={(v) => setField({ y: v })}
                      />
                      <Range
                        label="尺度"
                        value={activeField.scale}
                        min={0.05}
                        max={3}
                        step={0.01}
                        onChange={(v) => setField({ scale: v })}
                      />
                      {["linear", "waves"].includes(activeField.kind) && (
                        <Range
                          label="方向"
                          value={activeField.angle}
                          min={-180}
                          max={180}
                          suffix="°"
                          onChange={(v) => setField({ angle: v })}
                        />
                      )}
                      {["waves", "rings"].includes(activeField.kind) && (
                        <>
                          <Range
                            label="周期数"
                            value={activeField.frequency}
                            min={0.1}
                            max={12}
                            step={0.1}
                            onChange={(v) => setField({ frequency: v })}
                          />
                          <Range
                            label="相位"
                            value={activeField.phase}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(v) => setField({ phase: v })}
                          />
                        </>
                      )}
                      {activeField.kind === "noise" && (
                        <>
                          <Range
                            label="细节层数"
                            value={activeField.detail}
                            min={1}
                            max={6}
                            onChange={(v) => setField({ detail: v })}
                          />
                          <label className="select-row">
                            <span>种子</span>
                            <input
                              aria-label="噪声种子"
                              type="number"
                              min={0}
                              max={2147483647}
                              value={activeField.seed}
                              onFocus={begin}
                              onBlur={end}
                              onChange={(e) =>
                                setField({
                                  seed: Math.round(
                                    clamp(+e.target.value, 0, 2147483647),
                                  ),
                                })
                              }
                            />
                          </label>
                          <button
                            className="button subtle full-width"
                            onClick={() =>
                              setField({
                                seed:
                                  crypto.getRandomValues(
                                    new Uint32Array(1),
                                  )[0] % 2147483648,
                              })
                            }
                          >
                            <Shuffle size={14} />
                            换一个种子
                          </button>
                        </>
                      )}
                    </section>
                  )}
                </>
              ) : active ? (
                <>
                  <section>
                    <div className="property-heading">
                      <span>基础图案</span>
                      <Shapes size={15} />
                    </div>
                    <input
                      className="layer-name-input"
                      aria-label="图层名称"
                      value={active.name}
                      maxLength={100}
                      onFocus={begin}
                      onBlur={end}
                      onChange={(e) => setLayer({ name: e.target.value })}
                    />
                    <div className="shape-options">
                      {(["circle", "square", "diamond", "custom"] as const).map(
                        (s, i) => (
                          <button
                            key={s}
                            title={["圆形", "方形", "菱形", "自定义"][i]}
                            aria-label={["圆形", "方形", "菱形", "自定义"][i]}
                            className={active.shape === s ? "selected" : ""}
                            onClick={() => {
                              if (s === "custom" && !asset) {
                                assetInput.current?.click();
                                return;
                              }
                              setLayer({ shape: s });
                            }}
                          >
                            {s === "custom" ? (
                              <Upload size={18} />
                            ) : (
                              <i className={"shape-icon " + s} />
                            )}
                            <span>{["圆形", "方形", "菱形", "自定义"][i]}</span>
                          </button>
                        ),
                      )}
                    </div>
                    <button
                      className="upload-pattern"
                      disabled={busy}
                      onClick={() => assetInput.current?.click()}
                    >
                      <Upload size={15} />
                      <span>
                        {active.shape === "custom" && asset
                          ? asset.name
                          : "上传你的图案"}
                        <small>SVG / 透明 PNG · 单色轮廓</small>
                      </span>
                      <Plus size={13} />
                    </button>
                    {active.shape === "custom" && asset && (
                      <>
                        <AssetPreview asset={asset} color={active.color} />
                        <div className="field-reorder">
                          <button
                            className="button subtle"
                            disabled={busy}
                            onClick={crop}
                          >
                            裁去透明留白
                          </button>
                          {asset.crop && (
                            <button
                              className="button subtle"
                              onClick={() =>
                                apply((p) => {
                                  delete p.assets.find(
                                    (a) => a.id === asset.id,
                                  )!.crop;
                                })
                              }
                            >
                              还原
                            </button>
                          )}
                        </div>
                      </>
                    )}
                    {project.assets.length > 0 && (
                      <Select
                        label="素材库"
                        value={active.assetId || ""}
                        onChange={(v) => {
                          if (v) setLayer({ assetId: v, shape: "custom" });
                        }}
                        options={{
                          "": "选择已有素材",
                          ...Object.fromEntries(
                            project.assets
                              .filter((a) => a.purpose !== "picture")
                              .map((a) => [a.id, a.name]),
                          ),
                        }}
                      />
                    )}
                    <Range
                      label="单元旋转"
                      value={active.rotation}
                      min={-180}
                      max={180}
                      suffix="°"
                      onChange={(v) => setLayer({ rotation: v })}
                    />
                  </section>
                  <section>
                    <div className="property-heading">
                      <span>网格与尺寸</span>
                      <Grid2X2 size={14} />
                    </div>
                    <div className="segmented">
                      <button
                        className={active.grid === "square" ? "selected" : ""}
                        onClick={() => setLayer({ grid: "square" })}
                      >
                        方形网格
                      </button>
                      <button
                        className={active.grid === "hex" ? "selected" : ""}
                        onClick={() => setLayer({ grid: "hex" })}
                      >
                        交错网格
                      </button>
                    </div>
                    <Range
                      label="网格间距"
                      value={active.spacing}
                      min={4}
                      max={120}
                      suffix="px"
                      onChange={(v) => setLayer({ spacing: v })}
                    />
                    <Range
                      label="网格角度"
                      value={active.angle}
                      min={-180}
                      max={180}
                      suffix="°"
                      onChange={(v) => setLayer({ angle: v })}
                    />
                    <Range
                      label="最小尺寸"
                      value={active.min}
                      min={0}
                      max={120}
                      suffix="px"
                      onChange={(v) =>
                        setLayer({ min: v, max: Math.max(v, active.max) })
                      }
                    />
                    <Range
                      label="最大尺寸"
                      value={active.max}
                      min={0}
                      max={160}
                      suffix="px"
                      onChange={(v) =>
                        setLayer({ max: v, min: Math.min(v, active.min) })
                      }
                    />
                    <Range
                      label="色调曲线"
                      value={active.gamma}
                      min={0.1}
                      max={4}
                      step={0.05}
                      onChange={(v) => setLayer({ gamma: v })}
                    />
                    <details>
                      <summary>
                        位置偏移 <ChevronRight size={13} />
                      </summary>
                      <Range
                        label="水平偏移"
                        value={active.offsetX}
                        min={-200}
                        max={200}
                        suffix="px"
                        onChange={(v) => setLayer({ offsetX: v })}
                      />
                      <Range
                        label="垂直偏移"
                        value={active.offsetY}
                        min={-200}
                        max={200}
                        suffix="px"
                        onChange={(v) => setLayer({ offsetY: v })}
                      />
                    </details>
                  </section>
                  <section>
                    <div className="property-heading">
                      <span>随机扰动</span>
                      <Shuffle size={14} />
                    </div>
                    <label className="check-row">
                      <span>启用随机扰动</span>
                      <input
                        aria-label="启用随机扰动"
                        type="checkbox"
                        checked={active.jitter.enabled}
                        onChange={(e) =>
                          setLayer({
                            jitter: {
                              ...active.jitter,
                              enabled: e.target.checked,
                            },
                          })
                        }
                      />
                    </label>
                    <p className="jitter-help">
                      每个单元独立变化。旋转叠加在单元角度上，固定种子可复现结果。
                    </p>
                    <fieldset
                      className="jitter-controls"
                      disabled={!active.jitter.enabled}
                    >
                      <Range
                        label="旋转扰动"
                        value={active.jitter.rotation}
                        min={0}
                        max={180}
                        suffix="±°"
                        onChange={(v) =>
                          setLayer({
                            jitter: { ...active.jitter, rotation: v },
                          })
                        }
                      />
                      <Range
                        label="位置扰动"
                        value={active.jitter.position * 100}
                        min={0}
                        max={100}
                        suffix="%"
                        onChange={(v) =>
                          setLayer({
                            jitter: { ...active.jitter, position: v / 100 },
                          })
                        }
                      />
                      <Range
                        label="大小扰动"
                        value={active.jitter.size * 100}
                        min={0}
                        max={100}
                        suffix="±%"
                        onChange={(v) =>
                          setLayer({
                            jitter: { ...active.jitter, size: v / 100 },
                          })
                        }
                      />
                      <label className="select-row">
                        <span>扰动种子</span>
                        <input
                          aria-label="扰动种子"
                          type="number"
                          value={active.jitter.seed}
                          min={0}
                          max={2147483647}
                          onFocus={begin}
                          onBlur={end}
                          onChange={(e) => {
                            if (
                              e.target.value !== "" &&
                              Number.isFinite(e.target.valueAsNumber)
                            )
                              setLayer({
                                jitter: {
                                  ...active.jitter,
                                  seed: Math.round(
                                    clamp(
                                      e.target.valueAsNumber,
                                      0,
                                      2147483647,
                                    ),
                                  ),
                                },
                              });
                          }}
                        />
                      </label>
                      <button
                        className="button subtle full-width"
                        onClick={() =>
                          setLayer({
                            jitter: {
                              ...active.jitter,
                              seed:
                                crypto.getRandomValues(new Uint32Array(1))[0] %
                                2147483648,
                            },
                          })
                        }
                      >
                        <Shuffle size={14} />
                        重新随机
                      </button>
                    </fieldset>
                    <p className="jitter-help">
                      位置幅度以网格间距为半径；大小在原尺寸上下浮动，可能超过设定的最大尺寸。圆形的旋转变化不可见。
                    </p>
                  </section>
                  <section>
                    <div className="property-heading">
                      <span>色彩与叠加</span>
                      <span
                        className="small-dot"
                        style={{ background: active.color }}
                      />
                    </div>
                    <label className="color-row">
                      <span>图层颜色</span>
                      <div>
                        <input
                          aria-label="图层颜色"
                          type="color"
                          value={active.color}
                          onFocus={begin}
                          onBlur={end}
                          onChange={(e) => setLayer({ color: e.target.value })}
                        />
                        <code>{active.color.toUpperCase()}</code>
                      </div>
                    </label>
                    <Range
                      label="不透明度"
                      value={active.opacity}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(v) => setLayer({ opacity: v })}
                    />
                    <Select
                      label="图层混合"
                      value={active.blend}
                      onChange={(v) => setLayer({ blend: v as Layer["blend"] })}
                      options={{
                        normal: "正常",
                        multiply: "正片叠底",
                        screen: "滤色",
                      }}
                    />
                  </section>
                </>
              ) : (
                <section className="empty-state">
                  <Layers size={28} />
                  <p>添加图层，开始创作。</p>
                  <button className="button primary" onClick={addLayer}>
                    <Plus size={14} />
                    添加图层
                  </button>
                </section>
              )}
              <section>
                <div className="property-heading">
                  <span>画布</span>
                  <Maximize size={14} />
                </div>
                <div className="dimension-row">
                  {(["width", "height"] as const).map((key, i) => (
                    <label key={key}>
                      <span>{i ? "H" : "W"}</span>
                      <input
                        aria-label={i ? "画布高度" : "画布宽度"}
                        type="number"
                        min={64}
                        max={4096}
                        value={project[key]}
                        onFocus={begin}
                        onBlur={end}
                        onChange={(e) => {
                          if (e.target.value)
                            apply((p) => {
                              p[key] = Math.round(
                                clamp(+e.target.value, 64, 4096),
                              );
                            });
                        }}
                      />
                    </label>
                  ))}
                </div>
                <Select
                  label="画布比例"
                  value=""
                  onChange={(v) => {
                    const [w, h] = v.split("x").map(Number);
                    apply((p) => {
                      p.width = w;
                      p.height = h;
                    });
                  }}
                  options={{
                    "": "自定义",
                    "1200x1200": "1:1 方形",
                    "1200x1600": "3:4 竖版",
                    "1920x1080": "16:9 横版",
                  }}
                />
                <label className="color-row">
                  <span>背景颜色</span>
                  <div>
                    <input
                      aria-label="背景颜色"
                      type="color"
                      value={project.background}
                      onFocus={begin}
                      onBlur={end}
                      onChange={(e) =>
                        apply((p) => {
                          p.background = e.target.value;
                        })
                      }
                    />
                    <code>{project.background.toUpperCase()}</code>
                  </div>
                </label>
                <label className="check-row">
                  <span>透明背景</span>
                  <input
                    type="checkbox"
                    checked={project.transparent}
                    onChange={(e) =>
                      apply((p) => {
                        p.transparent = e.target.checked;
                      })
                    }
                  />
                </label>
              </section>
            </div>
          </aside>
        </div>
        <footer className="statusbar">
          <span>
            <span className="status-dot" />
            {geometryResult.error ? "需要调整参数" : "实时预览"}
            <span className="status-divider" /> {count.toLocaleString()} 个单元
            <span className="status-divider" />
            {project.layers.filter((l) => l.visible).length} 个可见图层
          </span>
          <span>
            {ms.toFixed(0)} ms <span className="status-divider" /> HALFTONE
            STUDIO / 1.0
          </span>
        </footer>
        <input
          ref={assetInput}
          type="file"
          accept=".svg,.png"
          hidden
          onChange={(e) => {
            if (e.target.files?.[0]) void loadPattern(e.target.files[0]);
            e.target.value = "";
          }}
        />
        <input
          ref={projectInput}
          type="file"
          accept=".json"
          hidden
          onChange={(e) => {
            if (e.target.files?.[0]) void openProject(e.target.files[0]);
            e.target.value = "";
          }}
        />
        <input
          ref={pictureInput}
          aria-label="导入图片图层"
          type="file"
          accept=".png,.jpg,.jpeg,.webp"
          hidden
          onChange={(e) => {
            if (e.target.files?.[0]) void loadPicture(e.target.files[0]);
            e.target.value = "";
          }}
        />
        {!ready && <div className="loading-overlay">正在恢复工作台…</div>}
        {notice && (
          <div role="status" className="toast">
            <Check size={16} />
            <span>{notice}</span>
            <IconButton title="关闭提示" onClick={() => setNotice("")}>
              <X size={13} />
            </IconButton>
          </div>
        )}
        {modal && (
          <div
            className="modal-backdrop"
            onClick={() => {
              if (!busy) setModal(null);
            }}
          >
            <div
              className={"modal " + (modal === "presets" ? "preset-modal" : "")}
              role="dialog"
              aria-modal="true"
              aria-label={modal === "presets" ? "预设库" : "导出作品"}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-heading">
                <div>
                  <span className="eyebrow">
                    {modal === "presets"
                      ? "A STARTING POINT"
                      : "TAKE IT WITH YOU"}
                  </span>
                  <h2>
                    {modal === "presets" ? "选择一个新的起点" : "导出你的作品"}
                  </h2>
                </div>
                <IconButton
                  title="关闭窗口"
                  onClick={() => setModal(null)}
                  disabled={busy}
                >
                  <X size={18} />
                </IconButton>
              </div>
              {modal === "presets" ? (
                <>
                  <p className="modal-description">
                    每一个预设，都可以被你重新定义。切换后可撤销。
                  </p>
                  <div className="preset-grid">
                    {presets.map((name, i) => (
                      <button
                        className="preset-card"
                        key={name}
                        onClick={() => {
                          const p = preset(i);
                          replace(p);
                          setSelected(p.layers[0].id);
                          setFieldId(null);
                          setModal(null);
                          setZoom(1);
                          setPan({ x: 0, y: 0 });
                        }}
                      >
                        <PresetPreview index={i} />
                        <div>
                          <span>{String(i + 1).padStart(2, "0")}</span>
                          <strong>{name}</strong>
                          <ArrowUpRight size={15} />
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="export-info">
                    <div>
                      <span>画布尺寸</span>
                      <strong>
                        {project.width} × {project.height}
                      </strong>
                    </div>
                    <div>
                      <span>图案单元</span>
                      <strong>{count.toLocaleString()}</strong>
                    </div>
                  </div>
                  <button
                    className="export-option"
                    onClick={() => void exportFile("svg")}
                    disabled={busy || !!geometryResult.error}
                  >
                    <span className="file-type">SVG</span>
                    <div>
                      <strong>可编辑矢量图</strong>
                      <p>
                        {project.layers.some(
                          (l) =>
                            l.kind === "image" && l.visible && l.exportEnabled,
                        )
                          ? "图片图层作为原色位图内嵌，网点保留矢量。"
                          : project.layers.some(
                                (l) =>
                                  l.visible &&
                                  l.kind === "dots" &&
                                  l.shape === "custom" &&
                                  project.assets.find((a) => a.id === l.assetId)
                                    ?.kind === "png",
                              )
                            ? "含内嵌 PNG 单元，不会自动矢量化。"
                            : "保留矢量单元、图层和透明度。"}
                      </p>
                    </div>
                    <Download size={18} />
                  </button>
                  <div className="png-settings">
                    <label>PNG 导出倍率</label>
                    <div className="segmented">
                      {[1, 2, 4].map((s) => (
                        <button
                          key={s}
                          disabled={!canPng(s)}
                          title={
                            !canPng(s)
                              ? "超过 8192 边长或 1600 万总像素限制"
                              : undefined
                          }
                          className={pngScale === s ? "selected" : ""}
                          onClick={() => setPngScale(s)}
                        >
                          {s}×
                        </button>
                      ))}
                    </div>
                    <small>最长边 ≤ 8192 px · 总像素 ≤ 1600 万</small>
                  </div>
                  <button
                    className="export-option"
                    onClick={() => void exportFile("png")}
                    disabled={
                      busy || !!geometryResult.error || !canPng(pngScale)
                    }
                  >
                    <span className="file-type">PNG</span>
                    <div>
                      <strong>高清位图</strong>
                      <p>
                        {project.width * pngScale} × {project.height * pngScale}{" "}
                        · {project.transparent ? "透明背景" : "包含背景颜色"}
                      </p>
                    </div>
                    <Download size={18} />
                  </button>
                  {busy && (
                    <p className="export-progress">正在准备文件，请稍候…</p>
                  )}
                  <p className="modal-footnote">
                    文件在你的浏览器中生成。第三方编辑器对 SVG
                    混合效果的支持可能不同。
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </EditContext.Provider>
  );
}
function PresetPreview({ index }: { index: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    const p = preset(index),
      c = document.createElement("canvas");
    paint(c, p, generate(p), 300, 240).then(() => {
      if (alive && ref.current) {
        ref.current.width = 300;
        ref.current.height = 240;
        ref.current.getContext("2d")!.drawImage(c, 0, 0);
      }
    });
    return () => {
      alive = false;
    };
  }, [index]);
  return <canvas ref={ref} />;
}
createRoot(document.getElementById("root")!).render(<App />);

function AssetPreview({ asset, color }: { asset: Asset; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    assetImage(asset, color)
      .then((im) => {
        if (!live || !ref.current) return;
        const b = assetBox(asset),
          c = ref.current;
        c.width = 160;
        c.height = 112;
        const ctx = c.getContext("2d")!,
          ratio = Math.min(140 / b.w, 92 / b.h),
          w = b.w * ratio,
          h = b.h * ratio;
        ctx.clearRect(0, 0, 160, 112);
        ctx.drawImage(
          im,
          b.x,
          b.y,
          b.w,
          b.h,
          (160 - w) / 2,
          (112 - h) / 2,
          w,
          h,
        );
        if (asset.kind === "png") {
          ctx.globalCompositeOperation = "source-in";
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 160, 112);
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [asset, color]);
  return (
    <div className="asset-preview checker">
      <canvas ref={ref} aria-label="当前图案单元" />
      <span>
        {asset.kind.toUpperCase()} · {Math.round(assetBox(asset).w)} ×{" "}
        {Math.round(assetBox(asset).h)}
      </span>
    </div>
  );
}

function PictureInspector({
  layer: l,
  asset,
  project,
  change,
  replace,
  busy,
}: {
  layer: PictureLayer;
  asset: Asset;
  project: Project;
  change: (patch: Partial<PictureLayer>) => void;
  replace: () => void;
  busy: boolean;
}) {
  const { begin, end } = React.useContext(EditContext);
  return (
    <>
      <section>
        <div className="property-heading">
          <span>原色图片</span>
          <Shapes size={15} />
        </div>
        <input
          className="layer-name-input"
          aria-label="图层名称"
          value={l.name}
          maxLength={100}
          onFocus={begin}
          onBlur={end}
          onChange={(e) => change({ name: e.target.value })}
        />
        <div className="picture-preview checker">
          <img src={asset.data} alt={asset.name} />
        </div>
        <p className="jitter-help">
          {asset.width} × {asset.height} px · 保留原色与 Alpha
        </p>
        <button
          className="button subtle full-width"
          disabled={busy || l.locked}
          onClick={replace}
        >
          <Upload size={14} />
          替换图片
        </button>
        <label className="check-row">
          <span>锁定图片</span>
          <input
            aria-label="锁定图片"
            type="checkbox"
            checked={l.locked}
            onChange={(e) => change({ locked: e.target.checked })}
          />
        </label>
        <p className="jitter-help">
          {l.locked
            ? "图片摆放已锁定，可继续调整其他图层。"
            : "选择工具下拖动图片，或输入精确位置。"}
        </p>
      </section>
      <section>
        <div className="property-heading">
          <span>图片摆放</span>
          <Move size={14} />
        </div>
        <fieldset className="jitter-controls" disabled={l.locked}>
          <div className="dimension-row">
            {(["x", "y"] as const).map((key) => (
              <label key={key}>
                <span>{key.toUpperCase()}</span>
                <input
                  aria-label={"图片中心 " + key.toUpperCase()}
                  type="number"
                  value={+l[key].toFixed(2)}
                  min={-1000000}
                  max={1000000}
                  onFocus={begin}
                  onBlur={end}
                  onChange={(e) => {
                    if (
                      e.target.value !== "" &&
                      Number.isFinite(e.target.valueAsNumber)
                    )
                      change({
                        [key]: clamp(e.target.valueAsNumber, -1000000, 1000000),
                      });
                  }}
                />
              </label>
            ))}
          </div>
          <Range
            label="图片缩放"
            value={l.scaleX * 100}
            min={Math.max(0.01, (0.01 * l.scaleX) / l.scaleY)}
            max={Math.min(
              Math.max(1000, Math.ceil(l.scaleX * 100)),
              1000000,
              (1000000 * l.scaleX) / l.scaleY,
            )}
            step={0.1}
            suffix="%"
            onChange={(v) =>
              change({
                scaleX: v / 100,
                scaleY: (l.scaleY * (v / 100)) / l.scaleX,
              })
            }
          />
          <div className="dimension-row picture-dimensions">
            {(["width", "height"] as const).map((axis, i) => (
              <label key={axis}>
                <span>{i ? "H" : "W"}</span>
                <input
                  aria-label={i ? "图片高度" : "图片宽度"}
                  type="number"
                  value={+(asset[axis] * (i ? l.scaleY : l.scaleX)).toFixed(2)}
                  min={Math.max(0.5, asset[axis] * 0.0001)}
                  max={Math.min(1000000, asset[axis] * 10000)}
                  step={1}
                  onFocus={begin}
                  onBlur={end}
                  onChange={(e) => {
                    if (
                      e.target.value !== "" &&
                      Number.isFinite(e.target.valueAsNumber)
                    ) {
                      const size = clamp(
                        e.target.valueAsNumber,
                        Math.max(0.5, asset[axis] * 0.0001),
                        Math.min(1000000, asset[axis] * 10000),
                      );
                      change(
                        i
                          ? { scaleY: size / asset.height }
                          : { scaleX: size / asset.width },
                      );
                    }
                  }}
                />
              </label>
            ))}
          </div>
          <button
            className="button subtle full-width"
            title="恢复原始宽高比例，并按当前画布恢复导入时的适配尺寸；保留位置和旋转"
            onClick={() => {
              const scale = Math.min(
                project.width / asset.width,
                project.height / asset.height,
              );
              change({ scaleX: scale, scaleY: scale });
            }}
          >
            重置尺寸
          </button>
          <p className="jitter-help">
            边中点分别调整宽高；四角保持当前比例。按 Shift
            拖动边中点也可等比缩放，Esc 取消。缩放滑块同步改变宽高。
            重置尺寸恢复原始比例及画布适配大小，保留位置与旋转。
          </p>
          <Range
            label="图片旋转"
            value={l.rotation}
            min={-180}
            max={180}
            suffix="°"
            onChange={(v) => change({ rotation: v })}
          />
          <div className="picture-placement">
            <button
              className="button subtle"
              onClick={() =>
                change({ x: project.width / 2, y: project.height / 2 })
              }
            >
              居中图片
            </button>
            <button
              className="button subtle"
              onClick={() => change(fitPicture(l, asset, project))}
            >
              适应画布
            </button>
            <button
              className="button subtle"
              onClick={() => change(fitPicture(l, asset, project, true))}
            >
              铺满画布
            </button>
          </div>
        </fieldset>
      </section>
      <section>
        <div className="property-heading">
          <span>合成与导出</span>
          <Layers size={14} />
        </div>
        <Range
          label="图片不透明度"
          value={l.opacity}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => change({ opacity: v })}
        />
        <Select
          label="图片混合"
          value={l.blend}
          onChange={(v) => change({ blend: v as PictureLayer["blend"] })}
          options={{ normal: "正常", multiply: "正片叠底", screen: "滤色" }}
        />
        <label className="check-row">
          <span>参与导出</span>
          <input
            aria-label="参与导出"
            type="checkbox"
            checked={l.exportEnabled}
            onChange={(e) => change({ exportEnabled: e.target.checked })}
          />
        </label>
        <p className="jitter-help">
          {l.exportEnabled
            ? "可见时随作品导出，SVG 中嵌入原色位图。"
            : "仅在工作台预览中显示，PNG 和 SVG 导出均排除此图片。工程仍保留图片。"}
        </p>
      </section>
    </>
  );
}
