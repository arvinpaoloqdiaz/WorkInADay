use chrono::{DateTime, Local};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Workday {
    pub id: i64,
    pub date_str: String,
    pub target_seconds: i64,
    pub status: String, // "active", "completed", "ended_early", "discarded"
    pub created_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Session {
    pub id: i64,
    pub workday_id: i64,
    pub date_str: Option<String>,
    pub end_date_str: Option<String>,
    pub start_time: String,
    pub end_time: Option<String>,
    pub duration_seconds: i64,
    pub is_running: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkdayState {
    pub workday: Option<Workday>,
    pub sessions: Vec<Session>,
    pub active_session: Option<Session>,
    pub total_completed_seconds: i64,
    pub remaining_seconds: i64,
    pub is_target_reached: bool,
    pub unclosed_workday: Option<Workday>,
}

pub struct AppState {
    pub db: Mutex<Connection>,
}

fn get_db_path(app: &AppHandle) -> PathBuf {
    // Portable database: look next to the executable first
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let portable_db = exe_dir.join("work_timer.db");
            // If the executable directory is writable or already has the file, use it
            if portable_db.exists() {
                return portable_db;
            }
            // Check if we can write to exe_dir
            let test_file = exe_dir.join(".write_test");
            if fs::write(&test_file, b"test").is_ok() {
                let _ = fs::remove_file(&test_file);
                return portable_db;
            }
        }
    }

    // Fallback to app_data_dir for standard installations
    let app_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    fs::create_dir_all(&app_dir).unwrap_or_default();
    app_dir.join("work_timer.db")
}

pub fn init_db(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS workdays (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date_str TEXT NOT NULL,
            target_seconds INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workday_id INTEGER NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT,
            duration_seconds INTEGER NOT NULL DEFAULT 0,
            is_running INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY (workday_id) REFERENCES workdays(id)
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_workday ON sessions(workday_id);
        ",
    )?;

    // Backward-compatible schema migration:
    // Ensure sessions has date_str and end_date_str columns
    let mut stmt = conn.prepare("PRAGMA table_info(sessions)")?;
    let mut has_date_col = false;
    let mut has_end_date_col = false;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        if name == "date_str" {
            has_date_col = true;
        } else if name == "end_date_str" {
            has_end_date_col = true;
        }
    }

    if !has_date_col {
        conn.execute("ALTER TABLE sessions ADD COLUMN date_str TEXT", [])?;
    }
    if !has_end_date_col {
        conn.execute("ALTER TABLE sessions ADD COLUMN end_date_str TEXT", [])?;
    }

    // Backfill any NULL date_str values using the associated workday's date_str
    let _ = conn.execute(
        "UPDATE sessions 
         SET date_str = (
             SELECT COALESCE(w.date_str, '') 
             FROM workdays w 
             WHERE w.id = sessions.workday_id
         )
         WHERE date_str IS NULL OR date_str = ''",
        [],
    );

    // Backfill any NULL end_date_str values with date_str for completed sessions
    let _ = conn.execute(
        "UPDATE sessions 
         SET end_date_str = date_str 
         WHERE (end_date_str IS NULL OR end_date_str = '') AND end_time IS NOT NULL",
        [],
    );

    Ok(())
}

