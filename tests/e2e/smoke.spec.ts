import { expect, test } from "@playwright/test";

test("landing page renders", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect(page.locator("body")).toContainText(/AgriLens/i);
});

test("chat redirects unauthenticated users to sign in", async ({ page }) => {
  await page.goto("/chat");
  await expect(page).toHaveURL(/\/auth\/signin/, { timeout: 15_000 });
});

test("unknown route shows the 404 page", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist");
  expect(response?.status()).toBe(404);
});

test("chats API rejects unauthenticated requests", async ({ request }) => {
  const response = await request.get("/api/chats");
  expect(response.status()).toBe(401);
});
