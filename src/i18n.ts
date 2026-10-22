import { useSyncExternalStore } from "react";
import { zhCN } from "./messages";

export type Locale = "en" | "zh-CN";
export const languageStorageKey = "halftone-language";
export type Message = {
  key: string;
  values?: Record<string, string | number | Message>;
};
const listeners = new Set<() => void>();
let locale: Locale = readLocale();

function readLocale(): Locale {
  try {
    return localStorage.getItem(languageStorageKey) === "zh-CN"
      ? "zh-CN"
      : "en";
  } catch {
    return "en";
  }
}

export function setLocale(next: Locale) {
  if (next !== "en" && next !== "zh-CN") return;
  locale = next;
  try {
    localStorage.setItem(languageStorageKey, next);
  } catch {
    // The language still works for this session when storage is unavailable.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== languageStorageKey && event.key !== null) return;
    locale = readLocale();
    listeners.forEach((listener) => listener());
  });
}

export function useLocale() {
  return useSyncExternalStore(
    subscribe,
    () => locale,
    () => "en" as Locale,
  );
}

export function t(
  key: string,
  values: Message["values"] = {},
  language: Locale = locale,
): string {
  const template =
    language === "zh-CN" && Object.hasOwn(zhCN, key) ? zhCN[key] : key;
  return template.replace(/\{(\w+)\}/g, (token, name: string) => {
    const value = values[name];
    return value === undefined
      ? token
      : typeof value === "object"
        ? t(value.key, value.values, language)
        : String(value);
  });
}

export function errorMessage(error: unknown): Message {
  const message = error instanceof Error ? error.message : String(error);
  if (Object.hasOwn(zhCN, message)) return { key: message };
  if (message.startsWith("Invalid project: ")) {
    return {
      key: "Invalid project: {reason}",
      values: { reason: errorMessage(message.slice(17)) },
    };
  }
  const unsupported =
    /^SVG contains unsupported content: (.+)\. Convert text to outlines and export as basic paths\.$/.exec(
      message,
    );
  if (unsupported)
    return {
      key: "SVG contains unsupported content: {content}. Convert text to outlines and export as basic paths.",
      values: { content: { key: unsupported[1] } },
    };
  if (error instanceof SyntaxError)
    return { key: "Invalid JSON file. Choose a HalfTone project file." };
  return { key: "Something went wrong. Please try again." };
}

const defaultNames = [
  "Untitled",
  "Halftone layer",
  "Two-tone tide",
  "Gradient dots",
  "Radial bloom",
  "Noise cloud",
  "Ripple study",
  "Crossed grids",
  "Star study",
  "Forest / Ripples",
  "Coral / Ripples",
  "Forest / Rotation",
];
const legacyNames = Object.fromEntries(
  defaultNames.map((key) => [zhCN[key], key]),
);

// Old projects stored translated defaults. Resolve these only for display;
// user edits and original project data remain untouched.
export function localizedName(
  item: { name: string; customName?: boolean },
  language: Locale = locale,
): string {
  if (item.customName) return item.name;
  const key = Object.hasOwn(legacyNames, item.name)
    ? legacyNames[item.name]
    : item.name;
  if (defaultNames.includes(key)) return t(key, {}, language);
  const numbered = /^(?:Layer|图层) (\d+)$/.exec(key);
  if (numbered) return t("Layer {number}", { number: numbered[1] }, language);
  const copy = /^(.*)(?: copy| 副本)$/.exec(key);
  if (copy)
    return t(
      "{name} copy",
      { name: localizedName({ name: copy[1] }, language) },
      language,
    );
  const contour = /^(?:Contour|轮廓) \/ (.*)$/.exec(key);
  if (contour) return t("Contour / {name}", { name: contour[1] }, language);
  return item.name;
}
