import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  badge?: string;
  description?: string;
  disabled?: boolean;
}

export interface SelectFieldProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  size?: "xs" | "sm" | "md";
  className?: string;
  ariaLabel?: string;
  title?: string;
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  openUp: boolean;
}

const SIZE_CLASSES: Record<"xs" | "sm" | "md", string> = {
  xs: "px-2 py-1 text-xs rounded-lg gap-1.5",
  sm: "px-2.5 py-1.5 text-sm rounded-lg gap-2",
  md: "px-3 py-2 text-sm rounded-lg gap-2",
};

/**
 * Custom theme-aware dropdown select rendered via portal to avoid clipping
 * inside sticky or overflow-constrained containers.
 */
export function SelectField<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = "Chọn một mục...",
  disabled = false,
  size = "sm",
  className = "",
  ariaLabel,
  title,
}: SelectFieldProps<T>) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listboxId = useId();

  const selectedOption = options.find((opt) => opt.value === value);

  const findNextEnabledIndex = (start: number, step: 1 | -1): number => {
    if (options.length === 0) return -1;
    let idx = start;
    for (let i = 0; i < options.length; i++) {
      idx = (idx + step + options.length) % options.length;
      if (!options[idx]?.disabled) return idx;
    }
    return -1;
  };

  const findEdgeEnabledIndex = (fromEnd: boolean): number => {
    if (options.length === 0) return -1;
    const indices = fromEnd
      ? [...options.keys()].reverse()
      : [...options.keys()];
    return indices.find((i) => !options[i]?.disabled) ?? -1;
  };

  const computePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const gap = 6;
    const viewportMargin = 10;
    const preferredMaxHeight = 280;

    const spaceBelow = window.innerHeight - rect.bottom - viewportMargin;
    const spaceAbove = rect.top - viewportMargin;
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;

    const availableSpace = Math.max(120, (openUp ? spaceAbove : spaceBelow) - gap);
    const maxHeight = Math.min(preferredMaxHeight, availableSpace);

    const minMenuWidth = Math.max(rect.width, 180);
    const clampedWidth = Math.min(minMenuWidth, window.innerWidth - viewportMargin * 2);
    const left = Math.min(
      Math.max(viewportMargin, rect.left),
      window.innerWidth - clampedWidth - viewportMargin
    );

    const top = openUp ? rect.top - gap : rect.bottom + gap;

    setMenuPos({
      top,
      left,
      width: Math.max(rect.width, Math.min(clampedWidth, rect.width + 64)),
      maxHeight,
      openUp,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    computePosition();
    const selectedIdx = options.findIndex((o) => o.value === value && !o.disabled);
    setHighlightedIndex(selectedIdx >= 0 ? selectedIdx : findEdgeEnabledIndex(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    const handleReposition = () => {
      computePosition();
    };

    const handleKeyGlobal = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("keydown", handleKeyGlobal);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("keydown", handleKeyGlobal);
    };
  }, [open]);

  useEffect(() => {
    if (!open || highlightedIndex < 0) return;
    optionRefs.current[highlightedIndex]?.scrollIntoView({ block: "nearest" });
  }, [open, highlightedIndex]);

  const handleSelect = (opt: SelectOption<T>) => {
    if (opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (!open) {
      if (
        e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        e.key === "Enter" ||
        e.key === " "
      ) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < 0 ? findEdgeEnabledIndex(false) : findNextEnabledIndex(prev, 1)
        );
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < 0 ? findEdgeEnabledIndex(true) : findNextEnabledIndex(prev, -1)
        );
        break;
      }
      case "Home": {
        e.preventDefault();
        setHighlightedIndex(findEdgeEnabledIndex(false));
        break;
      }
      case "End": {
        e.preventDefault();
        setHighlightedIndex(findEdgeEnabledIndex(true));
        break;
      }
      case "Enter":
      case " ": {
        e.preventDefault();
        const opt = highlightedIndex >= 0 ? options[highlightedIndex] : undefined;
        if (opt && !opt.disabled) {
          handleSelect(opt);
        }
        break;
      }
      case "Tab": {
        setOpen(false);
        break;
      }
    }
  };

  return (
    <div className={`relative ${className || "w-full"}`}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        title={title ?? selectedOption?.label}
        disabled={disabled}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
        className={`flex w-full items-center justify-between border bg-white text-left transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-50 ${
          SIZE_CLASSES[size]
        } ${
          open
            ? "border-indigo-500 ring-2 ring-indigo-500/20"
            : "border-slate-200 hover:border-indigo-300"
        }`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          {selectedOption?.badge && (
            <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
              {selectedOption.badge}
            </span>
          )}
          <span
            className={`truncate font-medium ${
              selectedOption ? "text-slate-900" : "text-slate-400"
            }`}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-150 ${
            open ? "rotate-180 text-indigo-600" : ""
          }`}
        />
      </button>

      {open &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            style={{
              position: "fixed",
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              maxHeight: menuPos.maxHeight,
              transform: menuPos.openUp ? "translateY(-100%)" : undefined,
            }}
            className="z-50 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
          >
            {options.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-400">
                Không có tùy chọn
              </div>
            ) : (
              options.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isHighlighted = idx === highlightedIndex;
                return (
                  <button
                    key={opt.value}
                    ref={(el) => {
                      optionRefs.current[idx] = el;
                    }}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={opt.disabled}
                    onMouseEnter={() => !opt.disabled && setHighlightedIndex(idx)}
                    onClick={() => handleSelect(opt)}
                    className={`flex w-full items-start justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                      isSelected
                        ? "bg-indigo-50 text-indigo-800"
                        : isHighlighted
                        ? "bg-slate-100 text-slate-900"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        {opt.badge && (
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              isSelected
                                ? "bg-indigo-600 text-white"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {opt.badge}
                          </span>
                        )}
                        <span
                          className={`truncate ${
                            size === "xs" ? "text-xs" : "text-sm"
                          } ${isSelected ? "font-semibold" : "font-medium"}`}
                        >
                          {opt.label}
                        </span>
                      </span>
                      {opt.description && (
                        <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                          {opt.description}
                        </span>
                      )}
                    </span>
                    {isSelected && (
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" />
                    )}
                  </button>
                );
              })
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
