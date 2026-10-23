# 校园 Inbox · Android

这个版本把校园 Inbox 安装到 Android 手机里。页面随 APK 内置，离线也能查看已经保存的通知。新增 AI 整理仍需要联网。

第二版内置重构后的共享应用，保留通知、附件、笔记与备份能力，并接入系统的文件选择、另存为、分享文字、日历添加界面和本地截止提醒。页面使用 Material You 配色；Android 12 及以上可读取系统动态色。没有单独维护另一套原生业务界面。

## 使用与数据

- Android 8.0 及以上可安装。较新的 Android System WebView 能提供完整的原生桥功能。
- 从其他应用分享纯文字到「校园 Inbox」只会填入原文，用户按「整理」后才调用 AI。
- 日历功能打开手机的日历编辑界面，由用户确认保存。应用不读取已有日程，不申请读写日历权限，也不能获知日程最后是否保存。
- 通知先保存在这个应用自己的本地空间中；登录后持续同步文字、进度与笔记，网页和手机可接着办理。附件仅留在添加它的设备，可用完整备份迁移；卸载应用会清除本机数据。
- 文件通过系统选择器添加或保存，无「管理所有文件」等广泛存储权限。当前不包含直接拍照附件。
- 创建提醒可选择「应用通知」或「日历」。应用通知由手机系统 AlarmManager 定时发送，无需后台常驻或额外注册，在 Android 13 及以上仅用户点击设置时申请通知权限。使用非精确闹钟，系统节电可能延迟；强行停止应用会暂停，重新打开后恢复未来提醒，不申请特殊精确闹钟权限。重启、同签名升级后恢复未来提醒；已错过不超过24小时的已知计划在恢复时补发，更早的已知过期计划清理，不改通知正文或未知提醒记录。通知权限关闭时保留待发记录，允许后再次打开可在24小时窗口内补发。提醒计划仅本机，不包含服务器推送、小组件或静默日历写入。
- 每个任务有独立通知编号，设置第二个任务不会覆盖第一个。完成单个任务仅取消对应提醒；删除或完成整条通知时取消其所有本机子提醒和已显示的通知。
- 默认外观跟随系统，已有手动深浅色选择仍保留。Manifest 未拦截 `uiMode`，系统切换深浅色时按默认方式重建 Activity 并重新取得能力/动态色；Android 12 起动态取色，较旧系统使用内置配色。
- 启动或回到前台后按需检查更新，五秒内重复的生命周期回调合并；空闲时不轮询。设置→工具→「检查更新」显示当前安装版本，可以手动检查并查看结果；手动请求间隔至少30秒，30秒内成功结果直接复用，遇到正在进行的自动检查会等待同一次结果。检查不影响使用；有新版时先提示，点击「去下载」才打开该仓库的 HTTPS APK 地址，不自动下载或安装。网络不可用时保留本机通知；已有对话框期间暂缓提示，恢复应用后可再次提示缓存的新版本。
- 网页滚到顶部或底部时关闭 WebView 自带的拉伸回弹，滚动、手势和页面内容照常使用。

## 系统栏、安全区与键盘

原有 Android 11 及以上宿主已经使用边到边窗口；此次补齐 Android 8–10 的一致处理，并修正 WebView 安全区分发。窗口背景延伸至系统栏下方，正文、顶栏按钮和底部导航仍留在安全范围内，不隐藏状态栏或导航栏。

- 使用固定的 AndroidX Core 1.17.0 `WindowCompat.enableEdgeToEdge`，保留 SDK 36。由原生容器统一处理系统栏、刘海和键盘的边距，同一侧取最大遮挡值，不能把键盘与导航栏高度相加。横屏、多窗口和返回应用时重新取得边距。
- 已由容器处理的 inset 类型置零后继续传给 WebView，键盘关闭时也传零更新；不再整体返回 `CONSUMED`。这样不依赖 WebView 版本自行补相同边距。内置网页的 Android `--safe-top` / `--safe-bottom` 继续为零；不要再给网页叠一层系统安全区。
- `adjustResize` 保留，WebView 可用高度随输入区域变化；没有主动隐藏键盘、清空输入或移除焦点。原生背景与网页默认背景一致。系统栏图标按网页发来的深浅色更新，切换外观不覆盖旧系统的布局 flags；Android 10 起保留系统三键导航的对比保护，手势导航仍使用透明系统栏。
- 当前只完成源码合同审查；完整 Android 编译由发布 CI 完成。手势/三键导航、横屏刘海、多窗口、键盘反复开关及实际设备的主题切换仍待真机验收，纯 Java 边界检查或 APK 编译不能替代这些结果。

