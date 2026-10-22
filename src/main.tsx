import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  PanelLeft,
  PanelRight,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  Grid2X2,
  Layers,
  Maximize,
  Minus,
  MousePointer2,
  Plus,
  RotateCcw,
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
  Modal,
  Disclosure,
  FileMenu,
  navigateList,
  useCompactLayout,
} from "./ui";
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
  pressed,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
  pressed?: boolean;
}) {
  return (
    <button
      className={"icon-button " + className}
      title={title}
      aria-label={title}
      aria-pressed={pressed}
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
  value: rawValue,
  min: rawMin,
  max: rawMax,
  step: rawStep = 1,
  onChange: change,
  suffix = "",
  percent = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
  suffix?: string;
  percent?: boolean;
}) {
  const { begin, end } = React.useContext(EditContext);
  const multiplier = percent ? 100 : 1;
  const value = rawValue * multiplier,
    min = rawMin * multiplier,
    max = rawMax * multiplier,
    step = rawStep * multiplier;
  const onChange = (n: number) => change(n / multiplier);
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="range-control">
      <div className="control-heading">
        <label>{label}</label>
        <div className="number-wrap">
          <input
            aria-label={label}
            type="number"
            value={draft ?? +value.toFixed(3)}
            min={min}
            max={max}
            step={step}
            onFocus={() => {
              begin();
              setDraft(String(+value.toFixed(3)));
            }}
            onBlur={() => {
              if (
                draft !== null &&
                draft.trim() !== "" &&
                Number.isFinite(Number(draft))
              ) {
                onChange(clamp(Number(draft), min, max));
              }
              setDraft(null);
              end();
            }}
            onChange={(e) => {
              setDraft(e.target.value);
              if (
                e.target.value !== "" &&
                Number.isFinite(e.target.valueAsNumber) &&
                e.target.valueAsNumber >= min &&
                e.target.valueAsNumber <= max
              )
                onChange(e.target.valueAsNumber);
            }}
          />
          <span>{percent ? "%" : suffix}</span>
        </div>
      </div>
      <input
        aria-label={label + " slider"}
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
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
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
  const compact = useCompactLayout();
  const [leftOpen, setLeftOpen] = useState(true),
    [rightOpen, setRightOpen] = useState(true);
  const [compactPanel, setCompactPanel] = useState<
    "layers" | "inspector" | null
  >(null);
  const [inspectorTab, setInspectorTab] = useState<"selection" | "canvas">(
    "selection",
  );
  const showLayers = compact ? compactPanel === "layers" : leftOpen;
  const showInspector = compact ? compactPanel === "inspector" : rightOpen;
  const revealInspector = () => {
    setInspectorTab("selection");
    if (compact) {
      setCompactPanel("inspector");
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLButtonElement>("#inspector-panel button")
          ?.focus(),
      );
    } else setRightOpen(true);
  };
  const toggleLayers = () =>
    compact
      ? setCompactPanel((p) => (p === "layers" ? null : "layers"))
      : setLeftOpen((v) => !v);
  const toggleInspector = () =>
    compact
      ? setCompactPanel((p) => (p === "inspector" ? null : "inspector"))
      : setRightOpen((v) => !v);

  const [project, setProject] = useState<Project>(() => preset(0)),
    projectRef = useRef(project);
  const [selected, setSelected] = useState(project.layers[0]?.id || ""),
    [fieldId, setFieldId] = useState<string | null>(null);
  const [ready, setReady] = useState(false),
    [saveStatus, setSaveStatus] = useState("Restoring…"),
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
  useEffect(() => {
    if (modal) setNotice("");
  }, [modal]);
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
        if (live) notify("Could not restore autosave: " + (e as Error).message);
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
    setSaveStatus("Saving…");
    let live = true;
    const timer = setTimeout(
      () =>
        saveLocal(project)
          .then(() => {
            if (live) setSaveStatus("Saved on this device");
          })
          .catch(() => {
            if (live) {
              setSaveStatus("Autosave failed");
              notify(
                "Local storage is unavailable. Use Save project to download a backup.",
              );
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
      if (modal) return;
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
  }, [historyVersion, modal]);
  const geometryResult = useMemo(() => {
    try {
      if (estimate(project) > 50000)
        throw Error(
          "Over 50,000 candidate cells. Increase spacing or hide some layers.",
        );
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
      (viewport.width - (compact ? 32 : 72)) / project.width,
      (viewport.height - (compact ? 100 : 120)) / project.height,
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
    l.name = "Layer " + (project.layers.length + 1);
    apply((p) => p.layers.push(l));
    setSelected(l.id);
    setFieldId(null);
    revealInspector();
  };
  const duplicateLayer = () => {
    if (!current || project.layers.length >= 8) return;
    const l = structuredClone(current);
    l.id = uid();
    l.name += " copy";
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
    revealInspector();
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
      if (project.assets.length >= 32)
        throw Error("A project can contain up to 32 assets.");
      const a = await readAsset(file);
      apply((p) => {
        p.assets.push(a);
        const l = p.layers.find((l) => l.id === layerId);
        if (l?.kind === "dots") {
          l.assetId = a.id;
          l.shape = "custom";
        }
      });
      notify("Imported " + a.name + " · Uses the layer color");
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
      if (p.assets.length >= 32)
        throw Error("A project can contain up to 32 assets.");
      if (
        p.assets.reduce((n, a) => n + a.data.length, 0) + a.data.length >
        48 * 1024 * 1024
      )
        throw Error(
          "Project assets exceed 48 MB. Resize the image before importing.",
        );
      if (!replaceId && p.layers.length >= 8)
        throw Error("A project can contain up to 8 layers.");
      const target = replaceId
        ? p.layers.find((l) => l.id === replaceId)
        : null;
      if (replaceId && target?.kind !== "image")
        throw Error("The image layer to replace no longer exists.");
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
      revealInspector();
      notify(
        (replaceId ? "Replaced" : "Added") +
          " image layer · Original color and transparency",
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
      notify(
        "Transparent padding trimmed. All layers using this asset were updated.",
      );
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
      if (file.size > 64 * 1024 * 1024)
        throw Error("Project files must be smaller than 64 MB.");
      const next = await validateProject(JSON.parse(await file.text()));
      replace(next);
      setSelected(next.layers[0]?.id || "");
      setFieldId(null);
      setPan({ x: 0, y: 0 });
      setZoom(1);
      notify("Project opened");
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
      notify("Exported " + format.toUpperCase());
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
        <a className="skip-link" href="#artwork">
          Skip to artwork
        </a>
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

          <div className="project-title">
            <input
              aria-label="Project name"
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
          </div>
          <span className="local-label">
            <span className="status-dot" />
            {saveStatus}
          </span>
          <div className="header-actions">
            <button
              className="icon-button panel-toggle"
              title="Layers panel"
              aria-label="Layers panel"
              aria-expanded={showLayers}
              aria-controls="layers-panel"
              onClick={toggleLayers}
            >
              <PanelLeft size={18} />
            </button>
            <button
              className="icon-button panel-toggle"
              title="Inspector panel"
              aria-label="Inspector panel"
              aria-expanded={showInspector}
              aria-controls="inspector-panel"
              onClick={toggleInspector}
            >
              <PanelRight size={18} />
            </button>
            <FileMenu
              onNew={() => {
                const p = blank();
                replace(p);
                setSelected(p.layers[0].id);
                setFieldId(null);
              }}
              onOpen={() => projectInput.current?.click()}
              onSave={saveFile}
            />
            <span className="separator" />
            <IconButton
              title="Undo"
              onClick={undo}
              disabled={!undoStack.current.length}
            >
              <Undo2 size={17} />
            </IconButton>
            <IconButton
              title="Redo"
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
              Presets
            </button>
            <button
              className="button primary"
              onClick={() => setModal("export")}
            >
              <Download size={15} />
              Export
            </button>
          </div>
        </header>
        <div
          className={`main-layout ${showLayers ? "with-layers" : ""} ${showInspector ? "with-inspector" : ""}`}
        >
          <aside
            id="layers-panel"
            aria-label="Layers and fields"
            className="left-panel"
            hidden={!showLayers}
          >
            <div className="section-heading">
              <h2>Layers</h2>
              <select
                className="add-layer-select"
                aria-label="Add layer"
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
                  ＋ Add layer
                </option>
                <option value="dots">Halftone layer</option>
                <option value="image">Image layer</option>
              </select>
            </div>
            <div
              className="layer-stack"
              role="group"
              aria-label="Layers"
              onKeyDown={navigateList}
            >
              {[...project.layers].reverse().map((l, reverseIndex) => (
                <div
                  key={l.id}
                  className={
                    "layer-card " + (current?.id === l.id ? "selected" : "")
                  }
                >
                  <button
                    className="row-select"
                    aria-pressed={current?.id === l.id}
                    aria-label={`Select layer ${l.name}`}
                    onClick={() => {
                      setSelected(l.id);
                      setFieldId(null);
                      setInspectorTab("selection");
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
                          ? "Image · " +
                            (l.locked ? "Locked · " : "") +
                            (l.exportEnabled
                              ? "Include in export"
                              : "Preview only")
                          : `${l.fields.length} ${l.fields.length === 1 ? "field" : "fields"} · ${l.grid === "hex" ? "Staggered" : "Square"} grid`}
                      </span>
                    </div>
                  </button>
                  <IconButton
                    title={l.visible ? "Hide layer" : "Show layer"}
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
                      title="Move layer up"
                      disabled={reverseIndex === 0}
                      onClick={() => reorderLayer(l.id, 1)}
                    >
                      <ArrowUp size={11} />
                    </IconButton>
                    <IconButton
                      title="Move layer down"
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
              <span>{project.layers.length} / 8 layers</span>
              <div>
                <IconButton
                  title="Duplicate layer"
                  onClick={duplicateLayer}
                  disabled={!current || project.layers.length >= 8}
                >
                  <Copy size={14} />
                </IconButton>
                <IconButton
                  title="Delete layer"
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
            {active && (
              <section
                className="owned-fields"
                aria-label={`Fields for ${active.name}`}
              >
                <div className="section-heading">
                  <h2>Fields</h2>
                  <span className="badge">{active.fields.length} / 8</span>
                </div>
                <p className="field-owner">
                  In <strong>{active.name}</strong>
                </p>
                <div
                  className="field-stack"
                  role="group"
                  aria-label="Fields"
                  onKeyDown={navigateList}
                >
                  {active &&
                    [...active.fields].reverse().map((f, i) => (
                      <div
                        key={f.id}
                        className={
                          "field-card " +
                          (activeField?.id === f.id ? "selected" : "")
                        }
                      >
                        <button
                          className="row-select"
                          aria-label={`Edit ${labels[f.kind]}`}
                          aria-pressed={activeField?.id === f.id}
                          onClick={() => {
                            setFieldId(f.id);
                            revealInspector();
                          }}
                        >
                          <div className={"field-glyph " + f.kind}>
                            {fieldIcons[f.kind]}
                          </div>
                          <div className="field-info">
                            <strong>{labels[f.kind]}</strong>
                            <span>
                              {i === active.fields.length - 1
                                ? "Base field"
                                : {
                                    replace: "Replace",
                                    add: "Add",
                                    multiply: "Multiply",
                                    max: "Maximum",
                                    min: "Minimum",
                                  }[f.blend]}{" "}
                              · {Math.round(f.strength * 100)}%
                            </span>
                          </div>
                        </button>
                        <IconButton
                          title={f.enabled ? "Disable field" : "Enable field"}
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
                      aria-label="Add field"
                      value=""
                      disabled={active.fields.length >= 8}
                      onChange={(e) => addField(e.target.value as FieldKind)}
                    >
                      <option value="" disabled>
                        Add field
                      </option>
                      {Object.entries(labels).map(([key, v]) => (
                        <option key={key} value={key}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </section>
            )}
            <div className="left-spacer" />
            <p className="left-footer">Stored on this device</p>
          </aside>
          <main
            id="artwork"
            tabIndex={-1}
            aria-label="Artwork"
            className={"workspace " + (tool === "pan" ? "pan-tool" : "")}
            ref={workspace}
            onPointerDown={pointerStart}
          >
            <div
              className="canvas-centered"
              style={{
                transform: "translate(" + pan.x + "px," + pan.y + "px)",
              }}
            >
              <div className="artboard-meta" style={{ width: displayWidth }}>
                <span>{project.name || "Untitled"}</span>
                <span>
                  {project.width} × {project.height}
                </span>
              </div>
              <div
                ref={stage}
                className={"artboard " + (project.transparent ? "checker" : "")}
                style={{ width: displayWidth, height: displayHeight }}
              >
                <canvas ref={canvas} aria-label="Live artwork preview" />
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
                            aria-label={"Resize image: " + h.label}
                            title={
                              h.x && h.y
                                ? "Drag to resize proportionally · Esc to cancel"
                                : "Drag to adjust " +
                                  (h.x ? "width" : "height") +
                                  " · Shift to keep proportions · Esc to cancel"
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
                    <strong>Preview unavailable</strong>
                    <p>{geometryResult.error || renderError}</p>
                  </div>
                )}
              </div>
            </div>
            {project.layers.length === 0 && (
              <section
                className="canvas-empty-state"
                aria-labelledby="empty-composition-title"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <Layers size={32} aria-hidden="true" />
                <h2 id="empty-composition-title">No layers yet</h2>
                <p>Add a layer or choose a preset to get started.</p>
                <div className="canvas-empty-actions">
                  <button className="button primary" onClick={addLayer}>
                    <Plus size={15} aria-hidden="true" />
                    Add layer
                  </button>
                  <button
                    className="button subtle"
                    onClick={() => setModal("presets")}
                  >
                    <Grid2X2 size={15} aria-hidden="true" />
                    Choose a preset
                  </button>
                </div>
                <span>
                  Deleted a layer by accident? Use Undo to bring it back.
                </span>
              </section>
            )}
            <div
              className="canvas-toolbar"
              role="group"
              aria-label="Canvas tools"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <IconButton
                title="Select or move field center"
                className={tool === "select" ? "active" : ""}
                pressed={tool === "select"}
                onClick={() => setTool("select")}
              >
                <MousePointer2 size={17} />
              </IconButton>
              <IconButton
                title="Pan canvas"
                className={tool === "pan" ? "active" : ""}
                pressed={tool === "pan"}
                onClick={() => setTool("pan")}
              >
                <Move size={17} />
              </IconButton>
              <span className="separator" />
              <IconButton
                title="Zoom out"
                onClick={() => setZoom((z) => Math.max(0.25, z / 1.25))}
              >
                <Minus size={16} />
              </IconButton>
              <span className="zoom-value">
                {Math.round(displayScale * 100)}%
              </span>
              <IconButton
                title="Zoom in"
                onClick={() => setZoom((z) => Math.min(5, z * 1.25))}
              >
                <Plus size={16} />
              </IconButton>
              <span className="separator" />
              <IconButton
                title="Fit to window"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
              >
                <Maximize size={16} />
              </IconButton>
            </div>
          </main>
          <aside
            id="inspector-panel"
            aria-label="Inspector"
            className="right-panel"
            hidden={!showInspector}
          >
            <div
              className="inspector-navigation"
              role="group"
              aria-label="Inspector view"
            >
              <button
                aria-pressed={inspectorTab === "selection"}
                onClick={() => setInspectorTab("selection")}
              >
                Selection
              </button>
              <button
                aria-pressed={inspectorTab === "canvas"}
                onClick={() => setInspectorTab("canvas")}
              >
                Canvas
              </button>
            </div>
            {inspectorTab === "selection" && (
              <div className="inspector-title">
                {activeField && (
                  <IconButton
                    title="Back to layer"
                    onClick={() => setFieldId(null)}
                  >
                    <ArrowLeft size={16} />
                  </IconButton>
                )}
                <div className="inspector-context">
                  <h2>
                    {activePicture
                      ? "Image properties"
                      : activeField
                        ? "Field properties"
                        : "Layer properties"}
                  </h2>
                  <p>
                    {current?.name || "No selection"}
                    {activeField && <> / {labels[activeField.kind]}</>}
                  </p>
                </div>
              </div>
            )}
            <div
              className="inspector-scroll"
              key={`${current?.id}-${fieldId}-${inspectorTab}`}
            >
              {inspectorTab === "selection" && (
                <>
                  {activePicture && pictureAsset ? (
                    <>
                      <section>
                        <button
                          className="button primary full-width"
                          disabled={project.layers.length >= 8}
                          onClick={() => {
                            const dots = layer();
                            dots.name = "Contour / " + activePicture.name;
                            dots.color = "#e95073";
                            dots.spacing = Math.max(
                              10,
                              Math.ceil(
                                Math.sqrt(
                                  (project.width * project.height) / 30000,
                                ),
                              ),
                            );
                            dots.max = 8;
                            dots.fields = [field("uniform")];
                            dots.attachment = {
                              pictureId: activePicture.id,
                              mode: "halo",
                              spread: 12,
                              feather: 60,
                            };
                            apply((p) =>
                              p.layers.splice(
                                p.layers.findIndex(
                                  (l) => l.id === activePicture.id,
                                ),
                                0,
                                dots,
                              ),
                            );
                            setSelected(dots.id);
                            setFieldId(null);
                          }}
                        >
                          <Sparkles size={15} />
                          Create contour layer
                        </button>
                      </section>
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
                    </>
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
                              title="Duplicate field"
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
                              title="Delete field"
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
                          label="Type"
                          value={activeField.kind}
                          onChange={(v) => setField({ kind: v as FieldKind })}
                          options={labels}
                        />
                        <Select
                          label="Field blend"
                          value={activeField.blend}
                          onChange={(v) =>
                            setField({ blend: v as Field["blend"] })
                          }
                          options={{
                            replace: "Replace",
                            add: "Add",
                            multiply: "Multiply",
                            max: "Maximum",
                            min: "Minimum",
                          }}
                        />
                        <Range
                          label="Strength"
                          percent
                          value={activeField.strength}
                          min={0}
                          max={1}
                          step={0.01}
                          onChange={(v) => setField({ strength: v })}
                        />
                        <label className="check-row">
                          <span>Invert</span>
                          <input
                            type="checkbox"
                            checked={activeField.invert}
                            onChange={(e) =>
                              setField({ invert: e.target.checked })
                            }
                          />
                        </label>
                        <div className="field-reorder">
                          <button
                            className="button subtle"
                            disabled={
                              active.fields.at(-1)?.id === activeField.id
                            }
                            onClick={() => reorderField(activeField.id, 1)}
                          >
                            <ArrowUp size={13} />
                            Move up
                          </button>
                          <button
                            className="button subtle"
                            disabled={active.fields[0]?.id === activeField.id}
                            onClick={() => reorderField(activeField.id, -1)}
                          >
                            <ArrowDown size={13} />
                            Move down
                          </button>
                        </div>
                      </section>
                      {activeField.kind !== "uniform" && (
                        <section>
                          <div className="property-heading">
                            <span>Distribution</span>
                            <Crosshair size={14} />
                          </div>
                          <Range
                            label="Center X"
                            value={activeField.x}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(v) => setField({ x: v })}
                          />
                          <Range
                            label="Center Y"
                            value={activeField.y}
                            min={0}
                            max={1}
                            step={0.01}
                            onChange={(v) => setField({ y: v })}
                          />
                          <Range
                            label="Scale"
                            value={activeField.scale}
                            min={0.05}
                            max={3}
                            step={0.01}
                            onChange={(v) => setField({ scale: v })}
                          />
                          {["linear", "waves"].includes(activeField.kind) && (
                            <Range
                              label="Direction"
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
                                label="Frequency"
                                value={activeField.frequency}
                                min={0.1}
                                max={12}
                                step={0.1}
                                onChange={(v) => setField({ frequency: v })}
                              />
                              <Range
                                label="Phase"
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
                                label="Detail"
                                value={activeField.detail}
                                min={1}
                                max={6}
                                onChange={(v) => setField({ detail: v })}
                              />
                              <label className="select-row">
                                <span>Seed</span>
                                <input
                                  aria-label="Noise seed"
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
                                New seed
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
                          <span>Pattern</span>
                          <Shapes size={15} />
                        </div>
                        <input
                          className="layer-name-input"
                          aria-label="Layer name"
                          value={active.name}
                          maxLength={100}
                          onFocus={begin}
                          onBlur={end}
                          onChange={(e) => setLayer({ name: e.target.value })}
                        />
                        <div className="shape-options">
                          {(
                            ["circle", "square", "diamond", "custom"] as const
                          ).map((s, i) => (
                            <button
                              key={s}
                              title={
                                ["Circle", "Square", "Diamond", "Custom"][i]
                              }
                              aria-label={
                                ["Circle", "Square", "Diamond", "Custom"][i]
                              }
                              aria-pressed={active.shape === s}
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
                              <span>
                                {["Circle", "Square", "Diamond", "Custom"][i]}
                              </span>
                            </button>
                          ))}
                        </div>
                        <Disclosure
                          title="Pattern library"
                          key={active.shape}
                          defaultOpen={active.shape === "custom"}
                        >
                          <button
                            className="upload-pattern"
                            disabled={busy}
                            onClick={() => assetInput.current?.click()}
                          >
                            <Upload size={15} />
                            <span>
                              {active.shape === "custom" && asset
                                ? asset.name
                                : "Import pattern"}
                              <small>
                                SVG or transparent PNG · Single-color shape
                              </small>
                            </span>
                            <Plus size={13} />
                          </button>
                          {active.shape === "custom" && asset && (
                            <>
                              <AssetPreview
                                asset={asset}
                                color={active.color}
                              />
                              <div className="field-reorder">
                                <button
                                  className="button subtle"
                                  disabled={busy}
                                  onClick={crop}
                                >
                                  Trim transparent padding
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
                                    Restore
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                          {project.assets.length > 0 && (
                            <Select
                              label="Assets"
                              value={active.assetId || ""}
                              onChange={(v) => {
                                if (v)
                                  setLayer({ assetId: v, shape: "custom" });
                              }}
                              options={{
                                "": "Choose an asset",
                                ...Object.fromEntries(
                                  project.assets
                                    .filter((a) => a.purpose !== "picture")
                                    .map((a) => [a.id, a.name]),
                                ),
                              }}
                            />
                          )}
                        </Disclosure>
                        <Range
                          label="Pattern rotation"
                          value={active.rotation}
                          min={-180}
                          max={180}
                          suffix="°"
                          onChange={(v) => setLayer({ rotation: v })}
                        />
                      </section>
                      <section>
                        <div className="property-heading">
                          <span>Grid</span>
                          <Grid2X2 size={14} />
                        </div>
                        <div className="segmented">
                          <button
                            aria-pressed={active.grid === "square"}
                            className={
                              active.grid === "square" ? "selected" : ""
                            }
                            onClick={() => setLayer({ grid: "square" })}
                          >
                            Square grid
                          </button>
                          <button
                            aria-pressed={active.grid === "hex"}
                            className={active.grid === "hex" ? "selected" : ""}
                            onClick={() => setLayer({ grid: "hex" })}
                          >
                            Staggered grid
                          </button>
                        </div>
                        <Range
                          label="Grid spacing"
                          value={active.spacing}
                          min={4}
                          max={120}
                          suffix="px"
                          onChange={(v) => setLayer({ spacing: v })}
                        />
                        <Range
                          label="Grid angle"
                          value={active.angle}
                          min={-180}
                          max={180}
                          suffix="°"
                          onChange={(v) => setLayer({ angle: v })}
                        />
                        <Range
                          label="Minimum size"
                          value={active.min}
                          min={0}
                          max={120}
                          suffix="px"
                          onChange={(v) =>
                            setLayer({ min: v, max: Math.max(v, active.max) })
                          }
                        />
                        <Range
                          label="Maximum size"
                          value={active.max}
                          min={0}
                          max={160}
                          suffix="px"
                          onChange={(v) =>
                            setLayer({ max: v, min: Math.min(v, active.min) })
                          }
                        />
                        <Range
                          label="Tone curve"
                          value={active.gamma}
                          min={0.1}
                          max={4}
                          step={0.05}
                          onChange={(v) => setLayer({ gamma: v })}
                        />
                        <details>
                          <summary>
                            Position offset <ChevronRight size={13} />
                          </summary>
                          <Range
                            label="Horizontal offset"
                            value={active.offsetX}
                            min={-200}
                            max={200}
                            suffix="px"
                            onChange={(v) => setLayer({ offsetX: v })}
                          />
                          <Range
                            label="Vertical offset"
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
                          <span>Appearance</span>
                          <span
                            className="small-dot"
                            style={{ background: active.color }}
                          />
                        </div>
                        <label className="color-row">
                          <span>Layer color</span>
                          <div>
                            <input
                              aria-label="Layer color"
                              type="color"
                              value={active.color}
                              onFocus={begin}
                              onBlur={end}
                              onChange={(e) =>
                                setLayer({ color: e.target.value })
                              }
                            />
                            <code>{active.color.toUpperCase()}</code>
                          </div>
                        </label>
                        <Range
                          label="Opacity"
                          percent
                          value={active.opacity}
                          min={0}
                          max={1}
                          step={0.01}
                          onChange={(v) => setLayer({ opacity: v })}
                        />
                        <Select
                          label="Layer blend"
                          value={active.blend}
                          onChange={(v) =>
                            setLayer({ blend: v as Layer["blend"] })
                          }
                          options={{
                            normal: "Normal",
                            multiply: "Multiply",
                            screen: "Screen",
                          }}
                        />
                      </section>
                      <Disclosure
                        title="Image contour"
                        defaultOpen={!!active.attachment}
                      >
                        <label className="check-row">
                          <span>Source image</span>
                          <select
                            aria-label="Linked image"
                            value={active.attachment?.pictureId ?? ""}
                            onChange={(e) =>
                              setLayer({
                                attachment: e.target.value
                                  ? {
                                      pictureId: e.target.value,
                                      offsetX: active.attachment?.offsetX ?? 0,
                                      offsetY: active.attachment?.offsetY ?? 0,
                                      mode: active.attachment?.mode ?? "halo",
                                      spread: active.attachment?.spread ?? 12,
                                      feather: active.attachment?.feather ?? 60,
                                    }
                                  : undefined,
                              })
                            }
                          >
                            <option value="">None</option>
                            {active.attachment &&
                              !project.layers.some(
                                (l) => l.id === active.attachment!.pictureId,
                              ) && (
                                <option value={active.attachment.pictureId}>
                                  Image deleted
                                </option>
                              )}
                            {project.layers
                              .filter((l) => l.kind === "image")
                              .map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.name}
                                </option>
                              ))}
                          </select>
                        </label>
                        {active.attachment && (
                          <>
                            <label className="check-row">
                              <span>Mode</span>
                              <select
                                aria-label="Contour mode"
                                value={active.attachment.mode}
                                onChange={(e) =>
                                  setLayer({
                                    attachment: {
                                      ...active.attachment!,
                                      mode: e.target.value as "inside" | "halo",
                                    },
                                  })
                                }
                              >
                                <option value="halo">Outer halo</option>
                                <option value="inside">Clip inside</option>
                              </select>
                            </label>
                            {(["offsetX", "offsetY"] as const).map((axis) => (
                              <Range
                                key={axis}
                                label={
                                  axis === "offsetX"
                                    ? "Contour offset X"
                                    : "Contour offset Y"
                                }
                                value={active.attachment![axis] ?? 0}
                                min={-4096}
                                max={4096}
                                suffix="px"
                                onChange={(v) =>
                                  setLayer({
                                    attachment: {
                                      ...active.attachment!,
                                      [axis]: v,
                                    },
                                  })
                                }
                              />
                            ))}
                            <button
                              className="button subtle full-width"
                              disabled={
                                !(
                                  active.attachment.offsetX ||
                                  active.attachment.offsetY
                                )
                              }
                              onClick={() =>
                                setLayer({
                                  attachment: {
                                    ...active.attachment!,
                                    offsetX: 0,
                                    offsetY: 0,
                                  },
                                })
                              }
                            >
                              <RotateCcw size={13} />
                              Reset contour offset
                            </button>
                            {active.attachment.mode === "halo" && (
                              <>
                                <Range
                                  label="Spread"
                                  value={active.attachment.spread}
                                  min={0}
                                  max={300}
                                  suffix="px"
                                  onChange={(v) =>
                                    setLayer({
                                      attachment: {
                                        ...active.attachment!,
                                        spread: v,
                                      },
                                    })
                                  }
                                />
                                <Range
                                  label="Falloff"
                                  value={active.attachment.feather}
                                  min={0}
                                  max={300}
                                  suffix="px"
                                  onChange={(v) =>
                                    setLayer({
                                      attachment: {
                                        ...active.attachment!,
                                        feather: v,
                                      },
                                    })
                                  }
                                />
                              </>
                            )}
                            <p className="control-hint">
                              Move the contour independently of the image and
                              grid. Positive X moves right; positive Y moves
                              down, in canvas pixels. Place the layer below the
                              image for a silhouette, or above it for an
                              overlay.
                            </p>
                            {!project.layers.some(
                              (l) => l.id === active.attachment!.pictureId,
                            ) && (
                              <p role="status">
                                The source image was deleted. Relink an image or
                                choose None to show these dots.
                              </p>
                            )}
                          </>
                        )}
                        {!project.layers.some((l) => l.kind === "image") && (
                          <p className="control-hint">
                            Add a transparent PNG or WebP image to use its
                            contour.
                          </p>
                        )}
                      </Disclosure>
                      <Disclosure
                        title="Random variation"
                        defaultOpen={active.jitter.enabled}
                      >
                        <label className="check-row">
                          <span>Enable variation</span>
                          <input
                            aria-label="Enable variation"
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
                          Vary each cell independently. Keep the seed to
                          reproduce the same pattern.
                        </p>
                        <fieldset
                          className="jitter-controls"
                          disabled={!active.jitter.enabled}
                        >
                          <Range
                            label="Rotation variation"
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
                            label="Position variation"
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
                            label="Size variation"
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
                            <span>Variation seed</span>
                            <input
                              aria-label="Variation seed"
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
                                    crypto.getRandomValues(
                                      new Uint32Array(1),
                                    )[0] % 2147483648,
                                },
                              })
                            }
                          >
                            <Shuffle size={14} />
                            Randomize
                          </button>
                        </fieldset>
                        <p className="jitter-help">
                          Position uses grid spacing as its radius. Size
                          variation can exceed the maximum dot size. Rotation
                          has no visible effect on circles.
                        </p>
                      </Disclosure>
                    </>
                  ) : (
                    <section className="empty-state">
                      <Layers size={28} />
                      <p>Add a layer to start creating.</p>
                      <button className="button primary" onClick={addLayer}>
                        <Plus size={14} />
                        Add layer
                      </button>
                    </section>
                  )}
                </>
              )}
              {inspectorTab === "canvas" && (
                <>
                  <section>
                    <div className="property-heading">
                      <span>Canvas</span>
                      <Maximize size={14} />
                    </div>
                    <div className="dimension-row">
                      {(["width", "height"] as const).map((key, i) => (
                        <label key={key}>
                          <span>{i ? "H" : "W"}</span>
                          <input
                            aria-label={i ? "Canvas height" : "Canvas width"}
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
                      label="Aspect ratio"
                      value={
                        Math.abs(project.width / project.height - 1) < 0.001
                          ? "1200x1200"
                          : Math.abs(project.width / project.height - 0.75) <
                              0.001
                            ? "1200x1600"
                            : Math.abs(
                                  project.width / project.height - 16 / 9,
                                ) < 0.001
                              ? "1920x1080"
                              : ""
                      }
                      onChange={(v) => {
                        if (!v) return;
                        const [w, h] = v.split("x").map(Number);
                        apply((p) => {
                          p.width = w;
                          p.height = h;
                        });
                      }}
                      options={{
                        "": "Custom",
                        "1200x1200": "1:1 Square",
                        "1200x1600": "3:4 Portrait",
                        "1920x1080": "16:9 Landscape",
                      }}
                    />
                    <label className="color-row">
                      <span>Background color</span>
                      <div>
                        <input
                          aria-label="Background color"
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
                      <span>Transparent background</span>
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
                </>
              )}
            </div>
          </aside>
        </div>
        {compact && (
          <nav className="panel-switcher" aria-label="Workspace panels">
            <button
              aria-pressed={compactPanel === "layers"}
              onClick={toggleLayers}
            >
              <Layers size={17} />
              Layers
            </button>
            <button
              aria-pressed={compactPanel === null}
              onClick={() => setCompactPanel(null)}
            >
              <Maximize size={17} />
              Artwork
            </button>
            <button
              aria-pressed={compactPanel === "inspector"}
              onClick={toggleInspector}
            >
              <Settings2 size={17} />
              Inspector
            </button>
          </nav>
        )}
        <footer className="statusbar">
          <span>
            <span className="status-dot" />
            {geometryResult.error
              ? "Adjust settings to preview"
              : "Live preview"}
            <span className="status-divider" /> {count.toLocaleString()} cells
            <span className="status-divider" />
            {project.layers.filter((l) => l.visible).length} visible layers
          </span>
          <span>{ms.toFixed(0)} ms</span>
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
          aria-label="Import image layer"
          type="file"
          accept=".png,.jpg,.jpeg,.webp"
          hidden
          onChange={(e) => {
            if (e.target.files?.[0]) void loadPicture(e.target.files[0]);
            e.target.value = "";
          }}
        />
        {!ready && (
          <div className="loading-overlay">Restoring your workspace…</div>
        )}
        {notice && !modal && (
          <div role="status" className="toast">
            <Check size={16} />
            <span>{notice}</span>
            <IconButton
              title="Dismiss notification"
              onClick={() => setNotice("")}
            >
              <X size={13} />
            </IconButton>
          </div>
        )}
        {modal && (
          <Modal
            label={modal === "presets" ? "Presets" : "Export"}
            busy={busy}
            onClose={() => setModal(null)}
          >
            <div
              className={"modal " + (modal === "presets" ? "preset-modal" : "")}
            >
              <div className="modal-heading">
                <div>
                  <h2>
                    {modal === "presets" ? "Choose a preset" : "Export artwork"}
                  </h2>
                </div>
                <IconButton
                  title="Close dialog"
                  onClick={() => setModal(null)}
                  disabled={busy}
                >
                  <X size={18} />
                </IconButton>
              </div>
              {modal === "presets" ? (
                <>
                  <p className="modal-description">
                    Applying a preset replaces this composition. You can undo
                    this change.
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
                          <span className="preset-apply">Apply</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="export-info">
                    <div>
                      <span>Canvas size</span>
                      <strong>
                        {project.width} × {project.height}
                      </strong>
                    </div>
                    <div>
                      <span>Pattern cells</span>
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
                      <strong>Editable vector</strong>
                      <p>
                        {project.layers.some(
                          (l) =>
                            l.kind === "image" && l.visible && l.exportEnabled,
                        )
                          ? "Images are embedded in full color. Dots remain vectors."
                          : project.layers.some(
                                (l) =>
                                  l.visible &&
                                  l.kind === "dots" &&
                                  l.shape === "custom" &&
                                  project.assets.find((a) => a.id === l.assetId)
                                    ?.kind === "png",
                              )
                            ? "PNG pattern cells stay embedded images; they are not converted to vectors."
                            : "Preserves vector shapes, layers and transparency."}
                      </p>
                    </div>
                    <Download size={18} />
                  </button>
                  <div className="png-settings">
                    <label>PNG scale</label>
                    <div className="segmented">
                      {[1, 2, 4].map((s) => (
                        <button
                          key={s}
                          disabled={!canPng(s)}
                          title={
                            !canPng(s)
                              ? "Exceeds 8,192 pixels per side or 16 megapixels"
                              : undefined
                          }
                          aria-pressed={pngScale === s}
                          className={pngScale === s ? "selected" : ""}
                          onClick={() => setPngScale(s)}
                        >
                          {s}×
                        </button>
                      ))}
                    </div>
                    <small>Up to 8,192 px per side and 16 megapixels</small>
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
                      <strong>High-resolution image</strong>
                      <p>
                        {project.width * pngScale} × {project.height * pngScale}{" "}
                        ·{" "}
                        {project.transparent
                          ? "Transparent background"
                          : "Includes background color"}
                      </p>
                    </div>
                    <Download size={18} />
                  </button>
                  {busy && (
                    <p className="export-progress">Preparing your file…</p>
                  )}
                  <p className="modal-footnote">
                    Files are generated locally. SVG blending may look different
                    in other editors.
                  </p>
                </>
              )}
              {notice && (
                <div role="status" className="dialog-notice">
                  {notice}
                </div>
              )}
            </div>
          </Modal>
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
      <canvas ref={ref} aria-label="Current pattern cell" />
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
          <span>Image</span>
          <Shapes size={15} />
        </div>
        <input
          className="layer-name-input"
          aria-label="Layer name"
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
          {asset.width} × {asset.height} px · Original color and alpha
        </p>
        <button
          className="button subtle full-width"
          disabled={busy || l.locked}
          onClick={replace}
        >
          <Upload size={14} />
          Replace image
        </button>
        <label className="check-row">
          <span>Lock image</span>
          <input
            aria-label="Lock image"
            type="checkbox"
            checked={l.locked}
            onChange={(e) => change({ locked: e.target.checked })}
          />
        </label>
        <p className="jitter-help">
          {l.locked
            ? "Image placement is locked. Other layers are still editable."
            : "Drag the selected image or enter an exact position."}
        </p>
      </section>
      <section>
        <div className="property-heading">
          <span>Transform</span>
          <Move size={14} />
        </div>
        <fieldset className="jitter-controls" disabled={l.locked}>
          <div className="dimension-row">
            {(["x", "y"] as const).map((key) => (
              <label key={key}>
                <span>{key.toUpperCase()}</span>
                <input
                  aria-label={"Image center " + key.toUpperCase()}
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
            label="Image scale"
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
                  aria-label={i ? "Image height" : "Image width"}
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
            title="Restore the original aspect ratio and fit size, keeping position and rotation"
            onClick={() => {
              const scale = Math.min(
                project.width / asset.width,
                project.height / asset.height,
              );
              change({ scaleX: scale, scaleY: scale });
            }}
          >
            Reset size
          </button>
          <p className="jitter-help">
            Drag an edge to stretch, or a corner to keep proportions. Hold Shift
            while dragging an edge to keep proportions. Press Esc to cancel.
            Reset size restores the original ratio and fit without moving the
            image.
          </p>
          <Range
            label="Image rotation"
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
              Center image
            </button>
            <button
              className="button subtle"
              onClick={() => change(fitPicture(l, asset, project))}
            >
              Fit canvas
            </button>
            <button
              className="button subtle"
              onClick={() => change(fitPicture(l, asset, project, true))}
            >
              Fill canvas
            </button>
          </div>
        </fieldset>
      </section>
      <section>
        <div className="property-heading">
          <span>Appearance and export</span>
          <Layers size={14} />
        </div>
        <Range
          label="Image opacity"
          percent
          value={l.opacity}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => change({ opacity: v })}
        />
        <Select
          label="Image blend"
          value={l.blend}
          onChange={(v) => change({ blend: v as PictureLayer["blend"] })}
          options={{ normal: "Normal", multiply: "Multiply", screen: "Screen" }}
        />
        <label className="check-row">
          <span>Include in export</span>
          <input
            aria-label="Include in export"
            type="checkbox"
            checked={l.exportEnabled}
            onChange={(e) => change({ exportEnabled: e.target.checked })}
          />
        </label>
        <p className="jitter-help">
          {l.exportEnabled
            ? "Included in exports when visible. SVG embeds the full-color image."
            : "Shown only in the workspace. Excluded from PNG and SVG exports, but kept in the project."}
        </p>
      </section>
    </>
  );
}
