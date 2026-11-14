import { useMemo, useRef, useState } from "react";
import {
  Check,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Film,
  FolderOpen,
  Minimize2,
  Music,
  Pencil,
  Play,
  Plus,
  Scissors,
  Search,
  Sparkles,
  Trash2,
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
  TranscriptSegment,
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

function formatPreviewSpeakerPrefix(
  seg: TranscriptSegment,
  showSpeaker: boolean,
  showRole: boolean
): string | null {
  if (!showSpeaker && !showRole) return null;
  const roleKey = seg.role.trim().toLowerCase();
  const roleVi = roleBadgeStyle(roleKey).label;
  const label = seg.speaker_label.trim() || roleVi;
  if (showSpeaker && showRole) {
    if (roleKey === "teacher") {
      const labelLower = label.toLowerCase();
      const roleLower = roleVi.toLowerCase();
      return labelLower === roleLower || labelLower.startsWith(roleLower)
        ? label
        : `${roleVi} - ${label}`;
    }
    return label;
  }
  return showSpeaker ? label : roleVi;
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
  const [playerCurrentTime, setPlayerCurrentTime] = useState(0);
  const [editingSegIdx, setEditingSegIdx] = useState<number | null>(null);
  const [burnMode, setBurnMode] = useState<"hardsub" | "softsub">("hardsub");
  const [showSubRole, setShowSubRole] = useState(true);
  const [showSubSpeaker, setShowSubSpeaker] = useState(true);
  const [showSubText, setShowSubText] = useState(true);
  const [showSubTranslation, setShowSubTranslation] = useState(true);
  const [showSubGrammar, setShowSubGrammar] = useState(true);
  const [subtitleFont, setSubtitleFont] = useState<
    "Be Vietnam Pro" | "Noto Sans" | "Lexend"
  >("Be Vietnam Pro");
  const [subtitledVideoOutput, setSubtitledVideoOutput] =
    useState<MediaOutput | null>(null);
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
    setSubtitledVideoOutput(null);
    setEditingSegIdx(null);
    setPlayerCurrentTime(0);
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
    setSubtitledVideoOutput(null);
    setEditingSegIdx(null);
    setPlayerCurrentTime(0);
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

  function updateSegmentAt(
    idx: number,
    patch: Partial<TranscriptSegment>
  ) {
    setExportNotice("");
    setScriptResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        transcript: {
          ...prev.transcript,
          segments: prev.transcript.segments.map((seg, i) =>
            i === idx ? { ...seg, ...patch } : seg
          ),
        },
      };
    });
  }

  function assignSegmentSpeaker(idx: number, speakerId: string) {
    if (!scriptResult) return;
    const sp = scriptResult.transcript.speakers.find((s) => s.id === speakerId);
    if (!sp) return;
    updateSegmentAt(idx, {
      speaker_id: sp.id,
      speaker_label: sp.label,
      role: sp.role,
    });
  }

  function captureSegmentTime(idx: number, field: "start_time" | "end_time") {
    const current = playerRef.current?.currentTime ?? playerCurrentTime;
    if (!Number.isFinite(current)) return;
    updateSegmentAt(idx, { [field]: formatEditableTimecode(current) });
  }

  function insertSegmentAfter(idx: number | null) {
    if (!scriptResult) return;
    const defaultSpeaker = scriptResult.transcript.speakers[0] ?? {
      id: "S1",
      label: "Học sinh 1",
      role: "student",
      name_confident: false,
    };
    const prevSeg =
      idx !== null ? scriptResult.transcript.segments[idx] : undefined;
    const baseStartSecs = prevSeg
      ? parseTimecodeToSeconds(prevSeg.end_time || prevSeg.start_time) ?? 0
      : playerCurrentTime;
    const newSeg: TranscriptSegment = {
      start_time: formatEditableTimecode(baseStartSecs),
      end_time: formatEditableTimecode(baseStartSecs + 3),
      speaker_id: defaultSpeaker.id,
      speaker_label: defaultSpeaker.label,
      role: defaultSpeaker.role,
      text: "",
      translation: "",
      grammar_note: "",
    };

    const insertPos =
      idx === null ? scriptResult.transcript.segments.length : idx + 1;
    setScriptResult((prev) => {
      if (!prev) return prev;
      const nextSegments = [...prev.transcript.segments];
      nextSegments.splice(insertPos, 0, newSeg);
      return {
        ...prev,
        transcript: {
          ...prev.transcript,
          segments: nextSegments,
        },
      };
    });
    setEditingSegIdx(insertPos);
    setExportNotice("");
  }

  function deleteSegmentAt(idx: number) {
    setExportNotice("");
    setEditingSegIdx((cur) => {
      if (cur === null) return null;
      if (cur === idx) return null;
      return cur > idx ? cur - 1 : cur;
    });
    setScriptResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        transcript: {
          ...prev.transcript,
          segments: prev.transcript.segments.filter((_, i) => i !== idx),
        },
      };
    });
  }

  async function handleEmbedSubtitlesVideo() {
    if (!sourceFile || !scriptResult || isSourceAudio) return;
    if (scriptResult.transcript.segments.length === 0) {
      setErrMsg("Script chưa có dòng thoại nào để ghép vào video.");
      return;
    }

    setErrMsg("");
    setSubtitledVideoOutput(null);
    const overrides = resolveOutputOverrides(outputTarget, sourceFile.path);
    const mp4PathOverride =
      overrides.outPathOverride &&
      /\.(mp4|mov|m4v)$/i.test(overrides.outPathOverride)
        ? overrides.outPathOverride
        : undefined;

    const id = `media_studio_subvideo_${Date.now()}`;
    setTaskId(id);
    setStage(
      burnMode === "hardsub"
        ? "Đang chuẩn bị ghép Script cứng lên video..."
        : "Đang chuẩn bị nhúng phụ đề mềm vào video..."
    );
    setPercent(0);

    const unlisten = await api.listenProgress(id, (p) => {
      setStage(p.stage);
      setPercent(p.percent);
    });

    try {
      const out = await api.embedSubtitlesVideo({
        task_id: id,
        video_path: sourceFile.path,
        transcript: scriptResult.transcript,
        burn_mode: burnMode,
        content_mode: "all",
        font_name: subtitleFont,
        show_role: showSubRole,
        show_speaker: showSubSpeaker,
        show_text: showSubText,
        show_translation: showSubTranslation,
        show_grammar: showSubGrammar,
        out_dir_override: overrides.outDirOverride,
        out_path_override: mp4PathOverride,
      });
      setSubtitledVideoOutput(out);
      setSessionHistory((prev) => [
        {
          id,
          toolLabel:
            burnMode === "hardsub"
              ? "Video + Script (In cứng)"
              : "Video + Script (Phụ đề mềm)",
          output: out,
        },
        ...prev.slice(0, 7),
      ]);
    } catch (e) {
      setErrMsg(String(e));
    } finally {
      unlisten();
      setTaskId(null);
    }
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
    const indexed = scriptResult.transcript.segments.map((seg, originalIdx) => ({
      seg,
      originalIdx,
    }));
    const q = scriptSearch.trim().toLowerCase();
    if (!q) return indexed;
    return indexed.filter(
      ({ seg }) =>
        seg.text.toLowerCase().includes(q) ||
        seg.speaker_label.toLowerCase().includes(q) ||
        seg.translation.toLowerCase().includes(q) ||
        seg.grammar_note.toLowerCase().includes(q)
    );
  }, [scriptResult, scriptSearch]);

  const activeSegmentIdx = useMemo(() => {
    if (!scriptResult) return -1;
    const segs = scriptResult.transcript.segments;
    for (let i = 0; i < segs.length; i++) {
      const s = parseTimecodeToSeconds(
        segs[i].start_time.trim().replace(/^\[|\]$/g, "")
      );
      if (s === null) continue;
      const parsedEnd = parseTimecodeToSeconds(
        segs[i].end_time.trim().replace(/^\[|\]$/g, "")
      );
      const e = parsedEnd !== null && parsedEnd > s ? parsedEnd : s + 3;
      if (playerCurrentTime >= s && playerCurrentTime <= e) {
        return i;
      }
    }
    return -1;
  }, [scriptResult, playerCurrentTime]);

  const activePreviewSegment =
    scriptResult && activeSegmentIdx >= 0
      ? scriptResult.transcript.segments[activeSegmentIdx]
      : null;

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
                onTimeUpdate={(secs) => setPlayerCurrentTime(secs)}
                className={
                  isSourceAudio
                    ? "w-full"
                    : "aspect-video max-h-[240px] w-full rounded-lg bg-black object-contain"
                }
              />
            )}

            {scriptResult && (
              <div
                className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5 text-white shadow-inner"
                style={{
                  fontFamily: `"${subtitleFont}", "Noto Emoji", sans-serif`,
                }}
              >
                <div className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  <span>Xem trước phụ đề · {subtitleFont}</span>
                  <span className="font-mono text-indigo-300">
                    {formatDuration(playerCurrentTime)}
                  </span>
                </div>
                {activePreviewSegment ? (
                  (() => {
                    const prefix = formatPreviewSpeakerPrefix(
                      activePreviewSegment,
                      showSubSpeaker,
                      showSubRole
                    );
                    const hasText =
                      showSubText &&
                      activePreviewSegment.text.trim().length > 0;
                    const hasTrans =
                      showSubTranslation &&
                      activePreviewSegment.translation.trim().length > 0;
                    const hasGram =
                      showSubGrammar &&
                      activePreviewSegment.grammar_note.trim().length > 0;
                    if (!hasText && !hasTrans && !hasGram) {
                      return (
                        <p className="mt-1.5 text-center text-[11px] italic text-slate-400">
                          Các thành phần phụ đề của đoạn này đang được tắt hiển thị.
                        </p>
                      );
                    }
                    const prefixSpan = prefix ? (
                      <>
                        <span
                          className={`font-bold ${
                            activePreviewSegment.role === "teacher"
                              ? "text-amber-300"
                              : "text-emerald-300"
                          }`}
                        >
                          [{prefix}]:
                        </span>{" "}
                      </>
                    ) : null;
                    return (
                      <div className="mt-1.5 space-y-0.5 text-center">
                        {hasText && (
                          <p className="text-xs leading-snug">
                            {prefixSpan}
                            {activePreviewSegment.text}
                          </p>
                        )}
                        {hasTrans && (
                          <p className="text-[11px] italic text-slate-300">
                            {!hasText && prefixSpan}
                            {activePreviewSegment.translation}
                          </p>
                        )}
                        {hasGram && (
                          <p className="text-[11px] text-sky-300">
                            {!hasText && !hasTrans && prefixSpan}
                            💡 Sửa: {activePreviewSegment.grammar_note}
                          </p>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <p className="mt-1.5 text-center text-[11px] italic text-slate-400">
                    Bấm phát hoặc chọn mốc thời gian để xem trước phụ đề chạy theo video...
                  </p>
                )}
              </div>
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

              {/* Embed Script into Video Panel */}
              {!isSourceAudio && sourceFile && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950">
                      <Film className="h-4 w-4 text-indigo-600" />
                      Ghép Script hiện tại vào Video (Xuất MP4 có phụ đề)
                    </div>
                    <span className="text-[11px] text-indigo-700">
                      Dùng trực tiếp nội dung bạn vừa chỉnh sửa bên dưới
                    </span>
                  </div>
                  <div className="mt-2.5 space-y-2.5">
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700">
                          Kiểu ghép phụ đề
                        </label>
                        <select
                          value={burnMode}
                          onChange={(e) =>
                            setBurnMode(
                              e.target.value === "softsub" ? "softsub" : "hardsub"
                            )
                          }
                          aria-label="Kiểu ghép phụ đề vào video"
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-indigo-400 focus:outline-none"
                        >
                          <option value="hardsub">
                            In cứng (Hardsub — Mọi thiết bị/Zalo &amp; có màu vai trò)
                          </option>
                          <option value="softsub">
                            Phụ đề mềm (Softsub mov_text — Xuất cực nhanh)
                          </option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700">
                          Font chữ Google (Tiếng Việt &amp; Icon)
                        </label>
                        <select
                          value={subtitleFont}
                          onChange={(e) =>
                            setSubtitleFont(
                              e.target.value as
                                | "Be Vietnam Pro"
                                | "Noto Sans"
                                | "Lexend"
                            )
                          }
                          disabled={burnMode === "softsub"}
                          aria-label="Chọn font chữ Google cho phụ đề"
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-indigo-400 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          <option value="Be Vietnam Pro">
                            Be Vietnam Pro (Khuyên dùng — Dấu Việt cực nét)
                          </option>
                          <option value="Noto Sans">
                            Noto Sans (Chuẩn IPA &amp; Đa ngôn ngữ)
                          </option>
                          <option value="Lexend">
                            Lexend (Khoáng đạt, dễ đọc luyện nghe)
                          </option>
                        </select>
                      </div>
                    </div>

                    <div className="rounded-lg border border-indigo-200/80 bg-white/80 p-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-slate-700">
                          Thành phần hiển thị trên phụ đề (đồng bộ Xem trước &amp; Video):
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setShowSubRole(true);
                              setShowSubSpeaker(true);
                              setShowSubText(true);
                              setShowSubTranslation(true);
                              setShowSubGrammar(true);
                            }}
                            className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
                          >
                            Hiện đầy đủ
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowSubRole(false);
                              setShowSubSpeaker(false);
                              setShowSubText(true);
                              setShowSubTranslation(false);
                              setShowSubGrammar(false);
                            }}
                            className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50"
                          >
                            Chỉ lời thoại sạch
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {[
                          {
                            id: "role",
                            label: "Vai trò (GV/HS)",
                            checked: showSubRole,
                            onChange: setShowSubRole,
                          },
                          {
                            id: "speaker",
                            label: "Tên người nói",
                            checked: showSubSpeaker,
                            onChange: setShowSubSpeaker,
                          },
                          {
                            id: "text",
                            label: "Lời thoại gốc",
                            checked: showSubText,
                            onChange: setShowSubText,
                          },
                          {
                            id: "translation",
                            label: "Bản dịch tiếng Việt",
                            checked: showSubTranslation,
                            onChange: setShowSubTranslation,
                          },
                          {
                            id: "grammar",
                            label: "Gợi ý sửa lỗi",
                            checked: showSubGrammar,
                            onChange: setShowSubGrammar,
                          },
                        ].map((item) => (
                          <label
                            key={item.id}
                            className={`inline-flex cursor-pointer select-none items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition ${
                              item.checked
                                ? "border-indigo-300 bg-indigo-50 text-indigo-900"
                                : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={item.checked}
                              onChange={(e) => item.onChange(e.target.checked)}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            {item.label}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={`text-[11px] ${
                          !showSubText && !showSubTranslation && !showSubGrammar
                            ? "font-medium text-rose-600"
                            : "text-slate-500"
                        }`}
                      >
                        {!showSubText && !showSubTranslation && !showSubGrammar
                          ? "Hãy bật ít nhất 1 nội dung (Lời thoại, Dịch hoặc Gợi ý sửa)."
                          : burnMode === "hardsub"
                          ? "Tự đóng gói Noto Emoji vector & tự chỉnh cỡ chữ theo video ngang/dọc."
                          : "Softsub dùng font mặc định của trình phát video."}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleEmbedSubtitlesVideo()}
                        disabled={
                          taskId !== null ||
                          !ffmpegAvailable ||
                          scriptResult.transcript.segments.length === 0 ||
                          (!showSubText &&
                            !showSubTranslation &&
                            !showSubGrammar)
                        }
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Film className="h-3.5 w-3.5" />
                        Xuất Video + Script
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {subtitledVideoOutput && (
                <MediaResultCard
                  output={subtitledVideoOutput}
                  actionLabel={
                    burnMode === "hardsub"
                      ? "Video Hardsub (In cứng Script)"
                      : "Video Softsub (Phụ đề mềm)"
                  }
                />
              )}

              {/* Segments Timeline List with Inline Editor */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-700">
                    Lời thoại chi tiết ({scriptResult.transcript.segments.length} câu — bấm biểu tượng bút để sửa từng câu)
                  </span>
                  <button
                    type="button"
                    onClick={() => insertSegmentAfter(null)}
                    className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Thêm câu thoại
                  </button>
                </div>

                {filteredSegments.length === 0 ? (
                  <p className="rounded-lg bg-slate-50 py-6 text-center text-xs text-slate-500">
                    Không có đoạn hội thoại nào khớp với bộ lọc hiện tại.
                  </p>
                ) : (
                  filteredSegments.map(({ seg, originalIdx }) => {
                    const roleInfo = roleBadgeStyle(seg.role);
                    const timeLabel = seg.end_time.trim()
                      ? `${seg.start_time.trim()} – ${seg.end_time.trim()}`
                      : seg.start_time.trim();
                    const isEditing = editingSegIdx === originalIdx;
                    const isPlayingNow = activeSegmentIdx === originalIdx;

                    return (
                      <div
                        key={`seg-${originalIdx}`}
                        className={`rounded-xl border p-3 transition ${
                          isPlayingNow
                            ? "border-indigo-500 bg-indigo-50/40 ring-2 ring-indigo-200"
                            : isEditing
                            ? "border-indigo-300 bg-white shadow-xs"
                            : "border-slate-200 bg-slate-50/50 hover:border-indigo-200 hover:bg-white"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
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
                            {isPlayingNow && (
                              <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                Đang phát
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                setEditingSegIdx(isEditing ? null : originalIdx)
                              }
                              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                                isEditing
                                  ? "border-indigo-500 bg-indigo-600 text-white"
                                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                              }`}
                              title={
                                isEditing
                                  ? "Đóng trình sửa câu này"
                                  : "Sửa lời thoại, thời gian hoặc người nói"
                              }
                            >
                              {isEditing ? (
                                <>
                                  <Check className="h-3 w-3" />
                                  Xong
                                </>
                              ) : (
                                <>
                                  <Pencil className="h-3 w-3" />
                                  Sửa
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => insertSegmentAfter(originalIdx)}
                              className="rounded-md border border-slate-200 bg-white p-1 text-slate-500 hover:bg-indigo-50 hover:text-indigo-700"
                              title="Chèn thêm câu thoại ngay dưới dòng này"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteSegmentAt(originalIdx)}
                              className="rounded-md border border-slate-200 bg-white p-1 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                              title="Xóa dòng thoại này"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>

                        {isEditing ? (
                          <div className="mt-2.5 space-y-2 border-t border-slate-100 pt-2.5">
                            <div className="grid gap-2 sm:grid-cols-12">
                              <div className="sm:col-span-4">
                                <label className="block text-[10px] font-semibold text-slate-600">
                                  Chọn người nói
                                </label>
                                <select
                                  value={
                                    scriptResult.transcript.speakers.some(
                                      (s) => s.id === seg.speaker_id
                                    )
                                      ? seg.speaker_id
                                      : ""
                                  }
                                  onChange={(e) => {
                                    if (e.target.value) {
                                      assignSegmentSpeaker(
                                        originalIdx,
                                        e.target.value
                                      );
                                    }
                                  }}
                                  className="mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs focus:border-indigo-400 focus:outline-none"
                                >
                                  <option value="" disabled>
                                    -- Chọn người nói --
                                  </option>
                                  {scriptResult.transcript.speakers.map((sp) => (
                                    <option key={sp.id} value={sp.id}>
                                      {sp.label} ({roleBadgeStyle(sp.role).label})
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="sm:col-span-4">
                                <div className="flex items-center justify-between">
                                  <label className="text-[10px] font-semibold text-slate-600">
                                    Bắt đầu
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      captureSegmentTime(originalIdx, "start_time")
                                    }
                                    className="text-[10px] font-semibold text-indigo-600 hover:underline"
                                  >
                                    Lấy giờ Player
                                  </button>
                                </div>
                                <input
                                  type="text"
                                  value={seg.start_time}
                                  onChange={(e) =>
                                    updateSegmentAt(originalIdx, {
                                      start_time: e.target.value,
                                    })
                                  }
                                  className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1 font-mono text-xs focus:border-indigo-400 focus:outline-none"
                                />
                              </div>

                              <div className="sm:col-span-4">
                                <div className="flex items-center justify-between">
                                  <label className="text-[10px] font-semibold text-slate-600">
                                    Kết thúc
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      captureSegmentTime(originalIdx, "end_time")
                                    }
                                    className="text-[10px] font-semibold text-indigo-600 hover:underline"
                                  >
                                    Lấy giờ Player
                                  </button>
                                </div>
                                <input
                                  type="text"
                                  value={seg.end_time}
                                  onChange={(e) =>
                                    updateSegmentAt(originalIdx, {
                                      end_time: e.target.value,
                                    })
                                  }
                                  className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1 font-mono text-xs focus:border-indigo-400 focus:outline-none"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-[10px] font-semibold text-slate-600">
                                Nội dung lời nói
                              </label>
                              <textarea
                                rows={2}
                                value={seg.text}
                                onChange={(e) =>
                                  updateSegmentAt(originalIdx, {
                                    text: e.target.value,
                                  })
                                }
                                placeholder="Nhập lời nói chuẩn..."
                                className="mt-0.5 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
                              />
                              <SubtitleIconQuickBar
                                label="Chèn icon"
                                value={seg.text}
                                onChange={(next) =>
                                  updateSegmentAt(originalIdx, { text: next })
                                }
                              />
                            </div>

                            <div className="grid gap-2 sm:grid-cols-2">
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-600">
                                  Bản dịch tiếng Việt (tùy chọn)
                                </label>
                                <input
                                  type="text"
                                  value={seg.translation}
                                  onChange={(e) =>
                                    updateSegmentAt(originalIdx, {
                                      translation: e.target.value,
                                    })
                                  }
                                  placeholder="Dịch nghĩa..."
                                  className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-indigo-400 focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-600">
                                  Gợi ý sửa lỗi / Nhận xét (tùy chọn)
                                </label>
                                <input
                                  type="text"
                                  value={seg.grammar_note}
                                  onChange={(e) =>
                                    updateSegmentAt(originalIdx, {
                                      grammar_note: e.target.value,
                                    })
                                  }
                                  placeholder="VD: Nên dùng 'went' thay vì 'go'..."
                                  className="mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-indigo-400 focus:outline-none"
                                />
                                <SubtitleIconQuickBar
                                  label="Icon sửa lỗi"
                                  value={seg.grammar_note}
                                  onChange={(next) =>
                                    updateSegmentAt(originalIdx, {
                                      grammar_note: next,
                                    })
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="mt-1.5 text-sm leading-relaxed text-slate-800">
                              {seg.text || (
                                <span className="italic text-slate-400">
                                  (Chưa có lời thoại — bấm Sửa để nhập)
                                </span>
                              )}
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
                          </>
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

const SUBTITLE_QUICK_ICONS = ["🎓", "💡", "🎤", "✅", "⚠️", "⭐", "💬"] as const;

function SubtitleIconQuickBar({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
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
