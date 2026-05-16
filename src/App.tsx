import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, DragEvent, FormEvent, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Bell,
  Calendar,
  Check,
  Clock3,
  Database,
  ExternalLink,
  Flame,
  FolderClock,
  FolderOpen,
  GripVertical,
  LayoutGrid,
  Link2,
  Loader2,
  Minus,
  Monitor,
  Moon,
  Pencil,
  Plus,
  RefreshCcw,
  RotateCcw,
  Send,
  Settings,
  Sun,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import "./App.css";

type RepeatRule = "none" | "monthly" | "quarterly" | "yearly" | "customDays";
type DashboardFilter = "active" | "all" | "within30" | "overdue" | "archived";
type ExpiryInputMode = "remainingDays" | "date";
type EditorMode = "add" | "edit";
type ThemePreference = "system" | "light" | "dark";

interface CountdownItem {
  id: string;
  name: string;
  expiryDate: string;
  createdAt: string;
  updatedAt: string;
  note: string;
  reminderOffsets: number[];
  category: string;
  link: string;
  isArchived: boolean;
  repeatRule: RepeatRule;
  repeatCustomDays: number;
}

interface AppSettings {
  pushEnabled: boolean;
  barkPushAddress: string;
  pushSevenDaysEnabled: boolean;
  pushDueDayEnabled: boolean;
  appLanguage: AppLanguage;
  launchAtLoginEnabled: boolean;
}

interface DataPaths {
  dataDir: string;
  dataFile: string;
  backupsDir: string;
  settingsFile: string;
}

interface RecoveryNotice {
  kind: "restored" | "manualRecoveryNeeded";
  corruptedBackupPath?: string | null;
  restoredFromPath?: string | null;
}

interface AppData {
  items: CountdownItem[];
  settings: AppSettings;
  paths: DataPaths;
  recoveryNotice?: RecoveryNotice | null;
}

type AppLanguage =
  | "zh-Hans"
  | "en"
  | "es"
  | "hi"
  | "ar"
  | "fr"
  | "bn"
  | "pt"
  | "ru"
  | "ja";

const MS_PER_DAY = 86_400_000;
const DEFAULT_SETTINGS: AppSettings = {
  pushEnabled: false,
  barkPushAddress: "https://api.day.app/",
  pushSevenDaysEnabled: true,
  pushDueDayEnabled: true,
  appLanguage: "zh-Hans",
  launchAtLoginEnabled: false,
};

const EMPTY_PATHS: DataPaths = {
  dataDir: "browser-preview",
  dataFile: "browser-preview/items.json",
  backupsDir: "browser-preview/backups",
  settingsFile: "browser-preview/settings.json",
};

const reminderPresets = [30, 14, 7, 3, 1, 0];

const languageOptions: Array<{ value: AppLanguage; nativeName: string; locale: string }> = [
  { value: "zh-Hans", nativeName: "简体中文", locale: "zh-Hans-CN" },
  { value: "en", nativeName: "English", locale: "en-US" },
  { value: "es", nativeName: "Español", locale: "es-ES" },
  { value: "hi", nativeName: "हिन्दी", locale: "hi-IN" },
  { value: "ar", nativeName: "العربية", locale: "ar" },
  { value: "fr", nativeName: "Français", locale: "fr-FR" },
  { value: "bn", nativeName: "বাংলা", locale: "bn-BD" },
  { value: "pt", nativeName: "Português", locale: "pt-BR" },
  { value: "ru", nativeName: "Русский", locale: "ru-RU" },
  { value: "ja", nativeName: "日本語", locale: "ja-JP" },
];

