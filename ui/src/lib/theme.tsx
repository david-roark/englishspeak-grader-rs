import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  buildAccentCssVars,
  buildCustomSurfaceCssVars,
  buildCustomTextCssVars,
  isDarkColor,
  normalizeHex,
} from "./colorUtils";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedThemeMode = "light" | "dark";
export type SurfaceTheme =
  | "auto"
  | "light"
  | "sepia"
  | "mist"
  | "dark"
  | "midnight"
  | "custom";
export type ThemeAccent =
  | "indigo"
  | "sky"
  | "emerald"
  | "violet"
  | "rose"
  | "amber"
  | "custom";
export type ThemeFontFamily =
  | "be_vietnam"
  | "lexend"
  | "noto_sans"
  | "system"
  | "serif"
  | "mono"
  | "custom";
export type ThemeFontWeight = "light" | "normal" | "medium" | "semibold";

export interface ThemePreferences {
  mode: ThemeMode;
  surface: SurfaceTheme;
  customCanvasHex: string;
  customCardHex: string;
  accent: ThemeAccent;
  customAccentHex: string;
  customTextEnabled: boolean;
  customTextHex: string;
  fontFamily: ThemeFontFamily;
  customFontFamily: string;
  fontWeight: ThemeFontWeight;
  fontSize: number;
}

export interface FontSizePreset {
  size: number;
  label: string;
  description: string;
}

export const MIN_FONT_SIZE = 12;
export const MAX_FONT_SIZE = 22;
export const DEFAULT_FONT_SIZE = 16;

export const FONT_SIZE_PRESETS: FontSizePreset[] = [
  { size: 13, label: "Nhỏ", description: "Hiển thị nhiều thông tin hơn (13px)" },
  { size: 16, label: "Mặc định", description: "Cân đối chuẩn (16px)" },
  { size: 18, label: "Lớn", description: "Dễ đọc khi chấm bài lâu (18px)" },
  { size: 20, label: "Rất lớn", description: "Chữ to rõ nét (20px)" },
];

export function clampFontSize(val: number): number {
  if (!Number.isFinite(val)) return DEFAULT_FONT_SIZE;
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(val)));
}

export interface ThemeModeOption {
  id: ThemeMode;
  label: string;
  description: string;
}

export interface ThemeAccentOption {
  id: ThemeAccent;
  label: string;
  description: string;
  swatch: string;
  swatchSoft: string;
}

export const THEME_STORAGE_KEY = "englishspeak_grader_theme";

export interface SurfaceThemeOption {
  id: SurfaceTheme;
  label: string;
  description: string;
  canvasSwatch: string;
  cardSwatch: string;
}

export const DEFAULT_CUSTOM_CANVAS = "#f4f6fb";
export const DEFAULT_CUSTOM_CARD = "#ffffff";
export const DEFAULT_CUSTOM_ACCENT = "#0ea5e9";
export const DEFAULT_CUSTOM_TEXT = "#1e293b";

export interface ThemeFontOption {
  id: ThemeFontFamily;
  label: string;
  description: string;
  stack: string;
}

export interface ThemeFontWeightOption {
  id: ThemeFontWeight;
  label: string;
  numeric: number;
}

export const THEME_FONTS: ThemeFontOption[] = [
  {
    id: "be_vietnam",
    label: "Be Vietnam Pro",
    description: "Mặc định chuẩn tiếng Việt",
    stack: '"Be Vietnam Pro", "Noto Sans", system-ui, -apple-system, sans-serif',
  },
  {
    id: "lexend",
    label: "Lexend",
    description: "Dễ đọc, hỗ trợ đủ độ dày",
    stack: '"Lexend", "Noto Sans", system-ui, sans-serif',
  },
  {
    id: "noto_sans",
    label: "Noto Sans",
    description: "Trung tính, rõ nét",
    stack: '"Noto Sans", system-ui, -apple-system, sans-serif',
  },
  {
    id: "system",
    label: "Hệ thống",
    description: "Font mặc định của máy",
    stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  },
  {
    id: "serif",
    label: "Serif (Sách)",
    description: "Có chân, kiểu văn bản",
    stack: 'Georgia, "Times New Roman", Times, serif',
  },
  {
    id: "mono",
    label: "Monospace",
    description: "Đều nét kiểu code",
    stack: '"JetBrains Mono", "Fira Code", ui-monospace, Menlo, Consolas, monospace',
  },
  {
    id: "custom",
    label: "Tự nhập tên",
    description: "Font đã cài trên máy",
    stack: 'system-ui, sans-serif',
  },
];

