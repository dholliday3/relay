import { test, expect } from "@playwright/test";

test("task detail copies id and title", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

  const createRes = await page.request.post("/api/tasks", {
    data: { title: "Copy me" },
  });
  expect(createRes.ok()).toBeTruthy();
  const task = (await createRes.json()) as { id: string; title: string };

  await page.goto("/tasks");

  await page.getByRole("button", { name: new RegExp(task.title) }).click();
  await expect(page.getByRole("heading", { name: task.title })).toBeVisible();

  const copyButton = page.getByRole("button", { name: `Copy ${task.id} and title` });
  await copyButton.click();
  await expect(copyButton).toContainText("Copied");
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(`${task.id} ${task.title}`);
});

test("show filters toggles the task filters open and closed", async ({ page }) => {
  await page.goto("/tasks");

  const showFiltersButton = page.getByRole("button", { name: "Show filters" });
  const statusFilter = page.getByRole("button", { name: "Status" });

  await expect(showFiltersButton).toHaveAttribute("aria-expanded", "false");
  await expect(statusFilter).toHaveCount(0);

  await showFiltersButton.click();
  await expect(showFiltersButton).toHaveAttribute("aria-expanded", "true");
  await expect(statusFilter).toBeVisible();

  await showFiltersButton.click();
  await expect(showFiltersButton).toHaveAttribute("aria-expanded", "false");
  await expect(statusFilter).toHaveCount(0);
});
