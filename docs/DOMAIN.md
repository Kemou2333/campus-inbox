# 数据与操作规则

新版把通知数据、操作规则与界面拆开。网页和 Android 使用同一套 `src/domain`；日历、文件保存等系统能力交给 `src/platform`；AI 请求和本地读写放在 `src/infrastructure`。以后增加其他云端功能，不需要让每个按钮都知道服务器地址。

## 已有功能在新版的数据位置

| 功能 | 数据与规则 |
| --- | --- |
| 多条通知整理 | 服务仍接受最多 20 个 `sources`，合计 4000 字；这里只将返回的 v4 AI 内容转为 v5 本地记录 |
| 任务、提醒、知悉消息 | `kind` 保留三个内容类别；界面可以把 reminder 和 information 放在一个提醒页并区分标签 |
| 适用对象 | 每个 Task 保留 `scope`、`condition`、`assignee`，不能把“未选课的同学”显示成全体必做 |
| AI 拆出的办理步骤 | 每个 Step 的文字、细节原样保留；用户只修改完成状态和笔记 |
| 每项笔记 | Notice、Task、Step、Reminder 均支持本地笔记；与 AI 返回字段分开 |
| 日期与优先级 | 原文时间、完整 ISO 时间及 `timeSpec` 分开保存；只有完整确认时间或用户设置时间进入倒计时 |
| 完成与不适用 | 有效事项全部完成后自动完成；全部排除时状态为 dismissed，不能计作完成 |
| 备份与恢复 | v5 备份；支持读取原 v1-v4 备份；附件由独立附件仓库保存和导入 |
| 附件预览 | 保留 `attachments` ID，复用 `campus-inbox-files` / `files` IndexedDB |
| 示例通知 | 由应用把已有 AI 结果作为普通通知载入，领域层无需独立演示状态 |
| 删除、撤销 | 应用保存操作前的记录快照；领域操作均返回新对象，不直接改原对象 |

## 两种版本号

服务的 **AI 输出契约仍是 schemaVersion 4**。它包含摘要、执行人、条件、步骤和时间，不包含用户笔记、完成情况、附件或本地编号。

新版 **本地记录为 schemaVersion 5**。每条通知、事项、步骤和提醒都有稳定 ID。UI 编辑笔记和切换状态通过 ID 找到目标，不依赖列表下标；排序后笔记仍对应原来的项目。

```ts
const result = parseAnalysisBatch(response.result);
const notices = result.notices.map((a, i) => createNotice(a, sources[i].text));
```

`parseAnalysis` / `parseAnalysisBatch` 负责外部 AI 结果的边界校验，移除不了的错误直接告诉用户。`createNotice` 增加本地字段，不改写摘要和办理内容，也不进行第二次 AI 调用。

## 操作 API

- `toggleTask(notice, taskId)`：勾选整个事项时同步勾选其步骤；取消时同步取消。
- `toggleStep(notice, taskId, stepId)`：最后一个步骤完成后，该事项自动完成；取消任一步骤恢复待办。
- `setTaskApplicable(notice, taskId, applicable)`：明确保存“不适用”决定，保留已有笔记和步骤状态。
- `setNoticeCompleted(notice, completed)`：整体完成或恢复；恢复普通已完成通知时保留已经排除的分支，恢复全部不适用通知时恢复其适用状态。
- `updateNote(notice, target, note)`：按稳定 ID 改笔记；不会恢复已完成项目或取消不适用决定。
- `getNoticeStatus`：`pending`、`completed`、`dismissed`、`reminder`。dismissed 可以显示在历史页，但标签必须是“不适用”。
- `effectiveDeadline` / `priority` / `sortNotices`：基于本地时间计算今天要办、即将到期和已截止。活动开始时间不会自动被当成截止时间。

空白或未知适用对象不自动归到全体。已排除任务不会参与未完成数和到期排序。模型没有给出的时间、地点和执行人不补写。

## 时间精度