export const THEME_FONT_WEIGHTS: ThemeFontWeightOption[] = [
  { id: "light", label: "Mảnh", numeric: 300 },
  { id: "normal", label: "Chuẩn", numeric: 400 },
  { id: "medium", label: "Hơi đậm", numeric: 500 },
  { id: "semibold", label: "Đậm rõ", numeric: 600 },
];

export const DEFAULT_THEME: ThemePreferences = {
  mode: "system",
  surface: "auto",
  customCanvasHex: DEFAULT_CUSTOM_CANVAS,
  customCardHex: DEFAULT_CUSTOM_CARD,
  accent: "indigo",
  customAccentHex: DEFAULT_CUSTOM_ACCENT,
  customTextEnabled: false,
  customTextHex: DEFAULT_CUSTOM_TEXT,
  fontFamily: "be_vietnam",
  customFontFamily: "",
  fontWeight: "normal",
  fontSize: DEFAULT_FONT_SIZE,
};

export const THEME_SURFACES: SurfaceThemeOption[] = [
  {
    id: "auto",
    label: "Tự động",
    description: "Theo chế độ Sáng / Tối",
    canvasSwatch: "#f8fafc",
    cardSwatch: "#ffffff",
  },
  {
    id: "light",
    label: "Sáng chuẩn",
    description: "Nền trắng xám rõ nét",
    canvasSwatch: "#f8fafc",
    cardSwatch: "#ffffff",
  },
  {
    id: "sepia",
    label: "Giấy ấm",
    description: "Vàng kem dịu mắt khi đọc lâu",
    canvasSwatch: "#f4ede0",
    cardSwatch: "#fcf8f0",
  },
  {
    id: "mist",
    label: "Xám sương",
    description: "Xám mát giảm chói nhẹ",
    canvasSwatch: "#e9eef5",
    cardSwatch: "#f6f8fb",
  },
  {
    id: "dark",
    label: "Tối chuẩn",
    description: "Xanh than dịu mắt ban đêm",
    canvasSwatch: "#0b1120",
    cardSwatch: "#111a2b",
  },
  {
    id: "midnight",
    label: "Đêm sâu",
    description: "Đen sâu độ tương phản cao",
    canvasSwatch: "#050811",
    cardSwatch: "#0c1322",
  },
  {
    id: "custom",
    label: "Tự chọn màu",
    description: "Tùy chỉnh màu nền & thẻ",
    canvasSwatch: "#dbeafe",
    cardSwatch: "#ffffff",
  },
];

export const THEME_MODES: ThemeModeOption[] = [
  {
    id: "system",
    label: "Theo hệ thống",
    description: "Tự động đổi sáng/tối theo cài đặt hệ điều hành",
  },
  {
    id: "light",
    label: "Sáng (Light)",
    description: "Nền sáng rõ ràng, phù hợp môi trường đủ sáng",
  },
  {
    id: "dark",
    label: "Tối (Dark)",
    description: "Dịu mắt khi làm việc ban đêm hoặc chấm bài lâu",
  },
];

export const THEME_ACCENTS: ThemeAccentOption[] = [
  {
    id: "indigo",
    label: "Indigo Chàm",
    description: "Mặc định chuyên nghiệp",
    swatch: "#4f46e5",
    swatchSoft: "#e0e7ff",
  },
  {
    id: "sky",
    label: "Ocean Blue",
    description: "Xanh dương tươi sáng",
    swatch: "#0284c7",
    swatchSoft: "#e0f2fe",
  },
  {
    id: "emerald",
    label: "Emerald Ngọc",
    description: "Xanh lá dịu mắt",
    swatch: "#059669",
    swatchSoft: "#d1fae5",
  },
  {
    id: "violet",
    label: "Royal Violet",
    description: "Tím hiện đại",
    swatch: "#7c3aed",
    swatchSoft: "#ede9fe",
  },
  {
    id: "rose",
    label: "Crimson Rose",
    description: "Hồng đỏ nổi bật",
    swatch: "#e11d48",
    swatchSoft: "#ffe4e6",
  },
  {
    id: "amber",
    label: "Warm Amber",
    description: "Hổ phách ấm áp",
    swatch: "#d97706",
    swatchSoft: "#fef3c7",
  },
];