const copy = {
  "zh-Hans": {
    active: "进行中",
    add: "添加",
    addFirst: "点击加号添加第一个到期项目。",
    addHelp: "新增",
    adjust: "调整",
    all: "全部",
    archive: "归档",
    archiveHelp: "归档项目会从进行中视图隐藏，但不会删除。",
    archived: "归档",
    barkAddress: "Bark 推送地址",
    barkAddressHelp: "填写 Bark App 里复制的基础地址，例如 https://api.day.app/你的Key",
    barkAddressPlaceholder: "https://api.day.app/你的Key",
    cancel: "取消",
    cards: "卡片",
    category: "分类",
    categoryPlaceholder: "例如：订阅、证件、域名",
    close: "关闭",
    customDays: "自定义天数",
    customReminderAdd: "添加提醒",
    customReminderInput: "提前天数",
    customReminderOffsets: "自定义提醒天数",
    customReminderOffsetsHelp: "已启用：{offsets}",
    data: "数据",
    dataRecoveredMessage: "检测到 items.json 损坏，已自动备份损坏文件，并从最近的有效备份恢复。",
    dataRecoveredTitle: "已恢复倒计时数据",
    dataRecoveryNeededMessage: "检测到 items.json 损坏，已自动备份损坏文件。未找到可恢复备份，应用会先以空列表继续运行。",
    dataRecoveryNeededTitle: "数据文件已备份",
    dateMode: "日期",
    delete: "删除",
    deleteConfirm: "确定删除这个倒计时项目吗？",
    done: "完成",
    due: "到期",
    dueToday: "到期当天",
    dueTodaySubtitle: "剩余 0 天时推送项目名称",
    edit: "编辑",
    enableBark: "启用 Bark 推送",
    expiryDate: "到期日期",
    far: "较远",
    itemName: "项目名称",
    itemPlaceholder: "例如：会员续费、证件到期",
    language: "语言",
    launchAtLogin: "开机启动",
    launchAtLoginFailed: "设置失败，请检查系统登录项权限",
    launchAtLoginSubtitle: "登录系统后自动打开 Countdown",
    link: "链接",
    linkPlaceholder: "https://example.com",
    manualHint: "拖动卡片左侧圆点调整顺序",
    monthly: "每月",
    near: "临近",
    noItems: "还没有项目",
    none: "不重复",
    note: "备注",
    openBackupFolder: "打开备份文件夹",
    openDataFolder: "打开数据文件夹",
    overdue: "已过期",
    pushSubtitle: "Bark 到期推送",
    pushTiming: "推送时间",
    quarterly: "每季度",
    remaining: "剩余",
    remainingDays: "剩余天数",
    renew: "续期",
    repeat: "重复",
    repeatCustomDays: "重复天数",
    restore: "恢复",
    runtimeCheck: "应用运行时检查到期项目",
    save: "保存",
    settings: "设置",
    sevenDaysBefore: "到期前 7 天",
    sevenDaysSubtitle: "剩余 7 天时推送项目名称",
    showBackup: "显示备份",
    systemTheme: "系统",
    testFailed: "发送失败，请检查地址",
    testIdle: "发送一条测试消息",
    testPush: "测试推送",
    testSending: "发送中...",
    testSuccess: "已发送",
    theme: "主题",
    themeDark: "夜间",
    themeLight: "白天",
    today: "今天",
    within30: "30天内",
    yearly: "每年",
  },
  en: {
    active: "Active",
    add: "Add",
    addFirst: "Use the plus button to add your first expiry date.",
    addHelp: "Add",
    adjust: "Arrange",
    all: "All",
    archive: "Archive",
    archiveHelp: "Archived items are hidden from the active view but not deleted.",
    archived: "Archived",
    barkAddress: "Bark push URL",
    barkAddressHelp: "Paste the base URL copied from Bark, for example https://api.day.app/your-key",
    barkAddressPlaceholder: "https://api.day.app/your-key",
    cancel: "Cancel",
    cards: "Cards",
    category: "Category",
    categoryPlaceholder: "e.g. Subscription, Document, Domain",
    close: "Close",
    customDays: "Custom days",
    customReminderAdd: "Add reminder",
    customReminderInput: "Days before",
    customReminderOffsets: "Custom reminder days",
    customReminderOffsetsHelp: "Enabled: {offsets}",
    data: "Data",
    dataRecoveredMessage: "Countdown backed up a damaged items.json file and restored from the latest valid backup.",
    dataRecoveredTitle: "Countdown data restored",
    dataRecoveryNeededMessage: "Countdown backed up a damaged items.json file. No valid backup was found, so the app will continue with an empty list.",
    dataRecoveryNeededTitle: "Data file backed up",
    dateMode: "Date",
    delete: "Delete",
    deleteConfirm: "Delete this countdown item?",
    done: "Done",
    due: "Due",
    dueToday: "Due day",
    dueTodaySubtitle: "Send the item name when 0 days remain",
    edit: "Edit",
    enableBark: "Enable Bark push",
    expiryDate: "Expiry date",
    far: "Later",
    itemName: "Item name",
    itemPlaceholder: "e.g. membership, document renewal",
    language: "Language",
    launchAtLogin: "Launch at login",
    launchAtLoginFailed: "Failed. Check login item permissions",
    launchAtLoginSubtitle: "Open Countdown when you log in",
    link: "Link",
    linkPlaceholder: "https://example.com",
    manualHint: "Drag the handle on each card to adjust order",
    monthly: "Monthly",
    near: "Soon",
    noItems: "No items yet",
    none: "None",
    note: "Note",
    openBackupFolder: "Open Backup Folder",
    openDataFolder: "Open Data Folder",
    overdue: "Overdue",
    pushSubtitle: "Bark expiry push",
    pushTiming: "Push timing",
    quarterly: "Quarterly",
    remaining: "Left",
    remainingDays: "Days remaining",
    renew: "Renew",
    repeat: "Repeat",
    repeatCustomDays: "Repeat days",
    restore: "Restore",
    runtimeCheck: "Check due items while the app is running",
    save: "Save",
    settings: "Settings",
    sevenDaysBefore: "7 days before",
    sevenDaysSubtitle: "Send the item name when 7 days remain",
    showBackup: "Show Backup",
    systemTheme: "System",
    testFailed: "Failed. Check the URL",
    testIdle: "Send a test message",
    testPush: "Test push",
    testSending: "Sending...",
    testSuccess: "Sent",
    theme: "Theme",
    themeDark: "Dark",
    themeLight: "Light",
    today: "Today",
    within30: "30 days",
    yearly: "Yearly",
  },
} satisfies Record<"zh-Hans" | "en", Record<string, string>>;

const sampleItems: CountdownItem[] = [
  makeItem("流水", 31, "生活", "每月账单"),
  makeItem("电信卡充值", 146, "订阅", "定期检查余额"),
  makeItem("购买办公耗材", 250, "办公", ""),
  makeItem("会员续费", 314, "订阅", "年度会员"),
  makeItem("复合维生素片", 458, "健康", ""),
];

