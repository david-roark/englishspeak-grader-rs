mod commands;
mod media_server;
mod state;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState::initialize().expect("Failed to initialize application state");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::get_bootstrap,
            commands::inspect_file,
            commands::fetch_models,
            commands::cancel_task,
            commands::grade_video_cmd,
            commands::probe_media_duration,
            commands::compress_video_cmd,
            commands::extract_mp3_cmd,
            commands::trim_media_cmd,
            commands::mute_video_cmd,
            commands::list_rubrics,
            commands::save_custom_rubric,
            commands::clone_rubric,
            commands::delete_custom_rubric,
            commands::list_assessments,
            commands::get_assessment,
            commands::rename_student,
            commands::delete_assessment,
            commands::export_assessment_excel,
            commands::get_assessment_markdown,
            commands::save_prompt_profile,
            commands::clone_prompt_profile,
            commands::delete_prompt_profile,
            commands::set_active_prompt_profile,
            commands::reset_prompt_profile,
            commands::preview_grading_prompt,
            commands::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
