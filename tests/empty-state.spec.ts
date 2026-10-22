import { test, expect } from "@playwright/test";

test("empty composition stays usable and supports undo, add, presets and reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  const count = await page.locator(".layer-card").count();
  for (let i = 0; i < count; i++) {
    await page
      .getByRole("button", { name: "Delete layer", exact: true })
      .click();
  }
  expect(errors).toEqual([]);
  const empty = page.getByRole("region", {
    name: "No layers yet",
    exact: true,
  });
  await expect(empty).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Presets", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(empty).toHaveCount(0);
  await expect(page.locator(".layer-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(empty).toBeVisible();
  await empty.getByRole("button", { name: "Add layer", exact: true }).click();
  await expect(page.locator(".layer-card")).toHaveCount(1);
  await expect(empty).toHaveCount(0);
  await page.getByRole("button", { name: "Delete layer", exact: true }).click();
  await expect(empty).toBeVisible();
  await expect(
    page.getByText("Saved on this device", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(empty).toBeVisible();
  await page.setViewportSize({ width: 600, height: 900 });
  await page.screenshot({
    path: "test-results/empty-composition.png",
    fullPage: true,
  });
  await empty
    .getByRole("button", { name: "Choose a preset", exact: true })
    .click();
  await page.getByRole("button", { name: /07 Star study/ }).click();
  await expect(page.getByLabel("Project name")).toHaveValue("Star study");
  await expect(empty).toHaveCount(0);
  expect(errors).toEqual([]);
});
