import { Loader2, XCircle } from "lucide-react";

interface ProgressPanelProps {
  stage: string;
  percent: number | null;
  onCancel?: () => void;
}

export function ProgressPanel({ stage, percent, onCancel }: ProgressPanelProps) {
  const pct = percent !== null ? Math.max(0, Math.min(100, Math.round(percent))) : null;

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-indigo-900">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
          <span>{stage}</span>
        </div>
        <div className="flex items-center gap-3">
          {pct !== null && (
            <span className="text-xs font-semibold tabular-nums text-indigo-700">
              {pct}%
            </span>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              Hủy
            </button>
          )}
        </div>
      </div>

      <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-indigo-100">
        {pct !== null ? (
          <div
            className="h-full rounded-full bg-indigo-600 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        ) : (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-indigo-500" />
        )}
      </div>
    </div>
  );
}
