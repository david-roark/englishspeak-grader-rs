use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use chrono::Local;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::error::{GraderError, Result};
use crate::prompts::{
    default_strictness, default_temperature, merge_with_default, PromptProfile,
};
use crate::rubrics::{builtin_rubrics, Criterion, Rubric};
use crate::schemas::{AssessmentResult, CriterionScore, Evidence, StudentAssessment};

/// Dữ liệu đầu vào khi lưu một lần chấm điểm mới.
#[derive(Debug, Clone)]
pub struct NewAssessment<'a> {
    pub video_name: &'a str,
    pub video_path: Option<&'a str>,
    pub video_size_bytes: Option<u64>,
    pub rubric_id: &'a str,
    pub rubric_name: &'a str,
    pub task_type: &'a str,
    pub model: &'a str,
    pub feedback_lang: &'a str,
    pub media_resolution: &'a str,
    pub duration_ms: Option<u64>,
    pub result: &'a AssessmentResult,
}

/// Dòng tóm tắt hiển thị trong bảng Lịch sử.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AssessmentSummary {
    pub id: i64,
    pub created_at: String,
    pub video_name: String,
    pub rubric_id: String,
    pub rubric_name: String,
    pub task_type: String,
    pub model: String,
    pub feedback_lang: String,
    pub task_summary: String,
    pub student_count: usize,
    pub student_names: String,
    pub duration_ms: Option<i64>,
}

/// Bản ghi chi tiết của một học sinh (có `id` DB để giáo viên sửa tên sau khi chấm).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StudentRecord {
    pub id: i64,
    pub original_ai_name: String,
    pub assessment: StudentAssessment,
}

/// Chi tiết đầy đủ của một lần chấm bài.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AssessmentDetail {
    pub id: i64,
    pub created_at: String,
    pub video_name: String,
    pub video_path: Option<String>,
    pub video_size_bytes: Option<i64>,
    pub rubric_id: String,
    pub rubric_name: String,
    pub task_type: String,
    pub model: String,
    pub feedback_lang: String,
    pub media_resolution: String,
    pub detected_language: String,
    pub task_summary: String,
    pub general_notes: String,
    pub duration_ms: Option<i64>,
    pub students: Vec<StudentRecord>,
}

impl AssessmentDetail {
    /// Chuyển đổi sang `AssessmentResult` để render Markdown hoặc xuất Excel.
    pub fn to_assessment_result(&self) -> AssessmentResult {
        AssessmentResult {
            task_summary: self.task_summary.clone(),
            detected_language: self.detected_language.clone(),
            students: self.students.iter().map(|s| s.assessment.clone()).collect(),
            general_notes: self.general_notes.clone(),
        }
    }
}

/// Lớp truy cập SQLite chuẩn hóa cho `englishspeak-grader-rs`.
#[derive(Debug, Clone)]
pub struct Database {
    db_path: PathBuf,
}

impl Database {
    pub fn new(db_path: impl AsRef<Path>) -> Self {
        Self {
            db_path: db_path.as_ref().to_path_buf(),
        }
    }

    pub fn path(&self) -> &Path {
        &self.db_path
    }

