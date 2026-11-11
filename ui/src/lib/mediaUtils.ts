export const VIDEO_EXTENSIONS = [
  "mp4",
  "mov",
  "webm",
  "avi",
  "mkv",
  "mpeg",
  "mpg",
  "wmv",
  "3gp",
  "flv",
  "m4v",
];

export const AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "aac", "ogg", "flac"];

export const MEDIA_EXTENSIONS = [...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS];

export function getFileExtension(path: string): string {
  const base = path.split(/[/\\]/).pop() ?? "";
  const idx = base.lastIndexOf(".");
  if (idx <= 0 || idx === base.length - 1) return "";
  return base.slice(idx + 1).toLowerCase();
}

export function getFileStem(path: string): string {
  const base = path.split(/[/\\]/).pop() ?? "media";
  const idx = base.lastIndexOf(".");
  return idx > 0 ? base.slice(0, idx) : base;
}

export function getParentDir(path: string): string {
  const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (lastSlash <= 0) return "";
  return path.slice(0, lastSlash);
}

export function isAudioFilePath(path: string): boolean {
  return AUDIO_EXTENSIONS.includes(getFileExtension(path));
}

export function isSupportedExtension(
  path: string,
  allowed?: string[]
): boolean {
  if (!allowed || allowed.length === 0) return true;
  const ext = getFileExtension(path);
  return ext !== "" && allowed.includes(ext);
}

export function formatDuration(totalSecs: number | null | undefined): string {
  if (totalSecs == null || !Number.isFinite(totalSecs) || totalSecs < 0) {
    return "--:--";
  }
  const rounded = Math.floor(totalSecs);
  const h = Math.floor(rounded / 3600);
  const m = Math.floor((rounded % 3600) / 60);
  const s = rounded % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatEditableTimecode(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return "00:00";
  const whole = Math.floor(secs);
  const frac = Math.round((secs - whole) * 10);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const base =
    h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return frac > 0 && frac < 10 ? `${base}.${frac}` : base;
}

/**
 * Parse `ss`, `mm:ss`, or `hh:mm:ss` (with optional decimals) into seconds.
 * Returns null if blank or invalid.
 */
export function parseTimecodeToSeconds(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    return Number.isFinite(num) && num >= 0 ? num : null;
  }
  const parts = trimmed.split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 2) {
    return nums[0] * 60 + nums[1];
  }
  return nums[0] * 3600 + nums[1] * 60 + nums[2];
}
