import { test, expect } from "@playwright/test";

test("contour alpha clipping, halo, transforms, exports and deleted source", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const m = await import("/src/model.ts" as string);
    const e = await import("/src/engine.ts" as string);
    const r = await import("/src/render.ts" as string);
    const c = await import("/src/contour.ts" as string);
    const storage = await import("/src/storage.ts" as string);
    const p = m.blank();
    p.width = 256;
    p.height = 256;
    p.transparent = true;
    const source = document.createElement("canvas");
    source.width = 80;
    source.height = 80;
    const sx = source.getContext("2d")!;
    sx.fillStyle = "rgba(0,0,0,0.5)";
    sx.fillRect(10, 10, 60, 60);
    sx.fillStyle = "#000";
    sx.fillRect(20, 20, 40, 40);
    const asset = {
      id: m.uid(),
      name: "alpha.png",
      kind: "png",
      purpose: "picture",
      width: 80,
      height: 80,
      data: source.toDataURL(),
    };
    p.assets = [asset];
    const pic = m.pictureLayer(asset, p);
    pic.scaleX = pic.scaleY = 1;
    pic.visible = false;
    const dots = p.layers[0];
    dots.fields = [m.field("uniform")];
    dots.spacing = 8;
    dots.min = dots.max = 12;
    dots.attachment = {
      pictureId: pic.id,
      mode: "inside",
      spread: 8,
      feather: 24,
    };
    p.layers.push(pic);
    const geometry = () => e.generate(p);
    const render = async () => {
      const cv = document.createElement("canvas");
      await r.paint(cv, p, geometry(), 256, 256);
      return cv;
    };
    const inside = await render();
    const alpha = (cv: HTMLCanvasElement, x: number, y: number) =>
      cv.getContext("2d")!.getImageData(x, y, 1, 1).data[3];
    const insideSamples = [
      alpha(inside, 128, 128),
      alpha(inside, 100, 128),
      alpha(inside, 80, 128),
    ];
    const svg = await r.exportSvg(p, geometry());
    const im = new Image();
    im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    await im.decode();
    const svgCanvas = document.createElement("canvas");
    svgCanvas.width = svgCanvas.height = 256;
    svgCanvas.getContext("2d")!.drawImage(im, 0, 0);
    const svgSamples = [
      alpha(svgCanvas, 128, 128),
      alpha(svgCanvas, 100, 128),
      alpha(svgCanvas, 80, 128),
    ];
    dots.attachment.mode = "halo";
    const halo = await c.attachGeometry(p, geometry());
    const before = halo[0].points.map((v: any) => [v.x, v.y, v.size]);
    pic.x += 48;
    pic.rotation = 35;
    pic.scaleX = 1.3;
    const after = (await c.attachGeometry(p, geometry()))[0].points;
    const png = await r.exportPng(p, geometry(), 1);
    const validated = await storage.validateProject(p);
    p.layers.pop();
    const missing = (await c.attachGeometry(p, geometry()))[0].points.length;
    return {
      insideSamples,
      svgSamples,
      before,
      after,
      missing,
      pngSize: png.size,
      binding: validated.layers[0].attachment,
      svg,
    };
  });
  expect(result.insideSamples[0]).toBe(255);
  expect(result.insideSamples[1]).toBeGreaterThanOrEqual(126);
  expect(result.insideSamples[1]).toBeLessThanOrEqual(129);
  expect(result.insideSamples[2]).toBe(0);
  expect(result.svgSamples).toEqual(result.insideSamples);
  expect(result.before.length).toBeGreaterThan(0);
  expect(result.before.some((v: number[]) => v[2] < 12)).toBe(true);
  expect(result.after.map((v: any) => [v.x, v.y, v.size])).not.toEqual(
    result.before,
  );
  expect(result.missing).toBe(0);
  expect(result.pngSize).toBeGreaterThan(100);
  expect(result.binding.mode).toBe("halo");
});

