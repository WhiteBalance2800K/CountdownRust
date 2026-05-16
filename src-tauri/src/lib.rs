use auto_launch::AutoLaunchBuilder;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
};
use uuid::Uuid;

const APP_NAME: &str = "Countdown";
const DATA_FILE: &str = "items.json";
const SETTINGS_FILE: &str = "settings.json";
const BACKUP_LIMIT: usize = 12;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CountdownItem {
    #[serde(default = "new_uuid")]
    id: Uuid,
    #[serde(default)]
    name: String,
    #[serde(default = "now_utc")]
    expiry_date: DateTime<Utc>,
    #[serde(default = "now_utc")]
    created_at: DateTime<Utc>,
    #[serde(default = "now_utc")]
    updated_at: DateTime<Utc>,
    #[serde(default)]
    note: String,
    #[serde(default = "default_reminder_offsets")]
    reminder_offsets: Vec<i32>,
    #[serde(default)]
    category: String,
    #[serde(default)]
    link: String,
    #[serde(default)]
    is_archived: bool,
    #[serde(default)]
    repeat_rule: RepeatRule,
    #[serde(default = "default_repeat_custom_days")]
    repeat_custom_days: i32,
}

impl CountdownItem {
    fn normalized(mut self) -> Self {
        self.name = self.name.trim().to_string();
        self.note = self.note.trim().to_string();
        self.category = self.category.trim().to_string();
        self.link = self.link.trim().to_string();
        self.reminder_offsets = normalize_reminder_offsets(&self.reminder_offsets);
        self.repeat_custom_days = self.repeat_custom_days.max(1);
        self
    }
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RepeatRule {
    #[default]
    #[serde(rename = "none")]
    None,
    Monthly,
    Quarterly,
    Yearly,
    CustomDays,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default)]
    push_enabled: bool,
    #[serde(default = "default_bark_address")]
    bark_push_address: String,
    #[serde(default = "default_true")]
    push_seven_days_enabled: bool,
    #[serde(default = "default_true")]
    push_due_day_enabled: bool,
    #[serde(default = "default_language")]
    app_language: String,
    #[serde(default)]
    launch_at_login_enabled: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            push_enabled: false,
            bark_push_address: default_bark_address(),
            push_seven_days_enabled: true,
            push_due_day_enabled: true,
            app_language: default_language(),
            launch_at_login_enabled: false,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataPaths {
    data_dir: String,
    data_file: String,
    backups_dir: String,
    settings_file: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryNotice {
    kind: String,
    corrupted_backup_path: Option<String>,
    restored_from_path: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppData {
    items: Vec<CountdownItem>,
    settings: AppSettings,
    paths: DataPaths,
    recovery_notice: Option<RecoveryNotice>,
}

#[tauri::command]
fn load_app_data() -> Result<AppData, String> {
    ensure_data_dirs()?;
    let (items, recovery_notice) = load_items_with_recovery()?;
    let mut settings = load_settings()?;
    settings.launch_at_login_enabled = launch_at_login_status().unwrap_or(false);

    Ok(AppData {
        items,
        settings,
        paths: data_paths(),
        recovery_notice,
    })
}

#[tauri::command]
fn save_items(items: Vec<CountdownItem>) -> Result<Vec<CountdownItem>, String> {
    let normalized: Vec<CountdownItem> = items.into_iter().map(CountdownItem::normalized).collect();
    let bytes = serde_json::to_vec_pretty(&normalized).map_err(to_error)?;
    write_json_atomically(&data_file_path(), &bytes)?;
    save_snapshot_backup(&bytes)?;
    Ok(normalized)
}

#[tauri::command]
fn save_settings(settings: AppSettings) -> Result<AppSettings, String> {
    ensure_data_dirs()?;
    let bytes = serde_json::to_vec_pretty(&settings).map_err(to_error)?;
    write_json_atomically(&settings_file_path(), &bytes)?;
    Ok(settings)
}

#[tauri::command]
fn reveal_path(path: String) -> Result<(), String> {
    opener::open(path).map_err(to_error)
}

#[tauri::command]
fn launch_at_login_status() -> Result<bool, String> {
    auto_launcher()?.is_enabled().map_err(to_error)
}

#[tauri::command]
fn set_launch_at_login(enabled: bool) -> Result<bool, String> {
    let launcher = auto_launcher()?;
    if enabled {
        launcher.enable().map_err(to_error)?;
    } else {
        launcher.disable().map_err(to_error)?;
    }
    launcher.is_enabled().map_err(to_error)
}

#[tauri::command]
async fn send_bark_push(
    push_address: String,
    item_name: String,
    days_until_expiry: i64,
    language: String,
) -> Result<(), String> {
    let trimmed = push_address.trim();
    if trimmed.is_empty() {
        return Err("Bark address is empty".to_string());
    }

    let mut url = reqwest::Url::parse(trimmed).map_err(to_error)?;
    {
        let mut segments = url
            .path_segments_mut()
            .map_err(|_| "Bark address cannot be used as a base URL".to_string())?;
        segments.push(APP_NAME);
        segments.push(&bark_body(&item_name, days_until_expiry, &language));
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(to_error)?;
    let response = client.get(url).send().await.map_err(to_error)?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!("Bark request failed with {}", response.status()))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_app_data,
            save_items,
            save_settings,
            reveal_path,
            launch_at_login_status,
            set_launch_at_login,
            send_bark_push
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn load_items_with_recovery() -> Result<(Vec<CountdownItem>, Option<RecoveryNotice>), String> {
    let path = data_file_path();
    if !path.exists() {
        return Ok((Vec::new(), None));
    }

    match read_items_file(&path) {
        Ok(items) => Ok((items, None)),
        Err(_) => recover_from_corrupted_data_file(&path),
    }
}

fn read_items_file(path: &Path) -> Result<Vec<CountdownItem>, String> {
    let data = fs::read(path).map_err(to_error)?;
    let items: Vec<CountdownItem> = serde_json::from_slice(&data).map_err(to_error)?;
    Ok(items.into_iter().map(CountdownItem::normalized).collect())
}

fn recover_from_corrupted_data_file(
    path: &Path,
) -> Result<(Vec<CountdownItem>, Option<RecoveryNotice>), String> {
    let corrupted_backup_path = backup_corrupted_file(path).ok();
    if let Some((items, restored_from_path)) = latest_valid_snapshot() {
        let bytes = serde_json::to_vec_pretty(&items).map_err(to_error)?;
        write_json_atomically(path, &bytes)?;
        return Ok((
            items,
            Some(RecoveryNotice {
                kind: "restored".to_string(),
                corrupted_backup_path: corrupted_backup_path.map(path_to_string),
                restored_from_path: Some(path_to_string(restored_from_path)),
            }),
        ));
    }

    Ok((
        Vec::new(),
        Some(RecoveryNotice {
            kind: "manualRecoveryNeeded".to_string(),
            corrupted_backup_path: corrupted_backup_path.map(path_to_string),
            restored_from_path: None,
        }),
    ))
}

fn backup_corrupted_file(path: &Path) -> Result<PathBuf, String> {
    ensure_data_dirs()?;
    let destination = backups_dir().join(format!("items-corrupt-{}.json", timestamp()));
    if destination.exists() {
        fs::remove_file(&destination).map_err(to_error)?;
    }
    fs::rename(path, &destination).map_err(to_error)?;
    Ok(destination)
}

fn save_snapshot_backup(bytes: &[u8]) -> Result<(), String> {
    ensure_data_dirs()?;
    let destination = backups_dir().join(format!("items-backup-{}.json", timestamp()));
    write_json_atomically(&destination, bytes)?;
    prune_snapshot_backups();
    Ok(())
}

fn latest_valid_snapshot() -> Option<(Vec<CountdownItem>, PathBuf)> {
    for path in snapshot_backup_paths() {
        if let Ok(items) = read_items_file(&path) {
            return Some((items, path));
        }
    }
    None
}

fn prune_snapshot_backups() {
    let paths = snapshot_backup_paths();
    if paths.len() <= BACKUP_LIMIT {
        return;
    }
    for path in paths.into_iter().skip(BACKUP_LIMIT) {
        let _ = fs::remove_file(path);
    }
}

fn snapshot_backup_paths() -> Vec<PathBuf> {
    let mut paths: Vec<(PathBuf, std::time::SystemTime)> = fs::read_dir(backups_dir())
        .ok()
        .into_iter()
        .flat_map(|entries| entries.filter_map(Result::ok))
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("items-backup-") && name.ends_with(".json"))
        })
        .map(|path| {
            let modified = fs::metadata(&path)
                .and_then(|metadata| metadata.modified())
                .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
            (path, modified)
        })
        .collect();

    paths.sort_by(|(_, left), (_, right)| right.cmp(left));
    paths.into_iter().map(|(path, _)| path).collect()
}

