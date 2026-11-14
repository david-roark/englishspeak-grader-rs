import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyThemeToDocument,
  DEFAULT_THEME,
  loadThemePreferences,
  THEME_STORAGE_KEY,
  ThemeProvider,
  useTheme,
} from "./theme";

function ThemeProbe() {
  const {
    surface,
    accent,
    fontFamily,
    fontWeight,
    customTextEnabled,
    setSurface,
    setCustomAccentHex,
    setCustomTextHex,
    setFontFamily,
    setFontWeight,
    resetTheme,
  } = useTheme();

  return (
    <div>
      <span data-testid="state">
        {`${surface}|${accent}|${fontFamily}|${fontWeight}|${customTextEnabled}`}
      </span>
      <button type="button" onClick={() => setSurface("sepia")}>
        Sepia
      </button>
      <button type="button" onClick={() => setCustomAccentHex("#10b981")}>
        CustomAccent
      </button>
      <button type="button" onClick={() => setCustomTextHex("#3f362c")}>
        CustomText
      </button>
      <button type="button" onClick={() => setFontFamily("lexend")}>
        Lexend
      </button>
      <button type="button" onClick={() => setFontWeight("semibold")}>
        Semibold
      </button>
      <button type="button" onClick={resetTheme}>
        Reset
      </button>
    </div>
  );
}

describe("theme preferences & provider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("style");
    applyThemeToDocument(DEFAULT_THEME);
  });

  it("falls back safely when localStorage contains invalid JSON", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "{bad json");
    expect(loadThemePreferences()).toEqual(DEFAULT_THEME);
  });

  it("applies surface presets, custom accent, custom text, font, and weight to documentElement", () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByText("Sepia"));
    expect(document.documentElement.dataset.surface).toBe("sepia");
    expect(document.documentElement.dataset.theme).toBe("light");

    fireEvent.click(screen.getByText("CustomAccent"));
    expect(document.documentElement.dataset.accent).toBe("custom");
    expect(
      document.documentElement.style.getPropertyValue("--accent-solid")
    ).toBe("#10b981");

    fireEvent.click(screen.getByText("CustomText"));
    expect(
      document.documentElement.style.getPropertyValue("--color-slate-900")
    ).toBe("#3f362c");

    fireEvent.click(screen.getByText("Lexend"));
    expect(
      document.documentElement.style.getPropertyValue("--app-font-family")
    ).toContain("Lexend");

    fireEvent.click(screen.getByText("Semibold"));
    expect(document.documentElement.dataset.fontWeight).toBe("semibold");
    expect(
      document.documentElement.style.getPropertyValue("--app-font-weight")
    ).toBe("600");

    fireEvent.click(screen.getByText("Reset"));
    expect(screen.getByTestId("state").textContent).toBe(
      "auto|indigo|be_vietnam|normal|false"
    );
  });
});
