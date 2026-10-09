# 邮箱验证注册、密码登录与发信配置

注册时填写用户名、邮箱和密码，使用一次六位邮件验证码确认邮箱。以后直接用邮箱或用户名加密码登录，无需每次收验证码。已有用户名账号先用原密码登录，再绑定邮箱；绑定后邮箱也使用原密码，通知、笔记和进度继续归原账号。绑定不能覆盖邮箱或合并两个账号。

之前仅用邮箱验证码登录、没有设置密码的账号，可在登录页点“设置密码”，验证邮箱后设置首次密码，原账号 UUID 不变。该入口不会覆盖已经设置的密码，也不是密码找回。旧版客户端的验证码登录接口保留兼容，新网页默认使用密码登录。

邮箱验证默认关闭：`MAIL_LOGIN_ENABLED=false`。只在维护者配置好现有发信邮箱后开启；缺少配置时仍可用邀请码注册和密码登录。免费测试使用模拟发信，不发送真实邮件，也不创建邮箱、付费资源或微软应用。

## 先配置一个发信邮箱

全部真实配置写入仓库外的 `/etc/campus-inbox/backend.env`，文件权限 `600`。授权码、应用密钥和 refresh token 都是私密凭据，不能写进网页、GitHub、日志或通知备份。`SMTP_FROM` 必须与 `SMTP_USER` 相同。

### QQ 邮箱

