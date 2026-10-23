# Note Inbox 名称与网页入口

中文品牌为“拾笺”，英文名为“Note Inbox”。

- 阿里云主站：https://123.57.30.129/
- GitHub 新入口：https://kemou2333.github.io/note-inbox/
- GitHub 旧入口：https://kemou2333.github.io/campus-inbox/

GitHub 新旧路径提供同一版本完整应用，保留访问路径；同一来源共享本机存储。阿里云是另一个来源，沿用现有登录/变更同步机制。

源码、发布和旧安卓备用更新接口继续保留在 `Kemou2333/campus-inbox`，避免破坏旧安装包的固定地址。`Kemou2333/note-inbox` 只维护网站入口，其 Pages 工作流按指定的公开源码提交构建，不复制部署密钥，不改变应用包名、存储键、数据格式或安装包签名。

发布时先完成主仓库网页与 APK 发布、更新已验证下载清单，再手动触发 note-inbox 的 Pages 工作流，source_ref 填入最终完整提交 SHA。不得传私人 Token 到工作流，也不通过定时轮询同步。核对三个网页的标题/构建/下载清单及 GitHub 新旧路径的数据连续性。

首次使用仅显示一句 AI 隐私提醒；重看教程、关于、整理和提问均不重复弹窗。隐私说明位于设置 → 工具与帮助 → 隐私说明。
