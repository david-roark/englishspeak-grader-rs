import { getParentDir } from "./mediaUtils";

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
