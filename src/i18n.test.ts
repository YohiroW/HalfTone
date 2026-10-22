import { describe, expect, it } from "vitest";
import { errorMessage, localizedName, t } from "./i18n";
import { zhCN } from "./messages";

describe("localization", () => {
  it("keeps every interpolation available in both languages", () => {
    const placeholders = (s: string) =>
      [...s.matchAll(/\{\w+\}/g)].map(([key]) => key).sort();
    for (const [english, chinese] of Object.entries(zhCN)) {
      expect(chinese.trim(), english).not.toBe("");
      expect(placeholders(chinese), english).toEqual(placeholders(english));
    }
  });

  it("resolves old default names for display without changing the document", () => {
    const project = { name: "径向聚集" };
    expect(localizedName(project, "en")).toBe("Radial bloom");
    expect(localizedName(project, "zh-CN")).toBe("径向聚集");
    expect(project.name).toBe("径向聚集");
    expect(localizedName({ name: "图层 3 副本" }, "en")).toBe("Layer 3 copy");
    expect(localizedName({ name: "Halftone layer copy" }, "zh-CN")).toBe(
      "网点图层 副本",
    );
    expect(localizedName({ name: "Contour / photo.png" }, "zh-CN")).toBe(
      "轮廓 / photo.png",
    );
  });

  it("preserves custom names, even when they match a built-in name", () => {
    expect(localizedName({ name: "我的海报" }, "en")).toBe("我的海报");
    expect(
      localizedName({ name: "Radial bloom", customName: true }, "zh-CN"),
    ).toBe("Radial bloom");
    expect(localizedName({ name: "径向聚集", customName: true }, "en")).toBe(
      "径向聚集",
    );
    expect(localizedName({ name: "toString" }, "zh-CN")).toBe("toString");
  });

  it("localizes nested errors and leaves interpolated filenames intact", () => {
    const error = errorMessage(new Error("Invalid project: Canvas size"));
    expect(t(error.key, error.values, "zh-CN")).toBe("项目无效：画布尺寸");
    expect(t(error.key, error.values, "en")).toBe(
      "Invalid project: Canvas size",
    );
    const invalidJSON = errorMessage(new SyntaxError("Unexpected token"));
    expect(t(invalidJSON.key, {}, "zh-CN")).toBe(
      "JSON 文件无效，请选择 HalfTone 项目文件。",
    );
    expect(
      t("Imported {name} · Uses the layer color", { name: "Noise" }, "zh-CN"),
    ).toBe("已导入 Noise · 使用图层颜色");
    expect(t("unknown", {}, "zh-CN")).toBe("unknown");
    expect(t("toString", {}, "zh-CN")).toBe("toString");
  });
});
