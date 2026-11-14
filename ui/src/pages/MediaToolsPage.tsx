import { useMemo, useRef, useState } from "react";
import {
  Check,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Minimize2,
  Music,
  Play,
  Scissors,
  Search,
  Sparkles,
  Users,
  VolumeX,
} from "lucide-react";
import { LocalMediaPlayer } from "../components/LocalMediaPlayer";
import { MediaDropZone } from "../components/MediaDropZone";
import { MediaResultCard } from "../components/MediaResultCard";
import { OutputLocationPicker } from "../components/OutputLocationPicker";
import {
  loadSavedOutputTarget,
  resolveOutputOverrides,
  saveOutputTarget,
  type OutputTargetState,
} from "../lib/outputTarget";
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
import type {
  FileInfo,
  GenerateScriptResponse,
  MediaOutput,
  Mp3Preset,
  TranscriptResult,
  VideoPreset,
} from "../lib/types";

type MediaToolId = "compress" | "mp3" | "trim" | "mute" | "script";

interface MediaToolsPageProps {
  apiKeyInput: string;
  model: string;
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

const INTERACTION_MODE_OPTIONS = [
  { value: "auto", label: "Tự nhận diện từ âm thanh" },
  { value: "interview", label: "Hỏi – Đáp (Giáo viên & Học sinh)" },
  { value: "monologue", label: "Thuyết trình / Độc thoại (1 Học sinh)" },
  { value: "pair", label: "Hội thoại theo cặp (2 Học sinh)" },
  { value: "group", label: "Thảo luận nhóm (3+ người)" },
];

const VERBATIM_MODE_OPTIONS = [
  {
    value: "verbatim",
    label: "Nguyên trạng — Giữ cả lỗi ngữ pháp/ngập ngừng của HS",
  },
  {
    value: "clean",
    label: "Làm sạch — Lược bỏ từ đệm (um, uh) cho dễ đọc",
  },
];

function roleBadgeStyle(role: string): { label: string; badgeClass: string } {
  switch (role) {
    case "teacher":
      return {
        label: "Giáo viên",
        badgeClass: "bg-indigo-100 text-indigo-800 border-indigo-200",
      };
    case "student":
      return {
        label: "Học sinh",
        badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200",
      };
    default:
      return {
        label: "Khác",
        badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
      };
  }
}

function buildMarkdownScript(result: TranscriptResult, sourceName: string): string {
  const lines: string[] = [
    `# Script bài nói: ${sourceName}`,
    "",
    `- **Ngôn ngữ chính:** ${result.detected_language}`,
  ];
  if (result.summary.trim()) {
    lines.push(`- **Tóm tắt bối cảnh:** ${result.summary.trim()}`);
  }
  if (result.speakers.length > 0) {
    const spList = result.speakers
      .map((s) => `${s.label} (${roleBadgeStyle(s.role).label})`)
      .join(", ");
    lines.push(`- **Người tham gia:** ${spList}`);
  }
  lines.push("", "## Nội dung chi tiết", "");
  for (const seg of result.segments) {
    const range = seg.end_time.trim()
      ? `${seg.start_time.trim()} - ${seg.end_time.trim()}`
      : seg.start_time.trim();
    const roleLabel = roleBadgeStyle(seg.role).label;
    lines.push(
      `- **[${range}] [${roleLabel}] ${seg.speaker_label}:** ${seg.text.trim()}`
    );
    if (seg.translation.trim()) {
      lines.push(`  - *Dịch:* ${seg.translation.trim()}`);
    }
    if (seg.grammar_note.trim()) {
      lines.push(`  - *Gợi ý sửa:* ${seg.grammar_note.trim()}`);
    }
  }
  return `${lines.join("\n")}\n`;
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
  {
    id: "script",
    label: "Tạo Script (AI)",
    shortDesc: "Video → MP3 → Kịch bản",
    icon: FileText,
  },
];

export function MediaToolsPage({
  apiKeyInput,
  model,
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

  // AI Script generation options
  const [interactionMode, setInteractionMode] = useState("auto");
  const [verbatimMode, setVerbatimMode] = useState("verbatim");
  const [speakerHints, setSpeakerHints] = useState("");
  const [enhanceSpeech, setEnhanceSpeech] = useState(true);
  const [keepMp3, setKeepMp3] = useState(true);
  const [includeGrammarNotes, setIncludeGrammarNotes] = useState(true);
  const [includeTranslation, setIncludeTranslation] = useState(false);
  const [scriptExtraInstructions, setScriptExtraInstructions] = useState("");

  // Task execution state
  const [taskId, setTaskId] = useState<string | null>(null);
  const [stage, setStage] = useState("");
  const [percent, setPercent] = useState<number | null>(null);
  const [errMsg, setErrMsg] = useState("");
  const [latestResult, setLatestResult] = useState<{
    toolLabel: string;
    output: MediaOutput;
  } | null>(null);
  const [scriptResult, setScriptResult] = useState<GenerateScriptResponse | null>(
    null
  );
  const [scriptSearch, setScriptSearch] = useState("");
  const [copiedMd, setCopiedMd] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportNotice, setExportNotice] = useState("");
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryItem[]>([]);

  const isSourceAudio = sourceFile ? isAudioFilePath(sourceFile.path) : false;
  const isSourceMp3 = sourceFile
    ? getFileExtension(sourceFile.path) === "mp3"
    : false;
  const toolNeedsFfmpeg =
    activeTool !== "script" || !isSourceMp3 || enhanceSpeech || keepMp3;

  async function loadSourcePath(path: string) {
    setErrMsg("");
    setLatestResult(null);
    setScriptResult(null);
    setScriptSearch("");
    setExportNotice("");
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
    setScriptResult(null);
    setExportNotice("");
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
      case "script":
        return {
          defaultFileName: `${stem}_script.md`,
          filterName: "Script / Phụ đề",
          extensions: ["md", "txt", "srt"],
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

  function seekPlayerTo(rawTimestamp: string) {
    const cleaned = rawTimestamp.trim().replace(/^\[|\]$/g, "");
    const secs = parseTimecodeToSeconds(cleaned);
    if (secs === null || !playerRef.current) return;
    playerRef.current.currentTime = secs;
    void playerRef.current.play().catch(() => {
      // Ignore autoplay blocks if browser/webview restricts programmatic play
    });
  }

  function handleSpeakerChange(
    speakerId: string,
    nextLabel: string,
    nextRole: string
  ) {
    setExportNotice("");
    setScriptResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        transcript: {
          ...prev.transcript,
          speakers: prev.transcript.speakers.map((sp) =>
            sp.id === speakerId
              ? { ...sp, label: nextLabel, role: nextRole }
              : sp
          ),
          segments: prev.transcript.segments.map((seg) =>
            seg.speaker_id === speakerId
              ? { ...seg, speaker_label: nextLabel, role: nextRole }
              : seg
          ),
        },
      };
    });
  }

