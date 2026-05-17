# Countdown Rust

Countdown Rust 是一个使用 Slint + Rust 重构的跨平台原生桌面倒计时应用。它不再使用 Tauri、React、HTML/CSS 或 WebView；界面由 Slint 编译为原生桌面 UI，Rust 负责本地数据、备份恢复、Bark 推送、系统目录和启动项。

## 功能

- 到期日、续费日、deadline、周期事项追踪
- 新增、编辑、删除、归档、恢复、一键续期
- 按剩余天数录入
- 备注、分类、链接、预设和自定义提醒天数
- 进行中/全部/30 天内/已过期/已归档筛选
- 手动上移/下移排序、临近排序
- 自动跟随系统明暗主题，也可以手动切换白天/夜间
- Bark 到期提醒和测试推送
- 启动项开关、本地数据文件夹入口
- UTF-8 中文界面，避免乱码

## 数据位置

- macOS: `~/Library/Application Support/Countdown/items.json`
- Windows: `%APPDATA%/Countdown/items.json`
- Linux: `$XDG_DATA_HOME/countdown/items.json`，通常是 `~/.local/share/countdown/items.json`

每次保存都会在 `backups/` 下生成快照，默认保留最近 12 份。macOS 版本沿用原 SwiftUI 应用的数据目录。

## 开发运行

```bash
cargo run --manifest-path app/Cargo.toml
```

## 检查

```bash
cargo test --manifest-path app/Cargo.toml
```

## 打包

macOS `.app` + zip：

```bash
scripts/package-macos.sh
```

Windows portable zip，在 Windows 机器执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package-windows-portable.ps1
```

Linux portable tar.gz，在 Linux 机器执行：

```bash
scripts/package-linux-appimage.sh
```

跨平台打包需要在对应系统上执行。Windows portable 包是单独的 `Countdown.exe` zip；Linux 当前选择 tar.gz portable 分发形式。
