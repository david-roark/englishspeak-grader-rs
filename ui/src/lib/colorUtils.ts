export function normalizeHex(input: string, fallback = "#4f46e5"): string {
  const raw = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    const expanded = raw
      .split("")
      .map((c) => c + c)
      .join("")
      .toLowerCase();
    return `#${expanded}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return `#${raw.toLowerCase()}`;
  }
  return fallback;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = normalizeHex(hex).slice(1);
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) =>
    Math.min(255, Math.max(0, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

export function mixHex(hexA: string, hexB: string, weightB: number): string {
  const w = Math.min(1, Math.max(0, weightB));
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbToHex(
    a.r + (b.r - a.r) * w,
    a.g + (b.g - a.g) * w,
    a.b + (b.b - a.b) * w
  );
}

export function getRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const toLinear = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function isDarkColor(hex: string): boolean {
  return getRelativeLuminance(hex) < 0.35;
}

export function buildAccentCssVars(
  rawHex: string,
  isDark: boolean,
  canvasHex = "#0b1120"
): Record<string, string> {
  const base = normalizeHex(rawHex, "#4f46e5");
  if (isDark) {
    return {
      "--color-indigo-50": mixHex(canvasHex, base, 0.16),
      "--color-indigo-100": mixHex(canvasHex, base, 0.24),
      "--color-indigo-200": mixHex(canvasHex, base, 0.36),
      "--color-indigo-300": mixHex(canvasHex, base, 0.5),
      "--color-indigo-400": mixHex(base, "#ffffff", 0.25),
      "--color-indigo-500": mixHex(base, "#ffffff", 0.12),
      "--color-indigo-600": base,
      "--color-indigo-700": mixHex(base, "#ffffff", 0.42),
      "--color-indigo-800": mixHex(base, "#ffffff", 0.6),
      "--color-indigo-900": mixHex(base, "#ffffff", 0.78),
      "--color-indigo-950": mixHex(base, "#ffffff", 0.9),
      "--accent-solid": base,
      "--accent-solid-hover": mixHex(base, "#000000", 0.16),
      "--accent-text": mixHex(base, "#ffffff", 0.35),
    };
  }

  return {
    "--color-indigo-50": mixHex(base, "#ffffff", 0.93),
    "--color-indigo-100": mixHex(base, "#ffffff", 0.85),
    "--color-indigo-200": mixHex(base, "#ffffff", 0.7),
    "--color-indigo-300": mixHex(base, "#ffffff", 0.5),
    "--color-indigo-400": mixHex(base, "#ffffff", 0.28),
    "--color-indigo-500": mixHex(base, "#ffffff", 0.12),
    "--color-indigo-600": base,
    "--color-indigo-700": mixHex(base, "#0f172a", 0.16),
    "--color-indigo-800": mixHex(base, "#0f172a", 0.32),
    "--color-indigo-900": mixHex(base, "#0f172a", 0.48),
    "--color-indigo-950": mixHex(base, "#0f172a", 0.65),
    "--accent-solid": base,
    "--accent-solid-hover": mixHex(base, "#0f172a", 0.16),
    "--accent-text": mixHex(base, "#0f172a", 0.1),
  };
}

export function buildCustomSurfaceCssVars(
  rawCanvasHex: string,
  rawCardHex: string
): { isDark: boolean; vars: Record<string, string> } {
  const canvas = normalizeHex(rawCanvasHex, "#f8fafc");
  const card = normalizeHex(rawCardHex, "#ffffff");
  const dark = isDarkColor(canvas);
  const { r, g, b } = hexToRgb(card);

  if (dark) {
    const ink = "#f1f5f9";
    return {
      isDark: true,
      vars: {
        "--surface-canvas": canvas,
        "--surface-card": card,
        "--surface-card-soft": `rgba(${r}, ${g}, ${b}, 0.78)`,
        "--color-slate-50": mixHex(card, ink, 0.05),
        "--color-slate-100": mixHex(card, ink, 0.1),
        "--color-slate-200": mixHex(card, ink, 0.18),
        "--color-slate-400": mixHex(card, ink, 0.48),
        "--color-slate-500": mixHex(card, ink, 0.6),
        "--color-slate-600": mixHex(card, ink, 0.72),
        "--color-slate-700": mixHex(card, ink, 0.84),
        "--color-slate-800": mixHex(card, ink, 0.92),
        "--color-slate-900": ink,
      },
    };
  }

  const ink = "#0f172a";
  return {
    isDark: false,
    vars: {
      "--surface-canvas": canvas,
      "--surface-card": card,
      "--surface-card-soft": `rgba(${r}, ${g}, ${b}, 0.82)`,
      "--color-slate-50": mixHex(canvas, card, 0.4),
      "--color-slate-100": mixHex(canvas, ink, 0.05),
      "--color-slate-200": mixHex(canvas, ink, 0.12),
      "--color-slate-400": mixHex(card, ink, 0.45),
      "--color-slate-500": mixHex(card, ink, 0.58),
      "--color-slate-600": mixHex(card, ink, 0.7),
      "--color-slate-700": mixHex(card, ink, 0.82),
      "--color-slate-800": mixHex(card, ink, 0.91),
      "--color-slate-900": ink,
    },
  };
}

export function buildCustomTextCssVars(
  rawTextHex: string,
  rawCardHex: string
): Record<string, string> {
  const ink = normalizeHex(rawTextHex, "#0f172a");
  const card = normalizeHex(rawCardHex, "#ffffff");
  return {
    "--color-slate-400": mixHex(card, ink, 0.48),
    "--color-slate-500": mixHex(card, ink, 0.62),
    "--color-slate-600": mixHex(card, ink, 0.74),
    "--color-slate-700": mixHex(card, ink, 0.85),
    "--color-slate-800": mixHex(card, ink, 0.93),
    "--color-slate-900": ink,
  };
}
