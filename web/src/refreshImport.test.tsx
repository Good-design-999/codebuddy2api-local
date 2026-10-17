import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { Credentials } from "./pages/Credentials";
import { api, useResource } from "./api";

vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  useResource: vi.fn(),
}));
beforeEach(() => vi.restoreAllMocks());

it("submits every parsed refresh token for the chosen endpoint", async () => {
  vi.mocked(useResource).mockReturnValue({
    data: [],
    reload: vi.fn(),
    loading: false,
    error: null,
  });
  const post = vi.spyOn(api, "post").mockResolvedValue({
    data: {
      results: [
        { ok: true, name: "uid-1.info", uid: "uid-1", profile: "cn-cli" },
        {
          ok: false,
          name: "uid-2",
          uid: "uid-2",
          profile: "cn-cli",
          error: "刷新令牌已失效或端点不匹配",
        },
      ],
    },
  } as never);
  render(<Credentials />);
  fireEvent.click(screen.getByRole("button", { name: "批量操作" }));
  fireEvent.click(screen.getByRole("button", { name: "导入文件" }));
  fireEvent.click(screen.getByRole("tab", { name: "仅刷新令牌" }));
  fireEvent.change(screen.getByRole("combobox", { name: "端点" }), { target: { value: "cn-cli" } });
  fireEvent.change(screen.getByLabelText("刷新令牌"), {
    target: { value: "rt-a\n# 忽略\n\nrt-b\nrt-a" },
  });
  expect(screen.getByText(/已识别 2 \/ 50 条/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "刷新并导入 2 条" }));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/credentials/refresh-import", {
      profile: "cn-cli",
      refresh_tokens: ["rt-a", "rt-b"],
    }),
  );
  expect(await screen.findByText("uid-1.info")).toBeTruthy();
  expect(screen.getByText("刷新令牌已失效或端点不匹配")).toBeTruthy();
});