function App() {
  const [items, setItems] = useState<CountdownItem[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [paths, setPaths] = useState<DataPaths>(EMPTY_PATHS);
  const [recoveryNotice, setRecoveryNotice] = useState<RecoveryNotice | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DashboardFilter>("active");
  const [themePreference, setThemePreference, effectiveTheme] = useThemePreference();
  const [manualOrder, setManualOrder] = usePersistentBoolean("countdown.manualOrder", false);
  const [sortAscending, setSortAscending] = usePersistentBoolean("countdown.sortAscending", true);
  const [editorState, setEditorState] = useState<{ mode: EditorMode; item?: CountdownItem } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const language = settings.appLanguage;

  useEffect(() => {
    loadInitialData()
      .then((data) => {
        setItems(data.items);
        setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
        setPaths(data.paths);
        setRecoveryNotice(data.recoveryNotice ?? null);
      })
      .catch((error) => {
        setToast(String(error));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
      void checkAndSendDuePushes(items, settings);
    }, 3_600_000);
    return () => window.clearInterval(timer);
  }, [items, settings]);

  useEffect(() => {
    void checkAndSendDuePushes(items, settings);
  }, [items, settings]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const days = remainingDays(item, now);
      if (filter === "active") return !item.isArchived;
      if (filter === "all") return true;
      if (filter === "within30") return !item.isArchived && days >= 0 && days <= 30;
      if (filter === "overdue") return !item.isArchived && days < 0;
      return item.isArchived;
    });
  }, [filter, items, now]);

  const dashboardStats = useMemo(() => buildStats(filteredItems, now), [filteredItems, now]);

  async function commitItems(nextItems: CountdownItem[]) {
    setItems(nextItems);
    try {
      const saved = await saveItems(nextItems);
      setItems(saved);
    } catch (error) {
      setToast(String(error));
    }
  }

  async function updateSettings(patch: Partial<AppSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      const saved = await saveSettings(next);
      setSettings(saved);
    } catch (error) {
      setToast(String(error));
    }
  }

  function upsertItem(item: CountdownItem) {
    const exists = items.some((candidate) => candidate.id === item.id);
    const next = exists
      ? items.map((candidate) => (candidate.id === item.id ? item : candidate))
      : [...items, item];
    void commitItems(next);
  }

  function removeItem(item: CountdownItem) {
    if (!window.confirm(text("deleteConfirm", language))) {
      return;
    }
    void commitItems(items.filter((candidate) => candidate.id !== item.id));
  }

  function patchItem(item: CountdownItem, patch: Partial<CountdownItem>) {
    upsertItem({ ...item, ...patch, updatedAt: new Date().toISOString() });
  }

  function renewItem(item: CountdownItem) {
    const renewed = nextRenewedItem(item);
    if (renewed) {
      upsertItem(renewed);
    }
  }

  function sortByRemainingDays() {
    const next = [...items].sort((a, b) => {
      const da = remainingDays(a, now);
      const db = remainingDays(b, now);
      if (da === db) {
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      }
      return sortAscending ? da - db : db - da;
    });
    setSortAscending(!sortAscending);
    void commitItems(next);
  }

  function moveItem(id: string, targetId: string, placement: "before" | "after") {
    if (id === targetId) return;
    const fromIndex = items.findIndex((item) => item.id === id);
    const targetIndex = items.findIndex((item) => item.id === targetId);
    if (fromIndex < 0 || targetIndex < 0) return;

    const next = [...items];
    const [moving] = next.splice(fromIndex, 1);
    const targetAfterRemoval = next.findIndex((item) => item.id === targetId);
    const insertIndex = placement === "after" ? targetAfterRemoval + 1 : targetAfterRemoval;
    next.splice(insertIndex, 0, moving);
    void commitItems(next);
  }

  function handleCardDrop(targetId: string, event: DragEvent<HTMLElement>) {
    event.preventDefault();
    if (!draggedId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const placement = event.clientY > bounds.top + bounds.height / 2 ? "after" : "before";
    moveItem(draggedId, targetId, placement);
  }

  async function openLink(url: string) {
    const trimmed = url.trim();
    if (!trimmed) return;
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    if (isTauriRuntime()) {
      await openUrl(normalized);
    } else {
      window.open(normalized, "_blank", "noopener,noreferrer");
    }
  }

  async function reveal(path: string) {
    try {
      if (isTauriRuntime()) {
        await invoke("reveal_path", { path });
      } else {
        setToast(path);
      }
    } catch (error) {
      setToast(String(error));
    }
  }

  async function setLaunchAtLogin(enabled: boolean) {
    setSettings({ ...settings, launchAtLoginEnabled: enabled });
    try {
      const actual = await command<boolean>("set_launch_at_login", { enabled }, () => Promise.resolve(enabled));
      await updateSettings({ launchAtLoginEnabled: actual });
    } catch (error) {
      setToast(text("launchAtLoginFailed", language));
    }
  }

  return (
    <main className={`app-shell theme-${effectiveTheme}`} lang={language} data-theme={effectiveTheme}>
      <section className="top-strip" aria-label="Dashboard filters">
        <select className="filter-menu" value={filter} onChange={(event) => setFilter(event.target.value as DashboardFilter)}>
          {(["active", "all", "within30", "overdue", "archived"] as DashboardFilter[]).map((value) => (
            <option value={value} key={value}>
              {text(value, language)}
            </option>
          ))}
        </select>

        <ThemeSwitch preference={themePreference} language={language} onChange={setThemePreference} />
      </section>

      <section className="dashboard">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">Countdown</p>
            <h1>{dashboardStats.title}</h1>
          </div>
          <div className="stats-row" aria-label="Countdown summary">
            <Stat value={dashboardStats.total} label={text("all", language)} />
            <Stat value={dashboardStats.within30} label={text("within30", language)} tone="warning" />
            <Stat value={dashboardStats.overdue} label={text("overdue", language)} tone="danger" />
          </div>
        </div>

        {recoveryNotice ? (
          <div className="recovery-banner">
            <Database size={18} aria-hidden />
            <div>
              <strong>{text(recoveryNotice.kind === "restored" ? "dataRecoveredTitle" : "dataRecoveryNeededTitle", language)}</strong>
              <span>{text(recoveryNotice.kind === "restored" ? "dataRecoveredMessage" : "dataRecoveryNeededMessage", language)}</span>
            </div>
            {recoveryNotice.corruptedBackupPath ? (
              <button type="button" className="quiet-button" onClick={() => reveal(recoveryNotice.corruptedBackupPath ?? "")}>
                {text("showBackup", language)}
              </button>
            ) : null}
          </div>
        ) : null}

        {manualOrder ? <p className="manual-hint">{text("manualHint", language)}</p> : null}

        <div className="card-grid" aria-busy={loading}>
          {loading ? (
            <div className="empty-state">
              <Loader2 className="spin" size={34} aria-hidden />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="empty-state">
              <Calendar size={44} aria-hidden />
              <h2>{text("noItems", language)}</h2>
              <p>{text("addFirst", language)}</p>
            </div>
          ) : (
            filteredItems.map((item) => (
              <CountdownCard
                key={item.id}
                item={item}
                language={language}
                now={now}
                manualOrder={manualOrder}
                draggedId={draggedId}
                onDragStart={() => setDraggedId(item.id)}
                onDragEnd={() => setDraggedId(null)}
                onDrop={(event) => handleCardDrop(item.id, event)}
                onEdit={() => setEditorState({ mode: "edit", item })}
                onDelete={() => removeItem(item)}
                onArchive={() => patchItem(item, { isArchived: true })}
                onRestore={() => patchItem(item, { isArchived: false })}
                onRenew={() => renewItem(item)}
                onOpenLink={() => openLink(item.link)}
              />
            ))
          )}
        </div>
      </section>

      <nav className="bottom-controls" aria-label="Dashboard controls">
        <div className="control-cluster">
          <ControlButton icon={<LayoutGrid size={20} />} label={text("cards", language)} selected onClick={() => undefined} />
          <ControlButton
            icon={manualOrder ? <Check size={20} /> : <GripVertical size={20} />}
            label={manualOrder ? text("done", language) : text("adjust", language)}
            selected={manualOrder}
            onClick={() => setManualOrder(!manualOrder)}
          />
          <ControlButton
            icon={sortAscending ? <ArrowDown size={20} /> : <ArrowUp size={20} />}
            label={sortAscending ? text("near", language) : text("far", language)}
            disabled={manualOrder}
            onClick={sortByRemainingDays}
          />
          <ControlButton icon={<Settings size={20} />} label={text("settings", language)} onClick={() => setSettingsOpen(true)} />
        </div>
        <button type="button" className="add-button" aria-label={text("addHelp", language)} onClick={() => setEditorState({ mode: "add" })}>
          <Plus size={28} aria-hidden />
        </button>
      </nav>

      {editorState ? (
        <ItemEditor
          key={editorState.item?.id ?? "new"}
          mode={editorState.mode}
          item={editorState.item}
          language={language}
          onClose={() => setEditorState(null)}
          onSave={(item) => {
            upsertItem(item);
            setEditorState(null);
          }}
        />
      ) : null}

      {settingsOpen ? (
        <SettingsPanel
          settings={settings}
          paths={paths}
          language={language}
          toast={toast}
          onClose={() => setSettingsOpen(false)}
          onReveal={reveal}
          onSettingsChange={updateSettings}
          onLaunchAtLoginChange={setLaunchAtLogin}
          onTestPush={async () => {
            setToast(text("testSending", language));
            try {
              await sendBarkPush(settings.barkPushAddress, text("testPush", language), 7, language);
              setToast(text("testSuccess", language));
            } catch {
              setToast(text("testFailed", language));
            }
          }}
        />
      ) : null}

      {toast ? (
        <button type="button" className="toast" onClick={() => setToast("")}>
          {toast}
        </button>
      ) : null}
    </main>
  );
}

