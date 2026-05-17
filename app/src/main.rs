// Prevents an additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use countdown_lib::{
    data_paths, format_date, load_app_data, next_renewed_item, normalize_reminder_offsets,
    remaining_days, reveal_path, save_items, save_settings, send_bark_push, set_launch_at_login,
    utc_from_local_days, AppSettings, CountdownItem, RepeatRule,
};
use slint::{ModelRc, SharedString, Timer, TimerMode, VecModel};
use std::time::Duration;
use std::{cell::RefCell, rc::Rc};

slint::include_modules!();

#[derive(Clone)]
struct AppState {
    all_items: Vec<CountdownItem>,
    settings: AppSettings,
    selected_id: Option<String>,
    filter_index: i32,
    sort_ascending: bool,
}

fn main() -> Result<(), slint::PlatformError> {
    let app = MainWindow::new()?;
    let data = load_app_data().unwrap_or_else(|error| {
        eprintln!("Failed to load data: {error}");
        countdown_lib::AppData {
            items: Vec::new(),
            settings: AppSettings::default(),
            paths: data_paths(),
            recovery_notice: None,
        }
    });

    let state = Rc::new(RefCell::new(AppState {
        all_items: data.items,
        settings: data.settings,
        selected_id: None,
        filter_index: 0,
        sort_ascending: true,
    }));

    app.set_bark_input(state.borrow().settings.bark_push_address.clone().into());
    app.set_push_enabled(state.borrow().settings.push_enabled);
    app.set_launch_at_login(state.borrow().settings.launch_at_login_enabled);
    app.set_theme_mode(state.borrow().settings.theme_mode.clamp(0, 2));
    app.set_data_dir(data.paths.data_dir.into());
    sync_system_theme(&app);
    refresh(&app, &state);

    let theme_timer = Timer::default();
    {
        let app = app.as_weak();
        theme_timer.start(TimerMode::Repeated, Duration::from_secs(5), move || {
            let Some(app) = app.upgrade() else {
                return;
            };
            sync_system_theme(&app);
        });
    }

    {
        let app = app.as_weak();
        let state = Rc::clone(&state);
        app.unwrap().on_select_item(move |index| {
            let Some(app) = app.upgrade() else {
                return;
            };
            let visible = visible_items(&state.borrow());
            if let Some(item) = visible.get(index as usize) {
                state.borrow_mut().selected_id = Some(item.id.to_string());
                app.set_selected_index(index);
                fill_editor(&app, item);
            }
        });
    }

    {
        let app = app.as_weak();
        let state = Rc::clone(&state);
        app.unwrap().on_add_item(move || {
            let Some(app) = app.upgrade() else {
                return;
            };
            state.borrow_mut().selected_id = None;
            app.set_selected_index(-1);
            app.set_name_input("".into());
            app.set_days_input("30".into());
            app.set_category_input("".into());
            app.set_note_input("".into());
            app.set_reminders_input("7, 0".into());
            app.set_archived_input(false);
            app.set_toast("准备新增项目".into());
        });
    }

    {
        let app = app.as_weak();
        let state = Rc::clone(&state);
        app.unwrap().on_save_item(move || {
            let Some(app) = app.upgrade() else {
                return;
            };
            let name = app.get_name_input().trim().to_string();
            if name.is_empty() {
                app.set_toast("名称不能为空".into());
                return;
            }
            let days = app
                .get_days_input()
                .trim()
                .parse::<i64>()
                .unwrap_or(30)
                .clamp(0, 3650);
            let reminders = parse_reminders(&app.get_reminders_input());
            let mut state_ref = state.borrow_mut();
            let selected = state_ref.selected_id.clone();
            if let Some(id) = selected {
                if let Some(item) = state_ref
                    .all_items
                    .iter_mut()
                    .find(|item| item.id.to_string() == id)
                {
                    item.name = name;
                    item.expiry_date = utc_from_local_days(days);
                    item.category = app.get_category_input().trim().to_string();
                    item.note = app.get_note_input().trim().to_string();
                    item.reminder_offsets = reminders;
                    item.is_archived = app.get_archived_input();
                    item.updated_at = chrono::Utc::now();
                }
            } else {
                let mut item = CountdownItem::new(
                    name,
                    days,
                    app.get_category_input().trim().to_string(),
                    app.get_note_input().trim().to_string(),
                );
                item.reminder_offsets = reminders;
                item.is_archived = app.get_archived_input();
                state_ref.selected_id = Some(item.id.to_string());
                state_ref.all_items.push(item);
            }
            persist_items(&app, &mut state_ref);
            drop(state_ref);
            refresh(&app, &state);
        });
    }

    wire_simple_actions(&app, &state);
    let result = app.run();
    drop(theme_timer);
    result
}

fn sync_system_theme(app: &MainWindow) {
    app.set_system_dark_mode(matches!(dark_light::detect(), Ok(dark_light::Mode::Dark)));
}

