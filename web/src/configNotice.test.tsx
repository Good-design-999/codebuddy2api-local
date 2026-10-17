import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { api, useResource } from "./api";
import { Dashboard } from "./pages/Dashboard";

vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  useResource: vi.fn(),
}));
afterEach(() => vi.restoreAllMocks());

function payload(configNotice?: Record<string, unknown>) {
  return {
    data: {
      summary: { requests: 1, success_rate: 1, total_tokens: null, credit: null },
      series: [],
      models: [],
      profiles: [],
      health: { credentials: [] },
      storage: {},
      range: { granularity: "day" },
      ...(configNotice ? { config_notice: configNotice } : {}),
    },
    reload: vi.fn(),
    loading: false,
    error: null,
  };
}

describe("configuration source notice", () => {
  it("lists environment-backed runtime keys and dismisses through the API", async () => {
    vi.mocked(useResource).mockReturnValue(
      payload({
        count: 2,
        items: [
          { key: "max_images", label: "单请求图片上限" },
          { key: "stream_mode", label: "流式模式" },
        ],
        command: "python3 converter.py config migrate",
      }) as never,
    );
    const post = vi.spyOn(api, "post").mockResolvedValue({ data: { muted: true } } as never);
    render(<Dashboard />);
    expect(await screen.findByText("配置来源分散")).toBeTruthy();
    expect(screen.getByText(/max_images、stream_mode/)).toBeTruthy();
    expect(screen.getByText("python3 converter.py config migrate")).toBeTruthy();
    // Dismissal is confirmed in a drawer before the API call.
    fireEvent.click(screen.getByRole("button", { name: "不再提醒" }));
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "确认关闭提醒" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/config-notice/dismiss", {}));
    await waitFor(() => expect(screen.queryByText("配置来源分散")).toBeNull());
  });

  it("stays hidden when the server sends no notice and keeps it on failure", async () => {
    vi.mocked(useResource).mockReturnValue(payload() as never);
    const { unmount } = render(<Dashboard />);
    await waitFor(() => expect(useResource).toHaveBeenCalled());
    expect(screen.queryByText("配置来源分散")).toBeNull();
    unmount();

    vi.mocked(useResource).mockReturnValue(
      payload({ count: 1, items: [{ key: "max_images" }], command: "migrate" }) as never,
    );
    vi.spyOn(api, "post").mockRejectedValue(new Error("nope"));
    render(<Dashboard />);
    fireEvent.click(await screen.findByRole("button", { name: "不再提醒" }));
    fireEvent.click(await screen.findByRole("button", { name: "确认关闭提醒" }));
    await waitFor(() => expect(screen.getByText("nope")).toBeTruthy());
    // The banner stays because the server never recorded the dismissal.
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    await waitFor(() => expect(screen.getByText("配置来源分散")).toBeTruthy());
  });
});
