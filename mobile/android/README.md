# 校园 Inbox · Android

这个版本把校园 Inbox 安装到 Android 手机里。页面随 APK 内置，离线也能查看已经保存的通知。新增 AI 整理仍需要联网。

第一版保留网页的通知、附件、笔记与备份能力，并接入系统的文件选择、另存为、分享文字和日历添加界面。页面使用 Material You 配色；Android 12 及以上可读取系统动态色。没有单独维护另一套原生业务界面。

## 使用与数据

- Android 8.0 及以上可安装。较新的 Android System WebView 能提供完整的原生桥功能。
- 从其他应用分享纯文字到「校园 Inbox」只会填入原文，用户按「整理」后才调用 AI。
- 日历功能打开手机的日历编辑界面，由用户确认保存。应用不读取已有日程，不申请读写日历权限，也不能获知日程最后是否保存。
- 通知保存在这个应用自己的本地空间中，与浏览器内的数据各自独立。可用备份文件迁移；卸载应用会清除本机数据。
- 文件通过系统选择器添加或保存，无「管理所有文件」等广泛存储权限。当前不包含直接拍照附件。
- 没有后台闹钟、自动推送、小组件或静默日历写入。这些可以在后续版本中分别设计。

## 项目与构建

`app/src/main/assets/web/` 是构建时拷贝进去的网页成品目录，不提交重复的成品。将项目的 `dist/` 内容复制到这里后，使用 Gradle 8.13、JDK 17、Android SDK 36 构建：

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
| `capabilities` | `{}` | `{ calendar, fileSave, shareText, theme }` |
| `consumeShare` | `{}` | `{ text: string \| null, remaining }`；每条分享只取出一次 |
| `calendar` | `{ title, description?, location?, startMillis, endMillis?, allDay? }` | `{ status: "opened", saved: false }`，仅表示日历界面已打开 |
| `saveBegin` | `{ name, mime, size }` | `{ token }` |
| `saveChunk` | `{ token, base64 }` | `{ bytes }`，累计原始字节数 |
| `saveFinish` | `{ token }` | 系统保存结束后返回 `{ status: "saved" \| "cancelled" }` |
| `saveCancel` | `{ token }` | `{ status: "cancelled" }` |

`id` 使用 1–80 个英文、数字或 `_.:-`；文件最多 96 MiB，每个 base64 块最多 262144 个字符，按序等待回复后发送下一块。`size` 是原始文件字节数，不能是 base64 字符数。`saveFinish` 打开系统另存为界面，因此不应使用普通请求那样的短超时。

`theme` 含 `dark`、`primary`、`onPrimary`、`primaryContainer`、`onPrimaryContainer`、`surface`、`surfaceVariant`、`onSurface`、`outline`、`secondary`、`tertiary`，颜色值为 `#RRGGBB`。不支持消息桥的旧 WebView 会继续使用网页的普通功能，原生专属能力不可用。

正在打开应用时收到新的分享，原生会触发 `campus-native-share` 事件；网页再调用 `consumeShare`，先保存或追加现有草稿，避免覆盖用户输入。连续分享会排入最多 10 条的临时队列，网页可循环取出直到 `text: null`。返回键先触发可取消的 `campus-native-back` 事件，网页可用 `preventDefault()` 接管未保存内容的确认；没有接管时关闭最上面的 dialog，再返回历史，最后双击返回退出。

## 安全与验证边界

只加载 APK 内置的页面，外部链接交给系统浏览器。没有远程更新页面或远程脚本注入，没有忽略 SSL 错误，没有启用不安全的文件跨域访问。文件导出只写应用缓存中的随机临时文件，并由用户在系统界面选择目的位置；取消、完成或关闭应用后清理临时文件。

`checks/NativeHostChecks.java` 是免费、无模型调用的纯 Java 边界检查，验证来源、链接、时间范围、导出令牌、大小和数据完整性。它不替代真实手机对文件选择器、键盘、安全区域、系统日历和安装升级的检查。

主要参考：[AGP 8.11 兼容表](https://developer.android.com/build/releases/agp-8-11-0-release-notes)、[加载应用内页面](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content)、[WebKit 发布记录](https://developer.android.com/jetpack/androidx/releases/webkit)、[系统日历 Intent](https://developer.android.com/guide/components/intents-common#AddCalendarEvent)、[WebView 消息桥](https://developer.android.com/reference/androidx/webkit/WebViewCompat#addWebMessageListener(android.webkit.WebView,java.lang.String,java.util.Set,androidx.webkit.WebViewCompat.WebMessageListener))。
