import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  BookmarkPlus,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  FileVideo,
  FolderOpen,
  ImagePlus,
  Minimize2,
  Rocket,
  Save,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  X,
  ZoomIn,
} from "lucide-react";
import { LocalMediaPlayer } from "../components/LocalMediaPlayer";
import { ProgressPanel } from "../components/ProgressPanel";
import { ResultView } from "../components/ResultView";
import { SelectField } from "../components/SelectField";
import { api, LANG_LABELS, TASK_LABELS } from "../lib/api";
import {
  getParentDir,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from "../lib/mediaUtils";
import { formatScoreNum, slugifyRubricId } from "../lib/rubricUtils";
import { useFileDrop } from "../lib/useFileDrop";
import type {
  AppBootstrap,
  AssessmentDetail,
  AssignmentImage,
  FileInfo,
  GradingAssignment,
  PromptProfile,
  Rubric,
  VideoPreset,
} from "../lib/types";

interface GradePageProps {
  apiKeyInput: string;
  model: string;
  mediaResolution: string;
  rubrics: Rubric[];
  gradingAssignments: GradingAssignment[];
  promptProfiles: PromptProfile[];
  activePromptProfileId: string;
  videoPresets: VideoPreset[];
  ffmpegAvailable: boolean;
  exportDir: string;
  hasCustomExportDir: boolean;
  onBootstrapUpdated: (next: AppBootstrap) => void;
  onAssignmentsChanged: (next: GradingAssignment[]) => void;
}

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const FLEX_SCALE_PRESETS = [10, 20, 100];

const FLEX_ROUNDING_OPTIONS = [
  { value: "0.5", label: "Làm tròn 0.5" },
  { value: "0.25", label: "Làm tròn 0.25" },
  { value: "0.1", label: "Làm tròn 0.1" },
  { value: "1", label: "Số nguyên (1)" },
  { value: "", label: "Không làm tròn" },
];

const QUICK_REQUIREMENT_CHIPS = [
  {
    label: "+ Chia điểm 4-3-3",
    text: "Nội dung & đúng đề (4đ), Phát âm & Trôi chảy (3đ), Từ vựng & Ngữ pháp (3đ).",
  },
  {
    label: "+ Thời lượng ≥ 1p30",
    text: "Thời lượng nói tối thiểu 1 phút 30 giây (nói quá ngắn trừ điểm).",
  },
  {
    label: "+ Đúng từ vựng bài",
    text: "Kiểm tra việc sử dụng từ vựng và cấu trúc ngữ pháp mục tiêu của bài.",
  },
  {
    label: "+ Trừ đọc kịch bản",
    text: "Nếu học sinh nhìn giấy đọc máy móc, thiếu tự nhiên thì trừ điểm.",
  },
];

function readClipboardImageFile(file: File): Promise<AssignmentImage> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_IMAGE_BYTES) {
      reject(
        new Error(
          `Ảnh dán quá lớn (${(file.size / (1024 * 1024)).toFixed(1)} MB). Giới hạn tối đa mỗi ảnh là 15 MB.`
        )
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIdx = result.indexOf(",");
      if (commaIdx < 0) {
        reject(new Error("Không đọc được dữ liệu ảnh từ clipboard."));
        return;
      }
      const dataBase64 = result.slice(commaIdx + 1);
      const mimeType = file.type || "image/png";
      const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "png";
      const fileName =
        file.name && file.name !== "image.png"
          ? file.name
          : `anh_de_${Date.now()}.${ext}`;
      resolve({
        name: fileName,
        mime_type: mimeType,
        data_base64: dataBase64,
      });
    };
    reader.onerror = () =>
      reject(new Error("Không thể đọc ảnh từ clipboard."));
    reader.readAsDataURL(file);
  });
}