test("image shortcut creates a bound backing and persists controls", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".loading-overlay")).toHaveCount(0);
  // Isolate the backing from the startup preset for visual QA.
  for (const name of ["珊瑚 / 波纹", "墨绿 / 波纹"]) {
    await page
      .locator(".layer-card")
      .filter({ hasText: name })
      .getByRole("button", { name: "隐藏图层", exact: true })
      .click();
  }
  const data = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 400;
    c.height = 600;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#234d43";
    ctx.beginPath();
    ctx.arc(200, 125, 65, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(170, 190);
    ctx.lineTo(230, 190);
    ctx.lineTo(310, 400);
    ctx.lineTo(90, 400);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(145, 380, 40, 170);
    ctx.fillRect(215, 380, 40, 170);
    return c.toDataURL().split(",")[1];
  });
  const chooser = page.waitForEvent("filechooser");
  await page.getByLabel("添加图层", { exact: true }).selectOption("image");
  await (
    await chooser
  ).setFiles({
    name: "轮廓示例.png",
    mimeType: "image/png",
    buffer: Buffer.from(data, "base64"),
  });
  await page.getByRole("button", { name: "创建轮廓网点", exact: true }).click();
  await expect(page.getByLabel("轮廓模式")).toHaveValue("halo");
  await page.getByLabel("衰减宽度", { exact: true }).fill("95");
  await page.getByLabel("衰减宽度", { exact: true }).blur();
  await page.getByLabel("轮廓偏移 X", { exact: true }).fill("32");
  await page.getByLabel("轮廓偏移 X", { exact: true }).blur();
  await page.getByLabel("轮廓偏移 Y", { exact: true }).fill("-24");
  await page.getByLabel("轮廓偏移 Y", { exact: true }).blur();
  await page.getByLabel("轮廓模式").selectOption("inside");
  await expect(page.getByLabel("衰减宽度", { exact: true })).toHaveCount(0);
  await page.getByLabel("轮廓模式").selectOption("halo");
  await expect(page.getByLabel("衰减宽度", { exact: true })).toHaveValue("95");
  await expect(page.locator(".local-label")).toHaveText("已在本机保存");
  await page.reload();
  await expect(page.locator(".loading-overlay")).toHaveCount(0);
  await page.locator(".layer-card").filter({ hasText: "轮廓网点 /" }).click();
  await expect(page.getByLabel("轮廓模式")).toHaveValue("halo");
  await expect(page.getByLabel("衰减宽度", { exact: true })).toHaveValue("95");
  await expect(page.getByLabel("轮廓偏移 X", { exact: true })).toHaveValue(
    "32",
  );
  await expect(page.getByLabel("轮廓偏移 Y", { exact: true })).toHaveValue(
    "-24",
  );
  await page.getByRole("button", { name: "重置轮廓偏移", exact: true }).click();
  await expect(page.getByLabel("轮廓偏移 X", { exact: true })).toHaveValue("0");
  await expect(page.getByLabel("轮廓偏移 Y", { exact: true })).toHaveValue("0");
  await page.getByRole("button", { name: "撤销 Ctrl+Z", exact: true }).click();
  await expect(page.getByLabel("轮廓偏移 X", { exact: true })).toHaveValue(
    "32",
  );
  await expect(page.getByLabel("轮廓偏移 Y", { exact: true })).toHaveValue(
    "-24",
  );
  await page.screenshot({
    path: "test-results/contour-ui.png",
    fullPage: true,
  });
});

