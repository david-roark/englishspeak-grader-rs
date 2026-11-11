import { useMemo, useRef, useState } from "react";
import {
  Clock,
  ExternalLink,
  FolderOpen,
  Minimize2,
  Music,
  Scissors,
  VolumeX,
} from "lucide-react";
import { LocalMediaPlayer } from "../components/LocalMediaPlayer";
import { MediaDropZone } from "../components/MediaDropZone";
import { MediaResultCard } from "../components/MediaResultCard";
import {
  loadSavedOutputTarget,
  OutputLocationPicker,
  resolveOutputOverrides,
  saveOutputTarget,
  type OutputTargetState,
} from "../components/OutputLocationPicker";
import { ProgressPanel } from "../components/ProgressPanel";
import { SelectField } from "../components/SelectField";
import { api } from "../lib/api";
import {
  formatDuration,
  formatEditableTimecode,
  getFileExtension,
  getFileStem,
  isAudioFilePath,
  parseTimecodeToSeconds,
} from "../lib/mediaUtils";
import type { FileInfo, MediaOutput, Mp3Preset, VideoPreset } from "../lib/types";

type MediaToolId = "compress" | "mp3" | "trim" | "mute";

interface MediaToolsPageProps {
  videoPresets: VideoPreset[];
  mp3Presets: Mp3Preset[];
  ffmpegAvailable: boolean;
  defaultExportDir: string;
  hasCustomExportDir: boolean;
}

interface SessionHistoryItem {
  id: string;
  toolLabel: string;
  output: MediaOutput;
}

const TOOL_TABS: {
  id: MediaToolId;
  label: string;
  shortDesc: string;
  icon: typeof Minimize2;
}[] = [
  {
    id: "compress",
    label: "Giảm dung lượng",
    shortDesc: "Nén video MP4 H.264",
    icon: Minimize2,
  },
  {
    id: "mp3",
    label: "Tách âm thanh",
    shortDesc: "Xuất file MP3 nhẹ",
    icon: Music,
  },
  {
    id: "trim",
    label: "Cắt đoạn",
    shortDesc: "Cắt theo mốc thời gian",
    icon: Scissors,
  },
  {
    id: "mute",
    label: "Xóa âm thanh",
    shortDesc: "Tắt tiếng video nhanh",
    icon: VolumeX,
  },
];