fn wire_simple_actions(app: &MainWindow, state: &Rc<RefCell<AppState>>) {
    {
        let app = app.as_weak();
        let state = Rc::clone(state);
        app.unwrap().on_delete_item(move || {
            let Some(app) = app.upgrade() else {
                return;
            };
            let mut state_ref = state.borrow_mut();
            let Some(id) = state_ref.selected_id.clone() else {
                return;
            };
            state_ref.all_items.retain(|item| item.id.to_string() != id);
            state_ref.selected_id = None;
            persist_items(&app, &mut state_ref);
            drop(state_ref);
            refresh(&app, &state);
        });
    }
    {
        let app = app.as_weak();
        let state = Rc::clone(state);
        app.unwrap().on_archive_toggle(move || {
            let Some(app) = app.upgrade() else {
                return;
            };
            let mut state_ref = state.borrow_mut();
            let Some(id) = state_ref.selected_id.clone() else {
                return;
            };
            if let Some(item) = state_ref
                .all_items
                .iter_mut()
                .find(|item| item.id.to_string() == id)
            {
                item.is_archived = !item.is_archived;
                item.updated_at = chrono::Utc::now();
            }
            persist_items(&app, &mut state_ref);
            drop(state_ref);
            refresh(&app, &state);
        });
    }
    {
        let app = app.as_weak();
        let state = Rc::clone(state);
        app.unwrap().on_renew_item(move || {
            let Some(app) = app.upgrade() else {
                return;
            };
            let mut state_ref = state.borrow_mut();
            let Some(id) = state_ref.selected_id.clone() else {
                return;
            };
            if let Some(index) = state_ref
                .all_items
                .iter()
                .position(|item| item.id.to_string() == id)
            {
                if let Some(renewed) = next_renewed_item(&state_ref.all_items[index]) {
                    state_ref.all_items[index] = renewed;
                } else {
                    app.set_toast("该项目未设置重复规则".into());
                    return;
                }
            }
            persist_items(&app, &mut state_ref);
            drop(state_ref);
            refresh(&app, &state);
        });
    }
    {
        let app = app.as_weak();
        let state = Rc::clone(state);
        app.unwrap()
            .on_move_up(move || move_selected(&app, &state, -1));
    }
    {
        let app = app.as_weak();
        let state = Rc::clone(state);
        app.unwrap()
            .on_move_down(move || move_selected(&app, &state, 1));
    }
    {
        let app = app.as_weak();
        let state = Rc::clone(state);
        app.unwrap().on_sort_near(move || {
            let Some(app) = app.upgrade() else {
                return;
            };
            let mut state_ref = state.borrow_mut();
            let asc = state_ref.sort_ascending;
            state_ref.all_items.sort_by(|a, b| {
                let da = remaining_days(a);
                let db = remaining_days(b);
                if asc { da.cmp(&db) } else { db.cmp(&da) }.then_with(|| a.name.cmp(&b.name))
            });
            state_ref.sort_ascending = !asc;
            persist_items(&app, &mut state_ref);
            drop(state_ref);
            refresh(&app, &state);
        });
    }
    {
        let app = app.as_weak();
        let state = Rc::clone(state);
        app.unwrap().on_filter_changed(move |index| {
            let Some(app) = app.upgrade() else {
                return;
            };
            state.borrow_mut().filter_index = index;
            app.set_filter_index(index);
            refresh(&app, &state);
        });
    }
    {
        let app = app.as_weak();
        app.unwrap().on_open_data_dir(move || {
            let Some(app) = app.upgrade() else {
                return;
            };
            match reveal_path(data_paths().data_dir) {
                Ok(()) => app.set_toast("已打开数据目录".into()),
                Err(error) => app.set_toast(error.into()),
            }
        });
    }
    {
        let app = app.as_weak();
        let state = Rc::clone(state);
        app.unwrap().on_save_settings(move || {
            let Some(app) = app.upgrade() else {
                return;
            };
            let mut state_ref = state.borrow_mut();
            state_ref.settings.push_enabled = app.get_push_enabled();
            state_ref.settings.bark_push_address = app.get_bark_input().to_string();
            state_ref.settings.launch_at_login_enabled = app.get_launch_at_login();
            state_ref.settings.theme_mode = app.get_theme_mode().clamp(0, 2);
            let _ = set_launch_at_login(state_ref.settings.launch_at_login_enabled);
            match save_settings(state_ref.settings.clone()) {
                Ok(saved) => {
                    state_ref.settings = saved;
                    app.set_toast("设置已保存".into());
                }
                Err(error) => app.set_toast(error.into()),
            }
        });
    }
    {
        let app = app.as_weak();
        let state = Rc::clone(state);
        app.unwrap().on_test_push(move || {
            let Some(app) = app.upgrade() else {
                return;
            };
            let settings = state.borrow().settings.clone();
            match send_bark_push(
                settings.bark_push_address,
                "Countdown 测试".to_string(),
                7,
                settings.app_language,
            ) {
                Ok(()) => app.set_toast("测试推送已发送".into()),
                Err(error) => app.set_toast(error.into()),
            }
        });
    }
    {
        let app = app.as_weak();
        let state = Rc::clone(state);
        app.unwrap().on_theme_changed(move |mode| {
            let Some(app) = app.upgrade() else {
                return;
            };
            let mode = mode.clamp(0, 2);
            app.set_theme_mode(mode);
            let mut state_ref = state.borrow_mut();
            state_ref.settings.theme_mode = mode;
            match save_settings(state_ref.settings.clone()) {
                Ok(saved) => {
                    state_ref.settings = saved;
                    app.set_toast("主题已更新".into());
                }
                Err(error) => app.set_toast(error.into()),
            }
        });
    }
}

