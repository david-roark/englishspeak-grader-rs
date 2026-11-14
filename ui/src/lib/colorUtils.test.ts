import { describe, expect, it } from "vitest";
import {
  buildAccentCssVars,
  buildCustomSurfaceCssVars,
  buildCustomTextCssVars,
  isDarkColor,
  normalizeHex,
} from "./colorUtils";

describe("colorUtils", () => {
  it("normalizes short, uppercase, and invalid hex colors", () => {
    expect(normalizeHex("ABC")).toBe("#aabbcc");
    expect(normalizeHex(" #0EA5E9 ")).toBe("#0ea5e9");
    expect(normalizeHex("invalid", "#4f46e5")).toBe("#4f46e5");
  });

  it("detects dark vs light colors accurately", () => {
    expect(isDarkColor("#0b1120")).toBe(true);
    expect(isDarkColor("#111111")).toBe(true);
    expect(isDarkColor("#f8fafc")).toBe(false);
    expect(isDarkColor("#fcf8f0")).toBe(false);
  });

  it("builds full accent palette for light and dark surfaces", () => {
    const lightVars = buildAccentCssVars("#0ea5e9", false);
    expect(lightVars["--color-indigo-600"]).toBe("#0ea5e9");
    expect(lightVars["--accent-solid"]).toBe("#0ea5e9");
    expect(lightVars["--color-indigo-50"]).not.toBe("#0ea5e9");

    const darkVars = buildAccentCssVars("#0ea5e9", true, "#0b1120");
    expect(darkVars["--color-indigo-600"]).toBe("#0ea5e9");
    expect(darkVars["--accent-text"]).not.toBe("#0ea5e9");
  });

  it("builds custom surface CSS vars and infers dark mode from canvas luminance", () => {
    const darkSurface = buildCustomSurfaceCssVars("#090d16", "#131b2e");
    expect(darkSurface.isDark).toBe(true);
    expect(darkSurface.vars["--surface-canvas"]).toBe("#090d16");
    expect(darkSurface.vars["--surface-card"]).toBe("#131b2e");
    expect(darkSurface.vars["--color-slate-900"]).toBe("#f1f5f9");

    const lightSurface = buildCustomSurfaceCssVars("#faf5eb", "#fffdf7");
    expect(lightSurface.isDark).toBe(false);
    expect(lightSurface.vars["--color-slate-900"]).toBe("#0f172a");
  });

  it("builds custom text CSS scale from ink and card colors", () => {
    const vars = buildCustomTextCssVars("#3f362c", "#fcf8f0");
    expect(vars["--color-slate-900"]).toBe("#3f362c");
    expect(vars["--color-slate-400"]).toBeDefined();
    expect(vars["--color-slate-700"]).toBeDefined();
  });
});