function parseTimestampToSeconds(ts: string): number | null {
  const parts = ts
    .trim()
    .split(":")
    .map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export function GradePage({
  apiKeyInput,
  model,
  mediaResolution,
  rubrics,
  gradingAssignments,
  promptProfiles,
  activePromptProfileId,
  videoPresets,
  ffmpegAvailable,
  exportDir,
  hasCustomExportDir,
  onBootstrapUpdated,
  onAssignmentsChanged,
}: GradePageProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoDropRef = useRef<HTMLDivElement | null>(null);
  const imageDropRef = useRef<HTMLDivElement | null>(null);

  const [videoInfo, setVideoInfo] = useState<FileInfo | null>(null);
  const [origFileInfo, setOrigFileInfo] = useState<FileInfo | null>(null);

  const [compressOpen, setCompressOpen] = useState(false);
  const [compressPreset, setCompressPreset] = useState("balanced");
  const [compressing, setCompressing] = useState(false);
  const [configDrawerOpen, setConfigDrawerOpen] = useState(false);

  const [gradingMode, setGradingMode] = useState<"flexible" | "rubric">("flexible");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [assignmentName, setAssignmentName] = useState("");
  const [flexibleMaxScore, setFlexibleMaxScore] = useState<number>(10);
  const [flexibleRoundingStep, setFlexibleRoundingStep] = useState<string>("0.5");
  const [images, setImages] = useState<AssignmentImage[]>([]);
  const [previewImage, setPreviewImage] = useState<AssignmentImage | null>(null);
  const [savePanelOpen, setSavePanelOpen] = useState(false);
  const [saveNameInput, setSaveNameInput] = useState("");
  const [savingAssignment, setSavingAssignment] = useState(false);

  const [rubricId, setRubricId] = useState(rubrics[0]?.id ?? "ielts_speaking");
  const [promptProfileId, setPromptProfileId] = useState(
    activePromptProfileId || "default"
  );
  const [taskType, setTaskType] = useState("presentation");

  useEffect(() => {
    if (promptProfiles.some((p) => p.id === activePromptProfileId)) {
      setPromptProfileId(activePromptProfileId);
    }
  }, [activePromptProfileId, promptProfiles]);
  const [feedbackLang, setFeedbackLang] = useState("vi");
  const [studentNames, setStudentNames] = useState("");
  const [extraInstructions, setExtraInstructions] = useState("");

  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [progressStage, setProgressStage] = useState("");
  const [progressPercent, setProgressPercent] = useState<number | null>(null);

  const [statusMsg, setStatusMsg] = useState(
    "Sẵn sàng. Chọn video bài nói, nêu yêu cầu hoặc đính kèm ảnh đề bài rồi bấm Chấm điểm."
  );
  const [errorMsg, setErrorMsg] = useState("");
  const [resultDetail, setResultDetail] = useState<AssessmentDetail | null>(null);
  const [excelPath, setExcelPath] = useState<string | null>(null);

  async function loadImagesFromPaths(paths: string[]) {
    if (paths.length === 0) return;
    setErrorMsg("");
    try {
      const loaded = await Promise.all(paths.map((p) => api.loadImageFile(p)));
      setImages((prev) => [...prev, ...loaded]);
      setStatusMsg(`✅ Đã đính kèm thêm ${loaded.length} ảnh đề bài.`);
    } catch (e) {
      setErrorMsg(String(e));
    }
  }

  async function handlePickImages() {
    setErrorMsg("");
    const paths = await api.pickImageFiles();
    if (paths.length === 0) return;
    await loadImagesFromPaths(paths);
  }

  function removeImage(idx: number) {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  }

  useEffect(() => {
    function handleWindowPaste(e: ClipboardEvent) {
      if (busyTaskId !== null) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) imageFiles.push(f);
        }
      }
      if (imageFiles.length === 0) return;
      e.preventDefault();
      setErrorMsg("");
      void Promise.all(imageFiles.map((f) => readClipboardImageFile(f)))
        .then((loaded) => {
          setImages((prev) => [...prev, ...loaded]);
          setStatusMsg(`✅ Đã dán ${loaded.length} ảnh đề bài từ clipboard.`);
        })
        .catch((err) => setErrorMsg(String(err)));
    }

    window.addEventListener("paste", handleWindowPaste);
    return () => window.removeEventListener("paste", handleWindowPaste);
  }, [busyTaskId]);

  function handleSelectAssignment(nextId: string) {
    setErrorMsg("");
    setSavePanelOpen(false);
    setSelectedAssignmentId(nextId);
    if (!nextId) {
      setAssignmentName("");
      return;
    }
    const found = gradingAssignments.find((a) => a.id === nextId);
    if (!found) return;
    setAssignmentName(found.name);
    setGradingMode(found.mode === "rubric" ? "rubric" : "flexible");
    if (found.rubric_id && rubrics.some((r) => r.id === found.rubric_id)) {
      setRubricId(found.rubric_id);
    }
    setFlexibleMaxScore(found.max_score > 0 ? found.max_score : 10);
    setFlexibleRoundingStep(
      typeof found.rounding_step === "number" && found.rounding_step > 0
        ? String(found.rounding_step)
        : ""
    );
    setExtraInstructions(found.requirements ?? "");
    if (found.task_type) setTaskType(found.task_type);
    if (found.feedback_lang) setFeedbackLang(found.feedback_lang);
    if (
      found.prompt_profile_id &&
      promptProfiles.some((p) => p.id === found.prompt_profile_id)
    ) {
      setPromptProfileId(found.prompt_profile_id);
    }
    setImages(found.images ?? []);
    setStatusMsg(
      `✅ Đã nạp đợt chấm "${found.name}". Chỉ cần đổi video tiếp theo và bấm Chấm điểm.`
    );
  }

  function handleOpenSavePanel() {
    setErrorMsg("");
    if (savePanelOpen) {
      setSavePanelOpen(false);
      return;
    }
    const existing = gradingAssignments.find(
      (a) => a.id === selectedAssignmentId
    );
    setSaveNameInput(existing?.name || assignmentName || "");
    setSavePanelOpen(true);
  }

  async function handleSaveAssignment(asNew: boolean) {
    const cleanName = saveNameInput.trim();
    if (!cleanName) {
      setErrorMsg("Hãy nhập tên cho đợt chấm / đề bài trước khi lưu.");
      return;
    }
    setErrorMsg("");
    setSavingAssignment(true);
    try {
      const targetId =
        !asNew && selectedAssignmentId
          ? selectedAssignmentId
          : `${slugifyRubricId(cleanName)}_${Date.now().toString().slice(-4)}`;
      const payload: GradingAssignment = {
        id: targetId,
        name: cleanName,
        mode: gradingMode,
        rubric_id: gradingMode === "rubric" ? rubricId : null,
        max_score:
          Number.isFinite(flexibleMaxScore) && flexibleMaxScore > 0
            ? flexibleMaxScore
            : 10,
        rounding_step: flexibleRoundingStep ? Number(flexibleRoundingStep) : null,
        requirements: extraInstructions,
        task_type: taskType,
        feedback_lang: feedbackLang,
        prompt_profile_id: promptProfileId || null,
        images,
      };
      const updated = await api.saveGradingAssignment(payload);
      onAssignmentsChanged(updated);
      setSelectedAssignmentId(targetId);
      setAssignmentName(cleanName);
      setSavePanelOpen(false);
      setStatusMsg(
        `✅ Đã lưu đợt chấm "${cleanName}" (${images.length} ảnh đề). Các video sau chỉ cần đổi video rồi bấm Chấm điểm.`
      );
    } catch (e) {
      setErrorMsg(String(e));
    } finally {
      setSavingAssignment(false);
    }
  }

  const [confirmDeleteAssignmentOpen, setConfirmDeleteAssignmentOpen] =
    useState(false);

  function handleDeleteAssignment() {
    if (!selectedAssignmentId) return;
    setConfirmDeleteAssignmentOpen(true);
  }

  async function executeDeleteAssignment() {
    if (!selectedAssignmentId) return;
    setConfirmDeleteAssignmentOpen(false);
    const found = gradingAssignments.find((a) => a.id === selectedAssignmentId);
    setErrorMsg("");
    try {
      const updated = await api.deleteGradingAssignment(selectedAssignmentId);
      onAssignmentsChanged(updated);
      setSelectedAssignmentId("");
      setAssignmentName("");
      setSavePanelOpen(false);
      setStatusMsg(`🗑️ Đã xóa đợt chấm "${found?.name ?? ""}".`);
    } catch (e) {
      setErrorMsg(String(e));
    }
  }

  function appendQuickRequirement(snippet: string) {
    setExtraInstructions((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return snippet;
      if (trimmed.includes(snippet)) return prev;
      return `${trimmed}\n${snippet}`;
    });
  }

  async function loadVideoFromPath(path: string) {
    setErrorMsg("");
    try {
      const info = await api.inspectFile(path);
      setVideoInfo(info);
      setOrigFileInfo(info);
      setStatusMsg(`Đã chọn video: ${info.name} (${info.size_mb.toFixed(2)} MB).`);
    } catch (e) {
      setErrorMsg(String(e));
    }
  }

  async function handlePickVideo() {
    setErrorMsg("");
    const path = await api.pickVideoFile();
    if (!path) return;
    await loadVideoFromPath(path);
  }

  const { isDraggingOver: isVideoDragging } = useFileDrop({
    targetRef: videoDropRef,
    disabled: busyTaskId !== null,
    acceptedExtensions: VIDEO_EXTENSIONS,
    onDropFiles: (paths) => {
      if (paths[0]) void loadVideoFromPath(paths[0]);
    },
    onRejected: (msg) => setErrorMsg(msg),
  });

  const { isDraggingOver: isImageDragging } = useFileDrop({
    targetRef: imageDropRef,
    disabled: busyTaskId !== null,
    acceptedExtensions: IMAGE_EXTENSIONS,
    onDropFiles: (paths) => {
      void loadImagesFromPaths(paths);
    },
    onRejected: (msg) => setErrorMsg(msg),
  });

  async function handleCompressInline() {
    const source = origFileInfo ?? videoInfo;
    if (!source) {
      setErrorMsg("Hãy chọn video trước khi nén.");
      return;
    }
    setErrorMsg("");
    const taskId = `compress_${Date.now()}`;
    setCompressing(true);
    setBusyTaskId(taskId);
    setProgressStage("Đang chuẩn bị nén video...");
    setProgressPercent(0);

    const unlisten = await api.listenProgress(taskId, (p) => {
      setProgressStage(p.stage);
      setProgressPercent(p.percent);
    });

    try {
      const outDirOverride = hasCustomExportDir
        ? exportDir
        : getParentDir(source.path) || undefined;
      const out = await api.compressVideo({
        taskId,
        videoPath: source.path,
        preset: compressPreset,
        outDirOverride,
      });
      const newInfo = await api.inspectFile(out.output_path);
      setVideoInfo(newInfo);
      const savedPct =
        source.size_mb > 0
          ? ((1 - out.size_mb / source.size_mb) * 100).toFixed(1)
          : "0";
      setStatusMsg(
        `✅ Đã nén xong: ${out.file_name} (${out.size_mb.toFixed(2)} MB — giảm ${savedPct}% từ ${source.size_mb.toFixed(2)} MB). Sẵn sàng chấm bài!`
      );
    } catch (e) {
      setErrorMsg(String(e));
    } finally {
      unlisten();
      setCompressing(false);
      setBusyTaskId(null);
    }
  }

  async function handleChooseExportDir() {
    setErrorMsg("");
    const dir = await api.pickFolder("Chọn thư mục lưu kết quả mặc định");
    if (!dir) return;
    try {
      const updated = await api.saveSettings({ export_dir: dir });
      onBootstrapUpdated(updated);
      setStatusMsg(`✅ Đã lưu thư mục xuất mặc định: ${updated.export_dir}`);
    } catch (e) {
      setErrorMsg(String(e));
    }
  }

  async function handleGrade() {
    if (!videoInfo) {
      setErrorMsg("Chưa chọn video bài nói.");
      return;
    }
    if (
      gradingMode === "flexible" &&
      !extraInstructions.trim() &&
      images.length === 0
    ) {
      setErrorMsg(
        "Chế độ chấm linh hoạt cần nhập yêu cầu chấm hoặc đính kèm ít nhất 1 ảnh đề bài."
      );
      return;
    }
    setErrorMsg("");
    const taskId = `grade_${Date.now()}`;
    setBusyTaskId(taskId);
    setProgressStage("Đang kết nối Gemini...");
    setProgressPercent(2);

    const unlisten = await api.listenProgress(taskId, (p) => {
      setProgressStage(p.stage);
      setProgressPercent(p.percent);
    });

    try {
      const resp = await api.gradeVideo({
        task_id: taskId,
        api_key: apiKeyInput.trim() || undefined,
        video_path: videoInfo.path,
        rubric_id: rubricId,
        task_type: taskType,
        feedback_lang: feedbackLang,
        model,
        student_names_raw: studentNames,
        extra_instructions: extraInstructions,
        media_resolution: mediaResolution,
        prompt_profile_id: promptProfileId,
        grading_mode: gradingMode,
        assignment_name:
          gradingMode === "flexible"
            ? assignmentName.trim() || undefined
            : undefined,
        flexible_max_score:
          gradingMode === "flexible" ? flexibleMaxScore : undefined,
        flexible_rounding_step:
          gradingMode === "flexible"
            ? flexibleRoundingStep
              ? Number(flexibleRoundingStep)
              : null
            : undefined,
        images,
      });
      setResultDetail(resp.detail);
      setExcelPath(resp.excel_path);
      setStatusMsg(
        `✅ Đã chấm ${resp.detail.students.length} học sinh.${
          resp.reused_upload_cache
            ? " (Dùng lại video đã tải trên Gemini — siêu nhanh)"
            : ""
        } ${
          gradingMode === "flexible"
            ? "Yêu cầu & ảnh đề được giữ nguyên — chỉ cần chọn video tiếp theo để chấm tiếp cả đợt."
            : "Đổi rubric / loại bài / ngôn ngữ rồi bấm Chấm điểm lại sẽ không cần upload lại video."
        }`
      );
    } catch (e) {
      setErrorMsg(String(e));
    } finally {
      unlisten();
      setBusyTaskId(null);
    }
  }

  async function handleCancel() {
    if (!busyTaskId) return;
    await api.cancelTask(busyTaskId);
  }

  function handleSeek(ts: string) {
    const secs = parseTimestampToSeconds(ts);
    if (secs !== null && videoRef.current) {
      videoRef.current.currentTime = secs;
      void videoRef.current.play();
    }
  }

  const activeAssignmentName =
    gradingAssignments.find((a) => a.id === selectedAssignmentId)?.name ??
    "Đề mới / Chấm lẻ";
  const activeRubricName =
    rubrics.find((r) => r.id === rubricId)?.name ?? rubricId;

  return (
    <div className="space-y-3">
      {/* Compact Assignment Context Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-xs">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-slate-500">Đợt chấm:</span>
          <SelectField
            value={selectedAssignmentId}
            onChange={handleSelectAssignment}
            disabled={busyTaskId !== null}
            options={[
              { value: "", label: "— Soạn đề mới / Chấm lẻ —" },
              ...gradingAssignments.map((a) => ({
                value: a.id,
                label: a.name,
                badge: `${
                  a.mode === "flexible"
                    ? `Linh hoạt · ${formatScoreNum(a.max_score)}đ`
                    : "Rubric"
                }${a.images.length > 0 ? ` · ${a.images.length} ảnh` : ""}`,
              })),
            ]}
            size="xs"
            className="min-w-[200px]"
            ariaLabel="Chọn nhanh đợt chấm hoặc đề bài đã lưu"
          />
          <span className="hidden rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 sm:inline-flex">
            {gradingMode === "flexible"
              ? `Linh hoạt · ${formatScoreNum(flexibleMaxScore)}đ`
              : `Rubric: ${activeRubricName}`}
          </span>
          {images.length > 0 && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
              {images.length} ảnh đề
            </span>
          )}
          <span className="hidden rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 lg:inline-flex">
            {TASK_LABELS[taskType] ?? taskType} · {LANG_LABELS[feedbackLang] ?? feedbackLang}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setConfigDrawerOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Chỉnh sửa đề &amp; cấu hình
        </button>
      </div>

      <div className="grid items-start gap-4 md:grid-cols-12">
        {/* Left column: Video + Student Name + Primary CTA (always fits above the fold) */}
        <div className="space-y-3 md:sticky md:top-4 md:col-span-5 xl:col-span-4">
          <div
            ref={videoDropRef}
            className={`rounded-xl border bg-white p-3.5 shadow-xs transition ${
              isVideoDragging
                ? "border-indigo-500 ring-2 ring-indigo-500/30"
                : "border-slate-200"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-800">
                1. Video bài nói
              </h2>
              <button
                type="button"
                onClick={handlePickVideo}
                disabled={busyTaskId !== null}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5" />
                Chọn video
              </button>
            </div>

            {videoInfo ? (
              <div className="mt-2.5 space-y-2">
                <LocalMediaPlayer
                  ref={videoRef}
                  path={videoInfo.path}
                  kind="video"
                />
                <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
                  <span className="truncate font-medium" title={videoInfo.path}>
                    {videoInfo.name}
                  </span>
                  <span className="shrink-0 font-semibold text-indigo-700">
                    {videoInfo.size_mb.toFixed(2)} MB
                    {origFileInfo &&
                      origFileInfo.path !== videoInfo.path &&
                      origFileInfo.size_mb > 0 && (
                        <span className="ml-1 text-emerald-600">
                          (-
                          {(
                            (1 - videoInfo.size_mb / origFileInfo.size_mb) *
                            100
                          ).toFixed(0)}
                          %)
                        </span>
                      )}
                  </span>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handlePickVideo}
                className="mt-2.5 flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center hover:border-indigo-300 hover:bg-indigo-50/30"
              >
                <FileVideo className="h-7 w-7 text-slate-400" />
                <span className="mt-1.5 text-sm font-medium text-slate-700">
                  {isVideoDragging
                    ? "Thả video vào đây ngay..."
                    : "Kéo thả hoặc bấm để chọn file video (.mp4, .mov, .webm...)"}
                </span>
                <span className="mt-0.5 text-xs text-slate-400">
                  Hỗ trợ tối đa 2GB qua Gemini Files API
                </span>
              </button>
            )}

            {/* Accordion nén video */}
            <div className="mt-2.5 border-t border-slate-100 pt-2.5">
              <button
                type="button"
                onClick={() => setCompressOpen((v) => !v)}
                className="flex w-full items-center justify-between text-left text-xs font-semibold text-slate-700 hover:text-indigo-700"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Minimize2 className="h-3.5 w-3.5" />
                  Nén video trước khi gửi (tiết kiệm TPM)
                </span>
                {compressOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>

              {compressOpen && (
                <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-2.5">
                  {!ffmpegAvailable && (
                    <p className="text-xs text-amber-700">
                      ⚠️ Chưa tìm thấy ffmpeg. Hãy cài ffmpeg hoặc cấu hình trong tab Cài đặt.
                    </p>
                  )}
                  <SelectField
                    value={compressPreset}
                    onChange={setCompressPreset}
                    options={videoPresets.map((p) => ({
                      value: p.key,
                      label: p.label,
                    }))}
                    size="xs"
                    ariaLabel="Preset nén video"
                  />
                  <button
                    type="button"
                    onClick={handleCompressInline}
                    disabled={!videoInfo || compressing || busyTaskId !== null || !ffmpegAvailable}
                    className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                  >
                    {compressing ? "Đang nén video..." : "Thực hiện nén từ file gốc"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Compact Student & Primary Action Card */}
          <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
            <div>
              <label className="block text-xs font-semibold text-slate-600">
                2. Tên học sinh (tùy chọn)
              </label>
              <input
                type="text"
                value={studentNames}
                onChange={(e) => setStudentNames(e.target.value)}
                placeholder="VD: An, Bình — để trống nếu muốn AI tự lấy tên"
                className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={handleGrade}
              disabled={!videoInfo || busyTaskId !== null}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Rocket className="h-4 w-4" />
              {busyTaskId && !compressing ? "Đang chấm bài..." : "Chấm điểm bằng AI"}
            </button>
          </div>
        </div>

        {/* Right column: Status, Progress, Results */}
        <div className="space-y-3 md:col-span-7 xl:col-span-8">
        {busyTaskId && (
          <ProgressPanel
            stage={progressStage}
            percent={progressPercent}
            onCancel={handleCancel}
          />
        )}

        {errorMsg && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            ❌ {errorMsg}
          </div>
        )}

        {!errorMsg && statusMsg && (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700">
            {statusMsg}
          </div>
        )}

        {resultDetail ? (
          <ResultView
            detail={resultDetail}
            excelPath={excelPath}
            onDetailUpdated={(updated) => setResultDetail(updated)}
            onSeekVideo={handleSeek}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 p-6">
            <div className="mx-auto max-w-xl text-center">
              <p className="text-sm font-semibold text-slate-700">
                Kết quả bảng điểm chi tiết, nhận xét và dẫn chứng timestamp sẽ hiển thị tại đây
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Chọn video bên trái, nhập yêu cầu (hoặc dán ảnh đề bài) rồi bấm{" "}
                <span className="font-semibold text-indigo-600">Chấm điểm bằng AI</span>.
              </p>
              <div className="mt-4 grid gap-2.5 text-left text-xs sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="font-bold text-slate-800">1. Chấm linh hoạt &amp; Ảnh đề</div>
                  <p className="mt-0.5 text-slate-500">
                    Nêu yêu cầu tự nhiên, dán ảnh đề (Ctrl+V) và lưu thành đợt chấm dùng cho nhiều video.
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="font-bold text-slate-800">2. Nhảy mốc video</div>
                  <p className="mt-0.5 text-slate-500">
                    Bấm timestamp trong dẫn chứng để tua nhanh đoạn nói.
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="font-bold text-slate-800">3. Xuất Excel &amp; Lịch sử</div>
                  <p className="mt-0.5 text-slate-500">
                    Tự động lưu lịch sử SQLite và xuất file .xlsx chỉnh sửa được.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Slide-over Grading Configuration Drawer */}
      {configDrawerOpen && (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-black/35 backdrop-blur-[1px]"
          onClick={() => setConfigDrawerOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Thiết lập đề bài & cấu hình chấm"
            className="flex h-full w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-900">
                  Thiết lập đề bài &amp; cấu hình chấm
                </h2>
                <p className="truncate text-xs text-slate-500">
                  Đang chọn: {activeAssignmentName}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenSavePanel}
                  disabled={busyTaskId !== null}
                  className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                  title="Lưu yêu cầu, thang điểm và ảnh đề thành đợt chấm dùng lại nhiều video"
                >
                  <BookmarkPlus className="h-3.5 w-3.5" />
                  {selectedAssignmentId ? "Lưu / Cập nhật đề" : "Lưu đợt chấm"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfigDrawerOpen(false)}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  aria-label="Đóng bảng cấu hình"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 space-y-3.5 overflow-y-auto p-5">
              {/* Saved Assignment Selector */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
                <label className="block text-[11px] font-semibold text-slate-600">
                  Đợt chấm / Đề bài đã lưu
                </label>
                <div className="mt-1 flex items-center gap-1.5">
                  <SelectField
                    value={selectedAssignmentId}
                    onChange={handleSelectAssignment}
                    disabled={busyTaskId !== null}
                    options={[
                      { value: "", label: "— Soạn đề mới / Chấm lẻ —" },
                      ...gradingAssignments.map((a) => ({
                        value: a.id,
                        label: a.name,
                        badge: `${
                          a.mode === "flexible"
                            ? `Linh hoạt · ${formatScoreNum(a.max_score)}đ`
                            : "Rubric"
                        }${a.images.length > 0 ? ` · ${a.images.length} ảnh` : ""}`,
                      })),
                    ]}
                    size="xs"
                    className="min-w-0 flex-1"
                    ariaLabel="Chọn đợt chấm hoặc đề bài đã lưu"
                  />
                  {selectedAssignmentId && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteAssignment()}
                      disabled={busyTaskId !== null}
                      className="rounded-lg border border-rose-200 bg-white p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                      title="Xóa đợt chấm đã lưu này"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {savePanelOpen && (
                  <div className="mt-2 space-y-2 rounded-lg border border-indigo-200 bg-white p-2.5">
                    <label className="block text-[11px] font-semibold text-slate-700">
                      Tên đợt chấm / đề bài
                    </label>
                    <input
                      type="text"
                      value={saveNameInput}
                      onChange={(e) => setSaveNameInput(e.target.value)}
                      placeholder="VD: Lớp 8A - Speaking Unit 5 Giữa kỳ"
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-indigo-400 focus:outline-none"
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      {selectedAssignmentId ? (
                        <>
                          <button
                            type="button"
                            disabled={savingAssignment}
                            onClick={() => void handleSaveAssignment(false)}
                            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                          >
                            <Save className="h-3 w-3" />
                            Cập nhật đề này
                          </button>
                          <button
                            type="button"
                            disabled={savingAssignment}
                            onClick={() => void handleSaveAssignment(true)}
                            className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                          >
                            Lưu thành đề mới
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={savingAssignment}
                          onClick={() => void handleSaveAssignment(true)}
                          className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          <Save className="h-3 w-3" />
                          Lưu đợt chấm
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSavePanelOpen(false)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Hủy
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Mode Toggle: Flexible vs Standard Rubric */}
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setGradingMode("flexible")}
                  disabled={busyTaskId !== null}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                    gradingMode === "flexible"
                      ? "bg-white text-indigo-700 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Linh hoạt theo Đề bài
                </button>
                <button
                  type="button"
                  onClick={() => setGradingMode("rubric")}
                  disabled={busyTaskId !== null}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition ${
                    gradingMode === "rubric"
                      ? "bg-white text-indigo-700 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Theo Rubric chuẩn
                </button>
              </div>

              {gradingMode === "flexible" ? (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-7">
                      <label className="block text-[11px] font-semibold text-slate-600">
                        Thang điểm tổng
                      </label>
                      <div className="mt-1 flex items-center gap-1">
                        {FLEX_SCALE_PRESETS.map((sc) => {
                          const active = Math.abs(flexibleMaxScore - sc) < 1e-6;
                          return (
                            <button
                              key={sc}
                              type="button"
                              onClick={() => setFlexibleMaxScore(sc)}
                              className={`rounded-md border px-2 py-1 text-xs font-semibold transition ${
                                active
                                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              {sc}
                            </button>
                          );
                        })}
                        <input
                          type="number"
                          min="1"
                          step="0.5"
                          value={flexibleMaxScore}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            if (Number.isFinite(val) && val > 0) {
                              setFlexibleMaxScore(val);
                            }
                          }}
                          aria-label="Thang điểm tối đa tùy chỉnh"
                          className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold focus:border-indigo-400 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="col-span-5">
                      <label className="block text-[11px] font-semibold text-slate-600">
                        Làm tròn
                      </label>
                      <SelectField
                        value={flexibleRoundingStep}
                        onChange={setFlexibleRoundingStep}
                        options={FLEX_ROUNDING_OPTIONS}
                        size="xs"
                        className="mt-1 w-full"
                        ariaLabel="Bước làm tròn điểm"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-semibold text-slate-600">
                        Yêu cầu chấm &amp; Nội dung đề bài
                      </label>
                      {extraInstructions.trim() && (
                        <button
                          type="button"
                          onClick={() => setExtraInstructions("")}
                          className="text-[11px] font-medium text-slate-400 hover:text-rose-600"
                        >
                          Xóa chữ
                        </button>
                      )}
                    </div>
                    <textarea
                      rows={4}
                      value={extraInstructions}
                      onChange={(e) => setExtraInstructions(e.target.value)}
                      placeholder="VD: Chấm bài nói Unit 5 theo đề trong ảnh. Trả lời đủ 4 câu hỏi (4đ), phát âm & trôi chảy (3đ), từ vựng & ngữ pháp (3đ). Nói dưới 1 phút trừ 1đ."
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs leading-relaxed focus:border-indigo-400 focus:outline-none"
                    />
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {QUICK_REQUIREMENT_CHIPS.map((chip) => (
                        <button
                          key={chip.label}
                          type="button"
                          onClick={() => appendQuickRequirement(chip.text)}
                          className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600">
                      Rubric (tiêu chuẩn chấm)
                    </label>
                    <SelectField
                      value={rubricId}
                      onChange={setRubricId}
                      options={rubrics.map((r) => ({
                        value: r.id,
                        label: r.name,
                        badge: r.is_builtin ? "Mặc định" : "Tùy chỉnh",
                      }))}
                      size="sm"
                      className="mt-1 w-full"
                      ariaLabel="Rubric tiêu chuẩn chấm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600">
                      Yêu cầu bổ sung (tùy chọn)
                    </label>
                    <textarea
                      rows={2}
                      value={extraInstructions}
                      onChange={(e) => setExtraInstructions(e.target.value)}
                      placeholder="VD: chú trọng phát âm; bỏ qua phần chào hỏi..."
                      className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Multimodal Exam / Prompt Images Dropzone */}
              <div
                ref={imageDropRef}
                className={`rounded-xl border border-dashed p-2.5 transition ${
                  isImageDragging
                    ? "border-indigo-500 bg-indigo-50/40 ring-2 ring-indigo-500/20"
                    : "border-slate-200 bg-slate-50/60"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                    <ImagePlus className="h-3.5 w-3.5 text-indigo-600" />
                    Ảnh đề bài / Slide / Tranh ({images.length})
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200">
                      <ClipboardPaste className="h-2.5 w-2.5" />
                      Ctrl+V dán
                    </span>
                    <button
                      type="button"
                      onClick={() => void handlePickImages()}
                      disabled={busyTaskId !== null}
                      className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                    >
                      + Chọn ảnh
                    </button>
                  </div>
                </div>

                {images.length === 0 ? (
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    {isImageDragging
                      ? "Thả ảnh đề bài vào đây..."
                      : "Tùy chọn: chọn file, kéo thả hoặc bấm Ctrl+V để dán ảnh chụp đề bài / tranh cho AI đối chiếu."}
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {images.map((img, idx) => (
                      <div
                        key={`${img.name}-${idx}`}
                        className="group relative h-16 w-16 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs"
                      >
                        <button
                          type="button"
                          onClick={() => setPreviewImage(img)}
                          className="block h-full w-full"
                          title={`Xem phóng to: ${img.name}`}
                        >
                          <img
                            src={`data:${img.mime_type};base64,${img.data_base64}`}
                            alt={img.name}
                            className="h-full w-full object-cover"
                          />
                          <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition group-hover:opacity-100">
                            <ZoomIn className="h-4 w-4 text-white" />
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => removeImage(idx)}
                          disabled={busyTaskId !== null}
                          className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/75 text-white hover:bg-rose-600"
                          title="Xóa ảnh này"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {promptProfiles.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600">
                    Cấu hình Prompt
                  </label>
                  <SelectField
                    value={promptProfileId}
                    onChange={setPromptProfileId}
                    options={promptProfiles.map((p) => ({
                      value: p.id,
                      label: p.name,
                      badge:
                        p.id === activePromptProfileId
                          ? "Mặc định"
                          : p.strictness === "strict"
                          ? "Khắt khe"
                          : p.strictness === "encouraging"
                          ? "Khuyến khích"
                          : "Tiêu chuẩn",
                    }))}
                    size="sm"
                    className="mt-1 w-full"
                    ariaLabel="Chọn cấu hình Prompt"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-600">
                    Loại bài nói
                  </label>
                  <SelectField
                    value={taskType}
                    onChange={setTaskType}
                    options={Object.entries(TASK_LABELS).map(([k, label]) => ({
                      value: k,
                      label,
                    }))}
                    size="sm"
                    className="mt-1 w-full"
                    ariaLabel="Loại bài nói"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600">
                    Ngôn ngữ nhận xét
                  </label>
                  <SelectField
                    value={feedbackLang}
                    onChange={setFeedbackLang}
                    options={Object.entries(LANG_LABELS).map(([k, label]) => ({
                      value: k,
                      label,
                    }))}
                    size="sm"
                    className="mt-1 w-full"
                    ariaLabel="Ngôn ngữ nhận xét"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-slate-600">
                    Nơi lưu Excel kết quả (tự nhớ)
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleChooseExportDir()}
                    disabled={busyTaskId !== null}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  >
                    <FolderOpen className="h-3 w-3" />
                    Chọn nơi lưu...
                  </button>
                </div>
                <div
                  className="mt-1 truncate text-[11px] text-slate-500"
                  title={exportDir}
                >
                  <code>{exportDir}</code>
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="border-t border-slate-100 px-5 py-3">
              <button
                type="button"
                onClick={() => setConfigDrawerOpen(false)}
                className="w-full rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
              >
                Xong · Quay lại chấm bài
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Lightbox Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-2xl bg-white p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 px-2 pb-2">
              <span className="truncate text-xs font-semibold text-slate-700">
                {previewImage.name}
              </span>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <img
              src={`data:${previewImage.mime_type};base64,${previewImage.data_base64}`}
              alt={previewImage.name}
              className="max-h-[80vh] max-w-full rounded-xl object-contain"
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteAssignmentOpen}
        title={`Xóa đợt chấm đã lưu "${
          gradingAssignments.find((a) => a.id === selectedAssignmentId)?.name ??
          selectedAssignmentId
        }"?`}
        description="Cấu hình đề bài và ảnh đính kèm đã lưu trong đợt chấm này sẽ bị xóa."
        confirmLabel="Xóa đợt chấm"
        onConfirm={() => void executeDeleteAssignment()}
        onCancel={() => setConfirmDeleteAssignmentOpen(false)}
      />
    </div>
  );
}
