import { test, expect } from "@playwright/test";

test("dialogs contain keyboard focus, isolate the editor and restore the trigger", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".loading-overlay")).toHaveCount(0);
  for (const name of ["Export", "Presets"]) {
    const trigger = page.getByRole("button", { name, exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name, exact: true });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Close dialog" }),
    ).toBeFocused();
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press(i % 3 ? "Tab" : "Shift+Tab");
      expect(
        await page.evaluate(() => !!document.activeElement?.closest("dialog")),
      ).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
});

test("layer and field navigation work from the keyboard and expose selection", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".loading-overlay")).toHaveCount(0);
  const rows = page.locator(".layer-stack .row-select");
  await rows.first().focus();
  await page.keyboard.press("End");
  await expect(rows.last()).toBeFocused();
  await expect(rows.last()).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".field-owner")).toContainText("Coral / Ripples");
  await page.keyboard.press("Home");
  await expect(rows.first()).toBeFocused();
  await expect(rows.first()).toHaveAttribute("aria-pressed", "true");
  await page.locator(".field-stack .row-select").first().focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Field properties" }),
  ).toBeVisible();
  await expect(page.locator(".inspector-context")).toContainText(
    "Forest / Ripples",
  );
  await page.getByRole("button", { name: "Back to layer" }).click();
  await expect(
    page.getByRole("heading", { name: "Layer properties" }),
  ).toBeVisible();
});

test("canvas settings stay independent and proportions reflect the actual document", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".loading-overlay")).toHaveCount(0);
  await expect(
    page.locator(".inspector-scroll section .property-heading").first(),
  ).toHaveText("Pattern");
  await expect(
    page
      .locator(".disclosure")
      .filter({ has: page.locator("summary", { hasText: /^Image contour$/ }) }),
  ).not.toHaveAttribute("open");
  await page.getByRole("button", { name: "Canvas", exact: true }).click();
  const ratio = page.getByLabel("Aspect ratio", { exact: true });
  await expect(ratio).toHaveValue("1200x1200");
  await ratio.selectOption("1920x1080");
  await expect(page.getByLabel("Canvas width", { exact: true })).toHaveValue(
    "1920",
  );
  await expect(ratio).toHaveValue("1920x1080");
  await page.getByLabel("Canvas width", { exact: true }).fill("900");
  await expect(ratio).toHaveValue("");
  await ratio.selectOption("");
  await expect(page.locator(".canvas-error")).toHaveCount(0);
  await page.getByRole("button", { name: "Selection", exact: true }).click();
  await expect(page.getByLabel("Layer name")).toBeVisible();
});

test("percentage editing preserves normalized project values and undo", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".loading-overlay")).toHaveCount(0);
  const opacity = page.getByLabel("Opacity", { exact: true });
  await expect(opacity).toHaveValue("100");
  await opacity.fill("35");
  await opacity.blur();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(opacity).toHaveValue("100");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(opacity).toHaveValue("35");
  await page.locator(".file-menu summary").click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  const file = await pending;
  const stream = await file.createReadStream();
  const buffers = [];
  for await (const chunk of stream!) buffers.push(chunk);
  const saved = JSON.parse(Buffer.concat(buffers).toString());
  expect(saved.layers[0].opacity).toBe(0.35);
});

test("collapsed desktop panels leave no hidden keyboard stops", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".loading-overlay")).toHaveCount(0);
  const boardBefore = await page.locator(".workspace").boundingBox();
  await page.getByRole("button", { name: "Layers panel", exact: true }).click();
  await page
    .getByRole("button", { name: "Inspector panel", exact: true })
    .click();
  await expect(page.locator("#layers-panel")).toBeHidden();
  await expect(page.locator("#inspector-panel")).toBeHidden();
  const boardAfter = await page.locator(".workspace").boundingBox();
  expect(boardAfter!.width).toBeGreaterThan(boardBefore!.width + 500);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => !!document.activeElement?.closest("[hidden]")),
    ).toBe(false);
  }
  await page
    .getByRole("button", { name: "Inspector panel", exact: true })
    .click();
  await expect(page.getByLabel("Layer name")).toBeVisible();
});

for (const width of [390, 775]) {
  test(`compact editor at ${width}px keeps artwork, files and editing available`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.locator(".loading-overlay")).toHaveCount(0);
    const panels = page.getByRole("navigation", { name: "Workspace panels" });
    await panels.getByRole("button", { name: "Layers", exact: true }).click();
    await expect(page.getByLabel("Add layer", { exact: true })).toBeVisible();
    await panels
      .getByRole("button", { name: "Inspector", exact: true })
      .click();
    await expect(page.getByLabel("Layer name")).toBeVisible();
    const board = await page.locator(".artboard").boundingBox();
    const inspector = await page.locator("#inspector-panel").boundingBox();
    expect(board!.height).toBeGreaterThan(100);
    expect(board!.y + board!.height).toBeLessThan(inspector!.y);
    await page.getByLabel("Grid spacing", { exact: true }).fill("40");
    await page.getByLabel("Grid spacing", { exact: true }).blur();
    await page.getByRole("button", { name: "Canvas", exact: true }).click();
    await expect(
      page.getByLabel("Canvas width", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Canvas", exact: true }),
    ).toHaveCSS("background-color", "rgb(59, 65, 67)");
    await page.screenshot({ path: `test-results/editor-${width}.png` });
    await page.locator(".file-menu summary").click();
    for (const name of ["New project", "Open project", "Save project"]) {
      await expect(
        page.getByRole("button", { name, exact: true }),
      ).toBeVisible();
    }
    await page.keyboard.press("Escape");
    await expect(page.locator(".file-menu summary")).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(
      page.getByRole("button", { name: "Save project", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Export", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test.describe("touch controls", () => {
  test.use({ hasTouch: true });
  test("small touch viewport keeps controls reachable without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/");
    await expect(page.locator(".loading-overlay")).toHaveCount(0);
    await page
      .getByRole("navigation", { name: "Workspace panels" })
      .getByRole("button", { name: "Inspector", exact: true })
      .click();
    const target = await page.getByLabel("Grid spacing slider").boundingBox();
    expect(target!.height).toBeGreaterThanOrEqual(44);
    const actions = await page.locator(".header-actions").boundingBox();
    expect(actions!.x + actions!.width).toBeLessThanOrEqual(320);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: "test-results/editor-touch-320.png" });
    await page.locator(".file-menu summary").click();
    await expect(
      page.getByRole("button", { name: "Save project", exact: true }),
    ).toBeVisible();
  });
});

test("default interface is English and desktop typography remains readable", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".loading-overlay")).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toMatch(/[\u3400-\u9fff]/);
  const styles = await page
    .locator(".control-heading")
    .first()
    .evaluate((el) => {
      const style = getComputedStyle(el);
      return { size: parseFloat(style.fontSize), color: style.color };
    });
  expect(styles.size).toBeGreaterThanOrEqual(12);
  const slider = await page.getByLabel("Grid spacing slider").boundingBox();
  expect(slider!.height).toBeGreaterThanOrEqual(28);
  await expect(page.locator(".local-label")).toHaveText("Saved on this device");
  await page.screenshot({ path: "test-results/editor-desktop.png" });
});
