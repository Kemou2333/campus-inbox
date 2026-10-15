# 后台通知预览

`admin-preview.html` 是独立的只读 React 入口，与正式网页共用 `NoticeCard`、`NoticeDetailContent`、`DetailDialog`、主题及 Markdown 渲染。Vite 同时构建正式 `index.html` 和该入口；Android 的正式主入口保持不变。

预览不调用 `useCampus`，不载入公开示例、不登录、不访问模型或云同步，也不读取或保存本机通知、笔记和附件。数据仅留内存，页面刷新即消失。人工修正通过 `effectiveNotice` 显示，原文仍取原记录；已完成的任务/步骤和笔记仍可查看。完成、适用性、创建提醒、删除和笔记修改入口隐藏或禁用；逐条展开、原文和已有真实出处可用。

## 消息边界

仅接收实际父窗口、来源精确为 `https://123.57.30.129` 的 `message`。其他来源或窗口消息忽略。页面自身打开时不会接收伪父消息。

- 就绪：发送 `{type:'campus-admin-preview:ready'}` 至准确后台 origin。
- 数据：父窗口发送 `{type:'campus-admin-preview',notice}` 或 `{type:'campus-admin-preview',records}`，两者二选一。最多 20 条，字段经 `parseNotice` 验证、编号不可重复。不接收 token 等额外顶层字段。
- 清空：发送 `{type:'campus-admin-preview',records:[]}`。
- 数据无效：清空当前预览并显示错误，防止后台切换后还看到旧用户通知。
- 高度：发送 `{type:'campus-admin-preview:height',height}`，范围 240–20000。

父后台同样只接受 `https://kemou2333.github.io` 且 `event.source === iframe.contentWindow` 的消息，再向该准确 origin 发送通知。令牌只由后台处理，不传预览、不放 URL。正文通过 React 文本或共用 `RichText` 显示，原始 HTML 不执行、远程图片不加载。

## 免费隔离验收

`work/check-source-admin-preview-213.cjs`、`work/source-admin-preview-213-report.json`：320 与 1280 两种宽度分别验证正式网页的精简出处与真正共享组件的后台预览，共 4 场景成功。生产域名通过本机请求拦截映射到隔离构建与虚构父页面，不访问生产账号。

验证包括严格 origin/source、错误记录清空、人工修正显示、任务独立展开、进度和笔记保留、禁止修改、原文与第二段精确高亮、外观跟随系统、无横向溢出；预览内 0 Storage/IndexedDB 调用，整体 0 模型/写接口/外部请求/页面错误。截图 `work/ui-2.13-{320,1280}-admin-readonly.png`。这不代表生产发布或安卓真机验证。

整后台组合时另修复了 iframe 展开再收起无法缩高的问题：观察并测量预览 `main` 的实际高度，不把父视口高度当成内容高度。`work/admin-preview-height-213-report.json` 的两次免费检查成功：320 宽 300→1382→300px，1280 宽 329→1002→329px，展开内容不裁切、收起恢复原高，0 未知网络/页面错误。父后台手机布局另外保证 iframe 至少有 280px 可用宽度。
