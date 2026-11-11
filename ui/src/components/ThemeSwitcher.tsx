import { useEffect, useRef, useState } from "react";
import { Check, Minus, Monitor, Moon, Palette, Plus, RotateCcw, Sun, Type } from "lucide-react";
import {
  DEFAULT_FONT_SIZE,
  FONT_SIZE_PRESETS,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  THEME_ACCENTS,
  THEME_MODES,
  useTheme,
  type ThemeMode,
} from "../lib/theme";

const MODE_ICONS: Record<ThemeMode, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

export function ThemeSwitcher() {
  const { mode, accent, fontSize, setMode, setAccent, setFontSize, stepFontSize } =
    useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const currentAccent =
    THEME_ACCENTS.find((a) => a.id === accent) ?? THEME_ACCENTS[0];

  return (
    <div ref={containerRef} className="relative flex items-center gap-1.5">
      {/* Quick Mode Segmented Control */}
      <div
        role="group"
        aria-label="Chế độ giao diện"
        className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5"
      >
        {THEME_MODES.map((item) => {
          const Icon = MODE_ICONS[item.id];
          const active = mode === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setMode(item.id)}
              title={item.label}
              aria-label={item.label}
              aria-pressed={active}
              className={`inline-flex items-center justify-center rounded-md p-1.5 transition ${
                active
                  ? "bg-indigo-600 text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          );
        })}
      </div>

      {/* Accent Palette Popover Trigger */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label="Chọn bảng màu giao diện"
        title={`Bảng màu: ${currentAccent.label} · Cỡ chữ: ${fontSize}px`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        <span
          className="h-3 w-3 rounded-full border border-black/10"
          style={{ backgroundColor: currentAccent.swatch }}
        />
        <Palette className="h-3.5 w-3.5 text-slate-500" />
        <span className="hidden font-mono text-[11px] text-slate-500 sm:inline">
          {fontSize}px
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Tùy chỉnh giao diện và cỡ chữ"
          className="absolute top-full right-0 z-50 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900">
              Bảng màu chủ đạo
            </span>
            <span className="text-[11px] text-slate-500">
              {currentAccent.label}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {THEME_ACCENTS.map((item) => {
              const selected = accent === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setAccent(item.id)}
                  className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                    selected
                      ? "border-indigo-400 bg-indigo-50 font-semibold text-indigo-800"
                      : "border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <span
                      className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10"
                      style={{ backgroundColor: item.swatch }}
                    />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {selected && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-indigo-600" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-3 border-t border-slate-100 pt-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900">
                <Type className="h-3.5 w-3.5 text-indigo-600" />
                Cỡ chữ hiển thị
              </span>
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-[11px] font-bold text-indigo-700">
                  {fontSize}px
                </span>
                {fontSize !== DEFAULT_FONT_SIZE && (
                  <button
                    type="button"
                    onClick={() => setFontSize(DEFAULT_FONT_SIZE)}
                    className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title="Đặt lại 16px mặc định"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={fontSize <= MIN_FONT_SIZE}
                onClick={() => stepFontSize(-1)}
                className="rounded-lg border border-slate-200 px-2 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                title="Giảm cỡ chữ"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <div className="grid flex-1 grid-cols-4 gap-1">
                {FONT_SIZE_PRESETS.map((p) => {
                  const active = fontSize === p.size;
                  return (
                    <button
                      key={p.size}
                      type="button"
                      onClick={() => setFontSize(p.size)}
                      title={p.description}
                      className={`rounded-lg border py-1 text-[11px] font-semibold transition ${
                        active
                          ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                disabled={fontSize >= MAX_FONT_SIZE}
                onClick={() => stepFontSize(1)}
                className="rounded-lg border border-slate-200 px-2 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                title="Tăng cỡ chữ"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
