import { expect, test } from "@playwright/test";

for (const width of [1440, 375]) {
  test(`model declarations, profile variants and preflight settings at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1050 });
    const errors: string[] = [];
    const external: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (request.url().includes("example.invalid")) external.push(request.url());
    });
    let enabled = true;
    let revision = 1;
    await page.route("**/admin/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === "/admin/session")
        return route.fulfill({ json: { authenticated: true, csrf_token: "synthetic-csrf" } });
      if (path === "/admin/credentials") return route.fulfill({ json: { credentials: [] } });
      if (path === "/admin/models")
        return route.fulfill({
          json: {
            revision,
            model_capability_guard: enabled,
            models: [
              {
                id: "upstream",
                public_id: "public",
                upstream_id: "upstream",
                enabled: true,
                keep_original: false,
                region: null,
                profile: null,
                credential_ids: [],
                credits: 0,
                capabilities: {
                  images: "mixed",
                  tools: "supported",
                  reasoning: "supported",
                  thinking_disable: "unsupported",
                },
                limits: {
                  maxInputTokens: { state: "known", value: 192000 },
                  maxOutputTokens: { state: "mixed", value: null },
                },
                metadata_by_profile: {
                  "cn-cli": [
                    {
                      id: "upstream",
                      name: "Synthetic model",
                      descriptionZh: "仅用于浏览器回归的模型说明",
                      supportsImages: true,
                      maxOutputTokens: 64000,
                      iconUrl: "https://example.invalid/icon.svg",
                      reasoning: { supportedEfforts: ["low", "high"] },
                    },
                  ],
                  "intl-cli": [
                    {
                      id: "upstream",
                      name: "Synthetic model",
                      supportsImages: true,
                      catalog_source: { kind: "shared", profiles: ["intl-work"] },
                      source_variants: [
                        {
                          profile: "intl-work",
                          metadata: { descriptionZh: "共享原始声明", credits: "x0.00" },
                        },
                      ],
                    },
                  ],
                  "intl-work": [
                    { id: "upstream", supportsImages: false, maxOutputTokens: 32000 },
                    { id: "upstream", supportsImages: true, maxOutputTokens: 64000 },
                  ],
                },
              },
            ],
          },
        });
      if (path === "/admin/settings") {
        if (request.method() === "PATCH") {
          expect(request.headers()["x-csrf-token"]).toBe("synthetic-csrf");
          expect(request.postDataJSON()).toEqual({
            revision,
            values: { model_capability_guard: false },
          });
          enabled = false;
          revision += 1;
        }
        return route.fulfill({
          json: {
            revision,
            audit: {},
            items: [
              {
                key: "model_capability_guard",
                value: enabled,
                stored: enabled,
                source: "management",
                mode: "hot",
                type: "boolean",
                label: "模型能力预检",
                locked: false,
              },
            ],
          },
        });
      }
      return route.fulfill({ status: 404, json: { error: { message: "unknown fixture route" } } });
    });
    await page.goto("/dashboard/models");
    await expect(page.getByText("能力预检：开启")).toBeVisible();
    await expect(page.getByText("图片：因路由而异")).toBeVisible();
    const trigger = page.getByRole("button", { name: "模型详情" });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("仅用于浏览器回归的模型说明", { exact: true })).toBeVisible();
    await expect(dialog.getByText("可选强度", { exact: true })).toBeVisible();
    await dialog.getByRole("combobox", { name: "查看产品声明" }).selectOption("intl-work");
    await expect(dialog.getByRole("heading", { name: "声明 2" })).toBeVisible();
    await dialog.getByRole("combobox", { name: "查看产品声明" }).selectOption("intl-cli");
    await expect(dialog.getByRole("heading", { name: "共享目录来源" })).toBeVisible();
    await dialog.getByText(/来源版本 1/).click();
    await expect(dialog.getByText("共享原始声明", { exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/model-capabilities-${width}.png`, fullPage: true });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await page.goto("/dashboard/settings");
    const toggle = page.getByRole("checkbox", { name: /模型能力预检/ });
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    const saved = page.waitForResponse(
      (response) =>
        response.url().endsWith("/admin/settings") && response.request().method() === "PATCH",
    );
    await page.getByRole("button", { name: "保存更改" }).click();
    expect((await saved).status()).toBe(200);
    await expect(toggle).not.toBeChecked();
    await expect(page.getByText(/国际图片归并及其他安全限制不变/)).toBeVisible();
    await page.goto("/dashboard/models");
    await expect(page.getByText("能力预检：关闭")).toBeVisible();
    await expect(page.getByText("图片：因路由而异")).toBeVisible();
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  });
}
