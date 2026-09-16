import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { api, type ModelRule } from "./api";
import { CapabilityBadges, ModelMetadata } from "./modelMetadata";
import { Models } from "./pages/Models";
import { Settings } from "./pages/Settings";

const model: ModelRule = {
  id: "upstream",
  public_id: "public",
  upstream_id: "upstream",
  enabled: true,
  keep_original: false,
  region: "",
  profile: "",
  credential_ids: [],
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
        name: "Display model",
        descriptionZh: "中文说明",
        supportsImages: true,
        supportsToolCall: true,
        maxInputTokens: 192000,
        maxOutputTokens: 64000,
        iconUrl: "https://example.invalid/model.svg",
        reasoning: { supportedEfforts: ["low", "high"], canDisableThinking: false },
        contextWindow: { defaultLength: 192000, supportedLengths: [64000, 192000] },
      },
    ],
    "intl-work": [
      {
        id: "upstream",
        name: "Display model",
        descriptionEn: "English description",
        supportsImages: false,
        maxOutputTokens: 32000,
      },
      { id: "upstream", supportsImages: true, maxOutputTokens: 64000 },
    ],
  },
};

afterEach(() => vi.restoreAllMocks());

describe("model declarations", () => {
  it("distinguishes unknown from unsupported and does not claim measured support", () => {
    const { rerender } = render(<CapabilityBadges model={{}} />);
    expect(screen.getByText("图片：未知")).toBeTruthy();
    expect(screen.queryByText("图片：不支持")).toBeNull();
    rerender(<CapabilityBadges model={model} />);
    expect(screen.getByText("图片：因路由而异")).toBeTruthy();
  });

  it("renders complete structured declarations, options and profile variants without loading remote icons", () => {
    const { container } = render(<ModelMetadata model={model} />);
    expect(screen.getByText("中文说明", { selector: "span" })).toBeTruthy();
    expect(screen.getByText("可选强度")).toBeTruthy();
    expect(screen.getByText("可选窗口")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "查看产品声明" }), {
      target: { value: "intl-work" },
    });
    expect(screen.getByText("English description")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "声明 2" })).toBeTruthy();
    expect(screen.queryByText("中文说明", { selector: "span" })).toBeNull();
  });

  it("keeps upstream markup inert and gracefully handles old API responses", () => {
    const value = {
      metadata_by_profile: { "intl-cli": [{ descriptionZh: "<img src=x onerror=alert(1)>" }] },
    };
    const { container, rerender } = render(<ModelMetadata model={value} />);
    expect(screen.getByText("<img src=x onerror=alert(1)>", { selector: "span" })).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
    rerender(<ModelMetadata model={{}} />);
    expect(screen.getByText("尚无模型元数据")).toBeTruthy();
  });

  it("distinguishes inherited declarations and exposes safe source variants", () => {
    const inherited = {
      metadata_by_profile: {
        "intl-cli": [
          {
            id: "model",
            credits: "x0.3",
            catalog_source: { kind: "shared", profiles: ["intl-work"] },
            source_variants: [
              {
                profile: "intl-work",
                metadata: { descriptionZh: "共享原始声明", credits: "x0.3" },
              },
            ],
          },
        ],
      },
    };
    const { rerender } = render(<ModelMetadata model={inherited} />);
    expect(screen.getByText("国际共享目录")).toBeTruthy();
    expect(screen.getByText(/当前账号未直接声明此模型/)).toBeTruthy();
    fireEvent.click(screen.getByText(/来源版本 1/));
    expect(screen.getByText("共享原始声明", { selector: "span" })).toBeTruthy();
    rerender(
      <ModelMetadata
        model={{
          metadata_by_profile: {
            "intl-cli": [
              { id: "model", catalog_source: { kind: "direct", profiles: ["intl-cli"] } },
            ],
          },
        }}
      />,
    );
    expect(screen.getByText("目录来源：当前产品直接声明。")).toBeTruthy();
    expect(screen.queryByText("国际共享目录")).toBeNull();
    rerender(<ModelMetadata model={{ metadata_by_profile: { "intl-cli": [{ id: "model" }] } }} />);
    expect(screen.queryByText("目录来源：当前产品直接声明。")).toBeNull();
  });

  it("exposes details from the model table and supports display-name search", async () => {
    vi.spyOn(api, "get").mockImplementation(
      async (path) =>
        ({
          data:
            path === "/models"
              ? { revision: 1, models: [model], model_capability_guard: false }
              : { credentials: [] },
        }) as never,
    );
    render(<Models />);
    await screen.findByText("能力预检：关闭");
    fireEvent.change(screen.getByRole("textbox", { name: "搜索模型" }), {
      target: { value: "Display" },
    });
    fireEvent.click(screen.getByRole("button", { name: "模型详情" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("combobox", { name: "查看产品声明" })).toBeTruthy();
    expect(within(dialog).getByRole("heading", { name: "能力概要" })).toBeTruthy();
  });
});

describe("capability guard settings", () => {
  function settings(locked: boolean) {
    return {
      revision: 1,
      audit: {},
      items: [
        {
          key: "model_capability_guard",
          value: true,
          stored: null,
          source: locked ? "environment" : "default",
          mode: "hot",
          type: "boolean",
          label: "模型能力预检",
          locked,
        },
      ],
    };
  }

  it("saves an explicit false without changing other settings", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: settings(false) });
    const save = vi.spyOn(api, "patch").mockResolvedValue({ data: { revision: 2 } });
    render(<Settings />);
    const toggle = await screen.findByRole("checkbox", { name: /模型能力预检/ });
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: "保存更改" }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith("/settings", {
        revision: 1,
        values: { model_capability_guard: false },
      }),
    );
    expect(screen.getByText(/国际图片归并及其他安全限制不变/)).toBeTruthy();
  });

  it("shows an environment-locked guard instead of an editable switch", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: settings(true) });
    render(<Settings />);
    await screen.findByText("外部锁定");
    expect(screen.queryByRole("checkbox", { name: /模型能力预检/ })).toBeNull();
    expect(screen.getByText("当前生效：开启")).toBeTruthy();
  });
});