  async function handleCopyScriptMarkdown() {
    if (!scriptResult) return;
    const md = buildMarkdownScript(
      scriptResult.transcript,
      scriptResult.source_name
    );
    await navigator.clipboard.writeText(md);
    setCopiedMd(true);
    window.setTimeout(() => setCopiedMd(false), 2000);
  }

  async function handleSaveUpdatedMarkdown() {
    if (!scriptResult) return;
    setExportBusy(true);
    setErrMsg("");
    setExportNotice("");
    try {
      const existingPath = scriptResult.script_output.output_path;
      const ext = getFileExtension(existingPath);
      const format: "md" | "txt" | "srt" =
        ext === "srt" ? "srt" : ext === "txt" ? "txt" : "md";
      const out = await api.exportTranscriptFile({
        transcript: scriptResult.transcript,
        sourceName: scriptResult.source_name,
        format,
        outPath: existingPath,
      });
      setScriptResult((prev) => (prev ? { ...prev, script_output: out } : prev));
      setExportNotice(`Đã cập nhật file: ${out.file_name}`);
    } catch (e) {
      setErrMsg(String(e));
    } finally {
      setExportBusy(false);
    }
  }

  async function handleExportScriptAs(format: "md" | "txt" | "srt") {
    if (!scriptResult) return;
    const stem = getFileStem(scriptResult.source_name);
    const chosen = await api.saveScriptDialog(`${stem}_script.${format}`, format);
    if (!chosen) return;
    setExportBusy(true);
    setErrMsg("");
    setExportNotice("");
    try {
      const out = await api.exportTranscriptFile({
        transcript: scriptResult.transcript,
        sourceName: scriptResult.source_name,
        format,
        outPath: chosen,
      });
      setExportNotice(`Đã xuất: ${out.output_path}`);
      setSessionHistory((prev) => [
        {
          id: `script_export_${Date.now()}`,
          toolLabel: `Script (.${format})`,
          output: out,
        },
        ...prev.slice(0, 7),
      ]);
    } catch (e) {
      setErrMsg(String(e));
    } finally {
      setExportBusy(false);
    }
  }

