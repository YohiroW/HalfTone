import { test, expect } from "@playwright/test";
test("eight handles resize, preserve anchor, rotate, zoom, undo and cancel", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".loading-overlay")).toHaveCount(0);
  const project = await page.evaluate(async () => {
    const m = await import("/src/model.ts" as string),
      a = await import("/src/assets.ts" as string);
    const c = document.createElement("canvas");
    c.width = 400;
    c.height = 200;
    const x = c.getContext("2d")!;
    x.fillStyle = "#487f93";
    x.fillRect(0, 0, 400, 200);
    x.fillStyle = "#eb935d";
    x.fillRect(30, 30, 90, 80);
    const b = await new Promise<Blob>((res) => c.toBlob((v) => res(v!)));
    const asset = await a.readPicture(
      new File([b], "shape.png", { type: "image/png" }),
    );
    const p = m.blank();
    p.assets = [asset];
    p.layers = [m.pictureLayer(asset, p)];
    p.layers[0].scaleX = 1;
    p.layers[0].scaleY = 1;
    return JSON.stringify(p);
  });
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles({
      name: "resize.json",
      mimeType: "application/json",
      buffer: Buffer.from(project),
    });
  await expect(page.locator(".image-resize-handle")).toHaveCount(8);
  const width = page.getByLabel("图片宽度", { exact: true }),
    height = page.getByLabel("图片高度", { exact: true });
  const move = async (label: string, dx: number, dy: number, shift = false) => {
    const h = page.getByRole("button", {
        name: "缩放图片：" + label,
        exact: true,
      }),
      b = await h.boundingBox(),
      board = await page.locator(".artboard").boundingBox();
    if (!b || !board) throw Error("missing handle");
    if (shift) await page.keyboard.down("Shift");
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      b.x + b.width / 2 + (dx * board.width) / 1200,
      b.y + b.height / 2 + (dy * board.height) / 1200,
      { steps: 8 },
    );
    await page.mouse.up();
    if (shift) await page.keyboard.up("Shift");
  };
  await move("右边", 100, 0);
  expect(+(await width.inputValue())).toBeCloseTo(500, 0);
  await expect(height).toHaveValue("200");
  expect(
    +(await page.getByLabel("图片中心 X", { exact: true }).inputValue()),
  ).toBeCloseTo(650, 0);
  await page.getByRole("button", { name: "撤销 Ctrl+Z", exact: true }).click();
  await expect(width).toHaveValue("400");
  await move("下边", 0, 100);
  expect(+(await height.inputValue())).toBeCloseTo(300, 0);
  await expect(width).toHaveValue("400");
  await page.getByRole("button", { name: "撤销 Ctrl+Z", exact: true }).click();
  await move("右下角", 100, 50);
  expect(+(await width.inputValue())).toBeCloseTo(500, 0);
  expect(+(await height.inputValue())).toBeCloseTo(250, 0);
  await page.getByRole("button", { name: "撤销 Ctrl+Z", exact: true }).click();
  await move("右边", 100, 0, true);
  expect(+(await height.inputValue())).toBeCloseTo(250, 0);
  await page.getByRole("button", { name: "撤销 Ctrl+Z", exact: true }).click();
  await page.getByLabel("图片旋转", { exact: true }).fill("30");
  await page.getByLabel("图片旋转", { exact: true }).blur();
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await move("右边", Math.cos(Math.PI / 6) * 100, 50);
  expect(+(await width.inputValue())).toBeCloseTo(500, 0);
  await expect(height).toHaveValue("200");
  await expect(page.locator(".local-label")).toHaveText("已在本机保存");
  await page.reload();
  await expect(width).toHaveValue("500");
  const h = await page
    .getByRole("button", { name: "缩放图片：右下角", exact: true })
    .boundingBox();
  if (!h) throw Error("missing handle");
  await page.mouse.move(h.x + 7, h.y + 7);
  await page.mouse.down();
  await page.mouse.move(h.x + 60, h.y + 30);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(width).toHaveValue("500");
  await page.screenshot({
    path: "test-results/picture-handles.png",
    fullPage: true,
  });
  await page.getByLabel("锁定图片", { exact: true }).check();
  await expect(page.locator(".image-resize-handle")).toHaveCount(0);
});
test("legacy uniform scales migrate and stretched picture exports match", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".loading-overlay")).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const m = await import("/src/model.ts" as string),
      s = await import("/src/storage.ts" as string),
      a = await import("/src/assets.ts" as string),
      r = await import("/src/render.ts" as string);
    const c = document.createElement("canvas");
    c.width = 100;
    c.height = 80;
    const x = c.getContext("2d")!;
    x.fillStyle = "#e57632";
    x.fillRect(10, 10, 35, 60);
    x.fillStyle = "#3d7499";
    x.fillRect(45, 10, 45, 25);
    const blob = await new Promise<Blob>((res) => c.toBlob((v) => res(v!))),
      asset = await a.readPicture(
        new File([blob], "sample.png", { type: "image/png" }),
      );
    const p = m.blank();
    p.width = 600;
    p.height = 600;
    p.assets = [asset];
    p.layers = [m.pictureLayer(asset, p)];
    const l = p.layers[0];
    delete l.scaleX;
    delete l.scaleY;
    l.scale = 2;
    const migrated = await s.validateProject(p);
    const legacyOK =
      migrated.layers[0].scaleX === 2 &&
      migrated.layers[0].scaleY === 2 &&
      migrated.layers[0].scale === undefined;
    Object.assign(migrated.layers[0], { scaleX: 3, scaleY: 1.5, rotation: 37 });
    const lhs = document.createElement("canvas");
    await r.paint(lhs, migrated, [], 600, 600, true);
    const svg = await r.exportSvg(migrated, []),
      url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })),
      im = await a.loadImage(url),
      rhs = document.createElement("canvas");
    rhs.width = 600;
    rhs.height = 600;
    rhs.getContext("2d")!.drawImage(im, 0, 0);
    URL.revokeObjectURL(url);
    const aa = lhs.getContext("2d")!.getImageData(0, 0, 600, 600).data,
      bb = rhs.getContext("2d")!.getImageData(0, 0, 600, 600).data;
    let diff = 0;
    for (let i = 0; i < aa.length; i++) diff += Math.abs(aa[i] - bb[i]);
    const roundTrip = await s.validateProject(
      JSON.parse(JSON.stringify(migrated)),
    );
    return {
      legacyOK,
      error: diff / aa.length,
      scaleX: roundTrip.layers[0].scaleX,
      scaleY: roundTrip.layers[0].scaleY,
    };
  });
  expect(result.legacyOK).toBe(true);
  expect(result.error).toBeLessThan(3);
  expect(result.scaleX).toBe(3);
  expect(result.scaleY).toBe(1.5);
});