function CountdownCard(props: {
  item: CountdownItem;
  language: AppLanguage;
  now: Date;
  manualOrder: boolean;
  draggedId: string | null;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onEdit: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onRenew: () => void;
  onOpenLink: () => void;
}) {
  const days = remainingDays(props.item, props.now);
  const urgency = urgencyBand(days);
  const progress = progressRatio(props.item, props.now);
  const isDragging = props.draggedId === props.item.id;

  return (
    <article
      className={`countdown-card ${urgency} ${isDragging ? "dragging" : ""}`}
      onDragOver={(event) => props.manualOrder && event.preventDefault()}
      onDrop={props.onDrop}
    >
      <button type="button" className="card-main" onClick={props.onEdit}>
        <div className="card-title-row">
          {props.manualOrder ? (
            <span
              className="drag-handle"
              draggable
              title={text("adjust", props.language)}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                props.onDragStart();
              }}
              onDragEnd={props.onDragEnd}
              onClick={(event) => event.stopPropagation()}
            >
              <GripVertical size={14} aria-hidden />
            </span>
          ) : (
            <CardIcon days={days} />
          )}
          <h2>{props.item.name}</h2>
        </div>

        <div className="card-body-row">
          <div>
            <div className="day-number">{Math.abs(days)}</div>
            <p className="date-line">{formatDate(props.item.expiryDate, props.language)}</p>
          </div>
          <div className="progress-ring" style={{ "--progress": `${progress * 360}deg` } as CSSProperties}>
            <span />
          </div>
        </div>

        <div className="meta-row">
          {props.item.category ? (
            <span>
              <Tag size={12} aria-hidden />
              {props.item.category}
            </span>
          ) : null}
          {props.item.repeatRule !== "none" ? (
            <span>
              <RefreshCcw size={12} aria-hidden />
              {repeatLabel(props.item.repeatRule, props.language)}
            </span>
          ) : null}
          <span>{days < 0 ? text("overdue", props.language) : days === 0 ? text("today", props.language) : daysText(days, props.language)}</span>
        </div>
      </button>

      <div className="card-actions">
        {props.item.link ? (
          <IconButton label={text("link", props.language)} onClick={props.onOpenLink}>
            <ExternalLink size={16} />
          </IconButton>
        ) : null}
        {props.item.repeatRule !== "none" ? (
          <IconButton label={text("renew", props.language)} onClick={props.onRenew}>
            <RotateCcw size={16} />
          </IconButton>
        ) : null}
        <IconButton label={text("edit", props.language)} onClick={props.onEdit}>
          <Pencil size={16} />
        </IconButton>
        <IconButton label={props.item.isArchived ? text("restore", props.language) : text("archive", props.language)} onClick={props.item.isArchived ? props.onRestore : props.onArchive}>
          {props.item.isArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
        </IconButton>
        <IconButton label={text("delete", props.language)} onClick={props.onDelete} danger>
          <Trash2 size={16} />
        </IconButton>
      </div>
    </article>
  );
}

