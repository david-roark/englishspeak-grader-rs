import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import type {
  AppBootstrap,
  AssessmentDetail,
  AssessmentSummary,
  AssignmentImage,
  FileInfo,
  GenerateScriptResponse,
  GradeResponse,
  GradingAssignment,
  MediaOutput,
  ProgressPayload,
  PromptParts,
  PromptProfile,
  Rubric,
  TranscriptResult,
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

let mediaServerConfig: { baseUrl: string; token: string } | null = null;

export const api = {
  getBootstrap: async () => {
    const boot = await invoke<AppBootstrap>("get_bootstrap");
    if (boot.media_base_url && boot.media_token) {
      mediaServerConfig = {
        baseUrl: boot.media_base_url,
        token: boot.media_token,
      };
    }
    return boot;
  },
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
    prompt_profile_id?: string;
    grading_mode?: "flexible" | "rubric";
    assignment_name?: string;
    flexible_max_score?: number;
    flexible_rounding_step?: number | null;
    images?: AssignmentImage[];
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

  generateScript: (req: {
    task_id: string;
    api_key?: string;
    input_path: string;
    model: string;
    mp3_preset: string;
    enhance_speech: boolean;
    keep_mp3: boolean;
    interaction_mode: string;
    speaker_hints: string;
    verbatim_mode: string;
    include_translation: boolean;
    include_grammar_notes: boolean;
    extra_instructions: string;
    out_dir_override?: string;
    out_path_override?: string;
  }) => invoke<GenerateScriptResponse>("generate_script_cmd", { req }),

  exportTranscriptFile: (params: {
    transcript: TranscriptResult;
    sourceName: string;
    format: "md" | "txt" | "srt";
    outPath: string;
  }) =>
    invoke<MediaOutput>("export_transcript_file", {
      transcript: params.transcript,
      sourceName: params.sourceName,
      format: params.format,
      outPath: params.outPath,
    }),

  embedSubtitlesVideo: (req: {
    task_id: string;
    video_path: string;
    transcript: TranscriptResult;
    burn_mode: "hardsub" | "softsub";
    content_mode: "all" | "with_grammar" | "bilingual" | "text_only";
    out_dir_override?: string;
    out_path_override?: string;
  }) => invoke<MediaOutput>("embed_subtitles_video_cmd", { req }),

  listRubrics: () => invoke<Rubric[]>("list_rubrics"),
  saveCustomRubric: (rubric: Rubric) =>
    invoke<Rubric[]>("save_custom_rubric", { rubric }),
  cloneRubric: (sourceId: string, newId: string, newName: string) =>
    invoke<Rubric[]>("clone_rubric", { sourceId, newId, newName }),
  deleteCustomRubric: (id: string) =>
    invoke<Rubric[]>("delete_custom_rubric", { id }),

  listGradingAssignments: () =>
    invoke<GradingAssignment[]>("list_grading_assignments"),
  saveGradingAssignment: (assignment: GradingAssignment) =>
    invoke<GradingAssignment[]>("save_grading_assignment", { assignment }),
  deleteGradingAssignment: (id: string) =>
    invoke<GradingAssignment[]>("delete_grading_assignment", { id }),
  loadImageFile: (path: string) =>
    invoke<AssignmentImage>("load_image_file", { path }),

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

  savePromptProfile: (profile: PromptProfile, setActive = false) =>
    invoke<AppBootstrap>("save_prompt_profile", {
      profile,
      setActive,
    }),
  clonePromptProfile: (
    sourceId: string,
    newId: string,
    newName: string,
    setActive = true
  ) =>
    invoke<AppBootstrap>("clone_prompt_profile", {
      sourceId,
      newId,
      newName,
      setActive,
    }),
  deletePromptProfile: (id: string) =>
    invoke<AppBootstrap>("delete_prompt_profile", { id }),
  setActivePromptProfile: (id: string) =>
    invoke<AppBootstrap>("set_active_prompt_profile", { id }),
  resetPromptProfile: () =>
    invoke<AppBootstrap>("reset_prompt_profile"),
  previewGradingPrompt: (params: {
    profile?: PromptProfile;
    profileId?: string;
    rubric?: Rubric;
    rubricId?: string;
    taskType: string;
    feedbackLang: string;
    studentNamesRaw: string;
    extraInstructions: string;
  }) =>
    invoke<PromptParts>("preview_grading_prompt", {
      profile: params.profile ?? null,
      profileId: params.profileId ?? null,
      rubric: params.rubric ?? null,
      rubricId: params.rubricId ?? null,
      taskType: params.taskType,
      feedbackLang: params.feedbackLang,
      studentNamesRaw: params.studentNamesRaw,
      extraInstructions: params.extraInstructions,
    }),

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

  pickImageFiles: async (): Promise<string[]> => {
    const selected = await open({
      multiple: true,
      title: "Chọn ảnh đề bài / slide / tranh tình huống",
      filters: [
        {
          name: "Hình ảnh",
          extensions: [
            "png",
            "jpg",
            "jpeg",
            "webp",
            "gif",
            "bmp",
            "heic",
            "heif",
          ],
        },
      ],
    });
    if (Array.isArray(selected)) return selected;
    if (typeof selected === "string") return [selected];
    return [];
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

  saveScriptDialog: async (
    defaultName: string,
    format: "md" | "txt" | "srt"
  ): Promise<string | null> => {
    const filterName =
      format === "srt"
        ? "Phụ đề SubRip (.srt)"
        : format === "txt"
        ? "Văn bản thuần (.txt)"
        : "Markdown Script (.md)";
    const selected = await save({
      title: "Lưu file Script",
      defaultPath: defaultName,
      filters: [{ name: filterName, extensions: [format] }],
    });
    return selected;
  },

  openLocalFile: (path: string) => openPath(path),
  revealInFolder: (path: string) => revealItemInDir(path),
  mediaUrl: (path: string) => {
    if (mediaServerConfig) {
      const fileName = path.split(/[/\\]/).pop() || "media";
      return `${mediaServerConfig.baseUrl}/media/${encodeURIComponent(fileName)}?token=${encodeURIComponent(mediaServerConfig.token)}&path=${encodeURIComponent(path)}`;
    }
    return convertFileSrc(path);
  },
};
