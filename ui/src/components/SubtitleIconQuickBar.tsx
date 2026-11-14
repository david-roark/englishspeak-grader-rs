const SUBTITLE_QUICK_ICONS = ["🎓", "💡", "🎤", "✅", "⚠️", "⭐", "💬"] as const;

interface SubtitleIconQuickBarProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
}

export function SubtitleIconQuickBar({
  label,
  value,
  onChange,
}: SubtitleIconQuickBarProps) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <span className="text-[10px] text-slate-400">{label}:</span>
      {SUBTITLE_QUICK_ICONS.map((icon) => (
        <button
          key={icon}
          type="button"
          onClick={() =>
            onChange(value.trim() ? `${value.trimEnd()} ${icon}` : `${icon} `)
          }
          title={`Chèn ${icon}`}
          style={{ fontFamily: `"Noto Emoji", sans-serif` }}
          className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs leading-none hover:border-indigo-300 hover:bg-indigo-50"
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