export function MediaToolsPage({
  videoPresets,
  mp3Presets,
  ffmpegAvailable,
  defaultExportDir,
  hasCustomExportDir,
}: MediaToolsPageProps) {
  const playerRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);

  const [activeTool, setActiveTool] = useState<MediaToolId>("compress");
  const [sourceFile, setSourceFile] = useState<FileInfo | null>(null);
  const [durationSecs, setDurationSecs] = useState<number | null>(null);
  const [outputTarget, setOutputTarget] = useState<OutputTargetState>(() =>
    loadSavedOutputTarget(hasCustomExportDir ? defaultExportDir : undefined)
  );

  function updateOutputTarget(next: OutputTargetState) {
    setOutputTarget(next);
    saveOutputTarget(next);
  }

  // Tool options
  const [compPreset, setCompPreset] = useState("balanced");
  const [mp3Preset, setMp3Preset] = useState("balanced");
  const [trimStart, setTrimStart] = useState("00:00");
  const [trimEnd, setTrimEnd] = useState("");
  const [trimFastCopy, setTrimFastCopy] = useState(true);

  // Task execution state
  const [taskId, setTaskId] = useState<string | null>(null);
  const [stage, setStage] = useState("");
  const [percent, setPercent] = useState<number | null>(null);
  const [errMsg, setErrMsg] = useState("");
  const [latestResult, setLatestResult] = useState<{
    toolLabel: string;
    output: MediaOutput;
  } | null>(null);
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryItem[]>([]);

  const isSourceAudio = sourceFile ? isAudioFilePath(sourceFile.path) : false;

  async function loadSourcePath(path: string) {
    setErrMsg("");
    setLatestResult(null);
    try {
      const info = await api.inspectFile(path);
      setSourceFile(info);
      setDurationSecs(null);
      setTrimStart("00:00");
      setTrimEnd("");

      // Clear custom single-file destination when switching source file while keeping remembered folder
      if (outputTarget.mode === "custom_file") {
        updateOutputTarget({
          mode: outputTarget.customDir ? "custom_dir" : "source_dir",
          customDir: outputTarget.customDir,
          customFilePath: "",
        });
      }

      // If audio file is loaded while video-only tool is active, switch to MP3 or Trim cleanly
      if (isAudioFilePath(path) && (activeTool === "compress" || activeTool === "mute")) {
        setActiveTool("trim");
      }

      const dur = await api.probeMediaDuration(path);
      setDurationSecs(dur);
      if (dur && dur > 0) {
        setTrimEnd(formatEditableTimecode(dur));
      }
    } catch (e) {
      setErrMsg(String(e));
    }
  }

  async function handlePickMedia() {
    const p = await api.pickMediaFile();
    if (p) {
      await loadSourcePath(p);
    }
  }

  function handleClearSource() {
    setSourceFile(null);
    setDurationSecs(null);
    setLatestResult(null);
    setErrMsg("");
    if (outputTarget.mode === "custom_file") {
      updateOutputTarget({
        mode: outputTarget.customDir ? "custom_dir" : "source_dir",
        customDir: outputTarget.customDir,
        customFilePath: "",
      });
    }
  }

  function handleSelectTool(tool: MediaToolId) {
    setActiveTool(tool);
    setErrMsg("");
    if (outputTarget.mode === "custom_file") {
      updateOutputTarget({
        mode: outputTarget.customDir ? "custom_dir" : "source_dir",
        customDir: outputTarget.customDir,
        customFilePath: "",
      });
    }
  }

  const outputDialogMeta = useMemo(() => {
    const stem = sourceFile ? getFileStem(sourceFile.path) : "ket_qua";
    const srcExt = sourceFile ? getFileExtension(sourceFile.path) || "mp4" : "mp4";
    switch (activeTool) {
      case "compress":
        return {
          defaultFileName: `${stem}_compressed_${compPreset}.mp4`,
          filterName: "Video MP4",
          extensions: ["mp4"],
        };
      case "mp3":
        return {
          defaultFileName: `${stem}_${mp3Preset}.mp3`,
          filterName: "Audio MP3",
          extensions: ["mp3"],
        };
      case "trim":
        return {
          defaultFileName: `${stem}_trim.${srcExt}`,
          filterName: "Media",
          extensions: [srcExt, "mp4", "mp3"],
        };
      case "mute":
        return {
          defaultFileName: `${stem}_muted.${srcExt}`,
          filterName: "Video",
          extensions: [srcExt, "mp4"],
        };
    }
  }, [activeTool, compPreset, mp3Preset, sourceFile]);

  function capturePlayerTime(target: "start" | "end") {
    const current = playerRef.current?.currentTime;
    if (current == null || !Number.isFinite(current)) return;
    const formatted = formatEditableTimecode(current);
    if (target === "start") {
      setTrimStart(formatted);
    } else {
      setTrimEnd(formatted);
    }
  }

  async function handleRunTool() {
    if (!sourceFile) return;
    setErrMsg("");
    setLatestResult(null);

    const overrides = resolveOutputOverrides(outputTarget, sourceFile.path);
    const id = `media_studio_${activeTool}_${Date.now()}`;
    const toolInfo = TOOL_TABS.find((t) => t.id === activeTool);
    const toolLabel = toolInfo?.label ?? activeTool;

    let startSecs = 0;
    let endSecs: number | null = null;
    if (activeTool === "trim") {
      const parsedStart = parseTimecodeToSeconds(trimStart || "0");
      if (parsedStart === null) {
        setErrMsg("Mốc bắt đầu không hợp lệ. Ví dụ hợp lệ: 00:15 hoặc 15.");
        return;
      }
      startSecs = parsedStart;
      if (trimEnd.trim()) {
        const parsedEnd = parseTimecodeToSeconds(trimEnd);
        if (parsedEnd === null || parsedEnd <= startSecs) {
          setErrMsg("Mốc kết thúc phải lớn hơn mốc bắt đầu (ví dụ: 01:20).");
          return;
        }
        endSecs = parsedEnd;
      }
    }

    setTaskId(id);
    setStage(`Đang chuẩn bị: ${toolLabel}...`);
    setPercent(0);

    const unlisten = await api.listenProgress(id, (p) => {
      setStage(p.stage);
      setPercent(p.percent);
    });

    try {
      let out: MediaOutput;
      if (activeTool === "compress") {
        out = await api.compressVideo({
          taskId: id,
          videoPath: sourceFile.path,
          preset: compPreset,
          ...overrides,
        });
      } else if (activeTool === "mp3") {
        out = await api.extractMp3({
          taskId: id,
          videoPath: sourceFile.path,
          preset: mp3Preset,
          ...overrides,
        });
      } else if (activeTool === "trim") {
        out = await api.trimMedia({
          taskId: id,
          inputPath: sourceFile.path,
          startSecs,
          endSecs,
          fastCopy: trimFastCopy,
          ...overrides,
        });
      } else {
        out = await api.muteVideo({
          taskId: id,
          videoPath: sourceFile.path,
          ...overrides,
        });
      }

      setLatestResult({ toolLabel, output: out });
      setSessionHistory((prev) => [
        { id, toolLabel, output: out },
        ...prev.slice(0, 7),
      ]);

      // After one-off Save As, keep its folder remembered without overwriting the same file name next time
      if (outputTarget.mode === "custom_file") {
        updateOutputTarget({
          mode: outputTarget.customDir ? "custom_dir" : "source_dir",
          customDir: outputTarget.customDir,
          customFilePath: "",
        });
      }
    } catch (e) {
      setErrMsg(String(e));
    } finally {
      unlisten();
      setTaskId(null);
    }
  }

  const videoToolBlockedOnAudio =
    isSourceAudio && (activeTool === "compress" || activeTool === "mute");

  return (
    <div className="space-y-4">
      {!ffmpegAvailable && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠️ Chưa phát hiện <code>ffmpeg</code> trên hệ thống. Hãy vào tab{" "}
          <strong>Cài đặt &amp; Prompt</strong> để kiểm tra hoặc trỏ đường dẫn tới binary{" "}
          <code>ffmpeg</code>.
        </div>
      )}

      <div className="grid items-start gap-4 md:grid-cols-12">
        {/* Left column: Drag & drop source, preview & destination */}
        <div className="space-y-3 md:sticky md:top-4 md:col-span-5 xl:col-span-4">
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">
                1. File nguồn (Kéo thả hoặc chọn)
              </h2>
              {durationSecs != null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                  <Clock className="h-3 w-3" />
                  {formatDuration(durationSecs)}
                </span>
              )}
            </div>

            <MediaDropZone
              file={sourceFile}
              durationSecs={durationSecs}
              disabled={taskId !== null}
              onPickFile={() => void handlePickMedia()}
              onDropFile={(path) => void loadSourcePath(path)}
              onClear={handleClearSource}
              onInvalidDrop={(msg) => setErrMsg(msg)}
            />

            {sourceFile && (
              <LocalMediaPlayer
                ref={playerRef}
                path={sourceFile.path}
                kind={isSourceAudio ? "audio" : "video"}
                className={
                  isSourceAudio
                    ? "w-full"
                    : "aspect-video max-h-[240px] w-full rounded-lg bg-black object-contain"
                }
              />
            )}
          </div>

          <OutputLocationPicker
            defaultExportDir={defaultExportDir}
            sourceFilePath={sourceFile?.path}
            defaultFileName={outputDialogMeta.defaultFileName}
            fileFilterName={outputDialogMeta.filterName}
            fileExtensions={outputDialogMeta.extensions}
            value={outputTarget}
            onChange={updateOutputTarget}
            disabled={taskId !== null}
          />
        </div>

        {/* Right column: Interactive Tool Workspace + Results */}
        <div className="space-y-3 md:col-span-7 xl:col-span-8">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  2. Chọn thao tác xử lý Media
                </h2>
                <p className="text-xs text-slate-500">
                  Khu vực xử lý nhanh video &amp; âm thanh ngoại tuyến bằng FFmpeg.
                </p>
              </div>
            </div>

            {/* Tool selector grid */}
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {TOOL_TABS.map((t) => {
                const Icon = t.icon;
                const active = activeTool === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={taskId !== null}
                    onClick={() => handleSelectTool(t.id)}
                    className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition disabled:opacity-60 ${
                      active
                        ? "border-indigo-400 bg-indigo-50/70"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <div
                      className={`rounded-lg p-1.5 ${
                        active
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900">
                        {t.label}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {t.shortDesc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Active Tool Config Panel */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              {activeTool === "compress" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Cấu hình nén video MP4 (H.264 + AAC)
                    </label>
                    <SelectField
                      value={compPreset}
                      onChange={setCompPreset}
                      options={videoPresets.map((p) => ({
                        value: p.key,
                        label: p.label,
                      }))}
                      size="md"
                      className="mt-1 w-full"
                      ariaLabel="Preset nén video"
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    Giảm mạnh dung lượng để gửi Gemini nhanh hơn hoặc chia sẻ dễ dàng mà vẫn giữ rõ lời nói.
                  </p>
                </div>
              )}

              {activeTool === "mp3" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Chất lượng âm thanh MP3
                    </label>
                    <SelectField
                      value={mp3Preset}
                      onChange={setMp3Preset}
                      options={mp3Presets.map((p) => ({
                        value: p.key,
                        label: p.label,
                      }))}
                      size="md"
                      className="mt-1 w-full"
                      ariaLabel="Chất lượng xuất âm thanh MP3"
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    Mức <strong>Nhỏ gọn</strong> &amp; <strong>Cân bằng</strong> dùng mono để tối ưu cho giọng nói và giảm một nửa dung lượng file.
                  </p>
                </div>
              )}

              {activeTool === "trim" && (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs font-semibold text-slate-700">
                          Mốc bắt đầu (mm:ss hoặc giây)
                        </label>
                        {sourceFile && (
                          <button
                            type="button"
                            onClick={() => capturePlayerTime("start")}
                            className="text-[11px] font-semibold text-indigo-600 hover:underline"
                          >
                            Lấy từ player
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={trimStart}
                        onChange={(e) => setTrimStart(e.target.value)}
                        placeholder="VD: 00:10"
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs font-semibold text-slate-700">
                          Mốc kết thúc (để trống = đến hết)
                        </label>
                        {sourceFile && (
                          <button
                            type="button"
                            onClick={() => capturePlayerTime("end")}
                            className="text-[11px] font-semibold text-indigo-600 hover:underline"
                          >
                            Lấy từ player
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={trimEnd}
                        onChange={(e) => setTrimEnd(e.target.value)}
                        placeholder={
                          durationSecs ? formatEditableTimecode(durationSecs) : "VD: 01:30"
                        }
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
                      />
                    </div>
                  </div>

                  <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={trimFastCopy}
                      onChange={(e) => setTrimFastCopy(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    <span>
                      Cắt siêu nhanh giữ nguyên luồng gốc (<code>-c copy</code>). Bỏ chọn nếu muốn cắt chính xác từng khung hình.
                    </span>
                  </label>
                </div>
              )}

              {activeTool === "mute" && (
                <p className="text-xs text-slate-600">
                  Loại bỏ toàn bộ track âm thanh khỏi video và giữ nguyên luồng hình ảnh gốc (<code>-c:v copy -an</code>) nên xử lý gần như tức thì.
                </p>
              )}

              {videoToolBlockedOnAudio && (
                <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  File nguồn đang là file âm thanh. Thao tác này chỉ áp dụng cho video — hãy chuyển sang <strong>Tách âm thanh</strong> hoặc <strong>Cắt đoạn</strong>.
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void handleRunTool()}
                  disabled={
                    !sourceFile ||
                    taskId !== null ||
                    !ffmpegAvailable ||
                    videoToolBlockedOnAudio
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {taskId ? "Đang xử lý..." : "Bắt đầu xử lý"}
                </button>
              </div>
            </div>
          </div>

          {taskId && (
            <ProgressPanel
              stage={stage}
              percent={percent}
              onCancel={() => api.cancelTask(taskId)}
            />
          )}

          {errMsg && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              ⚠️ {errMsg}
            </div>
          )}

          {latestResult && (
            <MediaResultCard
              output={latestResult.output}
              actionLabel={latestResult.toolLabel}
            />
          )}

          {sessionHistory.length > 1 && (
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">
                Các file đã xuất trong phiên ({sessionHistory.length})
              </h3>
              <div className="mt-2 space-y-1.5">
                {sessionHistory.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-slate-800">
                        {item.output.file_name}
                      </span>{" "}
                      <span className="text-slate-500">
                        · {item.toolLabel} · {item.output.size_mb.toFixed(2)} MB
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => api.openLocalFile(item.output.output_path)}
                        className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Mở
                      </button>
                      <button
                        type="button"
                        onClick={() => api.revealInFolder(item.output.output_path)}
                        className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <FolderOpen className="h-3 w-3" />
                        Thư mục
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