fn calculate_state_internal(conn: &Connection, workday_id: i64) -> Result<WorkdayState, String> {
    let mut stmt = conn
        .prepare("SELECT id, date_str, target_seconds, status, created_at, completed_at FROM workdays WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let workday = stmt
        .query_row(params![workday_id], |row| {
            Ok(Workday {
                id: row.get(0)?,
                date_str: row.get(1)?,
                target_seconds: row.get(2)?,
                status: row.get(3)?,
                created_at: row.get(4)?,
                completed_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut session_stmt = conn
        .prepare(
            "SELECT id, workday_id, date_str, end_date_str, start_time, end_time, duration_seconds, is_running 
             FROM sessions WHERE workday_id = ?1 ORDER BY id ASC",
        )
        .map_err(|e| e.to_string())?;

    let session_iter = session_stmt
        .query_map(params![workday_id], |row| {
            Ok(Session {
                id: row.get(0)?,
                workday_id: row.get(1)?,
                date_str: row.get(2)?,
                end_date_str: row.get(3)?,
                start_time: row.get(4)?,
                end_time: row.get(5)?,
                duration_seconds: row.get(6)?,
                is_running: row.get::<_, i64>(7)? == 1,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut sessions = Vec::new();
    let mut active_session = None;
    let mut total_completed = 0;

    let now = Local::now();

    for s_res in session_iter {
        let s = s_res.map_err(|e| e.to_string())?;
        if s.is_running {
            // Calculate running elapsed time on the fly based on start_time
            if let Ok(start_dt) = DateTime::parse_from_rfc3339(&s.start_time) {
                let start_local = start_dt.with_timezone(&Local);
                let diff = now.signed_duration_since(start_local).num_seconds();
                let current_duration = if diff > 0 { diff } else { 0 };
                let mut running_session = s.clone();
                running_session.duration_seconds = current_duration;
                active_session = Some(running_session.clone());
                sessions.push(running_session);
            } else {
                active_session = Some(s.clone());
                sessions.push(s);
            }
        } else {
            total_completed += s.duration_seconds;
            sessions.push(s);
        }
    }

    let running_sec = active_session
        .as_ref()
        .map(|s| s.duration_seconds)
        .unwrap_or(0);
    let total_worked = total_completed + running_sec;
    let target = workday.target_seconds;
    let remaining = if target > total_worked {
        target - total_worked
    } else {
        0
    };
    let is_reached = target > 0 && total_worked >= target && total_worked > 0;

    Ok(WorkdayState {
        workday: Some(workday),
        sessions,
        active_session,
        total_completed_seconds: total_completed,
        remaining_seconds: remaining,
        is_target_reached: is_reached,
        unclosed_workday: None,
    })
}

// Commands
#[tauri::command]
fn start_day(
    state: tauri::State<'_, AppState>,
    target_hours: i64,
    target_minutes: i64,
) -> Result<WorkdayState, String> {
    if target_hours < 0 || target_minutes < 0 || target_minutes >= 60 {
        return Err("Invalid target hours or minutes.".to_string());
    }
    let target_seconds = (target_hours * 3600) + (target_minutes * 60);
    if target_seconds <= 0 {
        return Err("Target work time must be greater than zero.".to_string());
    }

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let now = Local::now();
    let date_str = now.format("%A, %B %d, %Y").to_string();
    let created_at = now.to_rfc3339();

    conn.execute(
        "INSERT INTO workdays (date_str, target_seconds, status, created_at) VALUES (?1, ?2, 'active', ?3)",
        params![date_str, target_seconds, created_at],
    )
    .map_err(|e| e.to_string())?;

    let workday_id = conn.last_insert_rowid();
    calculate_state_internal(&conn, workday_id)
}

#[tauri::command]
fn start_session(
    state: tauri::State<'_, AppState>,
    workday_id: i64,
) -> Result<WorkdayState, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    // Check if an active session already exists
    let active_count: i64 = conn
        .query_row(
            "SELECT count(*) FROM sessions WHERE workday_id = ?1 AND is_running = 1",
            params![workday_id],
            |r| r.get(0),
        )
        .unwrap_or(0);

    if active_count > 0 {
        return Err("A session is already running.".to_string());
    }

    let now = Local::now();
    let now_rfc = now.to_rfc3339();
    let date_str = now.format("%Y-%m-%d").to_string();

    conn.execute(
        "INSERT INTO sessions (workday_id, date_str, start_time, duration_seconds, is_running) VALUES (?1, ?2, ?3, 0, 1)",
        params![workday_id, date_str, now_rfc],
    )
    .map_err(|e| e.to_string())?;

    calculate_state_internal(&conn, workday_id)
}

#[tauri::command]
fn stop_session(
    state: tauri::State<'_, AppState>,
    workday_id: i64,
) -> Result<WorkdayState, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let session_opt: Option<(i64, String)> = conn
        .query_row(
            "SELECT id, start_time FROM sessions WHERE workday_id = ?1 AND is_running = 1 LIMIT 1",
            params![workday_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .ok();

    if let Some((sess_id, start_time_str)) = session_opt {
        let now = Local::now();
        let end_rfc = now.to_rfc3339();
        let end_date_str = now.format("%Y-%m-%d").to_string();
        let duration = if let Ok(start_dt) = DateTime::parse_from_rfc3339(&start_time_str) {
            let start_local = start_dt.with_timezone(&Local);
            let diff = now.signed_duration_since(start_local).num_seconds();
            if diff > 0 {
                diff
            } else {
                0
            }
        } else {
            0
        };

        conn.execute(
            "UPDATE sessions SET end_time = ?1, end_date_str = ?2, duration_seconds = ?3, is_running = 0 WHERE id = ?4",
            params![end_rfc, end_date_str, duration, sess_id],
        )
        .map_err(|e| e.to_string())?;
    }

    calculate_state_internal(&conn, workday_id)
}

#[tauri::command]
fn finish_day(
    state: tauri::State<'_, AppState>,
    workday_id: i64,
    status: Option<String>,
) -> Result<WorkdayState, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    // Stop active session first if running
    let session_opt: Option<(i64, String)> = conn
        .query_row(
            "SELECT id, start_time FROM sessions WHERE workday_id = ?1 AND is_running = 1 LIMIT 1",
            params![workday_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .ok();

    let now = Local::now();
    let now_rfc = now.to_rfc3339();

    if let Some((sess_id, start_time_str)) = session_opt {
        let duration = if let Ok(start_dt) = DateTime::parse_from_rfc3339(&start_time_str) {
            let start_local = start_dt.with_timezone(&Local);
            let diff = now.signed_duration_since(start_local).num_seconds();
            if diff > 0 {
                diff
            } else {
                0
            }
        } else {
            0
        };

        let end_date_str = now.format("%Y-%m-%d").to_string();
        let _ = conn.execute(
            "UPDATE sessions SET end_time = ?1, end_date_str = ?2, duration_seconds = ?3, is_running = 0 WHERE id = ?4",
            params![now_rfc, end_date_str, duration, sess_id],
        );
    }

    let final_status = status.unwrap_or_else(|| "completed".to_string());
    conn.execute(
        "UPDATE workdays SET status = ?1, completed_at = ?2 WHERE id = ?3",
        params![final_status, now_rfc, workday_id],
    )
    .map_err(|e| e.to_string())?;

    calculate_state_internal(&conn, workday_id)
}

#[tauri::command]
fn get_current_state(
    state: tauri::State<'_, AppState>,
    current_workday_id: Option<i64>,
) -> Result<WorkdayState, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    if let Some(w_id) = current_workday_id {
        return calculate_state_internal(&conn, w_id);
    }

    // Check if there is an unclosed (active) workday from a previous run or today
    let unclosed_id: Option<i64> = conn
        .query_row(
            "SELECT id FROM workdays WHERE status = 'active' ORDER BY id DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .ok();

    if let Some(uid) = unclosed_id {
        let mut res = calculate_state_internal(&conn, uid)?;
        res.unclosed_workday = res.workday.clone();
        return Ok(res);
    }

    Ok(WorkdayState {
        workday: None,
        sessions: vec![],
        active_session: None,
        total_completed_seconds: 0,
        remaining_seconds: 0,
        is_target_reached: false,
        unclosed_workday: None,
    })
}

#[tauri::command]
fn get_history(state: tauri::State<'_, AppState>) -> Result<Vec<serde_json::Value>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT w.id, w.date_str, w.target_seconds, w.status, w.created_at, w.completed_at,
                    COALESCE(SUM(s.duration_seconds), 0) AS total_seconds,
                    COUNT(s.id) AS session_count
             FROM workdays w
             LEFT JOIN sessions s ON s.workday_id = w.id
             GROUP BY w.id
             ORDER BY w.id DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "date_str": row.get::<_, String>(1)?,
                "target_seconds": row.get::<_, i64>(2)?,
                "status": row.get::<_, String>(3)?,
                "created_at": row.get::<_, String>(4)?,
                "completed_at": row.get::<_, Option<String>>(5)?,
                "total_seconds": row.get::<_, i64>(6)?,
                "session_count": row.get::<_, i64>(7)?,
            }))
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for r in rows {
        if let Ok(v) = r {
            result.push(v);
        }
    }
    Ok(result)
}

#[tauri::command]
fn get_workday_details(
    state: tauri::State<'_, AppState>,
    workday_id: i64,
) -> Result<WorkdayState, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    calculate_state_internal(&conn, workday_id)
}

#[tauri::command]
fn update_session(
    state: tauri::State<'_, AppState>,
    session_id: i64,
    start_time: String,
    end_time: Option<String>,
    date_str: Option<String>,
    end_date_str: Option<String>,
) -> Result<WorkdayState, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    // Fetch existing session info
    let (workday_id, is_running): (i64, i64) = conn
        .query_row(
            "SELECT workday_id, is_running FROM sessions WHERE id = ?1",
            params![session_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| format!("Session not found: {}", e))?;

    let start_dt = DateTime::parse_from_rfc3339(&start_time)
        .map_err(|e| format!("Invalid start time RFC3339: {}", e))?;

    let (duration_seconds, final_end_date) = if is_running == 1 {
        // If it's currently running, duration is calculated relative to now
        let now = Local::now();
        let diff = now.signed_duration_since(start_dt.with_timezone(&Local)).num_seconds();
        let current_duration = if diff > 0 { diff } else { 0 };
        (current_duration, None)
    } else {
        if let Some(ref end_str) = end_time {
            let end_dt = DateTime::parse_from_rfc3339(end_str)
                .map_err(|e| format!("Invalid end time RFC3339: {}", e))?;
            let diff = end_dt.signed_duration_since(start_dt).num_seconds();
            if diff < 0 {
                return Err("End time cannot be earlier than start time.".to_string());
            }
            let calculated_end_date = end_date_str.unwrap_or_else(|| end_dt.format("%Y-%m-%d").to_string());
            (diff, Some(calculated_end_date))
        } else {
            (0, None)
        }
    };

    // Update session date_str if provided, or derive from start_dt (YYYY-MM-DD)
    let final_date_str = date_str.unwrap_or_else(|| start_dt.format("%Y-%m-%d").to_string());

    conn.execute(
        "UPDATE sessions 
         SET start_time = ?1, end_time = ?2, duration_seconds = ?3, date_str = ?4, end_date_str = ?5 
         WHERE id = ?6",
        params![start_time, end_time, duration_seconds, final_date_str, final_end_date, session_id],
    )
    .map_err(|e| e.to_string())?;

    calculate_state_internal(&conn, workday_id)
}

#[tauri::command]
fn add_session_to_workday(
    state: tauri::State<'_, AppState>,
    workday_id: i64,
    start_time: String,
    end_time: String,
    date_str: String,
    end_date_str: String,
) -> Result<WorkdayState, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    // Verify workday exists and is not discarded
    let status: String = conn
        .query_row(
            "SELECT status FROM workdays WHERE id = ?1",
            params![workday_id],
            |r| r.get(0),
        )
        .map_err(|e| format!("Workday not found: {}", e))?;

    if status == "discarded" {
        return Err("Cannot add sessions to a discarded workday.".to_string());
    }

    let start_dt = DateTime::parse_from_rfc3339(&start_time)
        .map_err(|e| format!("Invalid start time RFC3339: {}", e))?;
    let end_dt = DateTime::parse_from_rfc3339(&end_time)
        .map_err(|e| format!("Invalid end time RFC3339: {}", e))?;

    let diff = end_dt.signed_duration_since(start_dt).num_seconds();
    if diff < 0 {
        return Err("End time cannot be earlier than start time.".to_string());
    }

    conn.execute(
        "INSERT INTO sessions (workday_id, date_str, end_date_str, start_time, end_time, duration_seconds, is_running)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0)",
        params![workday_id, date_str, end_date_str, start_time, end_time, diff],
    )
    .map_err(|e| e.to_string())?;

    calculate_state_internal(&conn, workday_id)
}

#[tauri::command]
fn resume_workday(
    state: tauri::State<'_, AppState>,
    workday_id: i64,
) -> Result<WorkdayState, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;

    let status: String = conn
        .query_row(
            "SELECT status FROM workdays WHERE id = ?1",
            params![workday_id],
            |r| r.get(0),
        )
        .map_err(|e| format!("Workday not found: {}", e))?;

    if status == "discarded" {
        return Err("Cannot resume a discarded workday.".to_string());
    }

    // Reactivate workday so it can be tracked or added to live
    conn.execute(
        "UPDATE workdays SET status = 'active', completed_at = NULL WHERE id = ?1",
        params![workday_id],
    )
    .map_err(|e| e.to_string())?;

    calculate_state_internal(&conn, workday_id)
}

#[tauri::command]
fn discard_workday(state: tauri::State<'_, AppState>, workday_id: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE workdays SET status = 'discarded' WHERE id = ?1",
        params![workday_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_always_on_top(app: AppHandle, always_on_top: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .set_always_on_top(always_on_top)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn resize_window(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window
            .set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn minimize_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.minimize().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn close_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn start_dragging(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.start_dragging().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Check GitHub Releases for a newer version.
/// Returns { available: bool, version: String, body: String }
#[tauri::command]
async fn check_for_update(app: AppHandle) -> Result<serde_json::Value, String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await {
        Ok(Some(update)) => Ok(serde_json::json!({
            "available": true,
            "version": update.version,
            "body": update.body.unwrap_or_default()
        })),
        Ok(None) => Ok(serde_json::json!({ "available": false, "version": "", "body": "" })),
        Err(e) => Err(e.to_string()),
    }
}

/// Download and install the update, then relaunch.
#[tauri::command]
async fn install_update(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;
    if let Some(update) = updater.check().await.map_err(|e| e.to_string())? {
        update
            .download_and_install(|_chunk, _total| {}, || {})
            .await
            .map_err(|e| e.to_string())?;
        // Relaunch after install
        app.restart();
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let db_path = get_db_path(&app.handle());
            let conn = Connection::open(db_path).expect("Failed to open SQLite database");
            init_db(&conn).expect("Failed to initialize database schema");
            app.manage(AppState {
                db: Mutex::new(conn),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_day,
            start_session,
            stop_session,
            finish_day,
            get_current_state,
            get_history,
            get_workday_details,
            update_session,
            add_session_to_workday,
            resume_workday,
            discard_workday,
            set_always_on_top,
            resize_window,
            minimize_window,
            close_window,
            start_dragging,
            check_for_update,
            install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
