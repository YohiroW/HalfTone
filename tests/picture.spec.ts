import { test, expect } from "@playwright/test";
test("picture import, placement, lock, reference switch and persistence", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".loading-overlay")).toHaveCount(0);
  const data = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 600;
    c.height = 360;
    const x = c.getContext("2d")!;
    const g = x.createLinearGradient(0, 0, 600, 360);
    g.addColorStop(0, "#1b3a57");
    g.addColorStop(1, "#e9a879");
    x.fillStyle = g;
    x.fillRect(0, 0, 600, 360);
    x.fillStyle = "#d7ed9f";
    x.beginPath();
    x.arc(400, 150, 85, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = "#122d37";
    x.fillRect(0, 260, 600, 100);
    return c.toDataURL().split(",")[1];
  });
  const chooser = page.waitForEvent("filechooser");
  await page.getByLabel("添加图层", { exact: true }).selectOption("image");
  await (
    await chooser
  ).setFiles({
    name: "preview-scene.png",
    mimeType: "image/png",
    buffer: Buffer.from(data, "base64"),
  });
  await expect(
    page.getByRole("heading", { name: "图片图层属性" }),
  ).toBeVisible();
  await expect(page.getByLabel("图片中心 X", { exact: true })).toHaveValue(
    "600",
  );
  await expect(page.getByLabel("图片缩放", { exact: true })).toHaveValue("200");
  const board = await page.locator(".artboard").boundingBox();
  if (!board) throw Error("missing artboard");
  const drag = async () => {
    await page.mouse.move(
      board.x + board.width / 2,
      board.y + board.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      board.x + board.width / 2 + 30,
      board.y + board.height / 2 + 20,
      { steps: 5 },
    );
    await page.mouse.up();
  };
  await drag();
  await expect(page.getByLabel("图片中心 X", { exact: true })).not.toHaveValue(
    "600",
  );
  await page.getByRole("button", { name: "撤销 Ctrl+Z", exact: true }).click();
  await expect(page.getByLabel("图片中心 X", { exact: true })).toHaveValue(
    "600",
  );
  await page.getByLabel("锁定图片", { exact: true }).check();
  await drag();
  await expect(page.getByLabel("图片中心 X", { exact: true })).toHaveValue(
    "600",
  );
  await expect(page.getByLabel("图片缩放", { exact: true })).toBeDisabled();
  await page.getByLabel("锁定图片", { exact: true }).uncheck();
  await page.getByLabel("图片旋转", { exact: true }).fill("30");
  await page.getByLabel("图片旋转", { exact: true }).blur();
  await page.getByRole("button", { name: "铺满画布", exact: true }).click();
  await page.getByLabel("参与导出", { exact: true }).uncheck();
  await expect(page.locator(".layer-card.selected")).toContainText("仅供预览");
  await page.getByRole("button", { name: "复制图层", exact: true }).click();
  await expect(page.locator(".layer-card")).toHaveCount(4);
  await page.getByRole("button", { name: "删除图层", exact: true }).click();
  await page
    .locator(".layer-card")
    .filter({ hasText: "preview-scene.png" })
    .click();
  await expect(page.locator(".local-label")).toHaveText("已在本机保存");
  await page.reload();
  await expect(page.locator(".loading-overlay")).toHaveCount(0);
  await page
    .locator(".layer-card")
    .filter({ hasText: "preview-scene.png" })
    .click();
  await expect(page.getByLabel("图片旋转", { exact: true })).toHaveValue("30");
  await expect(page.getByLabel("参与导出", { exact: true })).not.toBeChecked();
  // Place the reference under dot layers, keeping the full-color preview.
  await page
    .getByRole("button", { name: "下移图层", exact: true })
    .first()
    .click();
  await page
    .locator(".layer-card")
    .filter({ hasText: "preview-scene.png" })
    .hover();
  await page
    .locator(".layer-card")
    .filter({ hasText: "preview-scene.png" })
    .getByRole("button", { name: "下移图层", exact: true })
    .click();
  await page.getByRole("button", { name: "适应画布", exact: true }).click();
  await page.screenshot({
    path: "test-results/picture-layer.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("full-color PNG/JPG/WebP, compositing, reference exclusion and round-trip", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".loading-overlay")).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const m = await import("/src/model.ts" as string),
      a = await import("/src/assets.ts" as string),
      r = await import("/src/render.ts" as string),
      e = await import("/src/engine.ts" as string),
      s = await import("/src/storage.ts" as string);
    const source = document.createElement("canvas");
    source.width = 100;
    source.height = 80;
    const c = source.getContext("2d")!;
    c.fillStyle = "#e52a41";
    c.fillRect(0, 0, 50, 80);
    c.fillStyle = "rgba(20,100,230,0.5)";
    c.fillRect(50, 0, 50, 80);
    const formats = [];
    for (const [mime, ext] of [
      ["image/png", "png"],
      ["image/jpeg", "jpg"],
      ["image/webp", "webp"],
    ]) {
      const blob = await new Promise<Blob>((resolve) =>
        source.toBlob((v) => resolve(v!), mime),
      );
      const asset = await a.readPicture(
        new File([blob], "source." + ext, { type: mime }),
      );
      formats.push(asset.kind + ":" + asset.width + ":" + asset.purpose);
    }
    const asset = await a.readPicture(
      new File(
        [await new Promise<Blob>((res) => source.toBlob((v) => res(v!)))],
        "color.png",
        { type: "image/png" },
      ),
    );
    const p = m.blank();
    p.width = 400;
    p.height = 320;
    p.transparent = true;
    p.assets = [asset];
    const layer = m.pictureLayer(asset, p);
    p.layers = [layer];
    const geometry = e.generate(p);
    const canvas = document.createElement("canvas");
    await r.paint(canvas, p, geometry, 400, 320);
    const pixel = Array.from(
        canvas.getContext("2d")!.getImageData(20, 20, 1, 1).data,
      ),
      alpha = canvas.getContext("2d")!.getImageData(300, 20, 1, 1).data[3];
    const valid = await s.validateProject(JSON.parse(JSON.stringify(p)));
    const equal = JSON.stringify(valid) === JSON.stringify(p);
    const doc = new DOMParser().parseFromString(
      await r.exportSvg(p, geometry),
      "image/svg+xml",
    );
    const includes = doc.querySelectorAll("image").length;
    const parity = [];
    const dots = m.layer();
    dots.fields = [m.field("uniform")];
    dots.spacing = 30;
    dots.max = 22;
    dots.color = "#216840";
    dots.opacity = 0.65;
    for (const blend of ["normal", "multiply", "screen"]) {
      layer.blend = blend;
      layer.rotation = 25;
      layer.opacity = 0.7;
      for (const order of [
        [dots, layer],
        [layer, dots],
      ]) {
        p.layers = order;
        p.transparent = false;
        const g = e.generate(p);
        await r.paint(canvas, p, g, 400, 320, true);
        const url = URL.createObjectURL(
            new Blob([await r.exportSvg(p, g)], { type: "image/svg+xml" }),
          ),
          im = await a.loadImage(url),
          other = document.createElement("canvas");
        other.width = 400;
        other.height = 320;
        other.getContext("2d")!.drawImage(im, 0, 0);
        URL.revokeObjectURL(url);
        const aa = canvas.getContext("2d")!.getImageData(0, 0, 400, 320).data,
          bb = other.getContext("2d")!.getImageData(0, 0, 400, 320).data;
        let diff = 0;
        for (let i = 0; i < aa.length; i++) diff += Math.abs(aa[i] - bb[i]);
        parity.push(diff / aa.length);
      }
    }
    p.layers = [layer];
    p.transparent = true;
    layer.exportEnabled = false;
    const blob = await r.exportPng(p, [], 1),
      url = URL.createObjectURL(blob),
      im = await a.loadImage(url);
    canvas.getContext("2d")!.clearRect(0, 0, 400, 320);
    canvas.getContext("2d")!.drawImage(im, 0, 0);
    URL.revokeObjectURL(url);
    const excluded = canvas.getContext("2d")!.getImageData(200, 160, 1, 1)
        .data[3],
      noImages = !new DOMParser()
        .parseFromString(await r.exportSvg(p, []), "image/svg+xml")
        .querySelector("image");
    layer.visible = false;
    await r.paint(canvas, p, [], 400, 320);
    const hidden = canvas.getContext("2d")!.getImageData(200, 160, 1, 1)
      .data[3];
    const old = m.blank();
    delete old.layers[0].kind;
    const migrated = await s.validateProject(old);
    return {
      formats,
      pixel,
      alpha,
      equal,
      includes,
      parity,
      excluded,
      noImages,
      hidden,
      migrated: migrated.layers[0].kind,
    };
  });
  console.log("Picture render checks:", result);
  expect(result.formats).toEqual([
    "png:100:picture",
    "png:100:picture",
    "png:100:picture",
  ]);
  expect(result.pixel).toEqual([229, 42, 65, 255]);
  expect(result.alpha).toBe(128);
  expect(result.equal).toBe(true);
  expect(result.includes).toBe(1);
  for (const diff of result.parity) expect(diff).toBeLessThan(8);
  expect(result.excluded).toBe(0);
  expect(result.noImages).toBe(true);
  expect(result.hidden).toBe(0);
  expect(result.migrated).toBe("dots");
});