真机最小检查：在手势与三键导航各打开一次；旋转到横屏确认左右按钮不压刘海/导航键；输入并连续开关键盘确认输入和底部操作可见且不残留空白；分别切深浅色确认状态栏及导航键可读；返回前台确认布局和已有通知保持。

依据：[Android edge-to-edge 指南](https://developer.android.com/develop/ui/views/layout/edge-to-edge)、[WebView inset 处理](https://developer.android.com/develop/ui/views/layout/webapps/understand-window-insets)、[Android 16 的强制边到边行为](https://developer.android.com/about/versions/16/behavior-changes-16#edge-to-edge)、[WindowCompat API](https://developer.android.com/reference/androidx/core/view/WindowCompat)、[Core 1.17.0 固定版本](https://developer.android.com/jetpack/androidx/releases/core#1.17.0)。Core 1.18 起需要更高的 compileSdk，本次不顺带升级。

## 项目与构建

`app/src/main/assets/web/` 是构建时拷贝进去的网页成品目录，不提交重复的成品。在项目根完成 `pnpm build` 和 `python3 mobile/prepare-web.py` 后，使用 Gradle 8.13、JDK 17、Android SDK 36 构建：

```sh
gradle :app:assembleRelease
```

AGP 固定为 8.11.1，AndroidX WebKit 固定为 1.16.0。发布 APK 要用本机或 CI 私密空间里的固定签名密钥签名，不能把签名私钥、密码或本地 SDK 路径放入仓库。相同的签名和更高 `versionCode` 才能覆盖更新而保留数据。

本项目不包含大语言模型 Key；联网请求发到现有服务器，后台需要允许 `https://appassets.androidplatform.net` 这个本地网页来源。

## 网页与原生的接口

桥对象只注入 `https://appassets.androidplatform.net`。Java 还会检查发信的是顶层页面以及精确的内置入口 `/assets/web/index.html`。没有开放 `addJavascriptInterface`。

网页通过 `CampusNative.postMessage(JSON.stringify({ id, action, payload }))` 发消息，通过 `CampusNative.onmessage` 收到 `{ id, ok, data }` 或 `{ id, ok: false, error }`。所有动作都异步。

| action | payload | 成功的 data |
| --- | --- | --- |
| `capabilities` | `{}` | `{ calendar, fileSave, shareText, localReminders, appearance, haptics, updates, appVersion, theme }` |
| `checkUpdate` | `{}` | `{ status: "current" \| "available" \| "busy" \| "cooldown" \| "error", currentVersion, version?, download?, github?, aliyun? }`；只检查元数据，下载需另点按钮 |
| `consumeShare` | `{}` | `{ text: string \| null, remaining }`；每条分享只取出一次 |
| `calendar` | `{ title, description?, location?, startMillis, endMillis?, allDay? }` | `{ status: "opened", saved: false }`，仅表示日历界面已打开 |
| `saveBegin` | `{ name, mime, size }` | `{ token }` |
| `saveChunk` | `{ token, base64 }` | `{ bytes }`，累计原始字节数 |
| `saveFinish` | `{ token }` | 系统保存结束后返回 `{ status: "saved" \| "cancelled" }` |
| `saveCancel` | `{ token }` | `{ status: "cancelled" }` |
| `scheduleReminder` | `{ id, noticeId?, title, body?, triggerMillis }` | `{ status: "scheduled" \| "permission-denied", approximate: true }`；`noticeId`为父通知，旧记录缺省沿用`id` |
| `cancelReminder` | `{ id }` | `{ status: "cancelled" }` |
| `consumeOpenedNotice` | `{}` | `{ id: string \| null }` |

桥请求 `id` 使用 1–80 个英文、数字或 `_.:-`；提醒 `payload.id` 最多320字符、父通知`noticeId`最多150字符。子任务提醒使用`通知ID::task::任务ID`，取消父ID精确关联该父的所有子计划，取消子ID仅影响这一计划。文件最多 96 MiB，每个 base64 块最多 262144 个字符，按序等待回复后发送下一块。`size` 是原始文件字节数，不能是 base64 字符数。`saveFinish` 打开系统另存为界面，因此不应使用普通请求那样的短超时。

`theme` 含 `dark`、`primary`、`onPrimary`、`primaryContainer`、`onPrimaryContainer`、`surface`、`surfaceVariant`、`onSurface`、`outline`、`secondary`、`tertiary`，颜色值为 `#RRGGBB`。不支持消息桥的旧 WebView 会继续使用网页的普通功能，原生专属能力不可用。

正在打开应用时收到新的分享，原生会触发 `campus-native-share` 事件；网页再调用 `consumeShare`，先保存或追加现有草稿，避免覆盖用户输入。连续分享会排入最多 10 条的临时队列，网页可循环取出直到 `text: null`。返回键先触发可取消的 `campus-native-back` 事件，网页可用 `preventDefault()` 接管未保存内容的确认；没有接管时关闭最上面的 dialog，再返回历史，最后双击返回退出。

点击本地提醒触发 `campus-native-open-notice` 事件。网页通过 `consumeOpenedNotice` 取出稳定通知 ID 并跳转；如果应用刚启动，也会在能力就绪后主动消费一次。提醒计划仅保存在本机，不随文字备份或云同步跨设备自动创建。

## 安全与验证边界

只加载 APK 内置的页面，外部链接交给系统浏览器。没有远程更新页面或远程脚本注入，没有忽略 SSL 错误，没有启用不安全的文件跨域访问。文件导出只写应用缓存中的随机临时文件，并由用户在系统界面选择目的位置；取消、完成或关闭应用后清理临时文件。

`checks/NativeHostChecks.java` 是免费、无模型调用的纯 Java 边界检查，验证来源、链接、时间范围、导出令牌、大小和数据完整性。它不替代真实手机对文件选择器、键盘、安全区域、系统日历和安装升级的检查。

更新检查优先读取固定的 `https://123.57.30.129/android-download.json`（最多32 KiB），不可用、无效或明显旧于已安装/已知版本时，才回退固定的 GitHub Releases API（最多512 KiB）。两端点都不跟随重定向，连接及单次读取各最多3秒，并共用约14秒截止期限；保留系统 HTTPS 验证。ETag 按来源绑定，版本及下载通道一起保存，旧 GitHub 缓存兼容读取。

清单必须提供同版本的精确 GitHub APK 地址。可选 `aliyun` 只接受 `https://123.57.30.129/downloads/android-v{版本}/campus-inbox-{版本}.apk` 原样路径，不接受显式端口、userinfo、query/hash、编码或路径别名；提供了无效通道会拒绝该清单并回退固定 API。缺少 `aliyun` 时维持 GitHub 下载；有效时原生弹窗显示“阿里云下载”和“GitHub 备用”，都需用户点击，再由系统界面确认安装。清单解析代码不会创建阿里云下载路由或发布文件；实际提供了哪个通道以已验证发布的清单为准。

更新检查沿用已有联网权限，未增加服务或安装权限，不下载或自动安装 APK；`checkUpdate` 桥动作只检查上述固定公开元数据。离线、限流、无效元数据不会被误报为“已是最新版”：自动检查静默等待下次进入，手动检查显示简短失败提示。纯 Java 检查同时编译 `NativeUpdatePolicy.java`，覆盖通道精确地址与同版本约束。

本地提醒的授权、节电延迟、重启恢复、通知点击跳转，以及回弹关闭、升级提示和同签名覆盖安装仍需要真实手机验证，不以编译成功代替这些实际结果。

主要参考：[AGP 8.11 兼容表](https://developer.android.com/build/releases/agp-8-11-0-release-notes)、[加载应用内页面](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content)、[WebKit 发布记录](https://developer.android.com/jetpack/androidx/releases/webkit)、[系统日历 Intent](https://developer.android.com/guide/components/intents-common#AddCalendarEvent)、[WebView 消息桥](https://developer.android.com/reference/androidx/webkit/WebViewCompat#addWebMessageListener(android.webkit.WebView,java.lang.String,java.util.Set,androidx.webkit.WebViewCompat.WebMessageListener))。