function ItemEditor(props: {
  mode: EditorMode;
  item?: CountdownItem;
  language: AppLanguage;
  onClose: () => void;
  onSave: (item: CountdownItem) => void;
}) {
  const item = props.item;
  const initialDays = item ? remainingDays(item, new Date()) : 30;
  const [name, setName] = useState(item?.name ?? "");
  const [inputMode, setInputMode] = useState<ExpiryInputMode>(item && initialDays < 0 ? "date" : "remainingDays");
  const [remaining, setRemaining] = useState(Math.max(initialDays, 0));
  const [dateValue, setDateValue] = useState(item ? dateInputValue(item.expiryDate) : dateInputValue(isoFromRemainingDays(30)));
  const [category, setCategory] = useState(item?.category ?? "");
  const [link, setLink] = useState(item?.link ?? "");
  const [note, setNote] = useState(item?.note ?? "");
  const [offsets, setOffsets] = useState<number[]>(normalizeOffsetList(item?.reminderOffsets ?? [7, 0]));
  const [customOffset, setCustomOffset] = useState(14);
  const [repeatRule, setRepeatRule] = useState<RepeatRule>(item?.repeatRule ?? "none");
  const [repeatCustomDays, setRepeatCustomDays] = useState(item?.repeatCustomDays ?? 30);
  const [isArchived, setIsArchived] = useState(item?.isArchived ?? false);
  const parsedOffsets = normalizeOffsetList(offsets);
  const expiryIso = inputMode === "date" ? isoFromDateInput(dateValue) : isoFromRemainingDays(remaining);
  const previewDays = daysUntilIso(expiryIso);

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const nowIso = new Date().toISOString();
    props.onSave({
      id: item?.id ?? crypto.randomUUID(),
      name: trimmedName,
      expiryDate: expiryIso,
      createdAt: item?.createdAt ?? nowIso,
      updatedAt: nowIso,
      note: note.trim(),
      reminderOffsets: parsedOffsets,
      category: category.trim(),
      link: link.trim(),
      isArchived,
      repeatRule,
      repeatCustomDays: Math.max(1, repeatCustomDays),
    });
  }

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label={text("itemName", props.language)}>
      <form className="editor-panel" onSubmit={submit}>
        <label className="field-block">
          <span>{text("itemName", props.language)}</span>
          <div className="input-shell">
            <Pencil size={16} aria-hidden />
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder={text("itemPlaceholder", props.language)} autoFocus />
          </div>
        </label>

        <div className="segmented">
          <button type="button" className={inputMode === "remainingDays" ? "selected" : ""} onClick={() => setInputMode("remainingDays")}>
            <Clock3 size={16} aria-hidden />
            {text("dateMode" === "dateMode" ? "remainingDays" : "remainingDays", props.language)}
          </button>
          <button type="button" className={inputMode === "date" ? "selected" : ""} onClick={() => setInputMode("date")}>
            <Calendar size={16} aria-hidden />
            {text("dateMode", props.language)}
          </button>
        </div>

        {inputMode === "remainingDays" ? (
          <label className="field-block">
            <span>{text("remainingDays", props.language)}</span>
            <div className="stepper">
              <button type="button" onClick={() => setRemaining(Math.max(0, remaining - 1))} aria-label="-1">
                <Minus size={18} aria-hidden />
              </button>
              <input type="number" min={0} max={3650} value={remaining} onChange={(event) => setRemaining(clampNumber(event.target.valueAsNumber, 0, 3650))} />
              <button type="button" onClick={() => setRemaining(Math.min(3650, remaining + 1))} aria-label="+1">
                <Plus size={18} aria-hidden />
              </button>
            </div>
          </label>
        ) : (
          <label className="field-block">
            <span>{text("expiryDate", props.language)}</span>
            <div className="input-shell">
              <Calendar size={16} aria-hidden />
              <input type="date" value={dateValue} onChange={(event) => setDateValue(event.target.value)} />
            </div>
          </label>
        )}

        <div className="preview-strip">
          <PreviewPill icon={<Calendar size={15} />} label={text("due", props.language)} value={formatDate(expiryIso, props.language)} />
          <PreviewPill icon={<Clock3 size={15} />} label={text("remaining", props.language)} value={previewDays <= 0 ? text("today", props.language) : daysText(previewDays, props.language)} />
        </div>

        <div className="two-column">
          <label className="field-block">
            <span>{text("category", props.language)}</span>
            <div className="input-shell">
              <Tag size={16} aria-hidden />
              <input value={category} onChange={(event) => setCategory(event.target.value)} placeholder={text("categoryPlaceholder", props.language)} />
            </div>
          </label>
          <label className="field-block">
            <span>{text("link", props.language)}</span>
            <div className="input-shell">
              <Link2 size={16} aria-hidden />
              <input value={link} onChange={(event) => setLink(event.target.value)} placeholder={text("linkPlaceholder", props.language)} />
            </div>
          </label>
        </div>

        <label className="field-block">
          <span>{text("note", props.language)}</span>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
        </label>

        <label className="field-block">
          <span>{text("customReminderOffsets", props.language)}</span>
          <div className="reminder-picker">
            <div className="reminder-chips" aria-label={text("customReminderOffsets", props.language)}>
              {reminderPresets.map((days) => {
                const selected = parsedOffsets.includes(days);
                return (
                  <button
                    type="button"
                    key={days}
                    className={selected ? "selected" : ""}
                    onClick={() => {
                      setOffsets(selected ? parsedOffsets.filter((offset) => offset !== days) : normalizeOffsetList([...parsedOffsets, days]));
                    }}
                  >
                    <Bell size={13} aria-hidden />
                    {days === 0 ? text("today", props.language) : daysText(days, props.language)}
                  </button>
                );
              })}
            </div>
            <div className="custom-reminder-row">
              <label>
                <span>{text("customReminderInput", props.language)}</span>
                <input
                  type="number"
                  min={0}
                  max={3650}
                  value={customOffset}
                  onChange={(event) => setCustomOffset(clampNumber(event.target.valueAsNumber, 0, 3650))}
                />
              </label>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setOffsets(normalizeOffsetList([...parsedOffsets, customOffset]))}
              >
                <Plus size={14} aria-hidden />
                {text("customReminderAdd", props.language)}
              </button>
            </div>
          </div>
          <small>{text("customReminderOffsetsHelp", props.language).replace("{offsets}", parsedOffsets.join(", "))}</small>
        </label>

        <div className="two-column compact">
          <label className="field-block">
            <span>{text("repeat", props.language)}</span>
            <select value={repeatRule} onChange={(event) => setRepeatRule(event.target.value as RepeatRule)}>
              {(["none", "monthly", "quarterly", "yearly", "customDays"] as RepeatRule[]).map((rule) => (
                <option value={rule} key={rule}>
                  {repeatLabel(rule, props.language)}
                </option>
              ))}
            </select>
          </label>
          <label className={`field-block ${repeatRule === "customDays" ? "" : "muted"}`}>
            <span>{text("repeatCustomDays", props.language)}</span>
            <input
              type="number"
              min={1}
              value={repeatCustomDays}
              disabled={repeatRule !== "customDays"}
              onChange={(event) => setRepeatCustomDays(clampNumber(event.target.valueAsNumber, 1, 3650))}
            />
          </label>
        </div>

        <label className="switch-row">
          <div>
            <strong>{isArchived ? text("restore", props.language) : text("archive", props.language)}</strong>
            <span>{text("archiveHelp", props.language)}</span>
          </div>
          <input type="checkbox" checked={isArchived} onChange={(event) => setIsArchived(event.target.checked)} />
        </label>

        <footer className="editor-footer">
          <button type="button" className="secondary-button" onClick={props.onClose}>
            {text("cancel", props.language)}
          </button>
          <button type="submit" className="primary-button" disabled={!name.trim()}>
            {props.mode === "add" ? text("add", props.language) : text("save", props.language)}
          </button>
        </footer>
      </form>
    </div>
  );
}

