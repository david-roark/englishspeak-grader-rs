import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpLeft,
  Clock,
  ExternalLink,
  FileText,
  Film,
  FolderOpen,
  Layers,
  Minimize2,
  Music,
  Plus,
  Repeat,
  RotateCcw,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  Volume2,
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

type MediaToolId = "edit" | "merge" | "mp3" | "script";

interface MergeQueueItem {
  id: string;
  path: string;
  name: string;
  durationSecs: number | null;
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
  icon: typeof SlidersHorizontal;
}[] = [
  {
    id: "edit",
    label: "Chỉnh sửa Video",
    shortDesc: "Nén · Cắt đoạn · Xóa tiếng",
    icon: SlidersHorizontal,
  },
  {
    id: "merge",
    label: "Ghép video",
    shortDesc: "Nối nhiều video thành 1",
    icon: Layers,
  },
  {
    id: "mp3",
    label: "Tách âm thanh",
    shortDesc: "Xuất file MP3 nhẹ",
    icon: Music,
  },
  {
    id: "script",
    label: "Tạo Script (AI)",
    shortDesc: "Video → MP3 → Kịch bản & Phụ đề",
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
  const mergePlayerRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const pendingMergeSeekRef = useRef<number | null>(null);
  const [mergeCurrentTime, setMergeCurrentTime] = useState(0);
  const [mergePreviewDuration, setMergePreviewDuration] = useState<
    number | null
  >(null);
  const [mergeActiveIdx, setMergeActiveIdx] = useState<number | null>(null);

  const [activeTool, setActiveTool] = useState<MediaToolId>("edit");
  const [editCompress, setEditCompress] = useState(true);
  const [editTrim, setEditTrim] = useState(false);
  const [editMute, setEditMute] = useState(false);
  const [editEnhanceAudio, setEditEnhanceAudio] = useState(false);
  const [editAudioVolume, setEditAudioVolume] = useState(1.0);
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

      // If audio file is loaded while in Edit mode, automatically enable Trim
      if (isAudioFilePath(path) && activeTool === "edit") {
        setEditTrim(true);
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

  const effectiveEditCompress = editCompress && !isSourceAudio;
  const effectiveEditMute = editMute && !isSourceAudio;
  const effectiveEditAudioFx =
    !effectiveEditMute &&
    (editEnhanceAudio || Math.abs(editAudioVolume - 1.0) > 0.01);
  const effectiveEditCount =
    Number(effectiveEditCompress) +
    Number(editTrim) +
    Number(effectiveEditMute) +
    Number(effectiveEditAudioFx);

  const outputDialogMeta = useMemo(() => {
    const stem = sourceFile ? getFileStem(sourceFile.path) : "ket_qua";
    const srcExt = sourceFile ? getFileExtension(sourceFile.path) || "mp4" : "mp4";
    switch (activeTool) {
      case "edit": {
        if (effectiveEditCount === 1) {
          if (effectiveEditCompress) {
            return {
              defaultFileName: `${stem}_compressed_${compPreset}.mp4`,
              filterName: "Video MP4",
              extensions: ["mp4"],
            };
          }
          if (editTrim) {
            return {
              defaultFileName: `${stem}_trim.${srcExt}`,
              filterName: "Media",
              extensions: [srcExt, "mp4", "mp3"],
            };
          }
          if (effectiveEditAudioFx) {
            return {
              defaultFileName: `${stem}_audio.${srcExt}`,
              filterName: "Media",
              extensions: [srcExt, "mp4", "mp3"],
            };
          }
          return {
            defaultFileName: `${stem}_muted.${srcExt}`,
            filterName: "Video",
            extensions: [srcExt, "mp4"],
          };
        }
        const outExt = effectiveEditCompress ? "mp4" : srcExt;
        return {
          defaultFileName: `${stem}_edited.${outExt}`,
          filterName: effectiveEditCompress ? "Video MP4" : "Media",
          extensions: effectiveEditCompress ? ["mp4"] : [srcExt, "mp4"],
        };
      }
      case "mp3":
        return {
          defaultFileName: `${stem}_${mp3Preset}.mp3`,
          filterName: "Audio MP3",
          extensions: ["mp3"],
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
  }, [
    activeTool,
    compPreset,
    editTrim,
    effectiveEditAudioFx,
    effectiveEditCompress,
    effectiveEditCount,
    mergeQueue,
    mp3Preset,
    sourceFile,
  ]);

  function addMergePaths(paths: string[]) {
    if (paths.length === 0) return;
    setErrMsg("");
    const newItems: MergeQueueItem[] = paths.map((p, idx) => ({
      id: `${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
      path: p,
      name: p.split(/[/\\]/).pop() || p,
      durationSecs: null,
    }));
    setMergeQueue((prev) => [...prev, ...newItems]);
    setMergePreviewPath((cur) => cur ?? paths[0]);

    for (const item of newItems) {
      void api
        .probeMediaDuration(item.path)
        .then((dur) => {
          if (dur == null || !Number.isFinite(dur)) return;
          setMergeQueue((prev) =>
            prev.map((q) =>
              q.id === item.id ? { ...q, durationSecs: dur } : q
            )
          );
        })
        .catch(() => {
          // Ignore duration probe failure for individual clip
        });
    }
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
    setEditTrim(true);
    const formatted = formatEditableTimecode(current);
    if (target === "start") {
      setTrimStart(formatted);
    } else {
      setTrimEnd(formatted);
    }
  }

  function handleTimelineRangeChange(target: "start" | "end", nextSecs: number) {
    if (!Number.isFinite(nextSecs)) return;
    setEditTrim(true);
    const clamped = Math.max(0, nextSecs);
    if (target === "start") {
      const endLimit =
        durationSecs && trimEnd.trim()
          ? (parseTimecodeToSeconds(trimEnd) ?? durationSecs)
          : durationSecs;
      const safeStart =
        endLimit != null ? Math.min(clamped, Math.max(0, endLimit - 0.5)) : clamped;
      setTrimStart(formatEditableTimecode(safeStart));
      if (playerRef.current) {
        playerRef.current.currentTime = safeStart;
        setPlayerCurrentTime(safeStart);
      }
    } else {
      const startLimit = parseTimecodeToSeconds(trimStart || "0") ?? 0;
      const safeEnd = Math.max(clamped, startLimit + 0.5);
      setTrimEnd(formatEditableTimecode(safeEnd));
      if (playerRef.current) {
        playerRef.current.currentTime = safeEnd;
        setPlayerCurrentTime(safeEnd);
      }
    }
  }

  function seekMediaElementTo(el: HTMLMediaElement | null, secs: number) {
    if (!el || !Number.isFinite(secs)) return;
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
      if (el.networkState === HTMLMediaElement.NETWORK_EMPTY) {
        el.load();
      }
    } else {
      applySeekAndPlay();
    }
  }

  function seekPlayerTo(rawTimestamp: string) {
    const cleaned = rawTimestamp.trim().replace(/^\[|\]$/g, "");
    const secs = parseTimecodeToSeconds(cleaned);
    if (secs === null || !playerRef.current) return;
    setPlayerCurrentTime(secs);
    seekMediaElementTo(playerRef.current, secs);
  }

  function handleClickMergeStoryboardClip(
    idx: number,
    item: MergeQueueItem,
    startOffset: number | null
  ) {
    const mergedPath =
      latestResult?.toolId === "merge" ? latestResult.output.output_path : null;
    if (mergedPath && startOffset !== null) {
      setMergeActiveIdx(null);
      setMergeCurrentTime(startOffset);
      if (mergePreviewPath === mergedPath) {
        seekMediaElementTo(mergePlayerRef.current, startOffset);
      } else {
        pendingMergeSeekRef.current = startOffset;
        setMergePreviewPath(mergedPath);
      }
      return;
    }

    setMergeActiveIdx(idx);
    setMergeCurrentTime(0);
    if (mergePreviewPath === item.path) {
      seekMediaElementTo(mergePlayerRef.current, 0);
    } else {
      pendingMergeSeekRef.current = 0;
      setMergePreviewPath(item.path);
    }
  }

  function handleMergePreviewEnded() {
    const mergedPath =
      latestResult?.toolId === "merge" ? latestResult.output.output_path : null;
    if (mergedPath && mergePreviewPath === mergedPath) {
      return;
    }
    const currentIdx =
      mergeActiveIdx !== null && mergeQueue[mergeActiveIdx]
        ? mergeActiveIdx
        : mergeQueue.findIndex((q) => q.path === mergePreviewPath);
    const nextIdx = currentIdx + 1;
    if (currentIdx < 0 || nextIdx >= mergeQueue.length) {
      return;
    }
    const nextItem = mergeQueue[nextIdx];
    setMergeActiveIdx(nextIdx);
    setMergeCurrentTime(0);
    if (mergePreviewPath === nextItem.path) {
      seekMediaElementTo(mergePlayerRef.current, 0);
    } else {
      pendingMergeSeekRef.current = 0;
      setMergePreviewPath(nextItem.path);
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

    if (activeTool === "edit" && effectiveEditCount === 0) {
      setErrMsg(
        isSourceAudio
          ? "File âm thanh hỗ trợ Cắt đoạn và Lọc âm/Âm lượng ở mục này. Hãy bật ít nhất 1 tùy chọn để tiếp tục."
          : "Hãy bật ít nhất 1 thao tác chỉnh sửa (Giảm dung lượng, Cắt đoạn, Xóa âm thanh hoặc Lọc âm/Âm lượng)."
      );
      return;
    }

    const refPath =
      activeTool === "merge"
        ? mergeQueue[0].path
        : (sourceFile?.path ?? "");
    const overrides = resolveOutputOverrides(outputTarget, refPath);
    const id = `media_studio_${activeTool}_${Date.now()}`;
    const toolInfo = TOOL_TABS.find((t) => t.id === activeTool);
    const editParts: string[] = [];
    if (effectiveEditCompress) editParts.push("Giảm dung lượng");
    if (editTrim) editParts.push("Cắt đoạn");
    if (effectiveEditMute) editParts.push("Xóa âm thanh");
    if (!effectiveEditMute) {
      if (editEnhanceAudio) editParts.push("Lọc âm");
      if (Math.abs(editAudioVolume - 1.0) > 0.01) {
        editParts.push(`Âm lượng ${Math.round(editAudioVolume * 100)}%`);
      }
    }
    const toolLabel =
      activeTool === "edit" && editParts.length > 0
        ? editParts.join(" + ")
        : (toolInfo?.label ?? activeTool);

    let startSecs = 0;
    let endSecs: number | null = null;
    if (activeTool === "edit" && editTrim) {
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
        } else if (activeTool === "edit" && sourceFile) {
          out = await api.editVideo({
            taskId: id,
            inputPath: sourceFile.path,
            compressPreset: effectiveEditCompress ? compPreset : null,
            trim: editTrim
              ? {
                  startSecs,
                  endSecs,
                  fastCopy: effectiveEditCompress ? false : trimFastCopy,
                }
              : null,
            mute: effectiveEditMute,
            enhanceAudio: !effectiveEditMute && editEnhanceAudio,
            audioVolume: effectiveEditMute ? 1.0 : editAudioVolume,
            ...overrides,
          });
        } else if (activeTool === "mp3" && sourceFile) {
          out = await api.extractMp3({
            taskId: id,
            videoPath: sourceFile.path,
            preset: mp3Preset,
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
    activeTool === "edit" && effectiveEditCount === 0;

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

  const parsedTrimStartSecs = Math.max(
    0,
    parseTimecodeToSeconds(trimStart || "0") ?? 0
  );
  const parsedTrimEndSecs =
    durationSecs && durationSecs > 0
      ? Math.min(
          durationSecs,
          Math.max(
            parsedTrimStartSecs + 0.5,
            parseTimecodeToSeconds(trimEnd) ?? durationSecs
          )
        )
      : null;

  const mergeTimelineEntries = useMemo(() => {
    let cursor = 0;
    let allKnown = true;
    return mergeQueue.map((item) => {
      const startOffset = allKnown ? cursor : null;
      if (item.durationSecs != null && Number.isFinite(item.durationSecs)) {
        cursor += item.durationSecs;
      } else {
        allKnown = false;
      }
      const endOffset = allKnown ? cursor : null;
      return { item, startOffset, endOffset };
    });
  }, [mergeQueue]);

  return (
    <div className="space-y-3">
      {!ffmpegAvailable && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠️ Chưa phát hiện <code>ffmpeg</code> trên hệ thống. Hãy vào tab{" "}
          <strong>Cài đặt &amp; Prompt</strong> để kiểm tra hoặc trỏ đường dẫn tới binary{" "}
          <code>ffmpeg</code>.
        </div>
      )}

      {/* Pro Studio Top Bar: Mode Switcher & Quick Source Action */}
      <div className="rounded-2xl border border-slate-200 bg-white p-2.5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 px-1">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <Film className="h-3.5 w-3.5" />
            </span>
            <div>
              <p className="text-xs font-bold leading-tight text-slate-900">
                Xưởng Media
              </p>
              <p className="text-[10px] text-slate-500">
                {ffmpegAvailable ? "FFmpeg sẵn sàng" : "Thiếu FFmpeg"}
              </p>
            </div>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 sm:grid-cols-4">
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
                  className={`flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition disabled:opacity-60 ${
                    active
                      ? "bg-white text-indigo-700 shadow-xs ring-1 ring-indigo-200"
                      : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
                  }`}
                >
                  <Icon
                    className={`h-3.5 w-3.5 shrink-0 ${
                      active ? "text-indigo-600" : "text-slate-400"
                    }`}
                  />
                  <span className="truncate">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Studio Workspace: Dark Monitor (Left 7 cols) + Clean Inspector (Right 5 cols) */}
      <div className="grid items-start gap-3.5 lg:grid-cols-12">
        {/* Left column: Studio Monitor + Transport/Timeline + Live Subtitle Editor */}
        <div className="space-y-3 lg:sticky lg:top-3 lg:col-span-7 lg:max-h-[calc(100vh-1.5rem)] lg:overflow-y-auto lg:pr-0.5">
          {activeTool === "merge" ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3.5 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-indigo-500" />
                  <span className="text-xs font-bold tracking-wide text-slate-900">
                    Monitor ghép video
                  </span>
                </div>
                {mergePreviewPath && (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                      latestResult?.output.output_path === mergePreviewPath
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-indigo-100 text-indigo-700"
                    }`}
                  >
                    {latestResult?.output.output_path === mergePreviewPath
                      ? "Thành phẩm đã ghép"
                      : "Clip trong dải ghép"}
                  </span>
                )}
              </div>

              <div className="p-3.5">
                {mergePreviewPath ? (
                  <div className="space-y-2.5">
                    <LocalMediaPlayer
                      ref={mergePlayerRef}
                      path={mergePreviewPath}
                      kind="video"
                      playbackRate={playbackRate}
                      onTimeUpdate={setMergeCurrentTime}
                      onEnded={handleMergePreviewEnded}
                      onLoadedMetadata={() => {
                        const dur = mergePlayerRef.current?.duration;
                        if (dur != null && Number.isFinite(dur) && dur > 0) {
                          setMergePreviewDuration(dur);
                        }
                        const pending = pendingMergeSeekRef.current;
                        if (pending !== null) {
                          pendingMergeSeekRef.current = null;
                          seekMediaElementTo(mergePlayerRef.current, pending);
                        }
                      }}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
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
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                        title="Nạp video này làm file nguồn và chuyển sang Tạo Script (AI)"
                      >
                        <Sparkles className="h-3 w-3" />
                        Tạo Script từ video này
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex aspect-video flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-xs text-slate-500">
                    <Layers className="mb-2 h-8 w-8 text-slate-300" />
                    <p className="font-semibold text-slate-700">
                      Chưa có clip trên Monitor
                    </p>
                    <p className="mt-1 max-w-sm text-[11px] text-slate-500">
                      Thêm video vào dải Storyboard bên dưới — bấm từng clip để xem trước hoặc xem ngay thành phẩm sau khi ghép.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
              {/* Monitor Top Chrome */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3.5 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      sourceFile ? "bg-emerald-500" : "bg-slate-400"
                    }`}
                  />
                  <span className="truncate text-xs font-bold text-slate-900">
                    {sourceFile ? sourceFile.name : "Monitor xem trước"}
                  </span>
                  {sourceFile && (
                    <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                      {isSourceAudio ? "AUDIO" : "VIDEO"}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {durationSecs != null && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                      <Clock className="h-3 w-3 text-indigo-600" />
                      {formatDuration(playerCurrentTime)} /{" "}
                      {formatDuration(durationSecs)}
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={taskId !== null}
                    onClick={() => void handlePickMedia()}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50"
                  >
                    {sourceFile ? "Đổi file" : "Chọn file"}
                  </button>
                  {sourceFile && (
                    <button
                      type="button"
                      disabled={taskId !== null}
                      onClick={handleClearSource}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                      title="Gỡ file nguồn"
                    >
                      Gỡ
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-3 p-3.5">
                {!sourceFile ? (
                  <MediaDropZone
                    file={sourceFile}
                    durationSecs={durationSecs}
                    disabled={taskId !== null}
                    onPickFile={() => void handlePickMedia()}
                    onDropFile={(path) => void loadSourcePath(path)}
                    onClear={handleClearSource}
                    onInvalidDrop={(msg) => setErrMsg(msg)}
                  />
                ) : (
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

                    {/* Studio Transport Bar: Speed, Loop, Light Adjustments & In/Out Markers */}
                    <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                            Tốc độ
                          </span>
                          {[0.75, 1, 1.25, 1.5].map((rate) => (
                            <button
                              key={rate}
                              type="button"
                              onClick={() => setPlaybackRate(rate)}
                              className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-bold transition ${
                                playbackRate === rate
                                  ? "bg-indigo-600 text-white"
                                  : "border border-slate-200 bg-white text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                              }`}
                            >
                              {rate}x
                            </button>
                          ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {activeTool === "edit" && (
                            <>
                              <button
                                type="button"
                                onClick={() => capturePlayerTime("start")}
                                className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                                title="Đặt mốc bắt đầu cắt tại vị trí hiện tại"
                              >
                                <Scissors className="h-3 w-3" />
                                Đặt In ({trimStart || "00:00"})
                              </button>
                              <button
                                type="button"
                                onClick={() => capturePlayerTime("end")}
                                className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
                                title="Đặt mốc kết thúc cắt tại vị trí hiện tại"
                              >
                                Đặt Out (
                                {trimEnd ||
                                  (durationSecs
                                    ? formatEditableTimecode(durationSecs)
                                    : "--:--")}
                                )
                              </button>
                            </>
                          )}
                          {scriptResult && (
                            <button
                              type="button"
                              onClick={() => setLoopActiveSegment((v) => !v)}
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold transition ${
                                loopActiveSegment
                                  ? "bg-indigo-600 text-white"
                                  : "border border-slate-200 bg-white text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
                              }`}
                              title="Lặp lại câu phụ đề đang phát để nghe kỹ"
                            >
                              <Repeat className="h-3 w-3" />
                              Loop câu
                            </button>
                          )}
                          {!isSourceAudio && (
                            <button
                              type="button"
                              onClick={() => setShowVideoAdjustPanel((v) => !v)}
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold transition ${
                                showVideoAdjustPanel || hasVideoAdjustments
                                  ? "border border-amber-300 bg-amber-50 text-amber-800"
                                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                              }`}
                              title="Chỉnh độ sáng, tương phản, chống ngược sáng"
                            >
                              <Sun className="h-3 w-3" />
                              Ánh sáng
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Visual Trim Range Scrubber (in Edit mode) */}
                      {activeTool === "edit" &&
                        durationSecs != null &&
                        durationSecs > 0 &&
                        parsedTrimEndSecs != null && (
                          <div className="space-y-1.5 border-t border-slate-200 pt-2">
                            <div className="flex items-center justify-between text-[10px] text-slate-500">
                              <span className="font-semibold text-slate-700">
                                Thanh chọn đoạn cắt{" "}
                                {!editTrim && (
                                  <span className="font-normal text-slate-400">
                                    (kéo hoặc bấm Đặt In/Out để tự bật Cắt đoạn)
                                  </span>
                                )}
                              </span>
                              <span className="font-mono font-semibold text-indigo-600">
                                Giữ lại:{" "}
                                {formatDuration(
                                  Math.max(0, parsedTrimEndSecs - parsedTrimStartSecs)
                                )}
                              </span>
                            </div>

                            {/* Visual track bar */}
                            <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200">
                              <div
                                className={`absolute top-0 bottom-0 rounded-full transition-all ${
                                  editTrim ? "bg-indigo-600" : "bg-slate-400"
                                }`}
                                style={{
                                  left: `${(parsedTrimStartSecs / durationSecs) * 100}%`,
                                  width: `${Math.max(
                                    2,
                                    ((parsedTrimEndSecs - parsedTrimStartSecs) /
                                      durationSecs) *
                                      100
                                  )}%`,
                                }}
                              />
                              <div
                                className="absolute top-0 bottom-0 w-0.5 bg-amber-500"
                                style={{
                                  left: `${Math.min(
                                    100,
                                    (playerCurrentTime / durationSecs) * 100
                                  )}%`,
                                }}
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                              <label className="flex items-center gap-2 text-slate-600">
                                <span className="shrink-0 font-mono font-semibold text-slate-700">
                                  In: {formatEditableTimecode(parsedTrimStartSecs)}
                                </span>
                                <input
                                  type="range"
                                  min={0}
                                  max={Math.max(0.5, durationSecs - 0.5)}
                                  step={0.5}
                                  value={parsedTrimStartSecs}
                                  onChange={(e) =>
                                    handleTimelineRangeChange(
                                      "start",
                                      Number(e.target.value)
                                    )
                                  }
                                  className="w-full accent-indigo-600"
                                />
                              </label>
                              <label className="flex items-center gap-2 text-slate-600">
                                <span className="shrink-0 font-mono font-semibold text-slate-700">
                                  Out: {formatEditableTimecode(parsedTrimEndSecs)}
                                </span>
                                <input
                                  type="range"
                                  min={0.5}
                                  max={durationSecs}
                                  step={0.5}
                                  value={parsedTrimEndSecs}
                                  onChange={(e) =>
                                    handleTimelineRangeChange(
                                      "end",
                                      Number(e.target.value)
                                    )
                                  }
                                  className="w-full accent-indigo-600"
                                />
                              </label>
                            </div>
                          </div>
                        )}

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

                          <div className="grid gap-1.5 text-[10px] text-slate-600">
                            <label className="flex items-center gap-2">
                              <span className="w-24 shrink-0 font-semibold">
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
                              <span className="w-24 shrink-0 font-semibold">
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
                              <span className="w-24 shrink-0 font-semibold">
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
              </div>
            </div>
          )}

          {activeTool === "script" && scriptResult && (
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

        {/* Right column: Clean Inspector Panel (5 cols) */}
        <div className="space-y-3 lg:col-span-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Inspector — {activeToolInfo.label}
                </h2>
                <p className="text-xs text-slate-500">
                  {activeToolInfo.shortDesc}
                </p>
              </div>
            </div>

            {/* Active Tool Config Panel */}
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              {activeTool === "edit" && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-600">
                      Bật một hoặc nhiều thao tác để FFmpeg xử lý trong{" "}
                      <strong>1 lượt duy nhất</strong>.
                    </p>
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                      Đang chọn {effectiveEditCount}/4
                    </span>
                  </div>

                  {/* 1. Giảm dung lượng */}
                  <div
                    className={`rounded-lg border p-3 transition ${
                      effectiveEditCompress
                        ? "border-indigo-200 bg-white"
                        : "border-slate-200 bg-slate-50/70"
                    }`}
                  >
                    <label
                      className={`flex items-center justify-between gap-2 ${
                        isSourceAudio ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                      }`}
                    >
                      <span className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                        <input
                          type="checkbox"
                          disabled={isSourceAudio || taskId !== null}
                          checked={effectiveEditCompress}
                          onChange={(e) => setEditCompress(e.target.checked)}
                          className="rounded border-slate-300 text-indigo-600"
                        />
                        <Minimize2 className="h-3.5 w-3.5 text-indigo-600" />
                        Giảm dung lượng (MP4 H.264)
                      </span>
                      {isSourceAudio && (
                        <span className="text-[11px] text-slate-400">
                          Chỉ áp dụng cho video
                        </span>
                      )}
                    </label>
                    {effectiveEditCompress && (
                      <div className="mt-2.5 space-y-2 border-t border-slate-100 pt-2.5">
                        <SelectField
                          value={compPreset}
                          onChange={setCompPreset}
                          options={videoPresets.map((p) => ({
                            value: p.key,
                            label: p.label,
                          }))}
                          size="md"
                          className="w-full"
                          ariaLabel="Preset nén video"
                        />
                        <p className="line-clamp-1 text-[11px] text-slate-500">
                          Giảm mạnh dung lượng để gửi Gemini nhanh hơn hoặc chia sẻ dễ dàng mà vẫn giữ rõ lời nói.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* 2. Cắt đoạn */}
                  <div
                    className={`rounded-lg border p-3 transition ${
                      editTrim
                        ? "border-indigo-200 bg-white"
                        : "border-slate-200 bg-slate-50/70"
                    }`}
                  >
                    <label className="flex cursor-pointer items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                        <input
                          type="checkbox"
                          disabled={taskId !== null}
                          checked={editTrim}
                          onChange={(e) => setEditTrim(e.target.checked)}
                          className="rounded border-slate-300 text-indigo-600"
                        />
                        <Scissors className="h-3.5 w-3.5 text-indigo-600" />
                        Cắt đoạn theo mốc thời gian
                      </span>
                    </label>
                    {editTrim && (
                      <div className="mt-2.5 space-y-2.5 border-t border-slate-100 pt-2.5">
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
                                durationSecs
                                  ? formatEditableTimecode(durationSecs)
                                  : "VD: 01:30"
                              }
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
                            />
                          </div>
                        </div>

                        {effectiveEditCompress ? (
                          <p className="line-clamp-1 text-[11px] text-slate-500">
                            Đang bật <strong>Giảm dung lượng</strong> nên FFmpeg sẽ cắt và nén cùng lúc trong 1 lượt (chính xác từng khung hình).
                          </p>
                        ) : (
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
                        )}
                      </div>
                    )}
                  </div>

                  {/* 3. Xóa âm thanh */}
                  <div
                    className={`rounded-lg border p-3 transition ${
                      effectiveEditMute
                        ? "border-indigo-200 bg-white"
                        : "border-slate-200 bg-slate-50/70"
                    }`}
                  >
                    <label
                      className={`flex items-center justify-between gap-2 ${
                        isSourceAudio ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                      }`}
                    >
                      <span className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                        <input
                          type="checkbox"
                          disabled={isSourceAudio || taskId !== null}
                          checked={effectiveEditMute}
                          onChange={(e) => setEditMute(e.target.checked)}
                          className="rounded border-slate-300 text-indigo-600"
                        />
                        <VolumeX className="h-3.5 w-3.5 text-indigo-600" />
                        Xóa âm thanh (<code>-an</code>)
                      </span>
                      {isSourceAudio && (
                        <span className="text-[11px] text-slate-400">
                          Chỉ áp dụng cho video
                        </span>
                      )}
                    </label>
                    {effectiveEditMute && (
                      <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                        Loại bỏ toàn bộ track âm thanh khỏi video đầu ra{effectiveEditCompress ? " trong cùng lượt nén" : " (giữ nguyên luồng hình ảnh gốc nên xử lý cực nhanh)"}.
                      </p>
                    )}
                  </div>

                  {/* 4. Lọc âm & Chỉnh âm lượng */}
                  <div
                    className={`rounded-lg border p-3 transition ${
                      effectiveEditAudioFx
                        ? "border-indigo-200 bg-white"
                        : "border-slate-200 bg-slate-50/70"
                    } ${effectiveEditMute ? "opacity-60" : ""}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                        <Volume2 className="h-3.5 w-3.5 text-indigo-600" />
                        Lọc âm &amp; Độ to/nhỏ
                      </span>
                      {effectiveEditMute ? (
                        <span className="text-[11px] text-slate-400">
                          Đang bật Xóa âm thanh
                        </span>
                      ) : (
                        effectiveEditAudioFx && (
                          <button
                            type="button"
                            disabled={taskId !== null}
                            onClick={() => {
                              setEditEnhanceAudio(false);
                              setEditAudioVolume(1.0);
                            }}
                            className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-slate-500 hover:text-slate-800"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Đặt lại
                          </button>
                        )
                      )}
                    </div>

                    <div className="mt-2.5 space-y-2.5 border-t border-slate-100 pt-2.5">
                      <label
                        className={`flex items-center gap-2 text-xs text-slate-700 ${
                          effectiveEditMute ? "cursor-not-allowed" : "cursor-pointer"
                        }`}
                      >
                        <input
                          type="checkbox"
                          disabled={effectiveEditMute || taskId !== null}
                          checked={!effectiveEditMute && editEnhanceAudio}
                          onChange={(e) => setEditEnhanceAudio(e.target.checked)}
                          className="rounded border-slate-300 text-indigo-600"
                        />
                        <span>
                          Lọc tạp âm &amp; làm rõ giọng nói (<code>highpass/lowpass/dynaudnorm</code>)
                        </span>
                      </label>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700">
                            Âm lượng xuất file:{" "}
                            <span className="font-mono text-indigo-600">
                              {Math.round(editAudioVolume * 100)}%
                            </span>
                          </span>
                          <div className="flex items-center gap-1">
                            {[0.5, 1, 1.5, 2].map((v) => (
                              <button
                                key={v}
                                type="button"
                                disabled={effectiveEditMute || taskId !== null}
                                onClick={() => setEditAudioVolume(v)}
                                className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold transition disabled:opacity-50 ${
                                  Math.abs(editAudioVolume - v) < 0.01
                                    ? "bg-indigo-600 text-white"
                                    : "border border-slate-200 bg-white text-slate-600 hover:bg-indigo-50"
                                }`}
                              >
                                {Math.round(v * 100)}%
                              </button>
                            ))}
                          </div>
                        </div>
                        <input
                          type="range"
                          min={0.25}
                          max={2.5}
                          step={0.05}
                          disabled={effectiveEditMute || taskId !== null}
                          value={editAudioVolume}
                          onChange={(e) =>
                            setEditAudioVolume(Number(e.target.value))
                          }
                          className="w-full accent-indigo-600 disabled:opacity-50"
                        />
                      </div>
                    </div>
                  </div>
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

              {activeTool === "merge" && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-600">
                      Sắp xếp thứ tự các video ở <strong>Dải Storyboard</strong> bên dưới rồi bấm ghép (tối thiểu 2 video).
                    </p>
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                      {mergeQueue.length} clip
                    </span>
                  </div>

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

                  {sessionHistory.some(
                    (h) =>
                      !isAudioFilePath(h.output.output_path) &&
                      /\.(mp4|mov|mkv|webm|avi)$/i.test(h.output.output_path)
                  ) && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="font-semibold text-slate-500">
                        Thêm nhanh từ phiên:
                      </span>
                      {sessionHistory
                        .filter(
                          (h) =>
                            !isAudioFilePath(h.output.output_path) &&
                            /\.(mp4|mov|mkv|webm|avi)$/i.test(
                              h.output.output_path
                            )
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

                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-700">
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

                  <p className="line-clamp-1 text-[11px] text-slate-500">
                    Mẹo: Tự động tách MP3 mono trước khi gửi Gemini giúp giảm ~90% dung lượng upload và tiết kiệm quota token so với gửi video trực tiếp. Đang dùng model: <strong>{model}</strong>.
                  </p>
                </div>
              )}

              {videoToolBlockedOnAudio && (
                <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {isSourceAudio
                    ? "File nguồn đang là file âm thanh (chỉ hỗ trợ Cắt đoạn ở mục này). Hãy bật Cắt đoạn hoặc chuyển sang Tách âm thanh / Tạo Script (AI)."
                    : "Hãy bật ít nhất 1 thao tác chỉnh sửa ở trên để bắt đầu xử lý."}
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

      {/* Bottom Studio Dock: Horizontal Storyboard Track for Merge */}
      {activeTool === "merge" && (() => {
        const mergedPath =
          latestResult?.toolId === "merge"
            ? latestResult.output.output_path
            : null;
        const isShowingMerged =
          mergedPath !== null && mergePreviewPath === mergedPath;
        const totalQueueDuration =
          mergeTimelineEntries[mergeTimelineEntries.length - 1]?.endOffset ??
          null;
        const displayTotalDur = isShowingMerged
          ? (mergePreviewDuration ?? totalQueueDuration)
          : totalQueueDuration;
        const activeMergedIdx = isShowingMerged
          ? mergeTimelineEntries.findIndex(
              ({ startOffset, endOffset }) =>
                startOffset !== null &&
                endOffset !== null &&
                mergeCurrentTime >= startOffset &&
                mergeCurrentTime < endOffset
            )
          : -1;
        const activeSimIdx = !isShowingMerged
          ? mergeActiveIdx !== null && mergeQueue[mergeActiveIdx]
            ? mergeActiveIdx
            : mergeQueue.findIndex((q) => q.path === mergePreviewPath)
          : -1;
        const activeSimStart =
          activeSimIdx >= 0
            ? mergeTimelineEntries[activeSimIdx]?.startOffset ?? null
            : null;
        const simulatedGlobalTime =
          activeSimStart !== null ? activeSimStart + mergeCurrentTime : null;

        return (
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-indigo-600 text-white">
                <Layers className="h-3.5 w-3.5" />
              </span>
              <div>
                <h3 className="text-xs font-bold text-slate-900">
                  Dải Storyboard ghép nối ({mergeQueue.length} clip)
                  {displayTotalDur != null && displayTotalDur > 0 && (
                    <span className="ml-2 font-mono text-[11px] font-semibold text-indigo-600">
                      {isShowingMerged
                        ? `${formatDuration(mergeCurrentTime)} / ${formatDuration(displayTotalDur)}`
                        : simulatedGlobalTime != null
                        ? `${formatDuration(simulatedGlobalTime)} / ${formatDuration(displayTotalDur)}`
                        : `Tổng ${formatDuration(displayTotalDur)}`}
                    </span>
                  )}
                </h3>
                <p className="line-clamp-1 text-[11px] text-slate-500">
                  {activeMergedIdx >= 0
                    ? `Đang phát clip #${activeMergedIdx + 1} (${mergeQueue[activeMergedIdx]?.name}) — bấm vào clip hoặc thanh tiến trình để tua.`
                    : isShowingMerged
                    ? "Bấm vào clip hoặc thanh tiến trình dưới từng clip để tua video thành phẩm."
                    : activeSimIdx >= 0
                    ? `Đang xem thử nối tiếp: clip #${activeSimIdx + 1} (${mergeQueue[activeSimIdx]?.name}) — tự chuyển tiếp clip sau khi hết.`
                    : "Thứ tự phát từ trái sang phải — bấm vào clip để xem thử nối tiếp trên Monitor."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {!isShowingMerged && mergeQueue.length >= 2 && (
                <button
                  type="button"
                  onClick={() =>
                    handleClickMergeStoryboardClip(
                      0,
                      mergeQueue[0],
                      mergeTimelineEntries[0]?.startOffset ?? null
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                >
                  Xem thử nối tiếp
                </button>
              )}
              {mergedPath && mergePreviewPath !== mergedPath && (
                <button
                  type="button"
                  onClick={() => setMergePreviewPath(mergedPath)}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                >
                  Xem thành phẩm
                </button>
              )}
              <button
                type="button"
                disabled={taskId !== null}
                onClick={() => void handlePickMergeVideos()}
                className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Thêm clip
              </button>
            </div>
          </div>

          <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1">
            {mergeTimelineEntries.map(({ item, startOffset, endOffset }, idx) => {
              const isActiveInMerged =
                isShowingMerged &&
                startOffset !== null &&
                endOffset !== null &&
                mergeCurrentTime >= startOffset &&
                mergeCurrentTime < endOffset;
              const isFinishedInMerged =
                isShowingMerged &&
                endOffset !== null &&
                mergeCurrentTime >= endOffset;
              const isPreviewingSingle =
                !isShowingMerged && activeSimIdx === idx;
              const isFinishedInSim =
                !isShowingMerged && activeSimIdx > idx;
              const isFinished = isFinishedInMerged || isFinishedInSim;
              const isPreviewing = isActiveInMerged || isPreviewingSingle;

              const clipDur =
                item.durationSecs ??
                (startOffset !== null && endOffset !== null
                  ? endOffset - startOffset
                  : isPreviewingSingle
                  ? mergePreviewDuration
                  : null);

              let clipPct = 0;
              if (isShowingMerged && startOffset !== null && endOffset !== null) {
                const span = Math.max(0.1, endOffset - startOffset);
                clipPct = Math.min(
                  100,
                  Math.max(0, ((mergeCurrentTime - startOffset) / span) * 100)
                );
              } else if (isFinishedInSim) {
                clipPct = 100;
              } else if (isPreviewingSingle && clipDur && clipDur > 0) {
                clipPct = Math.min(
                  100,
                  Math.max(0, (mergeCurrentTime / clipDur) * 100)
                );
              }

              return (
                <div
                  key={item.id}
                  className={`flex w-56 shrink-0 flex-col justify-between rounded-xl border p-2.5 transition ${
                    isPreviewing
                      ? "border-indigo-500 bg-indigo-50/60 ring-2 ring-indigo-200"
                      : isFinished
                      ? "border-emerald-300 bg-emerald-50/30"
                      : "border-slate-200 bg-slate-50/70 hover:border-slate-300"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      handleClickMergeStoryboardClip(idx, item, startOffset)
                    }
                    className="text-left"
                    title={
                      mergedPath && startOffset !== null
                        ? `Tua video ghép tới ${formatDuration(startOffset)}`
                        : "Bấm để phát từ clip này và tự chuyển tiếp"
                    }
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold text-white ${
                          isFinished ? "bg-emerald-600" : "bg-indigo-600"
                        }`}
                      >
                        #{idx + 1}
                      </span>
                      {startOffset !== null && endOffset !== null ? (
                        <span className="font-mono text-[10px] font-semibold text-slate-500">
                          {formatDuration(startOffset)} →{" "}
                          {formatDuration(endOffset)}
                        </span>
                      ) : item.durationSecs != null ? (
                        <span className="font-mono text-[10px] text-slate-500">
                          {formatDuration(item.durationSecs)}
                        </span>
                      ) : isPreviewing ? (
                        <span className="text-[10px] font-semibold text-indigo-700">
                          Đang xem
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1.5 truncate text-xs font-semibold text-slate-900">
                      {item.name}
                    </p>
                    <p className="truncate text-[10px] text-slate-400">
                      {item.path}
                    </p>
                  </button>

                  {/* Per-clip progress bar */}
                  <div className="mt-2 space-y-1">
                    <div
                      role="slider"
                      tabIndex={0}
                      aria-label={`Tiến trình clip #${idx + 1}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(clipPct)}
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        if (rect.width <= 0 || !clipDur || clipDur <= 0) return;
                        const ratio = Math.min(
                          1,
                          Math.max(0, (e.clientX - rect.left) / rect.width)
                        );
                        if (mergedPath && startOffset !== null) {
                          const target = startOffset + ratio * clipDur;
                          setMergeCurrentTime(target);
                          if (mergePreviewPath !== mergedPath) {
                            pendingMergeSeekRef.current = target;
                            setMergePreviewPath(mergedPath);
                          } else {
                            seekMediaElementTo(mergePlayerRef.current, target);
                          }
                        } else {
                          const target = ratio * clipDur;
                          setMergeActiveIdx(idx);
                          setMergeCurrentTime(target);
                          if (mergePreviewPath !== item.path) {
                            pendingMergeSeekRef.current = target;
                            setMergePreviewPath(item.path);
                          } else {
                            seekMediaElementTo(mergePlayerRef.current, target);
                          }
                        }
                      }}
                      onKeyDown={(e) => {
                        if (
                          (e.key === "ArrowLeft" || e.key === "ArrowRight") &&
                          clipDur &&
                          clipDur > 0
                        ) {
                          e.preventDefault();
                          const delta = e.key === "ArrowRight" ? 2 : -2;
                          if (isShowingMerged && startOffset !== null) {
                            const next = Math.max(
                              startOffset,
                              Math.min(
                                startOffset + clipDur,
                                mergeCurrentTime + delta
                              )
                            );
                            setMergeCurrentTime(next);
                            seekMediaElementTo(mergePlayerRef.current, next);
                          } else if (isPreviewingSingle) {
                            const next = Math.max(
                              0,
                              Math.min(clipDur, mergeCurrentTime + delta)
                            );
                            setMergeCurrentTime(next);
                            seekMediaElementTo(mergePlayerRef.current, next);
                          }
                        }
                      }}
                      className="h-2 w-full cursor-pointer overflow-hidden rounded-full bg-slate-200"
                      title={
                        clipDur
                          ? "Bấm vào thanh tiến trình để tua trong clip này"
                          : "Đang tải thời lượng clip"
                      }
                    >
                      <div
                        className={`h-full rounded-full transition-[width] duration-150 ${
                          isFinished ? "bg-emerald-500" : "bg-indigo-600"
                        }`}
                        style={{ width: `${clipPct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between font-mono text-[9px] text-slate-500">
                      <span>
                        {isActiveInMerged && startOffset !== null
                          ? `${formatDuration(mergeCurrentTime - startOffset)} / ${formatDuration(clipDur ?? 0)}`
                          : isPreviewingSingle
                          ? `${formatDuration(mergeCurrentTime)} / ${formatDuration(clipDur ?? 0)}`
                          : isFinished
                          ? "Đã phát xong"
                          : clipDur != null
                          ? formatDuration(clipDur)
                          : "--:--"}
                      </span>
                      {isActiveInMerged && displayTotalDur != null && (
                        <span className="font-semibold text-indigo-600">
                          {Math.round(clipPct)}%
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between border-t border-slate-200/80 pt-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0 || taskId !== null}
                        onClick={() => moveMergeItem(idx, -1)}
                        className="rounded border border-slate-200 bg-white p-1 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-40"
                        title="Chuyển sang trái"
                        aria-label="Chuyển sang trái"
                      >
                        <ArrowLeft className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        disabled={
                          idx === mergeQueue.length - 1 || taskId !== null
                        }
                        onClick={() => moveMergeItem(idx, 1)}
                        className="rounded border border-slate-200 bg-white p-1 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-40"
                        title="Chuyển sang phải"
                        aria-label="Chuyển sang phải"
                      >
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={taskId !== null}
                      onClick={() => removeMergeItem(item.id)}
                      className="rounded border border-slate-200 bg-white p-1 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                      title="Xóa khỏi dải ghép"
                      aria-label="Xóa khỏi dải ghép"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              disabled={taskId !== null}
              onClick={() => void handlePickMergeVideos()}
              className="flex min-h-[120px] w-40 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-3 text-xs font-semibold text-slate-500 transition hover:border-indigo-400 hover:bg-indigo-50/40 hover:text-indigo-700 disabled:opacity-50"
            >
              <Plus className="h-5 w-5" />
              <span>Thêm video</span>
            </button>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
