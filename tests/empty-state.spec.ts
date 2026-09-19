import { test, expect } from "@playwright/test";

test("empty composition stays usable and supports undo, add, presets and reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByText("已在本机保存", { exact: true })).toBeVisible();
  const count = await page.locator(".layer-card").count();
  for (let i = 0; i < count; i++) {
    await page.getByRole("button", { name: "删除图层", exact: true }).click();
  }
  expect(errors).toEqual([]);
  const empty = page.getByRole("region", { name: "还没有图层", exact: true });
  await expect(empty).toBeVisible();
  await expect(
    page.getByRole("button", { name: "预设库", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "撤销 Ctrl+Z", exact: true }).click();
  await expect(empty).toHaveCount(0);
  await expect(page.locator(".layer-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "重做 Ctrl+Shift+Z", exact: true })
    .click();
  await expect(empty).toBeVisible();
  await empty.getByRole("button", { name: "添加图层", exact: true }).click();
  await expect(page.locator(".layer-card")).toHaveCount(1);
  await expect(empty).toHaveCount(0);
  await page.getByRole("button", { name: "删除图层", exact: true }).click();
  await expect(empty).toBeVisible();
  await expect(page.getByText("已在本机保存", { exact: true })).toBeVisible();
  await page.reload();
  await expect(empty).toBeVisible();
  await page.setViewportSize({ width: 600, height: 900 });
  await page.screenshot({
    path: "test-results/empty-composition.png",
    fullPage: true,
  });
  await empty.getByRole("button", { name: "从预设开始", exact: true }).click();
  await page.getByRole("button", { name: /07 星形实验/ }).click();
  await expect(page.getByLabel("工程名称")).toHaveValue("星形实验");
  await expect(empty).toHaveCount(0);
  expect(errors).toEqual([]);
});