function SettingsPanel(props: {
  settings: AppSettings;
  paths: DataPaths;
  language: AppLanguage;
  toast: string;
  onClose: () => void;
  onReveal: (path: string) => void;
  onSettingsChange: (patch: Partial<AppSettings>) => void;
  onLaunchAtLoginChange: (enabled: boolean) => void;
  onTestPush: () => void;
}) {
  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label={text("settings", props.language)}>
      <section className="settings-panel">
        <header className="settings-header">
          <div className="settings-icon">
            <Bell size={18} aria-hidden />
          </div>
          <div>
            <h2>{text("settings", props.language)}</h2>
            <p>{text("pushSubtitle", props.language)}</p>
          </div>
          <button type="button" className="icon-button" aria-label={text("close", props.language)} onClick={props.onClose}>
            <X size={16} aria-hidden />
          </button>
        </header>

        <div className="settings-body">
          <label className="settings-row">
            <div>
              <strong>{text("language", props.language)}</strong>
              <span>{languageOptions.find((option) => option.value === props.settings.appLanguage)?.nativeName}</span>
            </div>
            <select value={props.settings.appLanguage} onChange={(event) => props.onSettingsChange({ appLanguage: event.target.value as AppLanguage })}>
              {languageOptions.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.nativeName}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-row">
            <div>
              <strong>{text("launchAtLogin", props.language)}</strong>
              <span>{text("launchAtLoginSubtitle", props.language)}</span>
            </div>
            <input type="checkbox" checked={props.settings.launchAtLoginEnabled} onChange={(event) => props.onLaunchAtLoginChange(event.target.checked)} />
          </label>

          <label className="settings-row">
            <div>
              <strong>{text("enableBark", props.language)}</strong>
              <span>{text("runtimeCheck", props.language)}</span>
            </div>
            <input type="checkbox" checked={props.settings.pushEnabled} onChange={(event) => props.onSettingsChange({ pushEnabled: event.target.checked })} />
          </label>

          <label className="field-block">
            <span>{text("barkAddress", props.language)}</span>
            <div className="input-shell">
              <Link2 size={16} aria-hidden />
              <input
                value={props.settings.barkPushAddress}
                onChange={(event) => props.onSettingsChange({ barkPushAddress: event.target.value })}
                placeholder={text("barkAddressPlaceholder", props.language)}
              />
            </div>
            <small>{text("barkAddressHelp", props.language)}</small>
          </label>

          <div className="setting-group">
            <span>{text("pushTiming", props.language)}</span>
            <label className="settings-row compact">
              <div>
                <strong>{text("sevenDaysBefore", props.language)}</strong>
                <span>{text("sevenDaysSubtitle", props.language)}</span>
              </div>
              <input type="checkbox" checked={props.settings.pushSevenDaysEnabled} onChange={(event) => props.onSettingsChange({ pushSevenDaysEnabled: event.target.checked })} />
            </label>
            <label className="settings-row compact">
              <div>
                <strong>{text("dueToday", props.language)}</strong>
                <span>{text("dueTodaySubtitle", props.language)}</span>
              </div>
              <input type="checkbox" checked={props.settings.pushDueDayEnabled} onChange={(event) => props.onSettingsChange({ pushDueDayEnabled: event.target.checked })} />
            </label>
          </div>

          <div className="setting-group">
            <span>{text("data", props.language)}</span>
            <div className="data-actions">
              <button type="button" className="secondary-button" onClick={() => props.onReveal(props.paths.dataDir)}>
                <FolderOpen size={16} aria-hidden />
                {text("openDataFolder", props.language)}
              </button>
              <button type="button" className="secondary-button" onClick={() => props.onReveal(props.paths.backupsDir)}>
                <FolderClock size={16} aria-hidden />
                {text("openBackupFolder", props.language)}
              </button>
            </div>
          </div>

          <div className="test-row">
            <button type="button" className="primary-button" onClick={props.onTestPush}>
              <Send size={16} aria-hidden />
              {text("testPush", props.language)}
            </button>
            <span>{props.toast || text("testIdle", props.language)}</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function ControlButton(props: { icon: ReactNode; label: string; selected?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`control-button ${props.selected ? "selected" : ""}`} disabled={props.disabled} onClick={props.onClick}>
      {props.icon}
      <span>{props.label}</span>
    </button>
  );
}