    fn connect(&self) -> Result<Connection> {
        if let Some(parent) = self.db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(&self.db_path)?;
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;",
        )?;
        Ok(conn)
    }

    /// Khởi tạo schema và seed dữ liệu mặc định (5 rubric + prompt profile mặc định).
    pub fn init(&self) -> Result<()> {
        let mut conn = self.connect()?;
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS app_settings (
                key        TEXT PRIMARY KEY,
                value      TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS rubrics (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                scale_note  TEXT NOT NULL DEFAULT '',
                is_builtin  INTEGER NOT NULL DEFAULT 0,
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS rubric_criteria (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                rubric_id   TEXT NOT NULL REFERENCES rubrics(id) ON DELETE CASCADE,
                sort_order  INTEGER NOT NULL,
                name        TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                min_score   REAL NOT NULL DEFAULT 0,
                max_score   REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS prompt_profiles (
                id                  TEXT PRIMARY KEY,
                name                TEXT NOT NULL,
                system_instruction  TEXT NOT NULL,
                names_with_list     TEXT NOT NULL,
                names_auto_detect   TEXT NOT NULL,
                grading_rules_json  TEXT NOT NULL,
                task_types_json     TEXT NOT NULL,
                feedback_langs_json TEXT NOT NULL,
                temperature         REAL NOT NULL DEFAULT 0.25,
                strictness          TEXT NOT NULL DEFAULT 'standard',
                updated_at          TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS assessments (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at       TEXT NOT NULL,
                video_name       TEXT NOT NULL,
                video_path       TEXT,
                video_size_bytes INTEGER,
                rubric_id        TEXT NOT NULL,
                rubric_name      TEXT NOT NULL,
                task_type        TEXT NOT NULL,
                model            TEXT NOT NULL,
                feedback_lang    TEXT NOT NULL,
                media_resolution TEXT NOT NULL,
                detected_lang    TEXT NOT NULL,
                task_summary     TEXT NOT NULL,
                general_notes    TEXT NOT NULL DEFAULT '',
                duration_ms      INTEGER
            );

            CREATE TABLE IF NOT EXISTS student_assessments (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                assessment_id    INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
                sort_order       INTEGER NOT NULL,
                student_name     TEXT NOT NULL,
                original_ai_name TEXT NOT NULL,
                name_confident   INTEGER NOT NULL,
                total_score      REAL NOT NULL,
                max_total_score  REAL NOT NULL,
                overall_level    TEXT NOT NULL,
                strengths_json   TEXT NOT NULL,
                weaknesses_json  TEXT NOT NULL,
                suggestions_json TEXT NOT NULL,
                practice_json    TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS criterion_scores (
                id                    INTEGER PRIMARY KEY AUTOINCREMENT,
                student_assessment_id INTEGER NOT NULL REFERENCES student_assessments(id) ON DELETE CASCADE,
                sort_order            INTEGER NOT NULL,
                criterion_name        TEXT NOT NULL,
                score                 REAL NOT NULL,
                max_score             REAL NOT NULL,
                comment               TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS evidence_items (
                id                    INTEGER PRIMARY KEY AUTOINCREMENT,
                student_assessment_id INTEGER NOT NULL REFERENCES student_assessments(id) ON DELETE CASCADE,
                sort_order            INTEGER NOT NULL,
                timestamp             TEXT NOT NULL,
                quote                 TEXT NOT NULL,
                note                  TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_assessments_created ON assessments(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_student_name ON student_assessments(student_name);
            CREATE INDEX IF NOT EXISTS idx_rubric_criteria_rid ON rubric_criteria(rubric_id, sort_order);
            PRAGMA user_version = 1;
            "#,
        )?;

        ensure_prompt_profile_columns(&conn)?;

        let tx = conn.transaction()?;
        let now = now_iso();
        for rubric in builtin_rubrics() {
            upsert_rubric_tx(&tx, rubric, &now)?;
        }
        let has_default_prompt: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM prompt_profiles WHERE id = 'default')",
                [],
                |row| row.get(0),
            )?;
        if !has_default_prompt {
            let def = PromptProfile::default();
            save_prompt_profile_tx(&tx, &def, &now)?;
        }
        tx.commit()?;
        Ok(())
    }

    // --------------------------------------------------------------------- //
    // App Settings
    // --------------------------------------------------------------------- //

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let conn = self.connect()?;
        let val = conn
            .query_row(
                "SELECT value FROM app_settings WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .optional()?;
        Ok(val)
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        let conn = self.connect()?;
        conn.execute(
            "INSERT INTO app_settings (key, value, updated_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![key, value, now_iso()],
        )?;
        Ok(())
    }

    pub fn delete_setting(&self, key: &str) -> Result<()> {
        let conn = self.connect()?;
        conn.execute("DELETE FROM app_settings WHERE key = ?1", params![key])?;
        Ok(())
    }

    pub fn get_all_settings(&self) -> Result<BTreeMap<String, String>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare("SELECT key, value FROM app_settings ORDER BY key")?;
        let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;
        let mut map = BTreeMap::new();
        for r in rows {
            let (k, v) = r?;
            map.insert(k, v);
        }
        Ok(map)
    }

    // --------------------------------------------------------------------- //
    // Rubrics (Built-in + Custom)
    // --------------------------------------------------------------------- //

    pub fn list_rubrics(&self) -> Result<Vec<Rubric>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            "SELECT id, name, description, scale_note, is_builtin
             FROM rubrics
             ORDER BY is_builtin DESC, updated_at DESC, name ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)? != 0,
            ))
        })?;

        let mut rubrics = Vec::new();
        for row in rows {
            let (id, name, description, scale_note, is_builtin) = row?;
            let criteria = load_criteria(&conn, &id)?;
            rubrics.push(Rubric {
                id,
                name,
                description,
                scale_note,
                is_builtin,
                criteria,
            });
        }
        Ok(rubrics)
    }

    pub fn get_rubric(&self, id: &str) -> Result<Option<Rubric>> {
        let conn = self.connect()?;
        let row = conn
            .query_row(
                "SELECT id, name, description, scale_note, is_builtin FROM rubrics WHERE id = ?1",
                params![id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, i64>(4)? != 0,
                    ))
                },
            )
            .optional()?;

        match row {
            Some((id, name, description, scale_note, is_builtin)) => {
                let criteria = load_criteria(&conn, &id)?;
                Ok(Some(Rubric {
                    id,
                    name,
                    description,
                    scale_note,
                    is_builtin,
                    criteria,
                }))
            }
            None => Ok(None),
        }
    }

    pub fn save_custom_rubric(&self, rubric: &Rubric) -> Result<()> {
        let id = rubric.id.trim();
        let name = rubric.name.trim();
        if id.is_empty() || name.is_empty() {
            return Err(GraderError::InvalidInput(
                "Cần nhập cả mã (id) và tên rubric.".into(),
            ));
        }
        if rubric.criteria.is_empty() {
            return Err(GraderError::InvalidInput(
                "Rubric cần có ít nhất 1 tiêu chí.".into(),
            ));
        }
        for c in &rubric.criteria {
            if c.name.trim().is_empty() {
                return Err(GraderError::InvalidInput(
                    "Tên tiêu chí không được để trống.".into(),
                ));
            }
            if c.max_score < c.min_score {
                return Err(GraderError::InvalidInput(format!(
                    "Tiêu chí '{}': điểm tối đa phải lớn hơn hoặc bằng điểm tối thiểu.",
                    c.name
                )));
            }
        }

        let mut conn = self.connect()?;
        let existing_builtin: Option<i64> = conn
            .query_row(
                "SELECT is_builtin FROM rubrics WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .optional()?;
        if existing_builtin == Some(1) {
            return Err(GraderError::InvalidInput(format!(
                "Mã '{id}' trùng với rubric mặc định. Hãy dùng mã khác hoặc nhân bản (clone)."
            )));
        }

        let mut custom = rubric.clone();
        custom.id = id.to_string();
        custom.name = name.to_string();
        custom.is_builtin = false;

        let tx = conn.transaction()?;
        upsert_rubric_tx(&tx, &custom, &now_iso())?;
        tx.commit()?;
        Ok(())
    }

    pub fn clone_rubric(&self, source_id: &str, new_id: &str, new_name: &str) -> Result<Rubric> {
        let source = self
            .get_rubric(source_id)?
            .ok_or_else(|| GraderError::InvalidInput(format!("Không tìm thấy rubric '{source_id}'.")))?;
        let cloned = Rubric {
            id: new_id.trim().to_string(),
            name: new_name.trim().to_string(),
            description: source.description,
            scale_note: source.scale_note,
            is_builtin: false,
            criteria: source.criteria,
        };
        self.save_custom_rubric(&cloned)?;
        Ok(cloned)
    }

    pub fn delete_custom_rubric(&self, id: &str) -> Result<()> {
        let conn = self.connect()?;
        let is_builtin: Option<i64> = conn
            .query_row(
                "SELECT is_builtin FROM rubrics WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .optional()?;
        match is_builtin {
            Some(1) => Err(GraderError::InvalidInput(
                "Không thể xóa rubric mặc định.".into(),
            )),
            Some(_) => {
                conn.execute("DELETE FROM rubrics WHERE id = ?1", params![id])?;
                Ok(())
            }
            None => Err(GraderError::InvalidInput(format!(
                "Không tìm thấy rubric '{id}'."
            ))),
        }
    }

    // --------------------------------------------------------------------- //
    // Prompt Profiles
    // --------------------------------------------------------------------- //

    pub fn active_prompt_profile_id(&self) -> Result<String> {
        let id = self
            .get_setting("active_prompt_profile_id")?
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "default".to_string());
        Ok(id)
    }

    pub fn list_prompt_profiles(&self) -> Result<Vec<PromptProfile>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            "SELECT id, name, system_instruction, names_with_list, names_auto_detect,
                    grading_rules_json, task_types_json, feedback_langs_json,
                    temperature, strictness
             FROM prompt_profiles
             ORDER BY CASE WHEN id = 'default' THEN 0 ELSE 1 END, name ASC, id ASC",
        )?;
        let rows = stmt.query_map([], map_prompt_profile_row)?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        if out.is_empty() {
            out.push(PromptProfile::default());
        }
        Ok(out)
    }

    pub fn get_prompt_profile(&self, id: &str) -> Result<Option<PromptProfile>> {
        let conn = self.connect()?;
        conn.query_row(
            "SELECT id, name, system_instruction, names_with_list, names_auto_detect,
                    grading_rules_json, task_types_json, feedback_langs_json,
                    temperature, strictness
             FROM prompt_profiles WHERE id = ?1",
            params![id],
            map_prompt_profile_row,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn load_prompt_profile(&self) -> Result<PromptProfile> {
        let active_id = self.active_prompt_profile_id()?;
        if let Some(p) = self.get_prompt_profile(&active_id)? {
            return Ok(p);
        }
        if active_id != "default" {
            if let Some(p) = self.get_prompt_profile("default")? {
                return Ok(p);
            }
        }
        Ok(PromptProfile::default())
    }

    pub fn set_active_prompt_profile(&self, id: &str) -> Result<PromptProfile> {
        let profile = self
            .get_prompt_profile(id)?
            .ok_or_else(|| GraderError::InvalidInput(format!("Không tìm thấy Prompt Profile '{id}'.")))?;
        self.set_setting("active_prompt_profile_id", &profile.id)?;
        Ok(profile)
    }

    pub fn save_prompt_profile(&self, profile: &PromptProfile) -> Result<()> {
        if profile.id.trim().is_empty() || profile.name.trim().is_empty() {
            return Err(GraderError::InvalidInput(
                "ID và tên Prompt Profile không được để trống.".into(),
            ));
        }
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        save_prompt_profile_tx(&tx, profile, &now_iso())?;
        tx.commit()?;
        Ok(())
    }

    pub fn clone_prompt_profile(
        &self,
        source_id: &str,
        new_id: &str,
        new_name: &str,
    ) -> Result<PromptProfile> {
        let clean_id = new_id.trim();
        let clean_name = new_name.trim();
        if clean_id.is_empty() || clean_name.is_empty() {
            return Err(GraderError::InvalidInput(
                "ID và tên Prompt Profile mới không được để trống.".into(),
            ));
        }
        let mut profile = self
            .get_prompt_profile(source_id)?
            .unwrap_or_else(PromptProfile::default);
        profile.id = clean_id.to_string();
        profile.name = clean_name.to_string();
        self.save_prompt_profile(&profile)?;
        Ok(profile)
    }

    pub fn delete_prompt_profile(&self, id: &str) -> Result<()> {
        if id == "default" {
            return Err(GraderError::InvalidInput(
                "Không thể xóa Prompt Profile mặc định.".into(),
            ));
        }
        let active_id = self.active_prompt_profile_id()?;
        let conn = self.connect()?;
        conn.execute("DELETE FROM prompt_profiles WHERE id = ?1", params![id])?;
        drop(conn);
        if active_id == id {
            self.set_setting("active_prompt_profile_id", "default")?;
        }
        Ok(())
    }

    pub fn reset_prompt_profile(&self) -> Result<PromptProfile> {
        let def = PromptProfile::default();
        self.save_prompt_profile(&def)?;
        Ok(def)
    }

    // --------------------------------------------------------------------- //
    // Assessments (Normalized history + inline student rename)
    // --------------------------------------------------------------------- //

    pub fn save_assessment(&self, input: &NewAssessment<'_>) -> Result<i64> {
        let mut conn = self.connect()?;
        let tx = conn.transaction()?;
        let now = now_iso();

        tx.execute(
            "INSERT INTO assessments (
                created_at, video_name, video_path, video_size_bytes,
                rubric_id, rubric_name, task_type, model, feedback_lang,
                media_resolution, detected_lang, task_summary, general_notes, duration_ms
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                now,
                input.video_name,
                input.video_path,
                input.video_size_bytes.map(|v| v as i64),
                input.rubric_id,
                input.rubric_name,
                input.task_type,
                input.model,
                input.feedback_lang,
                input.media_resolution,
                input.result.detected_language,
                input.result.task_summary,
                input.result.general_notes,
                input.duration_ms.map(|v| v as i64),
            ],
        )?;
        let assessment_id = tx.last_insert_rowid();

        for (s_idx, s) in input.result.students.iter().enumerate() {
            tx.execute(
                "INSERT INTO student_assessments (
                    assessment_id, sort_order, student_name, original_ai_name,
                    name_confident, total_score, max_total_score, overall_level,
                    strengths_json, weaknesses_json, suggestions_json, practice_json
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    assessment_id,
                    s_idx as i64,
                    s.student_name,
                    s.student_name,
                    if s.name_confident { 1i64 } else { 0i64 },
                    s.total_score,
                    s.max_total_score,
                    s.overall_level,
                    serde_json::to_string(&s.strengths)?,
                    serde_json::to_string(&s.weaknesses)?,
                    serde_json::to_string(&s.improvement_suggestions)?,
                    serde_json::to_string(&s.practice_directions)?,
                ],
            )?;
            let student_id = tx.last_insert_rowid();

            for (c_idx, c) in s.criteria.iter().enumerate() {
                tx.execute(
                    "INSERT INTO criterion_scores (
                        student_assessment_id, sort_order, criterion_name, score, max_score, comment
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        student_id,
                        c_idx as i64,
                        c.criterion,
                        c.score,
                        c.max_score,
                        c.comment,
                    ],
                )?;
            }

            for (e_idx, ev) in s.evidence.iter().enumerate() {
                tx.execute(
                    "INSERT INTO evidence_items (
                        student_assessment_id, sort_order, timestamp, quote, note
                     ) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![student_id, e_idx as i64, ev.timestamp, ev.quote, ev.note],
                )?;
            }
        }

        tx.commit()?;
        Ok(assessment_id)
    }

    pub fn list_assessments(&self, query: Option<&str>, limit: usize) -> Result<Vec<AssessmentSummary>> {
        let conn = self.connect()?;
        let q = query.map(str::trim).filter(|s| !s.is_empty());
        let limit_i64 = limit.max(1) as i64;

        let sql = if q.is_some() {
            "SELECT a.id, a.created_at, a.video_name, a.rubric_id, a.rubric_name,
                    a.task_type, a.model, a.feedback_lang, a.task_summary, a.duration_ms,
                    COUNT(sa.id) AS student_count,
                    COALESCE(GROUP_CONCAT(sa.student_name, ', '), '') AS student_names
             FROM assessments a
             LEFT JOIN student_assessments sa ON sa.assessment_id = a.id
             WHERE a.video_name LIKE ?1
                OR a.rubric_name LIKE ?1
                OR a.task_summary LIKE ?1
                OR EXISTS (
                    SELECT 1 FROM student_assessments sa2
                    WHERE sa2.assessment_id = a.id AND sa2.student_name LIKE ?1
                )
             GROUP BY a.id
             ORDER BY a.id DESC
             LIMIT ?2"
        } else {
            "SELECT a.id, a.created_at, a.video_name, a.rubric_id, a.rubric_name,
                    a.task_type, a.model, a.feedback_lang, a.task_summary, a.duration_ms,
                    COUNT(sa.id) AS student_count,
                    COALESCE(GROUP_CONCAT(sa.student_name, ', '), '') AS student_names
             FROM assessments a
             LEFT JOIN student_assessments sa ON sa.assessment_id = a.id
             GROUP BY a.id
             ORDER BY a.id DESC
             LIMIT ?1"
        };

        let mut stmt = conn.prepare(sql)?;
        let map_row = |row: &rusqlite::Row<'_>| -> rusqlite::Result<AssessmentSummary> {
            Ok(AssessmentSummary {
                id: row.get(0)?,
                created_at: row.get(1)?,
                video_name: row.get(2)?,
                rubric_id: row.get(3)?,
                rubric_name: row.get(4)?,
                task_type: row.get(5)?,
                model: row.get(6)?,
                feedback_lang: row.get(7)?,
                task_summary: row.get(8)?,
                duration_ms: row.get(9)?,
                student_count: row.get::<_, i64>(10)? as usize,
                student_names: row.get(11)?,
            })
        };

        let mut out = Vec::new();
        if let Some(pattern) = q {
            let like = format!("%{pattern}%");
            let rows = stmt.query_map(params![like, limit_i64], map_row)?;
            for r in rows {
                out.push(r?);
            }
        } else {
            let rows = stmt.query_map(params![limit_i64], map_row)?;
            for r in rows {
                out.push(r?);
            }
        }
        Ok(out)
    }

    pub fn get_assessment(&self, id: i64) -> Result<Option<AssessmentDetail>> {
        let conn = self.connect()?;
        let header = conn
            .query_row(
                "SELECT id, created_at, video_name, video_path, video_size_bytes,
                        rubric_id, rubric_name, task_type, model, feedback_lang,
                        media_resolution, detected_lang, task_summary, general_notes, duration_ms
                 FROM assessments WHERE id = ?1",
                params![id],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, Option<i64>>(4)?,
                        row.get::<_, String>(5)?,
                        row.get::<_, String>(6)?,
                        row.get::<_, String>(7)?,
                        row.get::<_, String>(8)?,
                        row.get::<_, String>(9)?,
                        row.get::<_, String>(10)?,
                        row.get::<_, String>(11)?,
                        row.get::<_, String>(12)?,
                        row.get::<_, String>(13)?,
                        row.get::<_, Option<i64>>(14)?,
                    ))
                },
            )
            .optional()?;

        let Some((
            id,
            created_at,
            video_name,
            video_path,
            video_size_bytes,
            rubric_id,
            rubric_name,
            task_type,
            model,
            feedback_lang,
            media_resolution,
            detected_language,
            task_summary,
            general_notes,
            duration_ms,
        )) = header
        else {
            return Ok(None);
        };

        let mut s_stmt = conn.prepare(
            "SELECT id, student_name, original_ai_name, name_confident,
                    total_score, max_total_score, overall_level,
                    strengths_json, weaknesses_json, suggestions_json, practice_json
             FROM student_assessments
             WHERE assessment_id = ?1
             ORDER BY sort_order ASC, id ASC",
        )?;

        let s_rows = s_stmt.query_map(params![id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)? != 0,
                row.get::<_, f64>(4)?,
                row.get::<_, f64>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, String>(9)?,
                row.get::<_, String>(10)?,
            ))
        })?;

        let mut students = Vec::new();
        for s_row in s_rows {
            let (
                sid,
                student_name,
                original_ai_name,
                name_confident,
                total_score,
                max_total_score,
                overall_level,
                strengths_json,
                weaknesses_json,
                suggestions_json,
                practice_json,
            ) = s_row?;

            let criteria = load_criterion_scores(&conn, sid)?;
            let evidence = load_evidence_items(&conn, sid)?;

            students.push(StudentRecord {
                id: sid,
                original_ai_name,
                assessment: StudentAssessment {
                    student_name,
                    name_confident,
                    criteria,
                    total_score,
                    max_total_score,
                    overall_level,
                    strengths: serde_json::from_str(&strengths_json)?,
                    weaknesses: serde_json::from_str(&weaknesses_json)?,
                    improvement_suggestions: serde_json::from_str(&suggestions_json)?,
                    practice_directions: serde_json::from_str(&practice_json)?,
                    evidence,
                },
            });
        }

        Ok(Some(AssessmentDetail {
            id,
            created_at,
            video_name,
            video_path,
            video_size_bytes,
            rubric_id,
            rubric_name,
            task_type,
            model,
            feedback_lang,
            media_resolution,
            detected_language,
            task_summary,
            general_notes,
            duration_ms,
            students,
        }))
    }

    /// Gán lại tên học sinh trực tiếp trên DB (giữ nguyên `original_ai_name`, đánh dấu `name_confident = 1`).
    pub fn rename_student(&self, student_assessment_id: i64, new_name: &str) -> Result<()> {
        let trimmed = new_name.trim();
        if trimmed.is_empty() {
            return Err(GraderError::InvalidInput(
                "Tên học sinh không được để trống.".into(),
            ));
        }
        let conn = self.connect()?;
        let affected = conn.execute(
            "UPDATE student_assessments
             SET student_name = ?1, name_confident = 1
             WHERE id = ?2",
            params![trimmed, student_assessment_id],
        )?;
        if affected == 0 {
            return Err(GraderError::InvalidInput(format!(
                "Không tìm thấy học sinh ID {student_assessment_id}."
            )));
        }
        Ok(())
    }

    pub fn delete_assessment(&self, id: i64) -> Result<()> {
        let conn = self.connect()?;
        conn.execute("DELETE FROM assessments WHERE id = ?1", params![id])?;
        Ok(())
    }
}