const VALID_MODES = new Set<ThemeMode>(["system", "light", "dark"]);
const VALID_SURFACES = new Set<SurfaceTheme>([
  "auto",
  "light",
  "sepia",
  "mist",
  "dark",
  "midnight",
  "custom",
]);
const VALID_ACCENTS = new Set<ThemeAccent>([
  "indigo",
  "sky",
  "emerald",
  "violet",
  "rose",
  "amber",
  "custom",
]);
const VALID_FONTS = new Set<ThemeFontFamily>([
  "be_vietnam",
  "lexend",
  "noto_sans",
  "system",
  "serif",
  "mono",
  "custom",
]);
const VALID_WEIGHTS = new Set<ThemeFontWeight>([
  "light",
  "normal",
  "medium",
  "semibold",
]);

const CUSTOM_SURFACE_VAR_KEYS = [
  "--surface-canvas",
  "--surface-card",
  "--surface-card-soft",
  "--color-slate-50",
  "--color-slate-100",
  "--color-slate-200",
  "--color-slate-400",
  "--color-slate-500",
  "--color-slate-600",
  "--color-slate-700",
  "--color-slate-800",
  "--color-slate-900",
];

const CUSTOM_ACCENT_VAR_KEYS = [
  "--color-indigo-50",
  "--color-indigo-100",
  "--color-indigo-200",
  "--color-indigo-300",
  "--color-indigo-400",
  "--color-indigo-500",
  "--color-indigo-600",
  "--color-indigo-700",
  "--color-indigo-800",
  "--color-indigo-900",
  "--color-indigo-950",
  "--accent-solid",
  "--accent-solid-hover",
  "--accent-text",
];

function getSystemResolvedMode(): ResolvedThemeMode {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveThemeMode(prefs: ThemePreferences | ThemeMode): ResolvedThemeMode {
  if (typeof prefs === "string") {
    return prefs === "system" ? getSystemResolvedMode() : prefs;
  }
  switch (prefs.surface) {
    case "light":
    case "sepia":
    case "mist":
      return "light";
    case "dark":
    case "midnight":
      return "dark";
    case "custom":
      return isDarkColor(prefs.customCanvasHex) ? "dark" : "light";
    case "auto":
    default:
      return prefs.mode === "system" ? getSystemResolvedMode() : prefs.mode;
  }
}

export function loadThemePreferences(): ThemePreferences {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return DEFAULT_THEME;
    const parsed = JSON.parse(raw) as Partial<ThemePreferences>;
    const mode = parsed.mode && VALID_MODES.has(parsed.mode)
      ? parsed.mode
      : DEFAULT_THEME.mode;
    const surface = parsed.surface && VALID_SURFACES.has(parsed.surface)
      ? parsed.surface
      : DEFAULT_THEME.surface;
    const customCanvasHex = normalizeHex(
      parsed.customCanvasHex ?? "",
      DEFAULT_CUSTOM_CANVAS
    );
    const customCardHex = normalizeHex(
      parsed.customCardHex ?? "",
      DEFAULT_CUSTOM_CARD
    );
    const accent = parsed.accent && VALID_ACCENTS.has(parsed.accent)
      ? parsed.accent
      : DEFAULT_THEME.accent;
    const customAccentHex = normalizeHex(
      parsed.customAccentHex ?? "",
      DEFAULT_CUSTOM_ACCENT
    );
    const customTextEnabled = Boolean(parsed.customTextEnabled);
    const customTextHex = normalizeHex(
      parsed.customTextHex ?? "",
      DEFAULT_CUSTOM_TEXT
    );
    const fontFamily =
      parsed.fontFamily && VALID_FONTS.has(parsed.fontFamily)
        ? parsed.fontFamily
        : DEFAULT_THEME.fontFamily;
    const customFontFamily =
      typeof parsed.customFontFamily === "string"
        ? parsed.customFontFamily
        : "";
    const fontWeight =
      parsed.fontWeight && VALID_WEIGHTS.has(parsed.fontWeight)
        ? parsed.fontWeight
        : DEFAULT_THEME.fontWeight;
    const fontSize =
      typeof parsed.fontSize === "number"
        ? clampFontSize(parsed.fontSize)
        : DEFAULT_FONT_SIZE;
    return {
      mode,
      surface,
      customCanvasHex,
      customCardHex,
      accent,
      customAccentHex,
      customTextEnabled,
      customTextHex,
      fontFamily,
      customFontFamily,
      fontWeight,
      fontSize,
    };
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveThemePreferences(prefs: ThemePreferences): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota or private-mode restrictions
  }
}