function ThemeSwitch(props: { preference: ThemePreference; language: AppLanguage; onChange: (preference: ThemePreference) => void }) {
  const options: Array<{ value: ThemePreference; label: string; icon: ReactNode }> = [
    { value: "system", label: text("systemTheme", props.language), icon: <Monitor size={13} aria-hidden /> },
    { value: "light", label: text("themeLight", props.language), icon: <Sun size={13} aria-hidden /> },
    { value: "dark", label: text("themeDark", props.language), icon: <Moon size={13} aria-hidden /> },
  ];
  return (
    <div className="theme-switch" aria-label={text("theme", props.language)}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          className={props.preference === option.value ? "selected" : ""}
          onClick={() => props.onChange(option.value)}
          title={option.label}
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function IconButton(props: { children: ReactNode; label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`icon-button ${props.danger ? "danger" : ""}`} aria-label={props.label} title={props.label} onClick={props.onClick}>
      {props.children}
    </button>
  );
}

function PreviewPill(props: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="preview-pill">
      {props.icon}
      <div>
        <span>{props.label}</span>
        <strong>{props.value}</strong>
      </div>
    </div>
  );
}

function Stat(props: { value: number; label: string; tone?: "warning" | "danger" }) {
  return (
    <div className={`stat ${props.tone ?? ""}`}>
      <strong>{props.value}</strong>
      <span>{props.label}</span>
    </div>
  );
}

function CardIcon(props: { days: number }) {
  if (props.days < 0) return <Flame size={18} aria-hidden />;
  if (props.days < 15) return <Flame size={18} aria-hidden />;
  if (props.days <= 30) return <Clock3 size={18} aria-hidden />;
  return <Calendar size={18} aria-hidden />;
}

function usePersistentBoolean(key: string, fallback: boolean): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(() => localStorage.getItem(key) === null ? fallback : localStorage.getItem(key) === "true");
  return [
    value,
    (next: boolean) => {
      localStorage.setItem(key, String(next));
      setValue(next);
    },
  ];
}