fn now_iso() -> String {
    Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

fn upsert_rubric_tx(tx: &rusqlite::Transaction<'_>, rubric: &Rubric, now: &str) -> Result<()> {
    tx.execute(
        "INSERT INTO rubrics (id, name, description, scale_note, is_builtin, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             description = excluded.description,
             scale_note = excluded.scale_note,
             is_builtin = excluded.is_builtin,
             updated_at = excluded.updated_at",
        params![
            rubric.id,
            rubric.name,
            rubric.description,
            rubric.scale_note,
            if rubric.is_builtin { 1i64 } else { 0i64 },
            now,
        ],
    )?;

    tx.execute(
        "DELETE FROM rubric_criteria WHERE rubric_id = ?1",
        params![rubric.id],
    )?;

    for (idx, c) in rubric.criteria.iter().enumerate() {
        tx.execute(
            "INSERT INTO rubric_criteria (rubric_id, sort_order, name, description, min_score, max_score)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                rubric.id,
                idx as i64,
                c.name.trim(),
                c.description.trim(),
                c.min_score,
                c.max_score,
            ],
        )?;
    }
    Ok(())
}

fn ensure_prompt_profile_columns(conn: &Connection) -> Result<()> {
    let mut stmt = conn.prepare("PRAGMA table_info(prompt_profiles)")?;
    let cols: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    if !cols.iter().any(|c| c == "temperature") {
        conn.execute(
            "ALTER TABLE prompt_profiles ADD COLUMN temperature REAL NOT NULL DEFAULT 0.25",
            [],
        )?;
    }
    if !cols.iter().any(|c| c == "strictness") {
        conn.execute(
            "ALTER TABLE prompt_profiles ADD COLUMN strictness TEXT NOT NULL DEFAULT 'standard'",
            [],
        )?;
    }
    Ok(())
}

