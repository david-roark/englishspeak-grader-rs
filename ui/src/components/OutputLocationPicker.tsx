import { FileOutput, Folder, FolderOpen, HardDrive } from "lucide-react";
import { api } from "../lib/api";
import { getParentDir } from "../lib/mediaUtils";

export type OutputTargetMode =
  | "default"
  | "source_dir"
  | "custom_dir"
  | "custom_file";

export interface OutputTargetState {
  mode: OutputTargetMode;
  customDir: string;
  customFilePath: string;
}

export const MEDIA_OUTPUT_STORAGE_KEY = "englishspeak_grader_media_output";

export const INITIAL_OUTPUT_TARGET: OutputTargetState = {
  mode: "source_dir",
  customDir: "",
  customFilePath: "",
};

const PERSISTENT_MODES = new Set<OutputTargetMode>([
  "source_dir",
  "custom_dir",
  "default",
]);

export function loadSavedOutputTarget(
  fallbackCustomDir?: string
): OutputTargetState {
  try {
    const raw = window.localStorage.getItem(MEDIA_OUTPUT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<OutputTargetState>;
      const customDir =
        typeof parsed.customDir === "string" ? parsed.customDir.trim() : "";
      const mode =
        parsed.mode && PERSISTENT_MODES.has(parsed.mode)
          ? parsed.mode
          : customDir
          ? "custom_dir"
          : "source_dir";
      if (mode === "custom_dir" && !customDir) {
        return {
          mode: fallbackCustomDir ? "custom_dir" : "source_dir",
          customDir: fallbackCustomDir ?? "",
          customFilePath: "",
        };
      }
      return { mode, customDir, customFilePath: "" };
    }
  } catch {
    // Ignore invalid storage
  }
  if (fallbackCustomDir && fallbackCustomDir.trim()) {
    return {
      mode: "custom_dir",
      customDir: fallbackCustomDir.trim(),
      customFilePath: "",
    };
  }
  return INITIAL_OUTPUT_TARGET;
}

export function saveOutputTarget(target: OutputTargetState): void {
  try {
    const persistedMode: OutputTargetMode =
      target.mode === "custom_file"
        ? target.customDir
          ? "custom_dir"
          : "source_dir"
        : target.mode;
    window.localStorage.setItem(
      MEDIA_OUTPUT_STORAGE_KEY,
      JSON.stringify({
        mode: persistedMode,
        customDir: target.customDir,
      })
    );
  } catch {
    // Ignore storage restriction
  }
}

export function resolveOutputOverrides(
  target: OutputTargetState,
  sourceFilePath?: string | null
): { outDirOverride?: string; outPathOverride?: string } {
  if (target.mode === "custom_file" && target.customFilePath.trim()) {
    return { outPathOverride: target.customFilePath.trim() };
  }
  if (target.mode === "custom_dir" && target.customDir.trim()) {
    return { outDirOverride: target.customDir.trim() };
  }
  if (target.mode === "source_dir" && sourceFilePath) {
    const parent = getParentDir(sourceFilePath);
    if (parent) return { outDirOverride: parent };
  }
  return {};
}

interface OutputLocationPickerProps {
  defaultExportDir: string;
  sourceFilePath?: string | null;
  defaultFileName: string;
  fileFilterName: string;
  fileExtensions: string[];
  value: OutputTargetState;
  onChange: (next: OutputTargetState) => void;
  disabled?: boolean;
}

export function OutputLocationPicker({
  defaultExportDir,
  sourceFilePath,
  defaultFileName,
  fileFilterName,
  fileExtensions,
  value,
  onChange,
  disabled = false,
}: OutputLocationPickerProps) {
  const sourceDir = sourceFilePath ? getParentDir(sourceFilePath) : "";

  async function handlePickFolder() {
    const dir = await api.pickFolder("Chọn thư mục lưu file kết quả");
    if (dir) {
      onChange({ ...value, mode: "custom_dir", customDir: dir });
    }
  }

  async function handlePickSaveFile() {
    const filePath = await api.saveMediaDialog({
      title: "Chọn nơi lưu & đặt tên file kết quả",
      defaultName: defaultFileName,
      filterName: fileFilterName,
      extensions: fileExtensions,
    });
    if (filePath) {
      const parentDir = getParentDir(filePath);
      onChange({
        mode: "custom_file",
        customDir: parentDir || value.customDir,
        customFilePath: filePath,
      });
    }
  }

  let resolvedDisplay = defaultExportDir;
  if (value.mode === "source_dir") {
    resolvedDisplay =
      sourceDir || "Cùng thư mục với file nguồn (không lưu vào AppData)";
  } else if (value.mode === "custom_dir" && value.customDir) {
    resolvedDisplay = value.customDir;
  } else if (value.mode === "custom_file" && value.customFilePath) {
    resolvedDisplay = value.customFilePath;
  }

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-800">
          Nơi lưu kết quả
        </span>
        <span className="text-[11px] text-slate-500">
          {value.mode === "custom_file"
            ? "Tên file riêng"
            : "Tự nhớ cho lần sau"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ ...value, mode: "source_dir" })}
          title={
            sourceDir
              ? `Lưu cùng thư mục file nguồn (${sourceDir})`
              : "Lưu ngay cạnh file nguồn khi chọn file"
          }
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition disabled:opacity-50 ${
            value.mode === "source_dir"
              ? "border-indigo-400 bg-indigo-50 text-indigo-800"
              : "border-slate-200 text-slate-700 hover:bg-slate-50"
          }`}
        >
          <Folder className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Cùng file gốc</span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => void handlePickFolder()}
          title={
            value.customDir
              ? `Thư mục đã chọn: ${value.customDir}`
              : "Chọn thư mục lưu cố định cho mọi lần sau"
          }
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition disabled:opacity-50 ${
            value.mode === "custom_dir"
              ? "border-indigo-400 bg-indigo-50 text-indigo-800"
              : "border-slate-200 text-slate-700 hover:bg-slate-50"
          }`}
        >
          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {value.mode === "custom_dir" && value.customDir
              ? "Đổi thư mục..."
              : "Chọn thư mục..."}
          </span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ ...value, mode: "default" })}
          title={`Thư mục xuất của app: ${defaultExportDir}`}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition disabled:opacity-50 ${
            value.mode === "default"
              ? "border-indigo-400 bg-indigo-50 text-indigo-800"
              : "border-slate-200 text-slate-700 hover:bg-slate-50"
          }`}
        >
          <HardDrive className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Thư mục xuất app</span>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => void handlePickSaveFile()}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition disabled:opacity-50 ${
            value.mode === "custom_file"
              ? "border-indigo-400 bg-indigo-50 text-indigo-800"
              : "border-slate-200 text-slate-700 hover:bg-slate-50"
          }`}
        >
          <FileOutput className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Lưu thành file...</span>
        </button>
      </div>

      <div
        className="truncate rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600"
        title={resolvedDisplay}
      >
        <span className="font-semibold">Đích: </span>
        <code>{resolvedDisplay}</code>
      </div>
    </div>
  );
}
