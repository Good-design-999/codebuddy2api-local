import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { chooseLanguage, LanguageProvider, translate, useT } from "./i18n";

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

function ProbeText() {
  const t = useT();
  return (
    <>
      <span data-testid="probe">{t("nav.overview")}</span>
      <span data-testid="interp">{t("logs.attemptN", { n: 3 })}</span>
    </>
  );
}
function Probe() {
  return (
    <LanguageProvider>
      <ProbeText />
    </LanguageProvider>
  );
}

describe("i18n", () => {
  it("follows the browser language by default and persists explicit choices", () => {
    render(<Probe />);
    // jsdom reports en-US, so the system preference resolves to English.
    expect(screen.getByTestId("probe").textContent).toBe("Overview");
    act(() => chooseLanguage("zh"));
    expect(screen.getByTestId("probe").textContent).toBe("概览");
    expect(screen.getByTestId("interp").textContent).toBe("尝试 3");
    expect(localStorage.getItem("codebuddy2api.lang")).toBe("zh");
    act(() => chooseLanguage("en"));
    expect(screen.getByTestId("probe").textContent).toBe("Overview");
    expect(localStorage.getItem("codebuddy2api.lang")).toBe("en");
    act(() => chooseLanguage("system"));
    expect(screen.getByTestId("probe").textContent).toBe("Overview");
    expect(localStorage.getItem("codebuddy2api.lang")).toBe("system");
  });
  it("falls back to the key itself when an entry is missing", () => {
    expect(translate("missing.key.entirely")).toBe("missing.key.entirely");
  });
  it("applies language choices made in the appearance drawer", async () => {
    const { Appearance } = await import("./appearance");
    render(
      <LanguageProvider>
        <Appearance />
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "外观设置" }));
    fireEvent.click(document.querySelector('input[name="ui-language"][value="zh"]')!);
    expect(localStorage.getItem("codebuddy2api.lang")).toBe("zh");
    fireEvent.click(document.querySelector('input[name="ui-language"][value="system"]')!);
    expect(localStorage.getItem("codebuddy2api.lang")).toBe("system");
  });
});
