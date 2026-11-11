import { useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileVideo,
  FolderOpen,
  Minimize2,
  Rocket,
  Upload,
} from "lucide-react";
import { ProgressPanel } from "../components/ProgressPanel";
import { ResultView } from "../components/ResultView";
import { SelectField } from "../components/SelectField";
import { api, LANG_LABELS, TASK_LABELS } from "../lib/api";
import { getParentDir, VIDEO_EXTENSIONS } from "../lib/mediaUtils";
import { useFileDrop } from "../lib/useFileDrop";
import type {
  AppBootstrap,
  AssessmentDetail,
  FileInfo,
  Rubric,
  VideoPreset,
} from "../lib/types";

interface GradePageProps {
  apiKeyInput: string;
  model: string;
  mediaResolution: string;
  rubrics: Rubric[];
  videoPresets: VideoPreset[];
  ffmpegAvailable: boolean;
  exportDir: string;
  hasCustomExportDir: boolean;
  onBootstrapUpdated: (next: AppBootstrap) => void;
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
  videoPresets,
  ffmpegAvailable,
  exportDir,
  hasCustomExportDir,
  onBootstrapUpdated,
}: GradePageProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoDropRef = useRef<HTMLDivElement | null>(null);

  const [videoInfo, setVideoInfo] = useState<FileInfo | null>(null);
  const [origFileInfo, setOrigFileInfo] = useState<FileInfo | null>(null);

  const [compressOpen, setCompressOpen] = useState(false);
  const [compressPreset, setCompressPreset] = useState("balanced");
  const [compressing, setCompressing] = useState(false);

  const [rubricId, setRubricId] = useState(rubrics[0]?.id ?? "ielts_speaking");
  const [taskType, setTaskType] = useState("presentation");
  const [feedbackLang, setFeedbackLang] = useState("vi");
  const [studentNames, setStudentNames] = useState("");
  const [extraInstructions, setExtraInstructions] = useState("");

  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [progressStage, setProgressStage] = useState("");
  const [progressPercent, setProgressPercent] = useState<number | null>(null);

  const [statusMsg, setStatusMsg] = useState(
    "Sẵn sàng. Chọn video bài nói và bấm Chấm điểm."
  );
  const [errorMsg, setErrorMsg] = useState("");
  const [resultDetail, setResultDetail] = useState<AssessmentDetail | null>(null);
  const [excelPath, setExcelPath] = useState<string | null>(null);

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
      });
      setResultDetail(resp.detail);
      setExcelPath(resp.excel_path);
      setStatusMsg(
        `✅ Đã chấm ${resp.detail.students.length} học sinh.${
          resp.reused_upload_cache
            ? " (Dùng lại video đã tải trên Gemini — siêu nhanh)"
            : ""
        } Đổi rubric / loại bài / ngôn ngữ rồi bấm Chấm điểm lại sẽ không cần upload lại video.`
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

  return (
    <div className="grid items-start gap-4 md:grid-cols-12">
      {/* Left column: Controls (sticky on desktop so video stays visible while reading results) */}
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
              1. Video bài nói của học sinh
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
              <video
                ref={videoRef}
                src={api.mediaUrl(videoInfo.path)}
                controls
                className="aspect-video max-h-[280px] w-full rounded-lg bg-black object-contain"
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
              className="mt-2.5 flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-center hover:border-indigo-300 hover:bg-indigo-50/30"
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
                Nén video trước khi gửi (tiết kiệm dung lượng & TPM)
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

        {/* Grading config */}
        <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <h2 className="text-sm font-bold text-slate-800">2. Thiết lập chấm bài</h2>

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

          <div>
            <label className="block text-xs font-semibold text-slate-600">
              Tên học sinh (tùy chọn, cách nhau bằng dấu phẩy)
            </label>
            <input
              type="text"
              value={studentNames}
              onChange={(e) => setStudentNames(e.target.value)}
              placeholder="VD: An, Bình — để trống nếu muốn AI tự lấy tên"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
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
                Chọn video bên trái, chọn Rubric phù hợp rồi bấm{" "}
                <span className="font-semibold text-indigo-600">Chấm điểm bằng AI</span>.
              </p>
              <div className="mt-4 grid gap-2.5 text-left text-xs sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="font-bold text-slate-800">1. Chấm theo Rubric</div>
                  <p className="mt-0.5 text-slate-500">
                    Tự tách từng học sinh và chấm đúng tiêu chí đã chọn.
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="font-bold text-slate-800">2. Nhảy mốc video</div>
                  <p className="mt-0.5 text-slate-500">
                    Bấm timestamp trong dẫn chứng để tua nhanh đoạn nói.
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="font-bold text-slate-800">3. Xuất Excel & Lịch sử</div>
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
  );
}