  async function handleRunTool() {
    if (!sourceFile) return;
    setErrMsg("");
    setLatestResult(null);
    if (activeTool !== "script") {
      setScriptResult(null);
    }
    setExportNotice("");

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
      if (activeTool === "script") {
        const res = await api.generateScript({
          task_id: id,
          api_key: apiKeyInput.trim() || undefined,
          input_path: sourceFile.path,
          model,
          mp3_preset: mp3Preset,
          enhance_speech: enhanceSpeech,
          keep_mp3: keepMp3,
          interaction_mode: interactionMode,
          speaker_hints: speakerHints.trim(),
          verbatim_mode: verbatimMode,
          include_translation: includeTranslation,
          include_grammar_notes: includeGrammarNotes,
          extra_instructions: scriptExtraInstructions.trim(),
          out_dir_override: overrides.outDirOverride,
          out_path_override: overrides.outPathOverride,
        });
        setScriptResult(res);
        setSessionHistory((prev) => {
          const nextItems: SessionHistoryItem[] = [
            { id: `${id}_script`, toolLabel: "Tạo Script", output: res.script_output },
          ];
          if (res.mp3_output) {
            nextItems.push({
              id: `${id}_mp3`,
              toolLabel: "MP3 lọc thoại",
              output: res.mp3_output,
            });
          }
          return [...nextItems, ...prev].slice(0, 8);
        });
      } else {
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
      }

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

  const filteredSegments = useMemo(() => {
    if (!scriptResult) return [];
    const q = scriptSearch.trim().toLowerCase();
    if (!q) return scriptResult.transcript.segments;
    return scriptResult.transcript.segments.filter(
      (seg) =>
        seg.text.toLowerCase().includes(q) ||
        seg.speaker_label.toLowerCase().includes(q) ||
        seg.translation.toLowerCase().includes(q) ||
        seg.grammar_note.toLowerCase().includes(q)
    );
  }, [scriptResult, scriptSearch]);

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
                  Xử lý nhanh video &amp; âm thanh bằng FFmpeg hoặc tách MP3 tạo script AI có timestamp và phân vai.
                </p>
              </div>
            </div>

            {/* Tool selector grid */}
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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

              {activeTool === "script" && (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        Bối cảnh hội thoại
                      </label>
                      <SelectField
                        value={interactionMode}
                        onChange={setInteractionMode}
                        options={INTERACTION_MODE_OPTIONS}
                        size="sm"
                        className="mt-1 w-full"
                        ariaLabel="Bối cảnh hội thoại"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        Chất lượng MP3 gửi AI
                      </label>
                      <SelectField
                        value={mp3Preset}
                        onChange={setMp3Preset}
                        options={mp3Presets.map((p) => ({
                          value: p.key,
                          label: p.label,
                        }))}
                        size="sm"
                        className="mt-1 w-full"
                        ariaLabel="Chất lượng MP3 tách giọng nói"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        Chế độ chép lời
                      </label>
                      <SelectField
                        value={verbatimMode}
                        onChange={setVerbatimMode}
                        options={VERBATIM_MODE_OPTIONS}
                        size="sm"
                        className="mt-1 w-full"
                        ariaLabel="Chế độ chép lời"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        Gợi ý người nói (tùy chọn)
                      </label>
                      <input
                        type="text"
                        value={speakerHints}
                        onChange={(e) => setSpeakerHints(e.target.value)}
                        placeholder="VD: GV: Cô Lan; HS: Minh, An"
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={enhanceSpeech}
                        onChange={(e) => setEnhanceSpeech(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      <span>Lọc tạp âm &amp; cân bằng giọng nói (FFmpeg)</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={keepMp3}
                        onChange={(e) => setKeepMp3(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      <span>Lưu kèm file MP3 đã tách giọng nói</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={includeGrammarNotes}
                        onChange={(e) => setIncludeGrammarNotes(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      <span>Gợi ý sửa lỗi ngữ pháp/diễn đạt cho HS</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={includeTranslation}
                        onChange={(e) => setIncludeTranslation(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      <span>Kèm bản dịch tiếng Việt từng câu</span>
                    </label>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Yêu cầu bổ sung (tùy chọn)
                    </label>
                    <input
                      type="text"
                      value={scriptExtraInstructions}
                      onChange={(e) => setScriptExtraInstructions(e.target.value)}
                      placeholder="VD: Tách rõ phần Q&A cuối video; ghi chú các từ phát âm chưa rõ..."
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
                    />
                  </div>

                  <p className="text-[11px] text-slate-500">
                    Mẹo: Tự động tách MP3 mono trước khi gửi Gemini giúp giảm ~90% dung lượng upload và tiết kiệm quota token so với gửi video trực tiếp. Đang dùng model: <strong>{model}</strong>.
                  </p>
                </div>
              )}

              {videoToolBlockedOnAudio && (
                <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  File nguồn đang là file âm thanh. Thao tác này chỉ áp dụng cho video — hãy chuyển sang <strong>Tách âm thanh</strong>, <strong>Cắt đoạn</strong> hoặc <strong>Tạo Script (AI)</strong>.
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void handleRunTool()}
                  disabled={
                    !sourceFile ||
                    taskId !== null ||
                    (!ffmpegAvailable && toolNeedsFfmpeg) ||
                    videoToolBlockedOnAudio
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {activeTool === "script" && <Sparkles className="h-4 w-4" />}
                  {taskId
                    ? "Đang xử lý..."
                    : activeTool === "script"
                    ? "Tách MP3 & Tạo Script AI"
                    : "Bắt đầu xử lý"}
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

          {scriptResult && (
            <div className="space-y-3 rounded-xl border border-indigo-200 bg-white p-4 shadow-xs">
              {/* Saved files banner */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-emerald-800">
                      ✅ Đã tạo Script: {scriptResult.script_output.file_name}
                    </span>
                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                      {scriptResult.transcript.detected_language}
                    </span>
                    {scriptResult.reused_upload_cache && (
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                        Dùng lại audio đã upload
                      </span>
                    )}
                  </div>
                  {scriptResult.transcript.summary && (
                    <p className="text-xs text-slate-600">
                      {scriptResult.transcript.summary}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                    <span>
                      Script:{" "}
                      <strong className="text-slate-700">
                        {scriptResult.script_output.output_path}
                      </strong>
                    </span>
                    {scriptResult.mp3_output && (
                      <span>
                        MP3:{" "}
                        <strong className="text-slate-700">
                          {scriptResult.mp3_output.file_name}
                        </strong>{" "}
                        ({scriptResult.mp3_output.size_mb.toFixed(2)} MB)
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      api.openLocalFile(scriptResult.script_output.output_path)
                    }
                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Mở Script
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      api.revealInFolder(scriptResult.script_output.output_path)
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    Thư mục
                  </button>
                  {scriptResult.mp3_output && (
                    <button
                      type="button"
                      onClick={() =>
                        api.openLocalFile(scriptResult.mp3_output!.output_path)
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                    >
                      <Music className="h-3.5 w-3.5" />
                      Mở MP3
                    </button>
                  )}
                </div>
              </div>

              {/* Action toolbar & search */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleCopyScriptMarkdown()}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {copiedMd ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        Đã chép Markdown
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Sao chép Markdown
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={exportBusy}
                    onClick={() => void handleSaveUpdatedMarkdown()}
                    className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                    title="Ghi đè lại file đã lưu sau khi đổi tên/vai trò người nói"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Lưu cập nhật file
                  </button>
                  <button
                    type="button"
                    disabled={exportBusy}
                    onClick={() => void handleExportScriptAs("srt")}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Xuất phụ đề .srt
                  </button>
                  <button
                    type="button"
                    disabled={exportBusy}
                    onClick={() => void handleExportScriptAs("txt")}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Xuất .txt
                  </button>
                </div>

                <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={scriptSearch}
                    onChange={(e) => setScriptSearch(e.target.value)}
                    placeholder="Tìm trong lời thoại..."
                    className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-2.5 text-xs focus:border-indigo-400 focus:outline-none"
                  />
                </div>
              </div>

              {exportNotice && (
                <div className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
                  ✅ {exportNotice}
                </div>
              )}

              {/* Quick Speaker Rename & Role Editor */}
              {scriptResult.transcript.speakers.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                    <Users className="h-3.5 w-3.5 text-indigo-600" />
                    Người nói được nhận diện (sửa tên/vai trò để cập nhật cả script):
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {scriptResult.transcript.speakers.map((sp) => (
                      <div
                        key={sp.id}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-1.5"
                      >
                        <select
                          value={sp.role}
                          onChange={(e) =>
                            handleSpeakerChange(sp.id, sp.label, e.target.value)
                          }
                          aria-label={`Vai trò của ${sp.label}`}
                          className="rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-[11px] font-semibold text-slate-700 focus:border-indigo-400 focus:outline-none"
                        >
                          <option value="teacher">Giáo viên</option>
                          <option value="student">Học sinh</option>
                          <option value="other">Khác</option>
                        </select>
                        <input
                          type="text"
                          value={sp.label}
                          onChange={(e) =>
                            handleSpeakerChange(sp.id, e.target.value, sp.role)
                          }
                          aria-label={`Tên hiển thị của ${sp.id}`}
                          className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-800 focus:border-indigo-400 focus:outline-none"
                        />
                        {!sp.name_confident && (
                          <span
                            className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
                            title="AI đặt nhãn tạm vì chưa nghe rõ tên thật"
                          >
                            Tạm
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Segments Timeline List */}
              <div className="space-y-2">
                {filteredSegments.length === 0 ? (
                  <p className="rounded-lg bg-slate-50 py-6 text-center text-xs text-slate-500">
                    Không có đoạn hội thoại nào khớp với bộ lọc hiện tại.
                  </p>
                ) : (
                  filteredSegments.map((seg, idx) => {
                    const roleInfo = roleBadgeStyle(seg.role);
                    const timeLabel = seg.end_time.trim()
                      ? `${seg.start_time.trim()} – ${seg.end_time.trim()}`
                      : seg.start_time.trim();
                    return (
                      <div
                        key={`${seg.speaker_id}-${seg.start_time}-${idx}`}
                        className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 transition hover:border-indigo-200 hover:bg-white"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => seekPlayerTo(seg.start_time)}
                            title={`Tua player cột trái tới ${seg.start_time} và phát`}
                            className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                          >
                            <Play className="h-2.5 w-2.5 fill-current" />
                            {timeLabel}
                          </button>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${roleInfo.badgeClass}`}
                          >
                            {roleInfo.label}
                          </span>
                          <span className="text-xs font-bold text-slate-900">
                            {seg.speaker_label}
                          </span>
                        </div>

                        <p className="mt-1.5 text-sm leading-relaxed text-slate-800">
                          {seg.text}
                        </p>

                        {seg.translation.trim() && (
                          <p className="mt-1 text-xs italic text-slate-600">
                            Dịch: {seg.translation}
                          </p>
                        )}

                        {seg.grammar_note.trim() && (
                          <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-1.5 text-xs text-amber-900">
                            💡 <strong>Gợi ý sửa:</strong> {seg.grammar_note}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
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
