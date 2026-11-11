pub mod database;
pub mod error;
pub mod export;
pub mod gemini;
pub mod media;
pub mod paths;
pub mod prompts;
pub mod rubrics;
pub mod schemas;

pub use database::{AssessmentDetail, AssessmentSummary, Database, NewAssessment, StudentRecord};
pub use error::{GraderError, Result};
pub use gemini::{
    CachedUpload, GeminiClient, MediaResolution, UploadCache, UploadProgress, UploadedFile,
    DEFAULT_MODEL, FALLBACK_MODELS, UPLOAD_TTL_SECS,
};
pub use media::{
    compress_video, compress_video_to, extract_mp3, extract_mp3_to, get_mp3_preset,
    get_video_preset, mp3_presets, mute_video_to, probe_duration_secs, resolve_ffmpeg,
    trim_media_to, video_presets, MediaProgress, Mp3Preset, VideoPreset, DEFAULT_MP3_PRESET,
    DEFAULT_VIDEO_PRESET,
};
pub use paths::AppPaths;
pub use prompts::{build_grading_prompt, build_prompt_parts, PromptParts, PromptProfile};
pub use rubrics::{
    builtin_rubrics, fmt_num, format_result_markdown, get_builtin_rubric, Criterion, Rubric,
};
pub use schemas::{
    assessment_result_gemini_schema, AssessmentResult, CriterionScore, Evidence, StudentAssessment,
};
