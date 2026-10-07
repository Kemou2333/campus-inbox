# 安卓与网页共用一套应用

安卓安装包直接内置本项目的网页成品。通知整理、任务进度、子步骤、笔记和备份使用同一套代码；Material You 的系统动态色、系统分享、文件保存和日历入口通过 `src/platform/` 接入。网页使用浏览器适配器，安卓使用原生适配器，不另外维护第二套业务逻辑。

## 构建

1. 在项目根运行 `pnpm install --frozen-lockfile`、`pnpm build`。Vite 的 `base` 必须是 `./`，才能同时部署到 GitHub Pages 子目录和 APK 本地目录。
2. 运行 `python3 mobile/prepare-web.py`。
3. 使用 JDK 17、Gradle 8.13、Android SDK 36，在 `mobile/android/` 运行 `gradle :app:assembleRelease`。

APK 发布版本为 `2.3.0`、`versionCode=5`，应用 ID 延续 `io.github.kemou2333.campusinbox`。沿用第一版的私密签名密钥才能覆盖安装并保留已有通知。签名配置仅从 `ANDROID_KEYSTORE_PATH`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD` 环境变量读取，不进入仓库。

## 平台能力

- Android 8.0 及以上可安装；原生桥需要较新的 Android System WebView。
- Android 12 及以上读取系统动态配色，更早的系统使用应用默认 Material 色。
- 纯文字分享进入原生待收队列，由页面确认加入草稿；不会自动调用 AI。UI 整理中暂不消费队列，避免覆盖输入或丢失分享。
- 附件使用系统选择器，备份、日历文件和附件使用系统另存为；不申请广泛存储权限。
- 日历打开系统编辑界面，由用户确认保存和设置提醒。应用不读取已有日程、不静默写入，不申请读写日历权限，也不会把「打开界面」显示成「已经保存」。
- 安卓支持主动设置本地截止提醒。只有用户点击设置时才申请通知权限；使用非精确系统闹钟，节电模式可能延迟。未来提醒保存在手机中，重启和覆盖升级后恢复；取消提醒会同时清除对应系统通知。点击系统通知可以回到相应校园通知。
- 浏览器保留日历 `.ics` 文件导出。手机与网页先保存本地数据，登录同一账号后持续同步文字、笔记和进度；附件可用备份迁移。

原生桥只对 APK 内置的 HTTPS 顶层入口开放，外部链接交给浏览器；没有文件跨域访问、远程脚本更新或 SSL 忽略。云同步通过独立基础设施接口接入，原生宿主不直接连接数据库；只有登录后才同步文字、进度与笔记，附件仍留在本机。

## 布局与主题

当前只维护网页和 Android，其他平台暂缓。手机竖屏使用单栏；低高度横屏压缩导航；宽屏并列新增与查看。方屏根据当前窗口宽度自动切换，不锁定方向。宿主消费系统栏、刘海和键盘安全区，WebView 不重复留白；手动明暗模式同步系统栏颜色。动态色用于操作重点，正文使用稳定的中性色。

本地提醒统一使用 `{id,title,body?,triggerMillis}`，由稳定通知 ID 对应一项提醒；重新设置会替换原提醒。网页 `scheduleReminder` 返回 `unsupported`，不会显示一个实际上不能工作的后台提醒。Android 的 `onOpenNotice` 与 `getOpenedNotice` 将系统通知点击传给应用导航，不直接改写业务记录。

`android/checks/NativeHostChecks.java` 与 TypeScript 测试覆盖消息、文件、来源和时间边界，不能替代真实手机的安装升级、键盘、分享、文件选择器与系统日历验证。
