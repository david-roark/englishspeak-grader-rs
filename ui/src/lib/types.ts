export interface Criterion {
  name: string;
  description: string;
  min_score: number;
  max_score: number;
}

export interface Rubric {
  id: string;
  name: string;
  description: string;
  scale_note: string;
  is_builtin: boolean;
  criteria: Criterion[];
}

export interface CriterionScore {
  criterion: string;
  score: number;
  max_score: number;
  comment: string;
}

export interface Evidence {
  timestamp: string;
  quote: string;
  note: string;
}

export interface StudentAssessment {
  student_name: string;
  name_confident: boolean;
  criteria: CriterionScore[];
  total_score: number;
  max_total_score: number;
  overall_level: string;
  strengths: string[];
  weaknesses: string[];
  improvement_suggestions: string[];
  practice_directions: string[];
  evidence: Evidence[];
}

export interface StudentRecord {
  id: number;
  original_ai_name: string;
  assessment: StudentAssessment;
}

export interface AssessmentDetail {
  id: number;
  created_at: string;
  video_name: string;
  video_path: string | null;
  video_size_bytes: number | null;
  rubric_id: string;
  rubric_name: string;
  task_type: string;
  model: string;
  feedback_lang: string;
  media_resolution: string;
  detected_language: string;
  task_summary: string;
  general_notes: string;
  duration_ms: number | null;
  students: StudentRecord[];
}

export interface AssessmentSummary {
  id: number;
  created_at: string;
  video_name: string;
  rubric_id: string;
  rubric_name: string;
  task_type: string;
  model: string;
  feedback_lang: string;
  task_summary: string;
  student_count: number;
  student_names: string;
  duration_ms: number | null;
}

export interface PromptProfile {
  id: string;
  name: string;
  system_instruction: string;
  names_with_list: string;
  names_auto_detect: string;
  grading_rules: string[];
  task_types: Record<string, string>;
  feedback_languages: Record<string, string>;
}

export interface VideoPreset {
  key: string;
  label: string;
  preset: string;
  audio_bitrate: string;
  crf: number | null;
  video_bitrate: string | null;
  scale: string | null;
}

export interface Mp3Preset {
  key: string;
  label: string;
  bitrate: string;
  channels: number;
  sample_rate: number;
}

export interface AppBootstrap {
  has_api_key: boolean;
  masked_api_key: string;
  default_model: string;
  media_resolution: string;
  export_dir: string;
  db_path: string;
  ffmpeg_path: string | null;
  ffmpeg_custom_path: string;
  is_portable: boolean;
  fallback_models: string[];
  video_presets: VideoPreset[];
  mp3_presets: Mp3Preset[];
  rubrics: Rubric[];
  prompt_profile: PromptProfile;
}

export interface FileInfo {
  path: string;
  name: string;
  size_bytes: number;
  size_mb: number;
}

export interface GradeResponse {
  detail: AssessmentDetail;
  excel_path: string;
  reused_upload_cache: boolean;
}

export interface MediaOutput {
  output_path: string;
  file_name: string;
  size_bytes: number;
  size_mb: number;
  orig_size_mb: number;
}

export interface ProgressPayload {
  task_id: string;
  stage: string;
  percent: number | null;
}
