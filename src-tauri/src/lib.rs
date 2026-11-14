mod activity_log;
mod commands;
mod media_server;
mod state;

use state::AppState;
use tauri::Manager;

#[cfg(target_os = "linux")]
fn configure_linux_media_env() {
    // On Linux hybrid-GPU laptops (Intel + NVIDIA), WebKitGTK's Wayland/OpenGL display
    // often runs on Intel while GStreamer's `nvh264dec` (rank primary+1) decodes H.264 into
    // CUDA memory, causing PBO/OpenGL negotiation failures (black screen / infinite spinner).
    // Prefer software `avdec_h264` unless the user explicitly overrides GST_PLUGIN_FEATURE_RANK.
    if std::env::var_os("GST_PLUGIN_FEATURE_RANK").is_none() {
        std::env::set_var(
            "GST_PLUGIN_FEATURE_RANK",
            "avdec_h264:MAX,nvh264dec:NONE,nvautogpuh264dec:NONE,vulkanh264dec:NONE,vulkanh264device1dec:NONE",
        );
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    configure_linux_media_env();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_local_data_dir = app.path().app_local_data_dir().ok();
            let app_state =
                AppState::initialize(app_local_data_dir).map_err(std::io::Error::other)?;
            if let Ok(res_dir) = app.path().resource_dir() {
                app_state.set_resource_dir(res_dir);
            }
            app.manage(app_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_bootstrap,
            commands::authorize_media_path,
            commands::inspect_file,
            commands::fetch_models,
            commands::cancel_task,
            commands::grade_video_cmd,
            commands::probe_media_duration,
            commands::compress_video_cmd,
            commands::extract_mp3_cmd,
            commands::trim_media_cmd,
            commands::mute_video_cmd,
            commands::generate_script_cmd,
            commands::export_transcript_file,
            commands::embed_subtitles_video_cmd,
            commands::list_rubrics,
            commands::save_custom_rubric,
            commands::clone_rubric,
            commands::delete_custom_rubric,
            commands::list_grading_assignments,
            commands::save_grading_assignment,
            commands::delete_grading_assignment,
            commands::load_image_file,
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
            commands::get_diagnostics,
            commands::clear_activity_logs,
            commands::log_client_event,
            commands::open_diagnostic_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
