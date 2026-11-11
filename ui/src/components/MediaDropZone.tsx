import { useRef } from "react";
import { FileAudio, FileVideo, Upload, X } from "lucide-react";
import {
  formatDuration,
  isAudioFilePath,
  MEDIA_EXTENSIONS,
} from "../lib/mediaUtils";
import { useFileDrop } from "../lib/useFileDrop";
import type { FileInfo } from "../lib/types";

interface MediaDropZoneProps {
  file: FileInfo | null;
  durationSecs?: number | null;
  disabled?: boolean;
  acceptedExtensions?: string[];
  emptyTitle?: string;
  emptySubtitle?: string;
  onPickFile: () => void;
  onDropFile: (path: string) => void;
  onClear?: () => void;
  onInvalidDrop?: (message: string) => void;
}

export function MediaDropZone({
  file,
  durationSecs,
  disabled = false,
  acceptedExtensions = MEDIA_EXTENSIONS,
  emptyTitle = "Kéo & thả file Video / Audio vào đây",
  emptySubtitle = "Hoặc bấm để chọn file (.mp4, .mov, .mkv, .mp3, .wav, .m4a...)",
  onPickFile,
  onDropFile,
  onClear,
  onInvalidDrop,
}: MediaDropZoneProps) {
  const dropRef = useRef<HTMLDivElement | null>(null);

  const { isDraggingOver } = useFileDrop({
    targetRef: dropRef,
    disabled,
    acceptedExtensions,
    onDropFiles: (paths) => {
      if (paths[0]) onDropFile(paths[0]);
    },
    onRejected: onInvalidDrop,
  });

  const isAudio = file ? isAudioFilePath(file.path) : false;

  return (
    <div
      ref={dropRef}
      className={`rounded-xl border-2 border-dashed p-3.5 transition ${
        isDraggingOver
          ? "border-indigo-500 bg-indigo-50"
          : "border-slate-200 bg-slate-50/70 hover:border-indigo-300"
      }`}
    >
      {file ? (
        <div className="space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-2.5">
              <div className="mt-0.5 rounded-lg bg-indigo-100 p-2 text-indigo-700">
                {isAudio ? (
                  <FileAudio className="h-4 w-4" />
                ) : (
                  <FileVideo className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0">
                <div
                  className="truncate text-sm font-semibold text-slate-900"
                  title={file.path}
                >
                  {file.name}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-medium text-indigo-700">
                    {file.size_mb.toFixed(2)} MB
                  </span>
                  {durationSecs != null && (
                    <span>· Thời lượng: {formatDuration(durationSecs)}</span>
                  )}
                </div>
                <div
                  className="mt-0.5 truncate text-[11px] text-slate-400"
                  title={file.path}
                >
                  {file.path}
                </div>
              </div>
            </div>

            {onClear && (
              <button
                type="button"
                onClick={onClear}
                disabled={disabled}
                className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-white hover:text-rose-600 disabled:opacity-40"
                title="Bỏ chọn file"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-2">
            <span className="text-[11px] text-slate-500">
              {isDraggingOver
                ? "Thả để thay thế file hiện tại"
                : "Có thể kéo thả file khác vào đây để đổi"}
            </span>
            <button
              type="button"
              onClick={onPickFile}
              disabled={disabled}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              Đổi file
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onPickFile}
          disabled={disabled}
          className="flex w-full flex-col items-center justify-center py-4 text-center disabled:opacity-50"
        >
          <div className="rounded-full bg-indigo-50 p-2.5 text-indigo-600">
            <Upload className="h-5 w-5" />
          </div>
          <span className="mt-2 text-sm font-semibold text-slate-800">
            {isDraggingOver ? "Thả file vào đây ngay..." : emptyTitle}
          </span>
          <span className="mt-0.5 text-xs text-slate-500">{emptySubtitle}</span>
        </button>
      )}
    </div>
  );
}