test("offset masks match translated sources across modes and exports", async ({
  page,
}) => {
  await page.goto("/");
  const results = await page.evaluate(async () => {
    const m = await import("/src/model.ts" as string);
    const e = await import("/src/engine.ts" as string);
    const r = await import("/src/render.ts" as string);
    const storage = await import("/src/storage.ts" as string);
    const p = m.blank();
    p.width = p.height = 256;
    p.transparent = true;
    const source = document.createElement("canvas");
    source.width = source.height = 80;
    const ctx = source.getContext("2d")!;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(8, 8, 60, 60);
    ctx.fillStyle = "black";
    ctx.fillRect(20, 15, 35, 50);
    const a = {
      id: m.uid(),
      name: "offset.png",
      kind: "png",
      purpose: "picture",
      width: 80,
      height: 80,
      data: source.toDataURL(),
    };
    p.assets = [a];
    const pic = m.pictureLayer(a, p);
    pic.visible = false;
    pic.scaleX = 1.5;
    pic.scaleY = 0.7;
    pic.rotation = 37;
    p.layers.push(pic);
    const l = p.layers[0];
    l.fields = [m.field("uniform")];
    l.spacing = 8;
    l.min = l.max = 10;
    l.attachment = {
      pictureId: pic.id,
      mode: "inside",
      spread: 8,
      feather: 24,
    };
    const old = await storage.validateProject(p);
    const render = async (project: any) => {
      const cv = document.createElement("canvas");
      await r.paint(cv, project, e.generate(project), 256, 256);
      return cv;
    };
    const pixels = (cv: HTMLCanvasElement) =>
      cv.getContext("2d")!.getImageData(0, 0, 256, 256).data;
    const error = (a: Uint8ClampedArray, b: Uint8ClampedArray) =>
      a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0) / a.length;
    const rows = [];
    for (const mode of ["inside", "halo"])
      for (const [dx, dy] of [
        [32, -24],
        [-120, 104],
      ]) {
        l.attachment = { ...l.attachment, mode, offsetX: 0, offsetY: 0 };
        const before = await render(p);
        l.attachment.offsetX = dx;
        l.attachment.offsetY = dy;
        const actual = await render(p);
        const reference = structuredClone(p);
        reference.layers[1].x += dx;
        reference.layers[1].y += dy;
        reference.layers[0].attachment.offsetX =
          reference.layers[0].attachment.offsetY = 0;
        const expected = await render(reference);
        const svg = await r.exportSvg(p, e.generate(p));
        const im = new Image();
        im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
        await im.decode();
        const svgCv = document.createElement("canvas");
        svgCv.width = svgCv.height = 256;
        svgCv.getContext("2d")!.drawImage(im, 0, 0);
        const blob = await r.exportPng(p, e.generate(p), 1);
        const bitmap = await createImageBitmap(blob);
        const pngCv = document.createElement("canvas");
        pngCv.width = pngCv.height = 256;
        pngCv.getContext("2d")!.drawImage(bitmap, 0, 0);
        bitmap.close();
        rows.push({
          translation: error(pixels(actual), pixels(expected)),
          changed: error(pixels(actual), pixels(before)),
          svg: error(pixels(actual), pixels(svgCv)),
          png: error(pixels(actual), pixels(pngCv)),
        });
      }
    const saved = await storage.validateProject(p);
    l.attachment.offsetX = Infinity;
    let rejected = false;
    try {
      await storage.validateProject(p);
    } catch {
      rejected = true;
    }
    return {
      rows,
      original: [pic.x, pic.y, pic.rotation, pic.scaleX, pic.scaleY],
      old: old.layers[0].attachment,
      saved: saved.layers[0].attachment,
      rejected,
    };
  });
  for (const row of results.rows) {
    expect(row.translation).toBe(0);
    expect(row.changed).toBeGreaterThan(1);
    expect(row.svg).toBeLessThan(3);
    // PNG decoding can round premultiplied RGB at translucent edges.
    expect(row.png).toBeLessThan(0.01);
  }
  expect(results.original).toEqual([128, 128, 37, 1.5, 0.7]);
  expect([results.old.offsetX, results.old.offsetY]).toEqual([0, 0]);
  expect([results.saved.offsetX, results.saved.offsetY]).toEqual([-120, 104]);
  expect(results.rejected).toBe(true);
});