function resolveSurfaceCardHex(
  prefs: ThemePreferences,
  resolved: ResolvedThemeMode
): string {
  switch (prefs.surface) {
    case "light":
      return "#ffffff";
    case "sepia":
      return "#fcf8f0";
    case "mist":
      return "#f6f8fb";
    case "dark":
      return "#111a2b";
    case "midnight":
      return "#0c1322";
    case "custom":
      return prefs.customCardHex;
    case "auto":
    default:
      return resolved === "dark" ? "#111a2b" : "#ffffff";
  }
}

export function applyThemeToDocument(
  prefs: ThemePreferences
): ResolvedThemeMode {
  const resolved = resolveThemeMode(prefs);
  const root = document.documentElement;
  const fontSize = clampFontSize(prefs.fontSize);
  root.dataset.theme = resolved;
  root.dataset.themeMode = prefs.mode;
  root.dataset.surface = prefs.surface;
  root.dataset.accent = prefs.accent;
  root.dataset.fontSize = String(fontSize);
  root.dataset.fontWeight = prefs.fontWeight;
  root.style.colorScheme = resolved;
  root.style.fontSize = `${fontSize}px`;

  const fontPreset = THEME_FONTS.find((f) => f.id === prefs.fontFamily);
  const resolvedFontStack =
    prefs.fontFamily === "custom" && prefs.customFontFamily.trim()
      ? `${prefs.customFontFamily.trim()}, "Be Vietnam Pro", system-ui, sans-serif`
      : fontPreset?.stack ?? THEME_FONTS[0].stack;
  root.style.setProperty("--app-font-family", resolvedFontStack);

  const weightPreset = THEME_FONT_WEIGHTS.find((w) => w.id === prefs.fontWeight);
  root.style.setProperty(
    "--app-font-weight",
    String(weightPreset?.numeric ?? 400)
  );

  if (prefs.surface === "custom") {
    const { vars } = buildCustomSurfaceCssVars(
      prefs.customCanvasHex,
      prefs.customCardHex
    );
    for (const [k, v] of Object.entries(vars)) {
      root.style.setProperty(k, v);
    }
  } else {
    for (const key of CUSTOM_SURFACE_VAR_KEYS) {
      root.style.removeProperty(key);
    }
  }

  if (prefs.customTextEnabled) {
    const cardHex = resolveSurfaceCardHex(prefs, resolved);
    const textVars = buildCustomTextCssVars(prefs.customTextHex, cardHex);
    for (const [k, v] of Object.entries(textVars)) {
      root.style.setProperty(k, v);
    }
  }

  if (prefs.accent === "custom") {
    const canvasForDark =
      prefs.surface === "custom"
        ? prefs.customCanvasHex
        : prefs.surface === "midnight"
          ? "#050811"
          : "#0b1120";
    const vars = buildAccentCssVars(
      prefs.customAccentHex,
      resolved === "dark",
      canvasForDark
    );
    for (const [k, v] of Object.entries(vars)) {
      root.style.setProperty(k, v);
    }
  } else {
    for (const key of CUSTOM_ACCENT_VAR_KEYS) {
      root.style.removeProperty(key);
    }
  }

  return resolved;
}

interface ThemeContextValue {
  mode: ThemeMode;
  surface: SurfaceTheme;
  customCanvasHex: string;
  customCardHex: string;
  accent: ThemeAccent;
  customAccentHex: string;
  customTextEnabled: boolean;
  customTextHex: string;
  fontFamily: ThemeFontFamily;
  customFontFamily: string;
  fontWeight: ThemeFontWeight;
  fontSize: number;
  resolvedMode: ResolvedThemeMode;
  setMode: (mode: ThemeMode) => void;
  setSurface: (surface: SurfaceTheme) => void;
  setCustomSurfaceColors: (canvasHex: string, cardHex: string) => void;
  setAccent: (accent: ThemeAccent) => void;
  setCustomAccentHex: (hex: string) => void;
  setCustomTextEnabled: (enabled: boolean) => void;
  setCustomTextHex: (hex: string) => void;
  setFontFamily: (fontFamily: ThemeFontFamily) => void;
  setCustomFontFamily: (name: string) => void;
  setFontWeight: (weight: ThemeFontWeight) => void;
  setFontSize: (size: number) => void;
  stepFontSize: (delta: number) => void;
  resetTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<ThemePreferences>(() =>
    loadThemePreferences()
  );
  const [systemMode, setSystemMode] = useState<ResolvedThemeMode>(() =>
    getSystemResolvedMode()
  );