`timeSpec` 使用 `type,year,month,day,hour,minute,rawText`。完整日期时间为 `date_time`，只有完整年月日为 `date`，缺少年份等为 `partial`，明天或周五为 `relative`，范围或无法识别的表达为 `unknown`。

- `2026年10月7日17:00前` 可得到完整 ISO。
- `10月7日17:00前` 保留月日时分，年份为 null。
- `明天中午前` 保留原文，不借用添加时间推算。
- `2026级`、`2026—2027学年` 不提供日历年份。
- `24:00` 只在完整日期确定时转换为次日零点。

时间解析器是已有验证过的纯解析逻辑的 TypeScript 移植。`parseTimeSpec` 会核对结构与原文表达；不完整时间需要用户确认后才能变成可执行日程。

## 迁移和存储

首次打开同一浏览器来源时，`LocalRepository.load()` 优先读 `campus-inbox:notices:v5`。不存在时读取旧 `campus-inbox:notices:v1`，通过 `parseNotices` 迁移，成功写入 v5 后才返回。旧 key 和附件数据库不删除，也不会把异常旧数据覆盖成空列表。

旧 Task 没有 ID 时按通知 ID、旧顺序和内容生成确定 ID；已有 Step ID 保留。旧 `reminders:string[]` 加 `reminderNotes:string[]` 合成 `Reminder{id,text,note}[]`。迁移后重排提醒不会错位。

网页不同域名、不同浏览器、旧安卓包与新安卓包是独立存储空间。自动迁移只适用于同一来源；跨来源或跨设备通过含附件的备份恢复。

本地仓库以 `{version:5,revision,notices}` 保存列表。写入失败时不推进本地持久化状态；另一标签页已经更新时拒绝覆盖，应用先载入最新数据。`subscribe()` 提供变更订阅。UI 可以在一个应用状态入口管理记录，避免散落的 `localStorage` 写入。

## 后续同步和换服务器

`NoticeRepository` 只定义本地 `load / save / subscribe`。持续云同步由独立 `src/infrastructure/sync-client.ts` 协调器处理；它不会替换本地离线仓库，也不会把网络请求写进各个界面组件。

`createCloudSync(repository, endpoint, options)` 提供 `connect / disconnect / syncNow / resolveConflict / getState / subscribe`。应用用一次性邀请码注册，再用用户名和密码登录。登录成功取得设备会话并 `connect`，没有匿名生成空间的前端入口。

应用在新增、修改、完成、删除后短暂合并请求并自动同步；页面可见时定时拉取，重新获得焦点时立即拉取。这里的 key 是持续登录的设备会话，不是邀请码或一次性迁移码；使用同一账号登录连接同一云空间。每台设备仍先保存本地，断网时继续操作，恢复连接再上传。

每条卡片有服务端版本，本机保留基准版本、内容指纹和增量游标。新增和修改采用版本比较，删除发送 tombstone。提交过程中新产生的编辑不被当成已上传；分页使用明确的 `accepted` 确认，未读完的后续页只拉取更新，避免重复提交。远端写入本地后更新基准，不再原样上传一遍。

两台设备同时改同一卡片会留下本地内容并显示冲突。用户可选本机、云端或保留两份；保留两份只复制卡片编号，不改原通知文字与 AI 摘要。自动同步不会悄悄覆盖冲突记录。

当前云同步只有通知文本、步骤、完成状态与笔记；附件继续留在本机。云记录的附件数组固定为空，远端文本更新会保留已有本地附件编号，删除本地附件也不会上传文件。未来附件同步可以通过独立附件仓库增加。

同步身份与基准元数据单独存储，不包含在通知备份里。它们按服务地址隔离；换到另一个服务器时不会自动把旧密钥发送过去。真正更换服务器时迁移同步数据库及身份密钥配置，再让客户端连接新地址；本地格式和领域规则无需改动。示例和真实同步状态应区分，演示不冒充已完成的云端能力。
