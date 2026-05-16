# Countdown Rust

Countdown Rust 是原 macOS SwiftUI Countdown v0.8 的跨平台重构版。应用使用 Tauri v2：Rust 负责本地数据、备份恢复、Bark 推送、系统目录和启动项；React/TypeScript 负责桌面 UI。

## 功能

- 到期日、续费日、deadline、周期事项追踪
- 新增、编辑、删除、归档、恢复、一键续期
- 按剩余天数或到期日期录入
- 备注、分类、链接、预设和自定义提醒天数
- 每月、每季度、每年、自定义天数重复
- 进行中/全部/30 天内/已过期/已归档筛选
- 手动拖拽排序、临近/较远排序
- 跟随系统的白天/夜间主题，并支持手动切换
- Bark 到期提醒和测试推送
- 启动项开关、本地数据文件夹和备份文件夹入口
- UTF-8 多语言界面，默认简体中文

## 数据位置

- macOS: `~/Library/Application Support/Countdown/items.json`
- Windows: `%APPDATA%/Countdown/items.json`
- Linux: `$XDG_DATA_HOME/countdown/items.json`，通常是 `~/.local/share/countdown/items.json`

每次保存都会在 `backups/` 下生成快照，默认保留最近 12 份。macOS 版本沿用原 SwiftUI 应用的数据目录。

## 开发运行

```bash
npm install
npm run tauri dev
```

只预览前端 UI：

```bash
npm run dev
```

## 检查

```bash
npm run check
```

## 打包

macOS `.app` + zip：

```bash
npm run package:macos
```

Windows portable zip，在 Windows 机器执行：

```powershell
npm run package:windows
```

Linux AppImage，在 Linux 机器执行：

```bash
npm run package:linux
```

跨平台打包需要在对应系统上执行。Windows portable 包是单独的 `Countdown.exe` zip；Linux 选择 AppImage 作为 portable 分发形式。