fn map_prompt_profile_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<PromptProfile> {
    let id: String = row.get(0)?;
    let name: String = row.get(1)?;
    let sys: String = row.get(2)?;
    let with_list: String = row.get(3)?;
    let auto_detect: String = row.get(4)?;
    let rules_json: String = row.get(5)?;
    let tasks_json: String = row.get(6)?;
    let langs_json: String = row.get(7)?;
    let temperature: f64 = row.get::<_, Option<f64>>(8)?.unwrap_or(f64::from(default_temperature()));
    let strictness: String = row
        .get::<_, Option<String>>(9)?
        .unwrap_or_else(default_strictness);

    let grading_rules: Vec<String> = serde_json::from_str(&rules_json).unwrap_or_default();
    let task_types: BTreeMap<String, String> = serde_json::from_str(&tasks_json).unwrap_or_default();
    let feedback_languages: BTreeMap<String, String> =
        serde_json::from_str(&langs_json).unwrap_or_default();

    Ok(merge_with_default(PromptProfile {
        id,
        name,
        system_instruction: sys,
        names_with_list: with_list,
        names_auto_detect: auto_detect,
        grading_rules,
        task_types,
        feedback_languages,
        temperature: temperature as f32,
        strictness,
    }))
}

fn save_prompt_profile_tx(
    tx: &rusqlite::Transaction<'_>,
    profile: &PromptProfile,
    now: &str,
) -> Result<()> {
    let temp = if profile.temperature.is_finite() {
        profile.temperature.clamp(0.0, 1.0)
    } else {
        default_temperature()
    };
    let strictness = if matches!(
        profile.strictness.as_str(),
        "encouraging" | "standard" | "strict"
    ) {
        profile.strictness.as_str()
    } else {
        "standard"
    };
    tx.execute(
        "INSERT INTO prompt_profiles (
            id, name, system_instruction, names_with_list, names_auto_detect,
            grading_rules_json, task_types_json, feedback_langs_json,
            temperature, strictness, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            system_instruction = excluded.system_instruction,
            names_with_list = excluded.names_with_list,
            names_auto_detect = excluded.names_auto_detect,
            grading_rules_json = excluded.grading_rules_json,
            task_types_json = excluded.task_types_json,
            feedback_langs_json = excluded.feedback_langs_json,
            temperature = excluded.temperature,
            strictness = excluded.strictness,
            updated_at = excluded.updated_at",
        params![
            profile.id.trim(),
            profile.name.trim(),
            profile.system_instruction.trim(),
            profile.names_with_list.trim(),
            profile.names_auto_detect.trim(),
            serde_json::to_string(&profile.grading_rules)?,
            serde_json::to_string(&profile.task_types)?,
            serde_json::to_string(&profile.feedback_languages)?,
            f64::from(temp),
            strictness,
            now,
        ],
    )?;
    Ok(())
}