登录自己的 QQ 邮箱网页：右上角头像 → 设置 → 账号与安全 → 安全设置 → 开启 POP3/IMAP/SMTP 服务 → 生成授权码。按页面指引验证身份后，把授权码作为 SMTP 密码保存；QQ 登录密码不能代替授权码。[QQ 邮箱官方说明](https://help.mail.qq.com/detail/106/985)

```dotenv
MAIL_LOGIN_ENABLED=true
SMTP_AUTH_MODE=password
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=自己的数字QQ号@qq.com
SMTP_FROM=与SMTP_USER相同
SMTP_PASSWORD=自己的QQ邮箱授权码
```

这里使用 465 端口的 TLS 加密，服务器证书校验保持开启。SMTP 地址与加密端口也见[腾讯云官方发件邮箱配置表](https://intl.cloud.tencent.com/zh/document/product/1266/71700)。

### 可选：Outlook 个人邮箱

Outlook.com 需要 OAuth2 授权，使用 `smtp-mail.outlook.com:587` 和 STARTTLS；适配器拒绝用微软邮箱密码进行 SMTP 登录。当前支持个人 Microsoft 账号，组织账号和共享邮箱需要另行适配。[微软官方 SMTP 设置](https://support.microsoft.com/en-gb/outlook/pop-imap-and-smtp-settings-for-outlook-com)

发信邮箱所有者须先在已有权限的 Microsoft Entra 中注册支持个人账号的应用，登记准确的 **Web 回调地址**，取得 client ID 和服务端 client secret；再用微软授权库完成带 `state` 校验和 PKCE 的授权码流程，申请 `https://outlook.office.com/SMTP.Send offline_access` 委托范围，获得初始 refresh token。此准备步骤不在公开网页内进行，也不自动开通订阅或资源。[应用注册](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)、[授权码流程](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)、[SMTP OAuth 权限](https://learn.microsoft.com/en-us/exchange/client-developer/legacy-protocols/how-to-authenticate-an-imap-pop-smtp-application-by-using-oauth/)

环境设置为 `SMTP_AUTH_MODE=oauth2`、`SMTP_HOST=smtp-mail.outlook.com`、`SMTP_PORT=587`、`SMTP_SECURE=false`，并私密填写 `SMTP_OAUTH_CLIENT_ID`、`SMTP_OAUTH_CLIENT_SECRET`、`SMTP_OAUTH_REFRESH_TOKEN`；完整示例见 [Nodemailer 依赖与发信适配器说明](../server/vendor/NODEMAILER-SOURCE.md)。`SMTP_SECURE=false` 表示连接后强制 STARTTLS，仍校验证书；刷新端点固定为微软 `consumers` token 接口。

服务会在刷新时，把新的 refresh token 原子写入 `SMTP_OAUTH_STATE_FILE`（权限 `600`），目录必须为服务用户所有且权限 `700`。成功保存后才使用新的 access token 发信；匹配同一邮箱和应用的已保存 token 优先于环境中的初始值。一个文件由一个服务实例持有，重启、备份、搬家时保留它。授权被撤销或应用密钥过期后，需要所有者重新授权或更新凭据。[微软 refresh token 说明](https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens)

## 登录规则

发件邮箱和用户登录邮箱有独立用途。Outlook 可以作发件人；当前登录白名单为 `qq.com`、`163.com`、`126.com`、`gmail.com`、`stu.cqu.edu.cn`、`cqu.edu.cn`、`alu.cqu.edu.cn`、`139.com`、`189.cn`、`yeah.net`。QQ 登录地址使用数字 QQ 号；Gmail 的点号和加号别名归到同一邮箱。

| 限制 | 默认值 |
| --- | --- |
| 验证码 | 六位数字，5 分钟有效，最多尝试 5 次，只能使用一次 |
| 再次发送 | 同邮箱等待 60 秒 |
| 同邮箱发信 | 连续 1 小时 3 次、连续 24 小时 6 次 |
| 同网络发信 | 连续 1 小时 20 次、连续 24 小时 40 次 |
| 全站发信 | 连续 24 小时 50 次，同时最多发送 2 封 |
| 同网络失败验证 | 连续 1 分钟 10 次；不影响同网络其他人的正确验证码 |
| 已验证邮箱的新账号 | 同网络连续 24 小时 10 个、全站连续 24 小时 20 个；同网络连续 1 分钟 5 个 |
| 总账号容量 | 500 个；邀请码注册仍有独立的网络限制 |
| 密码登录猜测 | 同网络每分钟 5 次、同账号每分钟 5 次；邮箱和用户名共享账号额度 |

计数在发信前持久化；发送失败仍计入发信限额，并使对应验证码失效。错误响应带剩余发送冷却时间，避免连续点击。限额采用滚动时间窗口，跨整点或午夜不会突然多出一份额度；旧计数升级时保守保留，重启不会清零。

重发不取消其他尚未过期的验证码，避免匿名请求干扰别人正在注册或绑定。每个挑战仍最多尝试 5 次、只可使用一次；已作废的历史挑战不会恢复。取码响应不包含验证码或邮箱是否已注册。验证成功后才检查邮箱是否已占用，并继续检查账号容量与新账号限制；绑定必须由发起绑定的原账号会话完成。

邮箱注册在验证完成前不会创建账号；新密码以独立随机盐和 scrypt 哈希保存。密码哈希计算后会在事务中重新检查验证码状态和有效期，避免并发提交复用验证码。已存在的绑定邮箱、用户名和密码不能被注册流程覆盖。旧邮箱账号首次设置密码也仅能更新空密码，不修改任何已有密码。

网络额度为共享校园出口保留余量，新邮箱注册和邀请码注册分开计数。邮箱验证只证明可以收信；持有许多邮箱或使用多个网络的人仍可能批量尝试，也可能消耗公开取码额度。邮箱、网络、全站上限共同限制邮件骚扰与注册规模，现有账号登录不消耗新注册额度；AI 整理的账号、网络和全站限额继续生效。

## 接口与升级

| POST 路径 | 内容 | 成功返回 |
| --- | --- | --- |
| `/auth/options` | `{}` | `{emailEnabled,inviteEnabled,domains}` |
| `/auth/login` | `{username:邮箱或用户名,password}` | `{key,username,email?,expiresAt}` |
| `/auth/email/request` | `{email,purpose:'register'}` | `{challengeId,retryAfterSeconds,expiresAt}` |
| `/auth/email/verify` | `{challengeId,code,username,password}` | `{key,username,email,expiresAt}` |
| `/auth/email/request` | `{email,purpose:'password'}` | 同上；仅兼容尚未设密码的旧邮箱账号 |
| `/auth/email/verify` | `{challengeId,code,password}` | 同上；保留旧账号 UUID |
| `/auth/email/request` | `{email,purpose:'bind'}`，Bearer 原账号会话 | 同上 |
| `/auth/email/verify` | `{challengeId,code}`，Bearer 发起绑定的同账号会话 | `{username,email,expiresAt}` |
| `/auth/email/request` | `{email,purpose:'login'}` | 兼容旧客户端验证码登录 |
| `/auth/email/verify` | `{challengeId,code}` | 兼容旧客户端；返回旧邮箱账号或首次创建邮箱账号 |

邮箱与验证码表增量加入已有 `auth.sqlite`，保留原账号 UUID 和 `sync.sqlite` 的归属。本轮密码注册没有新增表或破坏性迁移。注册或首次设密码后创建会话失败时，已保存的账号、绑定和密码保留，用户改用邮箱或用户名密码登录；已消费的验证码不能重放。旧邀请码注册已创建账号但会话失败时，也可改用用户名密码登录。

升级前先备份两个 SQLite 数据库，并更新宿主受限安装器为新的 16 文件清单，再运行后端发布。开关和密钥不由源码归档覆盖。免费测试使用模拟邮箱与 token 服务，不代表真实邮箱能投递；启用后需由维护者明确安排一次真实收信验收。