function useThemePreference(): [ThemePreference, (value: ThemePreference) => void, "light" | "dark"] {
  const readPreference = () => {
    const stored = localStorage.getItem("countdown.themePreference");
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  };
  const systemTheme = () => (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const [preference, setPreference] = useState<ThemePreference>(readPreference);
  const [resolvedSystem, setResolvedSystem] = useState<"light" | "dark">(systemTheme);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setResolvedSystem(query.matches ? "dark" : "light");
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  function updatePreference(next: ThemePreference) {
    localStorage.setItem("countdown.themePreference", next);
    setPreference(next);
  }

  return [preference, updatePreference, preference === "system" ? resolvedSystem : preference];
}

function text(key: string, language: AppLanguage) {
  const dictionary: Record<string, string> = language === "zh-Hans" ? copy["zh-Hans"] : copy.en;
  const english: Record<string, string> = copy.en;
  return dictionary[key] ?? english[key] ?? key;
}

function repeatLabel(rule: RepeatRule, language: AppLanguage) {
  return text(rule, language);
}

function daysText(days: number, language: AppLanguage) {
  if (language === "zh-Hans") return `${days} 天`;
  if (language === "ja") return `${days}日`;
  return days === 1 ? "1 day" : `${days} days`;
}

function formatDate(iso: string, language: AppLanguage) {
  const date = parseDateOnlyIso(iso);
  if (language === "zh-Hans" || language === "ja") {
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }
  const locale = languageOptions.find((option) => option.value === language)?.locale ?? "en-US";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

function remainingDays(item: CountdownItem, now: Date) {
  const today = todayDateOnly(now);
  const expiry = parseDateOnlyIso(item.expiryDate);
  return Math.round((expiry.getTime() - today.getTime()) / MS_PER_DAY);
}

function daysUntilIso(iso: string) {
  const today = todayDateOnly(new Date());
  const expiry = parseDateOnlyIso(iso);
  return Math.round((expiry.getTime() - today.getTime()) / MS_PER_DAY);
}

function progressRatio(item: CountdownItem, now: Date) {
  const created = parseDateOnlyIso(item.createdAt);
  const expiry = parseDateOnlyIso(item.expiryDate);
  const today = todayDateOnly(now);
  const total = Math.max(1, Math.round((expiry.getTime() - created.getTime()) / MS_PER_DAY));
  const left = Math.max(0, Math.round((expiry.getTime() - today.getTime()) / MS_PER_DAY));
  return Math.min(1, Math.max(0, left / total));
}

function urgencyBand(days: number) {
  if (days < 15) return "urgent";
  if (days <= 30) return "warning";
  return "later";
}

function buildStats(items: CountdownItem[], now: Date) {
  let overdue = 0;
  let within30 = 0;
  let nearest: { item: CountdownItem; days: number } | null = null;
  for (const item of items) {
    const days = remainingDays(item, now);
    if (days < 0) overdue += 1;
    if (days >= 0 && days <= 30) within30 += 1;
    if (!nearest || Math.abs(days) < Math.abs(nearest.days)) {
      nearest = { item, days };
    }
  }
  return {
    total: items.length,
    overdue,
    within30,
    title: nearest ? nearest.item.name : "Countdown",
  };
}

function normalizeOffsetList(offsets: number[]) {
  const values = offsets
    .filter((part) => Number.isFinite(part))
    .map((part) => Math.max(0, Math.min(3650, Math.round(part))));
  const unique = [...new Set(values)].sort((a, b) => b - a);
  return unique.length ? unique : [7, 0];
}

function nextRenewedItem(item: CountdownItem): CountdownItem | null {
  if (item.repeatRule === "none") return null;
  const today = todayDateOnly(new Date());
  const expiry = parseDateOnlyIso(item.expiryDate);
  const base = expiry.getTime() > today.getTime() ? expiry : today;
  let next: Date;
  if (item.repeatRule === "monthly") next = addMonthsClamped(base, 1);
  else if (item.repeatRule === "quarterly") next = addMonthsClamped(base, 3);
  else if (item.repeatRule === "yearly") next = addMonthsClamped(base, 12);
  else next = new Date(base.getTime() + Math.max(1, item.repeatCustomDays) * MS_PER_DAY);
  return { ...item, expiryDate: next.toISOString(), isArchived: false, updatedAt: new Date().toISOString() };
}

function addMonthsClamped(date: Date, months: number) {
  const year = date.getFullYear();
  const month = date.getMonth() + months;
  const day = date.getDate();
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, lastDay));
}

function todayDateOnly(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseDateOnlyIso(iso: string) {
  const date = new Date(iso);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isoFromDateInput(value: string) {
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(year, month - 1, day).toISOString();
}

function isoFromRemainingDays(days: number) {
  return new Date(todayDateOnly(new Date()).getTime() + days * MS_PER_DAY).toISOString();
}

function dateInputValue(iso: string) {
  const date = parseDateOnlyIso(iso);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function makeItem(name: string, days: number, category: string, note: string): CountdownItem {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    expiryDate: isoFromRemainingDays(days),
    createdAt: now,
    updatedAt: now,
    note,
    reminderOffsets: [7, 0],
    category,
    link: "",
    isArchived: false,
    repeatRule: "none",
    repeatCustomDays: 30,
  };
}

async function checkAndSendDuePushes(items: CountdownItem[], settings: AppSettings) {
  if (!settings.pushEnabled || !settings.barkPushAddress.trim() || settings.barkPushAddress.trim() === "https://api.day.app/") return;
  const sent = new Set(JSON.parse(localStorage.getItem("countdown.sentReminderKeys") ?? "[]") as string[]);
  for (const item of items) {
    if (item.isArchived) continue;
    const days = remainingDays(item, new Date());
    if (days < 0) continue;
    const offsets = new Set(item.reminderOffsets);
    if (!settings.pushSevenDaysEnabled) offsets.delete(7);
    if (!settings.pushDueDayEnabled) offsets.delete(0);
    if (!offsets.has(days)) continue;
    const key = `${item.id}|${days}|${dateInputValue(item.expiryDate)}`;
    if (sent.has(key)) continue;
    try {
      await sendBarkPush(settings.barkPushAddress, item.name, days, settings.appLanguage);
      sent.add(key);
      localStorage.setItem("countdown.sentReminderKeys", JSON.stringify([...sent].sort()));
    } catch {
      return;
    }
  }
}

async function sendBarkPush(pushAddress: string, itemName: string, daysUntilExpiry: number, language: AppLanguage) {
  return command<void>(
    "send_bark_push",
    { pushAddress, itemName, daysUntilExpiry, language },
    () => Promise.resolve(),
  );
}

async function loadInitialData(): Promise<AppData> {
  return command<AppData>("load_app_data", {}, async () => {
    const savedItems = localStorage.getItem("countdown.preview.items");
    const savedSettings = localStorage.getItem("countdown.preview.settings");
    return {
      items: savedItems ? JSON.parse(savedItems) as CountdownItem[] : sampleItems,
      settings: savedSettings ? { ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) as AppSettings } : DEFAULT_SETTINGS,
      paths: EMPTY_PATHS,
      recoveryNotice: null,
    };
  });
}

async function saveItems(items: CountdownItem[]): Promise<CountdownItem[]> {
  return command<CountdownItem[]>("save_items", { items }, async () => {
    localStorage.setItem("countdown.preview.items", JSON.stringify(items));
    return items;
  });
}

async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  return command<AppSettings>("save_settings", { settings }, async () => {
    localStorage.setItem("countdown.preview.settings", JSON.stringify(settings));
    return settings;
  });
}

async function command<T>(name: string, args: Record<string, unknown>, fallback: () => Promise<T>): Promise<T> {
  if (isTauriRuntime()) {
    return invoke<T>(name, args);
  }
  return fallback();
}

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

export default App;
