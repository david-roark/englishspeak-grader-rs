import { useEffect, useRef, useState } from "react";
import { Check, Monitor, Moon, Palette, Sun } from "lucide-react";
import {
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
  const { mode, accent, setMode, setAccent } = useTheme();
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
        title={`Bảng màu: ${currentAccent.label}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        <span
          className="h-3 w-3 rounded-full border border-black/10"
          style={{ backgroundColor: currentAccent.swatch }}
        />
        <Palette className="h-3.5 w-3.5 text-slate-500" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Chọn bảng màu"
          className="absolute top-full right-0 z-50 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
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
                  onClick={() => {
                    setAccent(item.id);
                    setOpen(false);
                  }}
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
        </div>
      )}
    </div>
  );
}
