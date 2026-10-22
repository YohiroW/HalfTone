import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { blank } from "../src/model";

async function language(page: Page, locale: "en" | "zh-CN") {
  await page.locator(".file-menu summary").click();
  await page.locator(".language-setting select").selectOption(locale);
  await page.locator(".file-menu summary").click();
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
}

test("switching languages preserves edits, selection and undo, and survives reload", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".loading-overlay")).toHaveCount(0);
  const originalFields = await page.locator(".field-card").count();
  await page.getByLabel("Add field", { exact: true }).selectOption("noise");
  const selected = await page.locator(".field-card.selected").count();
  await language(page, "zh-CN");
  await expect(page).toHaveTitle("HalfTone — 网点图案工作室");
  await expect(page.getByRole("heading", { name: "场属性" })).toBeVisible();
  await expect(page.locator(".field-card.selected")).toHaveCount(selected);
  await expect(page.getByLabel("项目名称")).toHaveValue("双色潮汐");
  await expect(page.getByLabel("添加场").locator("option")).toHaveText([
    "添加场",
    "均匀",
    "线性渐变",
    "径向渐变",
    "波浪",
    "环形",
    "噪声",
  ]);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect(page.locator(".field-card")).toHaveCount(originalFields);
  await page.getByRole("button", { name: "重做", exact: true }).click();
  await expect(page.locator(".field-card")).toHaveCount(originalFields + 1);
  await page.getByRole("button", { name: "返回图层" }).click();
  await page.getByLabel("图层名称").fill("Radial bloom");
  await page.getByLabel("图层名称").blur();
  await expect(page.locator(".local-label")).toHaveText("已保存到此设备");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page
    .getByRole("button", { name: "选择图层 Radial bloom", exact: true })
    .click();
  await expect(page.getByLabel("图层名称")).toHaveValue("Radial bloom");
  await language(page, "en");
  await expect(page.getByLabel("Layer name")).toHaveValue("Radial bloom");
  await expect(page.getByLabel("Project name")).toHaveValue("Two-tone tide");
});

test("legacy defaults translate without rewriting saved names and custom names survive switching", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".loading-overlay")).toHaveCount(0);
  const project = blank();
  project.name = "径向聚集";
  project.layers[0].name = "网点图层";
  await page
    .locator('input[type="file"][accept=".json"]')
    .setInputFiles({
      name: "legacy.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(project)),
    });
  await expect(page.getByLabel("Project name")).toHaveValue("Radial bloom");
  await expect(page.getByLabel("Layer name")).toHaveValue("Halftone layer");
  await language(page, "zh-CN");
  await expect(page.getByLabel("项目名称")).toHaveValue("径向聚集");
  await page.locator(".file-menu summary").click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "保存项目", exact: true }).click();
  const download = await pending;
  const exported = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(exported.name).toBe("径向聚集");
  expect(exported.layers[0].name).toBe("网点图层");
  await page.getByLabel("项目名称").fill("我的海报");
  await page.getByLabel("项目名称").blur();
  await language(page, "en");
  await expect(page.getByLabel("Project name")).toHaveValue("我的海报");
  await page.getByRole("button", { name: "Presets", exact: true }).click();
  await page.getByRole("button", { name: /03 Radial bloom/ }).click();
  await language(page, "zh-CN");
  await expect(page.getByLabel("项目名称")).toHaveValue("径向聚集");
});

test("Chinese controls, presets, export and errors are localized at desktop and mobile sizes", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".loading-overlay")).toHaveCount(0);
  await language(page, "zh-CN");
  await page.getByText("随机变化", { exact: true }).click();
  await expect(page.getByLabel("启用随机变化")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Forest / Ripples");
  await page.getByRole("button", { name: "画布", exact: true }).click();
  await expect(page.getByLabel("宽高比")).toHaveValue("1200x1200");
  await page.getByRole("button", { name: "当前选择", exact: true }).click();
  await page.screenshot({ path: "test-results/localization-zh-desktop.png" });
  await page.getByRole("button", { name: "预设", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "预设" })).toContainText(
    "星形实验",
  );
  await expect(page.locator(".preset-card")).toHaveCount(7);
  await page.getByRole("button", { name: "关闭对话框" }).click();
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "导出" })).toContainText(
    "可编辑矢量图",
  );
  await page.getByRole("button", { name: "关闭对话框" }).click();
  await page
    .locator('input[type="file"][accept=".json"]')
    .setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from("not-json"),
    });
  await expect(page.getByRole("status")).toContainText(
    "JSON 文件无效，请选择 HalfTone 项目文件。",
  );
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole("button", { name: "图层", exact: true }).click();
  await expect(page.getByLabel("添加场")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator(".file-menu summary").click();
  await expect(page.getByLabel("语言")).toBeVisible();
  const menu = await page.locator(".file-popover").boundingBox();
  expect(menu!.x).toBeGreaterThanOrEqual(0);
  expect(menu!.x + menu!.width).toBeLessThanOrEqual(320);
  await page.screenshot({ path: "test-results/localization-zh-mobile.png" });
});
