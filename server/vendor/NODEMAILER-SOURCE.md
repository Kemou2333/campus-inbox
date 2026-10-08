# Nodemailer 离线依赖

- 上游：[Nodemailer 官方源码](https://github.com/nodemailer/nodemailer)
- 固定版本：`10.0.16`，标签 [`v10.0.16`](https://github.com/nodemailer/nodemailer/tree/v10.0.16)
- 固定提交：[`afa881500ed6b239091c4aa13c629bde62b10c7b`](https://github.com/nodemailer/nodemailer/commit/afa881500ed6b239091c4aa13c629bde62b10c7b)
- 许可证：MIT-0，完整上游许可证见 `NODEMAILER-LICENSE`。
- 产物：`nodemailer-10.0.16.mjs`，227,376 字节。
- SHA-256：`f50c9a29c3cb40a82533b2a103899696cffb69aaaea2d0456a1707911ec075fa`。

这是完整上游 Nodemailer 的 Node.js ESM bundle，包含 SMTP、XOAUTH2、邮件 MIME 等全部运行时依赖；只保留 Node.js 自带模块的外部导入。部署不依赖服务器的 `node_modules`，也不实现自制 SMTP 协议。源代码通过受信任的 GitHub connector 从固定官方标签读取；39 个上游源码/许可证/package 元数据 blob 均按 Git blob SHA-1 校验。没有将 GitHub 下载伪称为 npm tarball。

构建使用项目现有 esbuild `0.28.2`：

```sh
# 在上述官方提交的完整检出中，先运行上游生成步骤。
node scripts/build.js --generate-only
# 用项目中 esbuild 可执行文件，输入上游 src/nodemailer.ts。
esbuild src/nodemailer.ts --bundle --platform=node --target=node22 \
  --format=esm --minify --legal-comments=inline \
  --outfile=nodemailer-10.0.16.mjs
```

上游生成步骤产生 `src/package-info.ts` 和 `src/well-known/services.ts`。本机项目 TypeScript 7 不导出 `typescript/bin/tsc`；因此只跳过上游生成脚本中未使用的 tsc 路径解析，保持两段生成函数和所有运行时源代码原样，再用 esbuild 编译。构建中保留上游 legal comments；未修改上游 SMTP 或 OAuth 实现。

## 发送适配器配置

`createMailSender(env, options={})` 来自 `server/mail-sender.mjs`。只有 `MAIL_LOGIN_ENABLED=true` 才启用；未启用时返回 `null`，不读取私密 token 文件、不连接网络。启用且配置不完整时抛出启动配置错误。

QQ 邮箱：

```dotenv
MAIL_LOGIN_ENABLED=true
SMTP_AUTH_MODE=password
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=自己的完整QQ邮箱地址
SMTP_FROM=与SMTP_USER相同
SMTP_PASSWORD=自己的QQ邮箱授权码
```

授权码必须由邮箱所有者在 QQ 邮箱页面自行生成，不能用 QQ 登录密码代替。[QQ 邮箱官方授权码说明](https://help.mail.qq.com/detail/106/985)：头像 → 设置 → 账号与安全 → 安全设置 → 开启 POP3/IMAP/SMTP 服务 → 生成授权码。标准 QQ SMTP 为 `smtp.qq.com:465`、TLS；[腾讯云官方客户端配置示例](https://main.qcloudimg.com/raw/document/product/pdf/1270_46586_cn.pdf)也列出该地址与端口。`SMTP_FROM` 默认等于 `SMTP_USER`，只接受同一邮箱账号，不接受额外显示名或自定义头。

Outlook 个人邮箱需要 OAuth2，由账号所有者先完成微软应用注册和交互授权：

```dotenv
MAIL_LOGIN_ENABLED=true
SMTP_AUTH_MODE=oauth2
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=自己的完整Outlook邮箱地址
SMTP_FROM=与SMTP_USER相同
SMTP_OAUTH_CLIENT_ID=微软应用client_id
SMTP_OAUTH_CLIENT_SECRET=微软应用client_secret
SMTP_OAUTH_REFRESH_TOKEN=账号授权后取得的初始refresh_token
SMTP_OAUTH_STATE_FILE=/var/lib/campus-inbox/smtp-oauth.json
```

- 授权参数：`https://outlook.office.com/SMTP.Send offline_access`；须使用应用已注册的精确 redirect URI、authorization code 流程和 `state`。适配器不注册 Azure/Entra 应用、不执行用户交互授权、不创建付费服务。
- 刷新端点固定为 `https://login.microsoftonline.com/consumers/oauth2/v2.0/token`，禁止重定向，不接受任意 token URL。
- 新 refresh token 在模式 `0600` 的本地文件原子保存后，才交给 Nodemailer XOAUTH2 使用新 access token；文件目录须仅账号所有者可访问。文件中的 matching user/client token 优先于环境初始 token；持久化失败就终止发送。
- token 缓存和刷新去重限当前服务进程；一个状态文件只应由一个服务进程持有。微软授权、账户撤销和真实 SMTP 兼容性仍须在部署账号配置后验证。
- `SMTP_SECURE=false` 强制 STARTTLS，仍验证证书；Microsoft 官方 SMTP 主机禁止 password 模式。当前 OAuth2 适配器只针对 Outlook 个人邮箱，未扩展到组织账号/共享邮箱。

官方依据：[Nodemailer SMTP](https://nodemailer.com/smtp)、[Nodemailer OAuth2](https://nodemailer.com/smtp/oauth2)、[微软 SMTP OAuth2](https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth/)。

发送采用 10 秒应用总期限、5 秒 SMTP 阶段超时、4 秒 OAuth HTTPS 期限。SMTP 接受单个收件人且无拒绝才判成功；错误只返回通用信息。超时之后远端可能晚投递，因此登录服务必须撤销失败请求对应的验证码，不把超时当成功。这里没有发送真实邮件、取得真实 token 或使用用户邮箱。

测试注入点：`createTransport`、`fetch`、`oauthTokenStore`（`load`/`save`）、`now`、`sendTimeoutMs`（仅可缩短到 1–10,000 ms）。所有正式 TLS 和日志设置由适配器固定。
