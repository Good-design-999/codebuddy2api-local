import { expect, test } from "@playwright/test";

// Regression: zooming a daily series into a narrow window swaps in hourly
// buckets; the geometry helpers must follow the swapped rows or the chart
// crashes (white screen) once the cursor hovers past the daily row count.
test("trend zoom swaps to hourly granularity without crashing", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  const days = Array.from({ length: 7 }, (_, i) => ({
    date: `2026-10-0${i + 7}`,
    bucket: 1791417600 + i * 86400,
    requests: 100 + i,
    success: 100 + i,
    error: 0,
    total_tokens: 1000,
    credit: 1.5,
  }));
  const hours = Array.from({ length: 168 }, (_, i) => ({
    date: `2026-10-07 ${String(Math.floor(i / 24)).padStart(2, "0")}:${String(i % 24).padStart(2, "0")}`,
    bucket: 1791417600 + i * 3600,
    requests: 10 + i,
    success: 10 + i,
    error: 0,
    total_tokens: 100,
    credit: 0.1,
  }));
  await page.route("**/admin/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/admin/session")
      return route.fulfill({ json: { authenticated: true, csrf_token: "x" } });
    if (url.pathname === "/admin/dashboard") {
      const hourly = url.searchParams.get("granularity") === "hour";
      return route.fulfill({
        json: {
          summary: { requests: 1, success_rate: 1, total_tokens: 1, credit: 1 },
          series: hourly ? hours : days,
          models: [],
          profiles: [],
          health: { credentials: [] },
          storage: { degraded: false },
          range: { granularity: hourly ? "hour" : "day" },
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/dashboard");
  const chart = page.getByRole("img", { name: "按日用量趋势" });
  await expect(chart).toBeVisible();
  const box = (await chart.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(80);
  }
  // hourly granularity takes over in the narrow window
  await expect(page.getByRole("img", { name: "按小时用量趋势" })).toBeVisible();
  // hover past where the daily series would have ended
  for (let f = 0.2; f <= 0.9; f += 0.1) {
    await page.mouse.move(box.x + box.width * f, box.y + box.height * 0.5);
    await page.waitForTimeout(80);
  }
  await page.mouse.wheel(0, 240);
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(300);
  expect(pageErrors).toEqual([]);
});
