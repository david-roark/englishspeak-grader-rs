import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedThemeMode = "light" | "dark";
export type ThemeAccent =
  | "indigo"
  | "sky"
  | "emerald"
  | "violet"
  | "rose"
  | "amber";

export interface ThemePreferences {
  mode: ThemeMode;
  accent: ThemeAccent;
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

export const DEFAULT_THEME: ThemePreferences = {
  mode: "system",
  accent: "indigo",
  fontSize: DEFAULT_FONT_SIZE,
};

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
const VALID_ACCENTS = new Set<ThemeAccent>([
  "indigo",
  "sky",
  "emerald",
  "violet",
  "rose",
  "amber",
]);

function getSystemResolvedMode(): ResolvedThemeMode {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveThemeMode(mode: ThemeMode): ResolvedThemeMode {
  return mode === "system" ? getSystemResolvedMode() : mode;
}

export function loadThemePreferences(): ThemePreferences {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return DEFAULT_THEME;
    const parsed = JSON.parse(raw) as Partial<ThemePreferences>;
    const mode = parsed.mode && VALID_MODES.has(parsed.mode)
      ? parsed.mode
      : DEFAULT_THEME.mode;
    const accent = parsed.accent && VALID_ACCENTS.has(parsed.accent)
      ? parsed.accent
      : DEFAULT_THEME.accent;
    const fontSize =
      typeof parsed.fontSize === "number"
        ? clampFontSize(parsed.fontSize)
        : DEFAULT_FONT_SIZE;
    return { mode, accent, fontSize };
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

export function applyThemeToDocument(
  prefs: ThemePreferences
): ResolvedThemeMode {
  const resolved = resolveThemeMode(prefs.mode);
  const root = document.documentElement;
  const fontSize = clampFontSize(prefs.fontSize);
  root.dataset.theme = resolved;
  root.dataset.themeMode = prefs.mode;
  root.dataset.accent = prefs.accent;
  root.dataset.fontSize = String(fontSize);
  root.style.colorScheme = resolved;
  root.style.fontSize = `${fontSize}px`;
  return resolved;
}

interface ThemeContextValue {
  mode: ThemeMode;
  accent: ThemeAccent;
  fontSize: number;
  resolvedMode: ResolvedThemeMode;
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: ThemeAccent) => void;
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
    setPrefs((prev) => ({ ...prev, mode }));
  }, []);

  const setAccent = useCallback((accent: ThemeAccent) => {
    setPrefs((prev) => ({ ...prev, accent }));
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

  const resolvedMode: ResolvedThemeMode =
    prefs.mode === "system" ? systemMode : prefs.mode;

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode: prefs.mode,
      accent: prefs.accent,
      fontSize: prefs.fontSize,
      resolvedMode,
      setMode,
      setAccent,
      setFontSize,
      stepFontSize,
      resetTheme,
    }),
    [
      prefs.mode,
      prefs.accent,
      prefs.fontSize,
      resolvedMode,
      setMode,
      setAccent,
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
