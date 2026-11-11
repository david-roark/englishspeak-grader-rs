import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import type {
  AppBootstrap,
  AssessmentDetail,
  AssessmentSummary,
  FileInfo,
  GradeResponse,
  MediaOutput,
  ProgressPayload,
  PromptProfile,
  Rubric,
} from "./types";

export const TASK_LABELS: Record<string, string> = {
  presentation: "Thuyết trình cá nhân",
  qa: "Hỏi – đáp",
  dialogue: "Đối thoại (2 người)",
  group: "Thảo luận nhóm",
  other: "Khác / nói chung",
};

export const LANG_LABELS: Record<string, string> = {
  vi: "Tiếng Việt",
  en: "English",
  bilingual: "Song ngữ (Việt + Anh)",
};

export const MEDIA_RES_OPTIONS = [
  { value: "low", label: "Thấp — tiết kiệm token, an toàn free tier" },
  { value: "default", label: "Trung bình — chi tiết hơn, video dài dễ vượt giới hạn" },
  { value: "high", label: "Cao — chi tiết nhất, tốn token nhất" },
];

export const api = {
  getBootstrap: () => invoke<AppBootstrap>("get_bootstrap"),
  inspectFile: (path: string) => invoke<FileInfo>("inspect_file", { path }),
  fetchModels: (apiKey?: string) =>
    invoke<string[]>("fetch_models", { apiKey: apiKey || null }),
  cancelTask: (taskId: string) => invoke<boolean>("cancel_task", { taskId }),

  gradeVideo: (req: {
    task_id: string;
    api_key?: string;
    video_path: string;
    rubric_id: string;
    task_type: string;
    feedback_lang: string;
    model: string;
    student_names_raw: string;
    extra_instructions: string;
    media_resolution: string;
  }) => invoke<GradeResponse>("grade_video_cmd", { req }),

  compressVideo: (params: {
    taskId: string;
    videoPath: string;
    preset: string;
    outDirOverride?: string;
    outPathOverride?: string;
  }) =>
    invoke<MediaOutput>("compress_video_cmd", {
      taskId: params.taskId,
      videoPath: params.videoPath,
      preset: params.preset,
      outDirOverride: params.outDirOverride || null,
      outPathOverride: params.outPathOverride || null,
    }),

  extractMp3: (params: {
    taskId: string;
    videoPath: string;
    preset: string;
    outDirOverride?: string;
    outPathOverride?: string;
  }) =>
    invoke<MediaOutput>("extract_mp3_cmd", {
      taskId: params.taskId,
      videoPath: params.videoPath,
      preset: params.preset,
      outDirOverride: params.outDirOverride || null,
      outPathOverride: params.outPathOverride || null,
    }),

  trimMedia: (params: {
    taskId: string;
    inputPath: string;
    startSecs: number;
    endSecs?: number | null;
    fastCopy: boolean;
    outDirOverride?: string;
    outPathOverride?: string;
  }) =>
    invoke<MediaOutput>("trim_media_cmd", {
      taskId: params.taskId,
      inputPath: params.inputPath,
      startSecs: params.startSecs,
      endSecs: params.endSecs ?? null,
      fastCopy: params.fastCopy,
      outDirOverride: params.outDirOverride || null,
      outPathOverride: params.outPathOverride || null,
    }),

  muteVideo: (params: {
    taskId: string;
    videoPath: string;
    outDirOverride?: string;
    outPathOverride?: string;
  }) =>
    invoke<MediaOutput>("mute_video_cmd", {
      taskId: params.taskId,
      videoPath: params.videoPath,
      outDirOverride: params.outDirOverride || null,
      outPathOverride: params.outPathOverride || null,
    }),

  probeMediaDuration: (path: string) =>
    invoke<number | null>("probe_media_duration", { path }),

  listRubrics: () => invoke<Rubric[]>("list_rubrics"),
  saveCustomRubric: (rubric: Rubric) =>
    invoke<Rubric[]>("save_custom_rubric", { rubric }),
  cloneRubric: (sourceId: string, newId: string, newName: string) =>
    invoke<Rubric[]>("clone_rubric", { sourceId, newId, newName }),
  deleteCustomRubric: (id: string) =>
    invoke<Rubric[]>("delete_custom_rubric", { id }),

  listAssessments: (query?: string, limit = 100) =>
    invoke<AssessmentSummary[]>("list_assessments", {
      query: query || null,
      limit,
    }),
  getAssessment: (id: number) => invoke<AssessmentDetail>("get_assessment", { id }),
  renameStudent: (
    assessmentId: number,
    studentAssessmentId: number,
    newName: string
  ) =>
    invoke<AssessmentDetail>("rename_student", {
      assessmentId,
      studentAssessmentId,
      newName,
    }),
  deleteAssessment: (id: number) =>
    invoke<void>("delete_assessment", { id }),
  exportAssessmentExcel: (assessmentId: number, outPath?: string) =>
    invoke<string>("export_assessment_excel", {
      assessmentId,
      outPath: outPath || null,
    }),
  getAssessmentMarkdown: (assessmentId: number) =>
    invoke<string>("get_assessment_markdown", { assessmentId }),

  savePromptProfile: (profile: PromptProfile) =>
    invoke<PromptProfile>("save_prompt_profile", { profile }),
  resetPromptProfile: () =>
    invoke<PromptProfile>("reset_prompt_profile"),

  saveSettings: (settings: {
    api_key?: string;
    clear_api_key?: boolean;
    default_model?: string;
    media_resolution?: string;
    export_dir?: string;
    ffmpeg_custom_path?: string;
  }) => invoke<AppBootstrap>("save_settings", { settings }),

  listenProgress: (
    taskId: string,
    cb: (payload: ProgressPayload) => void
  ): Promise<UnlistenFn> =>
    listen<ProgressPayload>("task-progress", (event) => {
      if (event.payload.task_id === taskId) {
        cb(event.payload);
      }
    }),

  pickVideoFile: async (): Promise<string | null> => {
    const selected = await open({
      multiple: false,
      title: "Chọn video bài nói",
      filters: [
        {
          name: "Video",
          extensions: [
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
          ],
        },
      ],
    });
    return typeof selected === "string" ? selected : null;
  },

  pickMediaFile: async (): Promise<string | null> => {
    const selected = await open({
      multiple: false,
      title: "Chọn file Video hoặc Audio",
      filters: [
        {
          name: "Media (Video & Audio)",
          extensions: [
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
            "mp3",
            "wav",
            "m4a",
            "aac",
            "ogg",
            "flac",
          ],
        },
      ],
    });
    return typeof selected === "string" ? selected : null;
  },

  saveMediaDialog: async (params: {
    title: string;
    defaultName: string;
    filterName: string;
    extensions: string[];
  }): Promise<string | null> => {
    const selected = await save({
      title: params.title,
      defaultPath: params.defaultName,
      filters: [{ name: params.filterName, extensions: params.extensions }],
    });
    return selected;
  },

  pickFolder: async (title: string): Promise<string | null> => {
    const selected = await open({
      multiple: false,
      directory: true,
      title,
    });
    return typeof selected === "string" ? selected : null;
  },

  pickExecutable: async (title: string): Promise<string | null> => {
    const selected = await open({
      multiple: false,
      title,
    });
    return typeof selected === "string" ? selected : null;
  },

  saveExcelDialog: async (defaultName: string): Promise<string | null> => {
    const selected = await save({
      title: "Lưu file Excel kết quả",
      defaultPath: defaultName,
      filters: [{ name: "Excel", extensions: ["xlsx"] }],
    });
    return selected;
  },

  openLocalFile: (path: string) => openPath(path),
  revealInFolder: (path: string) => revealItemInDir(path),
  mediaUrl: (path: string) => convertFileSrc(path),
};
