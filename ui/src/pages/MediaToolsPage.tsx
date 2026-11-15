import { useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpLeft,
  Clock,
  ExternalLink,
  FileText,
  FolderOpen,
  Layers,
  Minimize2,
  Music,
  Plus,
  Repeat,
  RotateCcw,
  Scissors,
  Sparkles,
  Sun,
  Trash2,
  VolumeX,
} from "lucide-react";
import { LiveSubtitlePreview } from "../components/LiveSubtitlePreview";
import { LocalMediaPlayer } from "../components/LocalMediaPlayer";
import { MediaDropZone } from "../components/MediaDropZone";
import { MediaResultCard } from "../components/MediaResultCard";
import { MediaScriptResultPanel } from "../components/MediaScriptResultPanel";
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
import {
  INTERACTION_MODE_OPTIONS,
  VERBATIM_MODE_OPTIONS,
  buildMarkdownScript,
  type SubtitleFontName,
} from "../lib/scriptUtils";
import type {
  FileInfo,
  GenerateScriptResponse,
  MediaOutput,
  Mp3Preset,
  TranscriptSegment,
  VideoPreset,
} from "../lib/types";

type MediaToolId = "compress" | "mp3" | "trim" | "mute" | "merge" | "script";

interface MergeQueueItem {
  id: string;
  path: string;
  name: string;
}

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
    id: "merge",
    label: "Ghép video",
    shortDesc: "Nối nhiều video thành 1",
    icon: Layers,
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
    toolId: MediaToolId;
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
  const [scriptDirty, setScriptDirty] = useState(false);
  const [playerCurrentTime, setPlayerCurrentTime] = useState(0);
  const [editingSegIdx, setEditingSegIdx] = useState<number | null>(null);
  const [burnMode, setBurnMode] = useState<"hardsub" | "softsub">("hardsub");
  const [showSubRole, setShowSubRole] = useState(true);
  const [showSubSpeaker, setShowSubSpeaker] = useState(true);
  const [showSubText, setShowSubText] = useState(true);
  const [showSubTranslation, setShowSubTranslation] = useState(true);
  const [showSubGrammar, setShowSubGrammar] = useState(true);
  const [subtitleFont, setSubtitleFont] =
    useState<SubtitleFontName>("Be Vietnam Pro");
  const [subtitledVideoOutput, setSubtitledVideoOutput] =
    useState<MediaOutput | null>(null);
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryItem[]>([]);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [loopActiveSegment, setLoopActiveSegment] = useState(false);
  const [showVideoAdjustPanel, setShowVideoAdjustPanel] = useState(false);
  const [videoBrightness, setVideoBrightness] = useState(0);
  const [videoContrast, setVideoContrast] = useState(1);
  const [videoGamma, setVideoGamma] = useState(1);
  const [enhanceExportAudio, setEnhanceExportAudio] = useState(false);
  const [mergeQueue, setMergeQueue] = useState<MergeQueueItem[]>([]);
  const [mergeFastCopy, setMergeFastCopy] = useState(false);
  const [mergePreviewPath, setMergePreviewPath] = useState<string | null>(null);

  const hasVideoAdjustments =
    Math.abs(videoBrightness) > 0.005 ||
    Math.abs(videoContrast - 1) > 0.005 ||
    Math.abs(videoGamma - 1) > 0.005;

  const videoFilterStyle = hasVideoAdjustments
    ? `brightness(${(1 + videoBrightness * 1.4 + (videoGamma - 1) * 0.25).toFixed(2)}) contrast(${videoContrast.toFixed(2)})`
    : undefined;

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
    setScriptDirty(false);
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
      case "merge": {
        const firstStem = mergeQueue[0]
          ? getFileStem(mergeQueue[0].path)
          : stem;
        return {
          defaultFileName: `${firstStem}_merged.mp4`,
          filterName: "Video MP4",
          extensions: ["mp4"],
        };
      }
      case "script":
        return {
          defaultFileName: `${stem}_script.md`,
          filterName: "Script / Phụ đề",
          extensions: ["md", "txt", "srt"],
        };
    }
  }, [activeTool, compPreset, mergeQueue, mp3Preset, sourceFile]);

  function addMergePaths(paths: string[]) {
    if (paths.length === 0) return;
    setErrMsg("");
    setMergeQueue((prev) => [
      ...prev,
      ...paths.map((p, idx) => ({
        id: `${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
        path: p,
        name: p.split(/[/\\]/).pop() || p,
      })),
    ]);
    setMergePreviewPath((cur) => cur ?? paths[0]);
  }

  async function handlePickMergeVideos() {
    try {
      const picked = await api.pickVideoFiles();
      addMergePaths(picked);
    } catch (e) {
      setErrMsg(String(e));
    }
  }

  function moveMergeItem(idx: number, delta: -1 | 1) {
    setMergeQueue((prev) => {
      const target = idx + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(idx, 1);
      next.splice(target, 0, moved);
      return next;
    });
  }

  function removeMergeItem(id: string) {
    setMergeQueue((prev) => prev.filter((item) => item.id !== id));
  }

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
    const el = playerRef.current;
    if (secs === null || !el) return;

    setPlayerCurrentTime(secs);

    const applySeekAndPlay = () => {
      try {
        el.currentTime = secs;
      } catch {
        return;
      }
      const playAfterSeek = () => {
        void el.play().catch(() => {
          // Ignore autoplay blocks if browser/webview restricts programmatic play
        });
      };
      if (el.seeking) {
        el.addEventListener("seeked", playAfterSeek, { once: true });
      } else {
        playAfterSeek();
      }
    };

    if (el.readyState < 1) {
      el.addEventListener("loadedmetadata", applySeekAndPlay, { once: true });
      el.load();
    } else {
      applySeekAndPlay();
    }
  }

  function handleSpeakerChange(
    speakerId: string,
    nextLabel: string,
    nextRole: string
  ) {
    setExportNotice("");
    setScriptDirty(true);
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
    setScriptDirty(true);
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

  function nudgeSegmentTime(
    idx: number,
    field: "start_time" | "end_time",
    deltaSecs: number
  ) {
    if (!scriptResult) return;
    const seg = scriptResult.transcript.segments[idx];
    if (!seg) return;
    const base = parseTimecodeToSeconds(seg[field]) ?? playerCurrentTime;
    const next = Math.max(0, base + deltaSecs);
    updateSegmentAt(idx, { [field]: formatEditableTimecode(next) });
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
    setScriptDirty(true);
  }

  function insertSegmentAtCurrentTime(): number | null {
    if (!scriptResult) return null;
    const defaultSpeaker = scriptResult.transcript.speakers[0] ?? {
      id: "S1",
      label: "Học sinh 1",
      role: "student",
      name_confident: false,
    };
    const currentSecs = Math.max(
      0,
      playerRef.current?.currentTime ?? playerCurrentTime
    );
    const segments = scriptResult.transcript.segments;
    const foundPos = segments.findIndex((seg) => {
      const start = parseTimecodeToSeconds(seg.start_time);
      return start !== null && start > currentSecs;
    });
    const insertPos = foundPos === -1 ? segments.length : foundPos;
    const newSeg: TranscriptSegment = {
      start_time: formatEditableTimecode(currentSecs),
      end_time: formatEditableTimecode(currentSecs + 3),
      speaker_id: defaultSpeaker.id,
      speaker_label: defaultSpeaker.label,
      role: defaultSpeaker.role,
      text: "",
      translation: "",
      grammar_note: "",
    };

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
    setScriptDirty(true);
    return insertPos;
  }

  function deleteSegmentAt(idx: number) {
    setExportNotice("");
    setScriptDirty(true);
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
        brightness: videoBrightness,
        contrast: videoContrast,
        gamma: videoGamma,
        enhance_audio: enhanceExportAudio,
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

  async function handleExportSegmentClip(idx: number) {
    if (!sourceFile || !scriptResult || isSourceAudio || !ffmpegAvailable) return;
    const seg = scriptResult.transcript.segments[idx];
    if (!seg) return;
    const rawStart = parseTimecodeToSeconds(seg.start_time);
    const rawEnd = parseTimecodeToSeconds(seg.end_time);
    if (rawStart === null || rawEnd === null || rawEnd <= rawStart) {
      setErrMsg("Mốc thời gian bắt đầu/kết thúc của câu này chưa hợp lệ.");
      return;
    }
    const startSecs = Math.max(0, rawStart - 0.3);
    const endSecs = rawEnd + 0.4;

    setErrMsg("");
    const overrides = resolveOutputOverrides(outputTarget, sourceFile.path);
    const id = `media_studio_clip_${Date.now()}`;
    setTaskId(id);
    setStage(`Đang cắt clip câu #${idx + 1}...`);
    setPercent(0);

    const unlisten = await api.listenProgress(id, (p) => {
      setStage(p.stage);
      setPercent(p.percent);
    });

    try {
      const clipTranscript = {
        ...scriptResult.transcript,
        segments: [seg],
      };
      const out = await api.exportSegmentClip({
        task_id: id,
        video_path: sourceFile.path,
        start_secs: startSecs,
        end_secs: endSecs,
        clip_tag: `clip_cau_${idx + 1}`,
        burn_subtitles: burnMode === "hardsub",
        transcript: clipTranscript,
        content_mode: "all",
        font_name: subtitleFont,
        show_role: showSubRole,
        show_speaker: showSubSpeaker,
        show_text: showSubText,
        show_translation: showSubTranslation,
        show_grammar: showSubGrammar,
        brightness: videoBrightness,
        contrast: videoContrast,
        gamma: videoGamma,
        enhance_audio: enhanceExportAudio,
        out_dir_override: overrides.outDirOverride,
      });
      setLatestResult({
        toolId: "script",
        toolLabel: `Clip câu #${idx + 1}`,
        output: out,
      });
      setSessionHistory((prev) => [
        {
          id,
          toolLabel: `Clip câu #${idx + 1}`,
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
      setScriptDirty(false);
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
    if (activeTool === "merge") {
      if (mergeQueue.length < 2) {
        setErrMsg("Hãy chọn ít nhất 2 video để ghép.");
        return;
      }
    } else if (!sourceFile) {
      return;
    }
    setErrMsg("");
    setLatestResult(null);
    if (activeTool !== "script") {
      setScriptResult(null);
    }
    setExportNotice("");

    const refPath =
      activeTool === "merge"
        ? mergeQueue[0].path
        : (sourceFile?.path ?? "");
    const overrides = resolveOutputOverrides(outputTarget, refPath);
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
      if (activeTool === "script" && sourceFile) {
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
        setScriptDirty(false);
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
        let out: MediaOutput | null = null;
        if (activeTool === "merge") {
          out = await api.mergeVideos({
            task_id: id,
            video_paths: mergeQueue.map((item) => item.path),
            fast_copy: mergeFastCopy,
            out_dir_override: overrides.outDirOverride,
            out_path_override: overrides.outPathOverride,
          });
        } else if (activeTool === "compress" && sourceFile) {
          out = await api.compressVideo({
            taskId: id,
            videoPath: sourceFile.path,
            preset: compPreset,
            ...overrides,
          });
        } else if (activeTool === "mp3" && sourceFile) {
          out = await api.extractMp3({
            taskId: id,
            videoPath: sourceFile.path,
            preset: mp3Preset,
            ...overrides,
          });
        } else if (activeTool === "trim" && sourceFile) {
          out = await api.trimMedia({
            taskId: id,
            inputPath: sourceFile.path,
            startSecs,
            endSecs,
            fastCopy: trimFastCopy,
            ...overrides,
          });
        } else if (sourceFile) {
          out = await api.muteVideo({
            taskId: id,
            videoPath: sourceFile.path,
            ...overrides,
          });
        }

        if (!out) return;
        const finalOut = out;
        if (activeTool === "merge") {
          setMergePreviewPath(finalOut.output_path);
        }
        setLatestResult({ toolId: activeTool, toolLabel, output: finalOut });
        setSessionHistory((prev) => [
          { id, toolLabel, output: finalOut },
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

  const activeToolInfo =
    TOOL_TABS.find((t) => t.id === activeTool) ?? TOOL_TABS[0];

  return (
    <div className="space-y-4">
      {!ffmpegAvailable && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠️ Chưa phát hiện <code>ffmpeg</code> trên hệ thống. Hãy vào tab{" "}
          <strong>Cài đặt &amp; Prompt</strong> để kiểm tra hoặc trỏ đường dẫn tới binary{" "}
          <code>ffmpeg</code>.
        </div>
      )}

      {/* Step 1: Feature selector across the top */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              1. Chọn tính năng xử lý Media
            </h2>
            <p className="text-xs text-slate-500">
              Chọn thao tác muốn làm trước, rồi chọn video và tùy chỉnh thông số ở bên dưới.
            </p>
          </div>
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-1.5 rounded-xl border border-slate-200 bg-slate-100 p-1.5 sm:grid-cols-3 lg:grid-cols-6">
          {TOOL_TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTool === t.id;
            return (
              <button
                key={t.id}
                type="button"
                disabled={taskId !== null}
                title={t.shortDesc}
                onClick={() => handleSelectTool(t.id)}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition disabled:opacity-60 ${
                  active
                    ? "bg-white text-indigo-700 shadow-xs ring-1 ring-indigo-200"
                    : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    active ? "text-indigo-600" : "text-slate-400"
                  }`}
                />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold leading-tight">
                    {t.label}
                  </p>
                  <p className="truncate text-[10px] text-slate-400">
                    {t.shortDesc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2: Feature-tailored workspace */}
      <div className="grid items-start gap-4 md:grid-cols-12">
        {/* Left column: Sticky Media Preview, Player Controls & Inline Subtitle Editor */}
        <div className="space-y-3 md:sticky md:top-3 md:col-span-6 md:max-h-[calc(100vh-1.5rem)] md:overflow-y-auto md:pr-0.5">
          {activeTool === "merge" ? (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900">
                  2. Xem trước Video ghép
                </h2>
                {mergePreviewPath && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      latestResult?.output.output_path === mergePreviewPath
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-indigo-100 text-indigo-700"
                    }`}
                  >
                    {latestResult?.output.output_path === mergePreviewPath
                      ? "Kết quả đã ghép"
                      : "Clip trong danh sách"}
                  </span>
                )}
              </div>

              {mergePreviewPath ? (
                <>
                  <LocalMediaPlayer
                    path={mergePreviewPath}
                    kind="video"
                    playbackRate={playbackRate}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs">
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-700">
                      {mergePreviewPath.split(/[/\\]/).pop() || mergePreviewPath}
                    </span>
                    <button
                      type="button"
                      disabled={taskId !== null}
                      onClick={() => {
                        void loadSourcePath(mergePreviewPath);
                        handleSelectTool("script");
                      }}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                      title="Nạp video này làm file nguồn và chuyển sang Tạo Script (AI)"
                    >
                      <Sparkles className="h-3 w-3" />
                      Tạo Script từ video này
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex aspect-video flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-xs text-slate-500">
                  <Layers className="mb-2 h-7 w-7 text-slate-300" />
                  <p className="font-semibold text-slate-700">
                    Chưa có video để xem trước
                  </p>
                  <p className="mt-1 text-[11px]">
                    Chọn các video ở bên phải — bấm vào từng video để xem trước, hoặc xem ngay video thành phẩm sau khi ghép xong.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900">
                  2. Chọn Video / Audio nguồn
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
              <>
                <LocalMediaPlayer
                  ref={playerRef}
                  path={sourceFile.path}
                  kind={isSourceAudio ? "audio" : "video"}
                  playbackRate={playbackRate}
                  videoFilterStyle={videoFilterStyle}
                  onTimeUpdate={(secs) => {
                    setPlayerCurrentTime(secs);
                    if (loopActiveSegment && activePreviewSegment) {
                      const s = parseTimecodeToSeconds(
                        activePreviewSegment.start_time
                      );
                      const e = parseTimecodeToSeconds(
                        activePreviewSegment.end_time
                      );
                      if (
                        s !== null &&
                        e !== null &&
                        e > s &&
                        secs >= e - 0.05 &&
                        playerRef.current &&
                        !playerRef.current.paused
                      ) {
                        playerRef.current.currentTime = s;
                      }
                    }
                  }}
                  className={isSourceAudio ? "w-full" : undefined}
                />

                {/* Compact playback speed, loop & brightness controls */}
                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-semibold text-slate-500">
                        Tốc độ:
                      </span>
                      {[0.75, 1, 1.25, 1.5].map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() => setPlaybackRate(rate)}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition ${
                            playbackRate === rate
                              ? "bg-indigo-600 text-white"
                              : "bg-white text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                          }`}
                        >
                          {rate}x
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1">
                      {scriptResult && (
                        <button
                          type="button"
                          onClick={() => setLoopActiveSegment((v) => !v)}
                          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold transition ${
                            loopActiveSegment
                              ? "bg-indigo-600 text-white"
                              : "border border-slate-200 bg-white text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                          }`}
                          title="Lặp lại câu phụ đề đang phát để nghe kỹ"
                        >
                          <Repeat className="h-2.5 w-2.5" />
                          Loop câu
                        </button>
                      )}
                      {!isSourceAudio && (
                        <button
                          type="button"
                          onClick={() => setShowVideoAdjustPanel((v) => !v)}
                          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold transition ${
                            showVideoAdjustPanel || hasVideoAdjustments
                              ? "border border-amber-300 bg-amber-50 text-amber-800"
                              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                          }`}
                          title="Chỉnh độ sáng, tương phản, chống ngược sáng"
                        >
                          <Sun className="h-2.5 w-2.5" />
                          Ánh sáng
                        </button>
                      )}
                    </div>
                  </div>

                  {!isSourceAudio && showVideoAdjustPanel && (
                    <div className="space-y-2 border-t border-slate-200 pt-2">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <div className="flex flex-wrap gap-1">
                          {[
                            { label: "Mặc định", b: 0, c: 1, g: 1 },
                            { label: "Sáng nhẹ", b: 0.08, c: 1.05, g: 1.1 },
                            { label: "Ngược sáng", b: 0.1, c: 1.08, g: 1.35 },
                            { label: "Tối nhẹ", b: -0.08, c: 1.05, g: 0.92 },
                          ].map((preset) => (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => {
                                setVideoBrightness(preset.b);
                                setVideoContrast(preset.c);
                                setVideoGamma(preset.g);
                              }}
                              className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:border-amber-300 hover:bg-amber-50"
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                        {hasVideoAdjustments && (
                          <button
                            type="button"
                            onClick={() => {
                              setVideoBrightness(0);
                              setVideoContrast(1);
                              setVideoGamma(1);
                            }}
                            className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-slate-500 hover:text-slate-800"
                          >
                            <RotateCcw className="h-2.5 w-2.5" />
                            Đặt lại
                          </button>
                        )}
                      </div>

                      <div className="grid gap-1.5 text-[10px]">
                        <label className="flex items-center gap-2">
                          <span className="w-24 shrink-0 font-semibold text-slate-600">
                            Độ sáng ({videoBrightness >= 0 ? "+" : ""}
                            {Math.round(videoBrightness * 100)}%)
                          </span>
                          <input
                            type="range"
                            min={-0.3}
                            max={0.3}
                            step={0.02}
                            value={videoBrightness}
                            onChange={(e) =>
                              setVideoBrightness(Number(e.target.value))
                            }
                            className="w-full accent-amber-600"
                          />
                        </label>
                        <label className="flex items-center gap-2">
                          <span className="w-24 shrink-0 font-semibold text-slate-600">
                            Tương phản ({videoContrast.toFixed(2)}x)
                          </span>
                          <input
                            type="range"
                            min={0.7}
                            max={1.5}
                            step={0.05}
                            value={videoContrast}
                            onChange={(e) =>
                              setVideoContrast(Number(e.target.value))
                            }
                            className="w-full accent-amber-600"
                          />
                        </label>
                        <label className="flex items-center gap-2">
                          <span className="w-24 shrink-0 font-semibold text-slate-600">
                            Ngược sáng ({videoGamma.toFixed(2)})
                          </span>
                          <input
                            type="range"
                            min={0.7}
                            max={1.8}
                            step={0.05}
                            value={videoGamma}
                            onChange={(e) =>
                              setVideoGamma(Number(e.target.value))
                            }
                            className="w-full accent-amber-600"
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {scriptResult && (
              <LiveSubtitlePreview
                segments={scriptResult.transcript.segments}
                speakers={scriptResult.transcript.speakers}
                activeSegmentIdx={activeSegmentIdx}
                activePreviewSegment={activePreviewSegment}
                playerCurrentTime={playerCurrentTime}
                subtitleFont={subtitleFont}
                showSubRole={showSubRole}
                showSubSpeaker={showSubSpeaker}
                showSubText={showSubText}
                showSubTranslation={showSubTranslation}
                showSubGrammar={showSubGrammar}
                scriptDirty={scriptDirty}
                exportBusy={exportBusy}
                hasVideoSource={!isSourceAudio && Boolean(sourceFile)}
                ffmpegAvailable={ffmpegAvailable}
                isTaskBusy={taskId !== null}
                onSeekPlayerTo={seekPlayerTo}
                onUpdateSegmentAt={updateSegmentAt}
                onAssignSegmentSpeaker={assignSegmentSpeaker}
                onCaptureSegmentTime={captureSegmentTime}
                onNudgeSegmentTime={nudgeSegmentTime}
                onExportSegmentClip={(idx) => void handleExportSegmentClip(idx)}
                onInsertSegmentAtCurrentTime={insertSegmentAtCurrentTime}
                onDeleteSegmentAt={deleteSegmentAt}
                onSaveUpdatedMarkdown={() => void handleSaveUpdatedMarkdown()}
              />
            )}
            </div>
          )}
        </div>

        {/* Right column: Active Tool Settings + Destination + Results */}
        <div className="space-y-3 md:col-span-6">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {activeTool === "merge"
                    ? "2. Chọn các video & Ghép"
                    : `3. Tùy chỉnh: ${activeToolInfo.label}`}
                </h2>
                <p className="text-xs text-slate-500">
                  {activeToolInfo.shortDesc}
                </p>
              </div>
            </div>

            {/* Active Tool Config Panel */}
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
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

              {activeTool === "merge" && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-600">
                      Chọn từ <strong>2 video trở lên</strong> theo thứ tự cần nối. Hệ thống tự chuẩn hóa kích thước &amp; âm thanh để ghép mượt kể cả khi các video khác độ phân giải.
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={taskId !== null}
                        onClick={() => void handlePickMergeVideos()}
                        className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Chọn thêm video
                      </button>
                      {sourceFile && !isSourceAudio && (
                        <button
                          type="button"
                          disabled={taskId !== null}
                          onClick={() => addMergePaths([sourceFile.path])}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Thêm file nguồn
                        </button>
                      )}
                      {mergeQueue.length > 0 && (
                        <button
                          type="button"
                          disabled={taskId !== null}
                          onClick={() => setMergeQueue([])}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                        >
                          Xóa tất cả
                        </button>
                      )}
                    </div>
                  </div>

                  {sessionHistory.some(
                    (h) => !isAudioFilePath(h.output.output_path) && /\.(mp4|mov|mkv|webm|avi)$/i.test(h.output.output_path)
                  ) && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="font-semibold text-slate-500">
                        Thêm nhanh từ phiên:
                      </span>
                      {sessionHistory
                        .filter(
                          (h) =>
                            !isAudioFilePath(h.output.output_path) &&
                            /\.(mp4|mov|mkv|webm|avi)$/i.test(h.output.output_path)
                        )
                        .slice(0, 4)
                        .map((h) => (
                          <button
                            key={h.id}
                            type="button"
                            disabled={taskId !== null}
                            onClick={() => addMergePaths([h.output.output_path])}
                            className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-white px-2 py-0.5 font-medium text-indigo-700 hover:bg-indigo-50"
                            title={h.output.output_path}
                          >
                            <Plus className="h-2.5 w-2.5" />
                            {h.output.file_name}
                          </button>
                        ))}
                    </div>
                  )}

                  {mergeQueue.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-xs text-slate-500">
                      Chưa có video nào trong danh sách ghép. Bấm{" "}
                      <strong>Chọn thêm video</strong> ở trên để bắt đầu.
                    </div>
                  ) : (
                    <div className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
                      {mergeQueue.map((item, idx) => (
                        <div
                          key={item.id}
                          className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs transition ${
                            mergePreviewPath === item.path
                              ? "border-indigo-300 bg-indigo-50/50"
                              : "border-slate-200 bg-white"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setMergePreviewPath(item.path)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            title="Bấm để xem trước video này ở khung bên trái"
                          >
                            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-700">
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-800">
                                {item.name}
                              </p>
                              <p className="truncate text-[10px] text-slate-400">
                                {item.path}
                              </p>
                            </div>
                          </button>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              disabled={idx === 0 || taskId !== null}
                              onClick={() => moveMergeItem(idx, -1)}
                              className="rounded border border-slate-200 bg-slate-50 p-1 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-40"
                              title="Đưa lên trước"
                              aria-label="Đưa lên trước"
                            >
                              <ArrowUp className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              disabled={
                                idx === mergeQueue.length - 1 || taskId !== null
                              }
                              onClick={() => moveMergeItem(idx, 1)}
                              className="rounded border border-slate-200 bg-slate-50 p-1 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-40"
                              title="Đưa xuống sau"
                              aria-label="Đưa xuống sau"
                            >
                              <ArrowDown className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              disabled={taskId !== null}
                              onClick={() => removeMergeItem(item.id)}
                              className="rounded border border-slate-200 bg-slate-50 p-1 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                              title="Xóa khỏi danh sách"
                              aria-label="Xóa khỏi danh sách"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={mergeFastCopy}
                      onChange={(e) => setMergeFastCopy(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    <span>
                      Ghép siêu nhanh không encode lại (<code>-c copy</code>, chỉ dùng khi các video cùng kích thước &amp; định dạng).
                    </span>
                  </label>
                </div>
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

              <div className="mt-3 space-y-3 border-t border-slate-200/80 pt-3">
                <OutputLocationPicker
                  defaultExportDir={defaultExportDir}
                  sourceFilePath={
                    activeTool === "merge"
                      ? mergeQueue[0]?.path
                      : sourceFile?.path
                  }
                  defaultFileName={outputDialogMeta.defaultFileName}
                  fileFilterName={outputDialogMeta.filterName}
                  fileExtensions={outputDialogMeta.extensions}
                  value={outputTarget}
                  onChange={updateOutputTarget}
                  disabled={taskId !== null}
                />

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => void handleRunTool()}
                    disabled={
                      (activeTool === "merge"
                        ? mergeQueue.length < 2
                        : !sourceFile) ||
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
                      : activeTool === "merge"
                      ? `Bắt đầu ghép (${mergeQueue.length} video)`
                      : "Bắt đầu xử lý"}
                  </button>
                </div>
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

          {latestResult && latestResult.toolId === activeTool && (
            <MediaResultCard
              output={latestResult.output}
              actionLabel={latestResult.toolLabel}
            />
          )}

          {scriptResult && activeTool === "script" && (
            <MediaScriptResultPanel
              scriptResult={scriptResult}
              hasVideoSource={!isSourceAudio && Boolean(sourceFile)}
              ffmpegAvailable={ffmpegAvailable}
              isTaskBusy={taskId !== null}
              exportBusy={exportBusy}
              exportNotice={exportNotice}
              copiedMd={copiedMd}
              scriptDirty={scriptDirty}
              scriptSearch={scriptSearch}
              setScriptSearch={setScriptSearch}
              filteredSegments={filteredSegments}
              activeSegmentIdx={activeSegmentIdx}
              editingSegIdx={editingSegIdx}
              setEditingSegIdx={setEditingSegIdx}
              burnMode={burnMode}
              setBurnMode={setBurnMode}
              subtitleFont={subtitleFont}
              setSubtitleFont={setSubtitleFont}
              showSubRole={showSubRole}
              setShowSubRole={setShowSubRole}
              showSubSpeaker={showSubSpeaker}
              setShowSubSpeaker={setShowSubSpeaker}
              showSubText={showSubText}
              setShowSubText={setShowSubText}
              showSubTranslation={showSubTranslation}
              setShowSubTranslation={setShowSubTranslation}
              showSubGrammar={showSubGrammar}
              setShowSubGrammar={setShowSubGrammar}
              enhanceExportAudio={enhanceExportAudio}
              setEnhanceExportAudio={setEnhanceExportAudio}
              hasVideoAdjustments={hasVideoAdjustments}
              subtitledVideoOutput={subtitledVideoOutput}
              onCopyScriptMarkdown={() => void handleCopyScriptMarkdown()}
              onSaveUpdatedMarkdown={() => void handleSaveUpdatedMarkdown()}
              onExportScriptAs={(fmt) => void handleExportScriptAs(fmt)}
              onSpeakerChange={handleSpeakerChange}
              onEmbedSubtitlesVideo={() => void handleEmbedSubtitlesVideo()}
              onExportSegmentClip={(idx) => void handleExportSegmentClip(idx)}
              onSeekPlayerTo={seekPlayerTo}
              onInsertSegmentAfter={insertSegmentAfter}
              onDeleteSegmentAt={deleteSegmentAt}
              onAssignSegmentSpeaker={assignSegmentSpeaker}
              onCaptureSegmentTime={captureSegmentTime}
              onUpdateSegmentAt={updateSegmentAt}
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
                      {/\.(mp4|mov|mkv|webm|avi|mp3|wav|m4a|aac|ogg|flac)$/i.test(
                        item.output.output_path
                      ) && (
                        <button
                          type="button"
                          disabled={taskId !== null}
                          onClick={() => void loadSourcePath(item.output.output_path)}
                          className="inline-flex items-center gap-1 rounded border border-indigo-200 bg-white px-2 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                          title="Nạp file này vào khung File nguồn bên trái để xem hoặc xử lý tiếp"
                        >
                          <ArrowUpLeft className="h-3 w-3" />
                          Nạp nguồn
                        </button>
                      )}
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