fn load_criteria(conn: &Connection, rubric_id: &str) -> Result<Vec<Criterion>> {
    let mut stmt = conn.prepare(
        "SELECT name, description, min_score, max_score
         FROM rubric_criteria
         WHERE rubric_id = ?1
         ORDER BY sort_order ASC, id ASC",
    )?;
    let rows = stmt.query_map(params![rubric_id], |row| {
        Ok(Criterion {
            name: row.get(0)?,
            description: row.get(1)?,
            min_score: row.get(2)?,
            max_score: row.get(3)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

fn load_criterion_scores(conn: &Connection, student_id: i64) -> Result<Vec<CriterionScore>> {
    let mut stmt = conn.prepare(
        "SELECT criterion_name, score, max_score, comment
         FROM criterion_scores
         WHERE student_assessment_id = ?1
         ORDER BY sort_order ASC, id ASC",
    )?;
    let rows = stmt.query_map(params![student_id], |row| {
        Ok(CriterionScore {
            criterion: row.get(0)?,
            score: row.get(1)?,
            max_score: row.get(2)?,
            comment: row.get(3)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

fn load_evidence_items(conn: &Connection, student_id: i64) -> Result<Vec<Evidence>> {
    let mut stmt = conn.prepare(
        "SELECT timestamp, quote, note
         FROM evidence_items
         WHERE student_assessment_id = ?1
         ORDER BY sort_order ASC, id ASC",
    )?;
    let rows = stmt.query_map(params![student_id], |row| {
        Ok(Evidence {
            timestamp: row.get(0)?,
            quote: row.get(1)?,
            note: row.get(2)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}
