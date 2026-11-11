import { ExternalLink, FolderOpen } from "lucide-react";
import { api } from "../lib/api";
import { isAudioFilePath } from "../lib/mediaUtils";
import type { MediaOutput } from "../lib/types";

interface MediaResultCardProps {
  output: MediaOutput;
  actionLabel?: string;
}

export function MediaResultCard({ output, actionLabel }: MediaResultCardProps) {
  const isAudio = isAudioFilePath(output.output_path);
  const deltaPct =
    output.orig_size_mb > 0
      ? ((1 - output.size_mb / output.orig_size_mb) * 100).toFixed(1)
      : null;

  return (
    <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-emerald-900">
            <span>✅ {output.file_name}</span>
            {actionLabel && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                {actionLabel}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-emerald-800">
            Dung lượng mới: <strong>{output.size_mb.toFixed(2)} MB</strong>
            {deltaPct !== null && Number(deltaPct) > 0 && (
              <span> (giảm {deltaPct}% so với gốc)</span>
            )}
          </div>
          <div
            className="mt-0.5 truncate text-[11px] text-emerald-700"
            title={output.output_path}
          >
            {output.output_path}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => api.openLocalFile(output.output_path)}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Mở file
          </button>
          <button
            type="button"
            onClick={() => api.revealInFolder(output.output_path)}
            className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-700 shadow-2xs hover:bg-emerald-100"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Mở thư mục
          </button>
        </div>
      </div>

      {isAudio ? (
        <audio
          src={api.mediaUrl(output.output_path)}
          controls
          className="w-full"
        />
      ) : (
        <video
          src={api.mediaUrl(output.output_path)}
          controls
          className="aspect-video max-h-[300px] w-full rounded-lg bg-black object-contain"
        />
      )}
    </div>
  );
}