  useEffect(() => {
    saveThemePreferences(prefs);
    applyThemeToDocument(prefs);
  }, [prefs]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => {
      const nextSystem: ResolvedThemeMode = event.matches ? "dark" : "light";
      setSystemMode(nextSystem);
      if (prefs.mode === "system") {
        applyThemeToDocument(prefs);
      }
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [prefs]);

  const setMode = useCallback((mode: ThemeMode) => {
    setPrefs((prev) => ({ ...prev, mode, surface: "auto" }));
  }, []);

  const setSurface = useCallback((surface: SurfaceTheme) => {
    setPrefs((prev) => ({ ...prev, surface }));
  }, []);

  const setCustomSurfaceColors = useCallback(
    (canvasHex: string, cardHex: string) => {
      setPrefs((prev) => ({
        ...prev,
        surface: "custom",
        customCanvasHex: normalizeHex(canvasHex, prev.customCanvasHex),
        customCardHex: normalizeHex(cardHex, prev.customCardHex),
      }));
    },
    []
  );

  const setAccent = useCallback((accent: ThemeAccent) => {
    setPrefs((prev) => ({ ...prev, accent }));
  }, []);

  const setCustomAccentHex = useCallback((hex: string) => {
    setPrefs((prev) => ({
      ...prev,
      accent: "custom",
      customAccentHex: normalizeHex(hex, prev.customAccentHex),
    }));
  }, []);

  const setCustomTextEnabled = useCallback((customTextEnabled: boolean) => {
    setPrefs((prev) => ({ ...prev, customTextEnabled }));
  }, []);

  const setCustomTextHex = useCallback((hex: string) => {
    setPrefs((prev) => ({
      ...prev,
      customTextEnabled: true,
      customTextHex: normalizeHex(hex, prev.customTextHex),
    }));
  }, []);

  const setFontFamily = useCallback((fontFamily: ThemeFontFamily) => {
    setPrefs((prev) => ({ ...prev, fontFamily }));
  }, []);

  const setCustomFontFamily = useCallback((customFontFamily: string) => {
    setPrefs((prev) => ({ ...prev, fontFamily: "custom", customFontFamily }));
  }, []);

  const setFontWeight = useCallback((fontWeight: ThemeFontWeight) => {
    setPrefs((prev) => ({ ...prev, fontWeight }));
  }, []);

  const setFontSize = useCallback((size: number) => {
    setPrefs((prev) => ({ ...prev, fontSize: clampFontSize(size) }));
  }, []);

  const stepFontSize = useCallback((delta: number) => {
    setPrefs((prev) => ({
      ...prev,
      fontSize: clampFontSize(prev.fontSize + delta),
    }));
  }, []);

  const resetTheme = useCallback(() => {
    setPrefs(DEFAULT_THEME);
  }, []);

  const resolvedMode: ResolvedThemeMode = useMemo(() => {
    if (prefs.surface === "auto") {
      return prefs.mode === "system" ? systemMode : prefs.mode;
    }
    return resolveThemeMode(prefs);
  }, [prefs, systemMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode: prefs.mode,
      surface: prefs.surface,
      customCanvasHex: prefs.customCanvasHex,
      customCardHex: prefs.customCardHex,
      accent: prefs.accent,
      customAccentHex: prefs.customAccentHex,
      customTextEnabled: prefs.customTextEnabled,
      customTextHex: prefs.customTextHex,
      fontFamily: prefs.fontFamily,
      customFontFamily: prefs.customFontFamily,
      fontWeight: prefs.fontWeight,
      fontSize: prefs.fontSize,
      resolvedMode,
      setMode,
      setSurface,
      setCustomSurfaceColors,
      setAccent,
      setCustomAccentHex,
      setCustomTextEnabled,
      setCustomTextHex,
      setFontFamily,
      setCustomFontFamily,
      setFontWeight,
      setFontSize,
      stepFontSize,
      resetTheme,
    }),
    [
      prefs.mode,
      prefs.surface,
      prefs.customCanvasHex,
      prefs.customCardHex,
      prefs.accent,
      prefs.customAccentHex,
      prefs.customTextEnabled,
      prefs.customTextHex,
      prefs.fontFamily,
      prefs.customFontFamily,
      prefs.fontWeight,
      prefs.fontSize,
      resolvedMode,
      setMode,
      setSurface,
      setCustomSurfaceColors,
      setAccent,
      setCustomAccentHex,
      setCustomTextEnabled,
      setCustomTextHex,
      setFontFamily,
      setCustomFontFamily,
      setFontWeight,
      setFontSize,
      stepFontSize,
      resetTheme,
    ]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return ctx;
}
