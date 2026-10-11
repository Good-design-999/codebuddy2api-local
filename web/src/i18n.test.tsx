import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { LanguageProvider, LanguageToggle, translate, useT } from "./i18n";

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
      <LanguageToggle />
    </LanguageProvider>
  );
}

describe("i18n", () => {
  it("defaults to Chinese and switches to English with persistence", () => {
    render(<Probe />);
    expect(screen.getByTestId("probe").textContent).toBe("概览");
    fireEvent.click(screen.getByRole("button"));
    // eslint-disable-next-line no-console
    expect(screen.getByTestId("probe").textContent).toBe("Overview");
    expect(screen.getByTestId("interp").textContent).toBe("Attempt 3");
    expect(localStorage.getItem("codebuddy2api.lang")).toBe("en");
  });
  it("falls back to the key itself when an entry is missing", () => {
    expect(translate("missing.key.entirely")).toBe("missing.key.entirely");
  });
});