fn move_selected(app: &slint::Weak<MainWindow>, state: &Rc<RefCell<AppState>>, delta: isize) {
    let Some(app) = app.upgrade() else {
        return;
    };
    let mut state_ref = state.borrow_mut();
    let Some(id) = state_ref.selected_id.clone() else {
        return;
    };
    let Some(index) = state_ref
        .all_items
        .iter()
        .position(|item| item.id.to_string() == id)
    else {
        return;
    };
    let next = (index as isize + delta)
        .clamp(0, state_ref.all_items.len().saturating_sub(1) as isize) as usize;
    if index != next {
        state_ref.all_items.swap(index, next);
        persist_items(&app, &mut state_ref);
    }
    drop(state_ref);
    refresh(&app, state);
}

fn refresh(app: &MainWindow, state: &Rc<RefCell<AppState>>) {
    let state_ref = state.borrow();
    let visible = visible_items(&state_ref);
    let selected_id = state_ref.selected_id.clone();
    let selected_index = visible
        .iter()
        .position(|item| selected_id.as_deref() == Some(&item.id.to_string()))
        .map(|index| index as i32)
        .unwrap_or(-1);
    let stats = build_stats(&visible);
    let title = nearest_title(&visible);
    app.set_items(ModelRc::new(VecModel::from(
        visible.iter().map(to_ui_item).collect::<Vec<_>>(),
    )));
    app.set_selected_index(selected_index);
    app.set_title_text(title.into());
    app.set_total_count(stats.0.to_string().into());
    app.set_soon_count(stats.1.to_string().into());
    app.set_overdue_count(stats.2.to_string().into());
    app.set_filter_index(state_ref.filter_index);
}

fn visible_items(state: &AppState) -> Vec<CountdownItem> {
    state
        .all_items
        .iter()
        .filter(|item| match state.filter_index {
            0 => !item.is_archived,
            1 => true,
            2 => !item.is_archived && (0..=30).contains(&remaining_days(item)),
            3 => !item.is_archived && remaining_days(item) < 0,
            _ => item.is_archived,
        })
        .cloned()
        .collect()
}

fn fill_editor(app: &MainWindow, item: &CountdownItem) {
    app.set_name_input(item.name.clone().into());
    app.set_days_input(remaining_days(item).max(0).to_string().into());
    app.set_category_input(item.category.clone().into());
    app.set_note_input(item.note.clone().into());
    app.set_reminders_input(
        item.reminder_offsets
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>()
            .join(", ")
            .into(),
    );
    app.set_archived_input(item.is_archived);
}

fn persist_items(app: &MainWindow, state: &mut AppState) {
    match save_items(state.all_items.clone()) {
        Ok(saved) => {
            state.all_items = saved;
            app.set_toast("已保存".into());
        }
        Err(error) => app.set_toast(error.into()),
    }
}

fn parse_reminders(input: &SharedString) -> Vec<i32> {
    let parsed: Vec<i32> = input
        .split(|ch: char| ch == ',' || ch == '，' || ch.is_whitespace())
        .filter_map(|part| part.parse::<i32>().ok())
        .collect();
    normalize_reminder_offsets(&parsed)
}

fn to_ui_item(item: &CountdownItem) -> UiItem {
    let days = remaining_days(item);
    UiItem {
        id: item.id.to_string().into(),
        name: item.name.clone().into(),
        date: format_date(item.expiry_date).into(),
        days_text: days.abs().to_string().into(),
        category: item.category.clone().into(),
        note: item.note.clone().into(),
        archived: item.is_archived,
        repeat: repeat_label(item.repeat_rule).into(),
        urgent: days < 15,
        warning: (15..=30).contains(&days),
    }
}

fn repeat_label(rule: RepeatRule) -> String {
    match rule {
        RepeatRule::None => String::new(),
        RepeatRule::Monthly => "每月".to_string(),
        RepeatRule::Quarterly => "每季度".to_string(),
        RepeatRule::Yearly => "每年".to_string(),
        RepeatRule::CustomDays => "自定义重复".to_string(),
    }
}

fn build_stats(items: &[CountdownItem]) -> (usize, usize, usize) {
    let mut soon = 0;
    let mut overdue = 0;
    for item in items {
        let days = remaining_days(item);
        if days < 0 {
            overdue += 1;
        }
        if (0..=30).contains(&days) {
            soon += 1;
        }
    }
    (items.len(), soon, overdue)
}

fn nearest_title(items: &[CountdownItem]) -> String {
    items
        .iter()
        .min_by_key(|item| remaining_days(item).abs())
        .map(|item| item.name.clone())
        .unwrap_or_else(|| "Countdown".to_string())
}
