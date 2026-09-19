import { test, expect } from "@playwright/test";
test("jitter controls migrate old projects, change preview, undo and persist", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".loading-overlay")).toHaveCount(0);
  const legacy = await page.evaluate(async () => {
    const m = await import("/src/model.ts" as string),
      p = m.blank();
    p.layers[0].shape = "custom";
    p.layers[0].assetId = "arrow";
    p.layers[0].fields = [m.field("uniform")];
    p.layers[0].spacing = 50;
    p.layers[0].max = 35;
    p.assets = [
      {
        id: "arrow",
        kind: "svg",
        name: "arrow.svg",
        width: 100,
        height: 100,
        data: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 35H55V10L95 50 55 90V65H10Z"/></svg>',
      },
    ];
    delete p.layers[0].jitter;
    return JSON.stringify(p);
  });
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles({
      name: "legacy.json",
      mimeType: "application/json",
      buffer: Buffer.from(legacy),
    });
  const toggle = page.getByLabel("启用随机扰动", { exact: true });
  await expect(toggle).not.toBeChecked();
  const rotation = page.getByLabel("旋转扰动", { exact: true });
  await expect(rotation).toBeDisabled();
  await expect(page.locator(".local-label")).toHaveText("已在本机保存");
  const original = await page
    .locator('canvas[aria-label="图案实时预览"]')
    .evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await toggle.check();
  await expect(rotation).toBeEnabled();
  await expect(rotation).toHaveValue("45");
  await expect
    .poll(() =>
      page
        .locator('canvas[aria-label="图案实时预览"]')
        .evaluate((c: HTMLCanvasElement) => c.toDataURL()),
    )
    .not.toBe(original);
  await rotation.fill("180");
  await rotation.blur();
  await page.getByRole("button", { name: "撤销 Ctrl+Z", exact: true }).click();
  await expect(rotation).toHaveValue("45");
  await page
    .getByRole("button", { name: "重做 Ctrl+Shift+Z", exact: true })
    .click();
  await expect(rotation).toHaveValue("180");
  await page.getByLabel("位置扰动", { exact: true }).fill("25");
  await page.getByLabel("位置扰动", { exact: true }).blur();
  await page.getByLabel("大小扰动", { exact: true }).fill("20");
  await page.getByLabel("大小扰动", { exact: true }).blur();
  await page.getByRole("button", { name: "重新随机", exact: true }).click();
  const seed = await page.getByLabel("扰动种子", { exact: true }).inputValue();
  await expect(page.locator(".local-label")).toHaveText("已在本机保存");
  await page.screenshot({
    path: "test-results/jitter-workbench.png",
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator(".loading-overlay")).toHaveCount(0);
  await expect(page.getByLabel("扰动种子", { exact: true })).toHaveValue(seed);
  await expect(rotation).toHaveValue("180");
  await toggle.uncheck();
  await expect
    .poll(() =>
      page
        .locator('canvas[aria-label="图案实时预览"]')
        .evaluate((c: HTMLCanvasElement) => c.toDataURL()),
    )
    .toBe(original);
});
test("random asymmetric SVG and PNG render consistently and validate", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".loading-overlay")).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const m = await import("/src/model.ts" as string),
      e = await import("/src/engine.ts" as string),
      r = await import("/src/render.ts" as string),
      s = await import("/src/storage.ts" as string),
      a = await import("/src/assets.ts" as string);
    const shape =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 35H55V10L95 50 55 90V65H10Z"/></svg>';
    const svg = {
      id: "arrow",
      name: "arrow.svg",
      kind: "svg",
      ...a.cleanSvg(shape),
    };
    const c = document.createElement("canvas");
    c.width = 100;
    c.height = 100;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(5, 5, 20, 90);
    ctx.fillRect(25, 75, 65, 20);
    const png = {
      id: "ell",
      name: "ell.png",
      kind: "png",
      width: 100,
      height: 100,
      data: c.toDataURL(),
    };
    const errors = [];
    for (const asset of [svg, png]) {
      const p = m.blank();
      p.width = 600;
      p.height = 600;
      p.assets = [asset];
      Object.assign(p.layers[0], {
        shape: "custom",
        assetId: asset.id,
        grid: "hex",
        rotation: 30,
        spacing: 40,
        max: 32,
        jitter: {
          enabled: true,
          position: 0.4,
          rotation: 180,
          size: 0.4,
          seed: 427,
        },
      });
      const valid = await s.validateProject(JSON.parse(JSON.stringify(p))),
        g = e.generate(valid);
      const left = document.createElement("canvas");
      await r.paint(left, p, g, 600, 600);
      const text = await r.exportSvg(p, g),
        url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" })),
        im = await a.loadImage(url),
        right = document.createElement("canvas");
      right.width = 600;
      right.height = 600;
      right.getContext("2d")!.drawImage(im, 0, 0);
      URL.revokeObjectURL(url);
      const aa = left.getContext("2d")!.getImageData(0, 0, 600, 600).data,
        bb = right.getContext("2d")!.getImageData(0, 0, 600, 600).data;
      let diff = 0;
      for (let i = 0; i < aa.length; i++) diff += Math.abs(aa[i] - bb[i]);
      errors.push(diff / aa.length);
      if (JSON.stringify(g) !== JSON.stringify(e.generate(valid)))
        throw Error("non-deterministic");
    }
    const p = m.blank();
    p.layers[0].jitter.seed = -1;
    let rejected = false;
    try {
      await s.validateProject(p);
    } catch {
      rejected = true;
    }
    return { errors, rejected };
  });
  console.log("Perturbed SVG/Canvas parity:", result);
  expect(result.rejected).toBe(true);
  for (const v of result.errors) expect(v).toBeLessThan(8);
});