fn load_settings() -> Result<AppSettings, String> {
    let path = settings_file_path();
    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let data = fs::read(path).map_err(to_error)?;
    serde_json::from_slice(&data).map_err(to_error)
}

fn auto_launcher() -> Result<auto_launch::AutoLaunch, String> {
    let app_path = std::env::current_exe().map_err(to_error)?;
    let app_path = app_path
        .to_str()
        .ok_or_else(|| "App path is not valid UTF-8".to_string())?;

    let mut builder = AutoLaunchBuilder::new();
    builder.set_app_name(APP_NAME).set_app_path(app_path);

    #[cfg(target_os = "windows")]
    builder.set_windows_enable_mode(auto_launch::WindowsEnableMode::CurrentUser);

    #[cfg(target_os = "macos")]
    builder.set_macos_launch_mode(auto_launch::MacOSLaunchMode::LaunchAgent);

    #[cfg(target_os = "linux")]
    builder.set_linux_launch_mode(auto_launch::LinuxLaunchMode::XdgAutostart);

    builder.build().map_err(to_error)
}

fn data_paths() -> DataPaths {
    DataPaths {
        data_dir: path_to_string(data_dir()),
        data_file: path_to_string(data_file_path()),
        backups_dir: path_to_string(backups_dir()),
        settings_file: path_to_string(settings_file_path()),
    }
}

