import { test, expect } from "@playwright/test";
test("workbench renders, edits, undoes, persists and exports", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("已在本机保存", { exact: true })).toBeVisible();
  await expect(page.getByLabel("图案实时预览")).toBeVisible();
  await expect(page.locator(".canvas-error")).toHaveCount(0);
  await page.screenshot({ path: "test-results/workbench.png", fullPage: true });
  const initial = await page
    .getByLabel("网格间距", { exact: true })
    .inputValue();
  const slider = page.getByLabel("网格间距 滑块");
  const rect = await slider.boundingBox();
  if (!rect) throw Error("missing slider");
  await page.mouse.move(rect.x + rect.width * 0.2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * 0.4, rect.y + rect.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(page.getByLabel("网格间距", { exact: true })).not.toHaveValue(
    initial,
  );
  await page.getByRole("button", { name: "撤销 Ctrl+Z", exact: true }).click();
  await expect(page.getByLabel("网格间距", { exact: true })).toHaveValue(
    initial,
  );
  await page.getByRole("button", { name: "交错网格", exact: true }).click();
  await expect(page.locator(".layer-card.selected")).toContainText("交错网格");
  await page.getByLabel("添加生成场").selectOption("radial");
  await expect(page.getByRole("heading", { name: "生成场属性" })).toBeVisible();
  const board = await page.locator(".artboard").boundingBox();
  if (!board) throw Error("missing board");
  await page.mouse.click(
    board.x + board.width * 0.25,
    board.y + board.height * 0.35,
  );
  await expect(page.getByLabel("中心 X", { exact: true })).toHaveValue("0.25");
  await page.getByRole("button", { name: "返回图层属性" }).click();
  await page.getByLabel("图层名称").fill("交互测试");
  await page.getByLabel("图层名称").blur();
  await expect(page.getByText("已在本机保存", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("图层名称")).toHaveValue("交互测试");
  await page.getByRole("button", { name: "导出作品", exact: true }).click();
  const pendingSvg = page.waitForEvent("download");
  await page.getByRole("button", { name: /SVG 可编辑矢量图/ }).click();
  const svg = await pendingSvg;
  await svg.saveAs("test-results/export.svg");
  const pendingPng = page.waitForEvent("download");
  await page.getByRole("button", { name: /PNG 高清位图/ }).click();
  await (await pendingPng).saveAs("test-results/export.png");
  await page.getByRole("button", { name: "关闭窗口" }).click();
  const pendingProject = page.waitForEvent("download");
  await page.getByRole("button", { name: "保存工程", exact: true }).click();
  await (await pendingProject).saveAs("test-results/project.json");
  expect(errors).toEqual([]);
});
test("custom SVG and PNG, crop, standalone export, invalid SVG rejection", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("已在本机保存", { exact: true })).toBeVisible();
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill-rule="evenodd" d="M10 10H90V90H10Z M35 35H65V65H35Z"/></svg>';
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "hole.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(svg),
    });
  await expect(
    page.getByText("已导入 hole.svg · 使用图层颜色", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".canvas-error")).toHaveCount(0);
  await page.getByRole("button", { name: "裁去透明留白", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "还原", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "导出作品", exact: true }).click();
  const svgWait = page.waitForEvent("download");
  await page.getByRole("button", { name: /SVG 可编辑矢量图/ }).click();
  await (await svgWait).saveAs("test-results/custom.svg");
  await page.getByRole("button", { name: "关闭窗口" }).click();
  await page.screenshot({
    path: "test-results/custom-pattern.png",
    fullPage: true,
  });
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const x = c.getContext("2d")!;
    x.fillStyle = "rgba(255,0,0,0.5)";
    x.beginPath();
    x.arc(32, 32, 20, 0, Math.PI * 2);
    x.fill();
    return c.toDataURL().split(",")[1];
  });
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "alpha.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
  await expect(
    page.getByText("已导入 alpha.png · 使用图层颜色", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("透明背景", { exact: true }).check();
  await page.getByRole("button", { name: "导出作品", exact: true }).click();
  await expect(
    page.getByText("含内嵌 PNG 单元，不会自动矢量化。"),
  ).toBeVisible();
  const pngSvgWait = page.waitForEvent("download");
  await page.getByRole("button", { name: /SVG 可编辑矢量图/ }).click();
  await (await pngSvgWait).saveAs("test-results/embedded-png.svg");
  await page.getByRole("button", { name: "关闭窗口" }).click();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "bad.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script></svg>',
      ),
    });
  await expect(page.getByRole("status")).toContainText("暂不支持");
  await expect(page.locator(".upload-pattern")).toContainText("alpha.png");
});
test("renderer keeps SVG and Canvas appearance aligned", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("已在本机保存", { exact: true })).toBeVisible();
  const results = await page.evaluate(async () => {
    const model = await import("/src/model.ts" as string),
      engine = await import("/src/engine.ts" as string),
      render = await import("/src/render.ts" as string),
      assets = await import("/src/assets.ts" as string);
    const errors = [];
    for (let i = 0; i < 7; i++) {
      const p = model.preset(i),
        g = engine.generate(p),
        canvas = document.createElement("canvas");
      await render.paint(canvas, p, g, 480, 480);
      const svg = await render.exportSvg(p, g),
        url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })),
        im = await assets.loadImage(url),
        other = document.createElement("canvas");
      other.width = 480;
      other.height = 480;
      other.getContext("2d")!.drawImage(im, 0, 0, 480, 480);
      URL.revokeObjectURL(url);
      const a = canvas.getContext("2d")!.getImageData(0, 0, 480, 480).data,
        b = other.getContext("2d")!.getImageData(0, 0, 480, 480).data;
      let diff = 0;
      for (let j = 0; j < a.length; j++) diff += Math.abs(a[j] - b[j]);
      errors.push({ preset: i, mean: diff / a.length });
    }
    return errors;
  });
  console.log("Canvas vs SVG mean channel error:", results);
  for (const r of results) expect(r.mean).toBeLessThan(8);
});
test("small layout and preset selection", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await page.goto("/");
  await expect(page.locator(".loading-overlay")).toHaveCount(0);
  await expect(page.locator(".local-label")).toHaveText("已在本机保存");
  await page.getByRole("button", { name: "预设库", exact: true }).click();
  await page.getByRole("button", { name: /07 星形实验/ }).click();
  await expect(page.getByLabel("工程名称")).toHaveValue("星形实验");
  await page.screenshot({
    path: "test-results/narrow-layout.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("material alpha, crop, project round-trip and performance", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".loading-overlay")).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const m = await import("/src/model.ts" as string),
      e = await import("/src/engine.ts" as string),
      r = await import("/src/render.ts" as string),
      a = await import("/src/assets.ts" as string),
      s = await import("/src/storage.ts" as string);
    const source = document.createElement("canvas");
    source.width = 100;
    source.height = 80;
    const cx = source.getContext("2d")!;
    cx.fillStyle = "rgba(255,0,0,0.5)";
    cx.fillRect(20, 10, 60, 60);
    const png = {
      id: m.uid(),
      name: "alpha.png",
      kind: "png",
      data: source.toDataURL(),
      width: 100,
      height: 80,
    };
    const svg = {
      id: m.uid(),
      name: "outline.svg",
      kind: "svg",
      ...a.cleanSvg(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 100 80" fill="none"><path stroke="#000" stroke-width="5" d="M30 35H90V85H30Z"/></svg>',
      ),
    };
    const results = [];
    for (const asset of [png, svg]) {
      const cropped = await a.cropAsset(asset),
        p = m.blank();
      p.transparent = true;
      p.assets = [cropped];
      Object.assign(p.layers[0], {
        shape: "custom",
        assetId: asset.id,
        color: "#2361bd",
        spacing: 45,
        max: 36,
        rotation: 25,
        fields: [m.field("uniform")],
      });
      const valid = await s.validateProject(JSON.parse(JSON.stringify(p))),
        g = e.generate(valid),
        canvas = document.createElement("canvas");
      await r.paint(canvas, valid, g, 480, 480);
      const text = await r.exportSvg(valid, g),
        url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" })),
        image = await a.loadImage(url),
        other = document.createElement("canvas");
      other.width = 480;
      other.height = 480;
      other.getContext("2d")!.drawImage(image, 0, 0, 480, 480);
      URL.revokeObjectURL(url);
      const left = canvas.getContext("2d")!.getImageData(0, 0, 480, 480).data,
        right = other.getContext("2d")!.getImageData(0, 0, 480, 480).data;
      let total = 0,
        maxAlpha = 0;
      for (let i = 0; i < left.length; i++) {
        total +=
          i % 4 === 3
            ? Math.abs(left[i] - right[i])
            : Math.abs(
                (left[i] * left[i - (i % 4) + 3]) / 255 -
                  (right[i] * right[i - (i % 4) + 3]) / 255,
              );
        if (i % 4 === 3) maxAlpha = Math.max(maxAlpha, left[i]);
      }
      results.push({
        kind: asset.kind,
        error: total / left.length,
        maxAlpha,
        crop: cropped.crop,
        embedded: text.includes("data:image/png;base64,"),
        vector: text.includes("<path"),
      });
    }
    const bad = m.blank();
    bad.layers[0].spacing = 0;
    let rejected = false;
    try {
      await s.validateProject(bad);
    } catch {
      rejected = true;
    }
    const perf = [];
    const large = m.preset(3);
    large.layers[0].spacing = 6;
    large.layers[0].max = 6;
    for (const p of [m.preset(0), large]) {
      const times = [];
      for (let i = 0; i < 4; i++) {
        const start = performance.now(),
          g = e.generate(p);
        await r.paint(document.createElement("canvas"), p, g, 900, 900);
        times.push(performance.now() - start);
      }
      perf.push({ name: p.name, candidates: e.estimate(p), times });
    }
    return { results, rejected, perf };
  });
  console.log("Material and performance:", JSON.stringify(result));
  expect(result.rejected).toBe(true);
  for (const r of result.results) expect(r.error).toBeLessThan(8);
  expect(result.results[0].maxAlpha).toBeGreaterThan(120);
  expect(result.results[0].maxAlpha).toBeLessThanOrEqual(128);
  expect(result.results[0].embedded).toBe(true);
  expect(result.results[1].vector).toBe(true);
  expect(result.results[0].crop).toEqual({ x: 20, y: 10, w: 60, h: 60 });
  expect(result.perf[1].candidates).toBeLessThan(50000);
  expect(Math.max(...result.perf[1].times)).toBeLessThan(2000);
});
test("project import restores materials and rejects invalid projects", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".loading-overlay")).toHaveCount(0);
  const json = await page.evaluate(async () => {
    const m = await import("/src/model.ts" as string);
    return JSON.stringify(m.preset(6));
  });
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles({
      name: "star.halftone.json",
      mimeType: "application/json",
      buffer: Buffer.from(json),
    });
  await expect(page.getByLabel("工程名称")).toHaveValue("星形实验");
  await expect(page.locator(".upload-pattern")).toContainText("四芒星.svg");
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":99}'),
    });
  await expect(page.getByRole("status")).toContainText("不支持的工程版本");
  await expect(page.getByLabel("工程名称")).toHaveValue("星形实验");
});
