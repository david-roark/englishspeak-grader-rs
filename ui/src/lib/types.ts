export interface CriterionLevel {
  label: string;
  score_range: string;
  description: string;
}

export interface Criterion {
  name: string;
  description: string;
  min_score: number;
  max_score: number;
  weight?: number;
  levels?: CriterionLevel[];
}

export interface Rubric {
  id: string;
  name: string;
  description: string;
  scale_note: string;
  is_builtin: boolean;
  scoring_mode?: string;
  target_scale?: number | null;
  rounding_step?: number | null;
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
  temperature: number;
  strictness: string;
}

export interface PromptParts {
  system_instruction: string;
  user_prompt: string;
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

export interface AssignmentImage {
  name: string;
  mime_type: string;
  data_base64: string;
}

export interface GradingAssignment {
  id: string;
  name: string;
  mode: "flexible" | "rubric" | string;
  rubric_id?: string | null;
  max_score: number;
  rounding_step?: number | null;
  requirements: string;
  task_type: string;
  feedback_lang: string;
  prompt_profile_id?: string | null;
  images: AssignmentImage[];
  updated_at?: string;
}

export interface AppBootstrap {
  has_api_key: boolean;
  masked_api_key: string;
  default_model: string;
  media_resolution: string;
  export_dir: string;
  has_custom_export_dir: boolean;
  db_path: string;
  ffmpeg_path: string | null;
  ffmpeg_custom_path: string;
  is_portable: boolean;
  fallback_models: string[];
  video_presets: VideoPreset[];
  mp3_presets: Mp3Preset[];
  rubrics: Rubric[];
  grading_assignments: GradingAssignment[];
  prompt_profile: PromptProfile;
  prompt_profiles: PromptProfile[];
  active_prompt_profile_id: string;
  media_base_url: string;
  media_token: string;
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

export interface TranscriptSpeaker {
  id: string;
  label: string;
  role: "teacher" | "student" | "other" | string;
  name_confident: boolean;
}

export interface TranscriptSegment {
  start_time: string;
  end_time: string;
  speaker_id: string;
  speaker_label: string;
  role: "teacher" | "student" | "other" | string;
  text: string;
  translation: string;
  grammar_note: string;
}

export interface TranscriptResult {
  summary: string;
  detected_language: string;
  speakers: TranscriptSpeaker[];
  segments: TranscriptSegment[];
}

export interface GenerateScriptResponse {
  transcript: TranscriptResult;
  source_name: string;
  script_output: MediaOutput;
  mp3_output: MediaOutput | null;
  reused_upload_cache: boolean;
}

export interface ActivityLogEntry {
  timestamp_ms: number;
  level: "INFO" | "WARN" | "ERROR" | string;
  category: string;
  message: string;
}

export interface AppDiagnostics {
  app_name: string;
  app_version: string;
  os: string;
  arch: string;
  is_portable: boolean;
  data_dir: string;
  db_path: string;
  exports_dir: string;
  log_file_path: string;
  ffmpeg_path: string | null;
  fonts_dir: string | null;
  media_server_port: number;
  license_summary: string;
  logs: ActivityLogEntry[];
}