fn ensure_data_dirs() -> Result<(), String> {
    fs::create_dir_all(data_dir()).map_err(to_error)?;
    fs::create_dir_all(backups_dir()).map_err(to_error)?;
    Ok(())
}

fn data_file_path() -> PathBuf {
    data_dir().join(DATA_FILE)
}

fn settings_file_path() -> PathBuf {
    data_dir().join(SETTINGS_FILE)
}

fn backups_dir() -> PathBuf {
    data_dir().join("backups")
}

fn data_dir() -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        if let Some(home) = dirs::home_dir() {
            return home.join("Library").join("Application Support").join(APP_NAME);
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(dir) = dirs::data_dir() {
            return dir.join(APP_NAME);
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(dir) = dirs::data_dir() {
            return dir.join("countdown");
        }
    }

    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("CountdownData")
}

fn write_json_atomically(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(to_error)?;
    }
    let tmp_path = path.with_extension("json.tmp");
    fs::write(&tmp_path, bytes).map_err(to_error)?;
    if cfg!(target_os = "windows") && path.exists() {
        fs::remove_file(path).map_err(to_error)?;
    }
    fs::rename(&tmp_path, path).map_err(to_error)?;
    Ok(())
}

fn normalize_reminder_offsets(offsets: &[i32]) -> Vec<i32> {
    let values: BTreeSet<i32> = offsets.iter().map(|value| (*value).clamp(0, 3650)).collect();
    let mut sorted: Vec<i32> = values.into_iter().rev().collect();
    if sorted.is_empty() {
        sorted = default_reminder_offsets();
    }
    sorted
}

fn bark_body(item_name: &str, days_until_expiry: i64, language: &str) -> String {
    match language {
        "zh-Hans" => {
            if days_until_expiry == 0 {
                format!("{item_name} 今天到期")
            } else {
                format!("{item_name} {days_until_expiry} 天后到期")
            }
        }
        "ja" => {
            if days_until_expiry == 0 {
                format!("{item_name} は今日が期限です")
            } else {
                format!("{item_name} は{days_until_expiry}日後が期限です")
            }
        }
        _ => {
            if days_until_expiry == 0 {
                format!("{item_name} is due today")
            } else {
                format!("{item_name} is due in {days_until_expiry} days")
            }
        }
    }
}

fn timestamp() -> String {
    Utc::now().format("%Y%m%d-%H%M%S").to_string()
}

fn path_to_string(path: PathBuf) -> String {
    path.to_string_lossy().into_owned()
}

fn new_uuid() -> Uuid {
    Uuid::new_v4()
}

fn now_utc() -> DateTime<Utc> {
    Utc::now()
}

fn default_reminder_offsets() -> Vec<i32> {
    vec![7, 0]
}

fn default_repeat_custom_days() -> i32 {
    30
}

fn default_bark_address() -> String {
    "https://api.day.app/".to_string()
}

fn default_language() -> String {
    "zh-Hans".to_string()
}

fn default_true() -> bool {
    true
}

fn to_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_reminder_offsets() {
        assert_eq!(
            normalize_reminder_offsets(&[0, 30, 7, 30, 4000, -1]),
            vec![3650, 30, 7, 0]
        );
        assert_eq!(normalize_reminder_offsets(&[]), vec![7, 0]);
    }

    #[test]
    fn keeps_swift_repeat_rule_names() {
        assert_eq!(serde_json::to_string(&RepeatRule::CustomDays).unwrap(), "\"customDays\"");
        assert_eq!(serde_json::to_string(&RepeatRule::None).unwrap(), "\"none\"");
    }
}
