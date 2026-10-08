# 部署与服务器迁移

网页和 APK 使用同一份 React/TypeScript 成品。后端是一个模块化服务，负责 AI 整理、邀请注册、登录、文字同步和用量限制；没有额外的数据库进程。以下为新版部署约定，是否已经发布以实际网页、服务健康检查和发布记录为准。

## 部署分工

| 部分 | 位置与用途 |
| --- | --- |
| 网页 | `https://kemou2333.github.io/campus-inbox/`；GitHub Actions 构建后发布 `dist/`。 |
| Android | APK 内置同一份网页成品，支持离线查看；原生适配器负责分享、文件和系统日历。 |
| API | 初始地址 `https://123.57.30.129` 下的 `/analyze`、`/auth/`、`/sync`；健康检查为 `/health`。客户端优先读取 Pages 的 `runtime-config.json`。 |
| 服务源码 | `/opt/campus-inbox/current` 指向当前发行目录。 |
| Node 运行时 | `/opt/campus-inbox/runtime/node`，本应用独立的 Node 24，不替换系统 Node 或 QQBot 的运行环境。 |
| 环境与密钥 | `/etc/campus-inbox/backend.env`，权限 600，不在仓库。 |
| 登录数据 | `/var/lib/campus-inbox/auth.sqlite`，保存邀请码哈希、账号、密码哈希和设备会话。 |
| 同步数据 | `/var/lib/campus-inbox/sync.sqlite`，保存账号对应的通知文字、状态、笔记和删除记录。 |
| 用量文件 | `/var/lib/campus-inbox/usage.json`，保存匿名化计数，不保存通知正文。 |
| TLS | 宿主 Nginx 负责现有 IP HTTPS 证书及续期。 |

每个设备先保存本地数据，登录后同步文字、笔记和状态。附件仅保存在添加它的设备与用户导出的备份中，不上传服务器。退出登录不删除本地通知。保留邀请码注册与用户名密码登录；配置现有发信邮箱后支持邮箱验证码，默认关闭，不自动创建付费资源。邀请发行见 [INVITE-LOGIN.md](INVITE-LOGIN.md)，发信配置见 [EMAIL-LOGIN.md](EMAIL-LOGIN.md)。

## 本地构建与免费检查

需要 Node 24 与项目 `packageManager` 指定的 pnpm 11.19.0：

```sh
pnpm install --frozen-lockfile
pnpm test
node --test server/tests/*.test.mjs
pnpm build
python3 mobile/prepare-web.py
```

锁文件确定依赖版本。网页使用相对资源路径，避免 GitHub Pages 子目录与 Android 离线入口的差异造成资源 404。APK 只包含新版 `dist/`，不叠加旧字体或主题补丁。

免费检查使用假模型响应、模拟邮件和临时数据库，覆盖一次批量调用、缓存、付费失败计量、时间校验、账号限额、邀请码、邮箱验证和绑定、图片验证码、冲突和删除同步。发行检查把完整 16 文件包单独放入临时目录，启动服务；不依赖网页 `dist/`、package.json、包管理器或 node_modules。这些检查不证明真实邮件投递或所有真实通知都能正确提取，也不替代安卓真机检查。

## 三条 CI

### 网页

`pages.yml` 安装锁定依赖，免费检查并构建，再上传 `dist/` 到 Pages。网页包含公开 API 地址，模型 Key、SSH 密钥、密码和签名私钥均不进入构建。[GitHub Pages 自定义工作流说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

### 后端

`backend.yml` 用 Node 24 运行 `server/tests/`，再使用受限发布账户。Actions Secrets 为 `SERVER_HOST`、`SERVER_PORT`、`DEPLOY_SSH_PRIVATE_KEY`、`SSH_KNOWN_HOSTS`；该账户不能进入 root shell 或转发端口。

发行包只包含以下 16 个运行与依赖说明文件：

```text
server/index.mjs
server/analyze.mjs
server/service.mjs
server/image-captcha.mjs
server/sync.mjs
server/auth.mjs
server/email-auth.mjs
server/mail-sender.mjs
server/manage-invites.mjs
worker/prompt.mjs
server/contracts/data.js
server/contracts/time.js
server/contracts/email-policy.mjs
server/vendor/nodemailer-10.0.16.mjs
server/vendor/NODEMAILER-LICENSE
server/vendor/NODEMAILER-SOURCE.md
```

受限安装器检查清单、文件类型、路径、大小和语法，再切换发行目录并检查 `/health`；失败恢复上一个代码版本。旧 `dist/data.js` 与 `dist/time.js` 已原样移入后端合同目录，因此后端不依赖新版前端产物。SMTP 使用固定版本的完整 Nodemailer 离线 bundle，发布包保留许可证和来源记录；服务器无需安装 node_modules。Node 24 提供内置 SQLite。[Node SQLite 文档](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)

**首次升级新版需由维护者先完成以下宿主准备，再发布：**

1. 安装本应用独立的 Node 24，保持系统运行时不变。
2. 更新宿主受限安装器的 16 文件清单和语法检查运行时；原十文件安装器会拒绝新发布包。
3. 备份并更新 systemd 的 ExecStart、私密环境配置，创建服务拥有的状态目录。
4. 检查并更新 Nginx 的 `/auth/` 与 `/sync` 路由；同步请求体上限为 1 MiB。
5. 运行免费接口验收后，在项目目录外私密生成邀请码，再发布网页和 APK。

安装器、Nginx、systemd、密钥和数据库不由源码归档覆盖。代码回滚不会自动回滚用户数据；本次新增 SQLite 文件，未来更改数据库结构应另做备份与兼容迁移，不能依赖 `/health` 成功证明登录和同步都正常。

新版 `/analyze` 需要有效设备会话；示例和本地操作无需登录。默认付费请求上限为每账号 10 次/日、每 IP 10 次/日、全站 30 次/日，并保留三分钟限频。高频未缓存整理从第三次起要求本机生成的 4 位数字图片验证码，默认 `CAPTCHA_MODE=image`；显式 `pow` 用于旧版兼容。图片验证无需外部平台账号，120 秒有效、最多 5 次答案尝试，正确只能兑换一次，输错继续填写同图且不占新的限频入口。验证码失败不会调用模型；实际付费调用失败仍计数，缓存命中不占付费额度。来源限制用于浏览器跨域，真正的私密身份由登录会话确定；不能用 Origin 或 IP 代替账号。

### Android

`android.yml` 安装同样的依赖，免费检查、构建网页、复制内置资源，再用 JDK 17 / Gradle 8.13 / Android SDK 36 构建并验证签名。保持原包名和签名，提高版本号，便于覆盖升级和保留本地记录。

继续使用 `ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_PASSWORD`、`ANDROID_KEY_ALIAS` Secrets。CI 只上传 APK，不上传签名文件或私密配置。构建与模拟原生桥检查不等于真机日历、系统文件选择器和升级验证。

## 环境与状态

`server/.env.example` 只有占位值。真实环境文件包含模型 Key、长期随机服务器签名密钥、允许的 origin、费用限额，以及用量/登录/同步状态路径。`CAMPUS_ACCESS_TOKEN` 沿用旧字段名，现为服务器签名与匿名化计数密钥；用户不用填写访问码。邮箱登录只有 `MAIL_LOGIN_ENABLED=true` 且发信配置完整时才启用；未启用时不读取 OAuth 状态或连接邮箱，原登录仍正常。

systemd 默认 `BIND_HOST=127.0.0.1`、`PORT=8787`，通过 Nginx 对外。服务状态目录权限 700，私密文件 600。换模型 Key 后重启服务即可，不必重建客户端；重启时保留所有状态文件。服务为一个实例，避免两套独立计数绕过预算。

账号数据与服务器 IP 无关。设备会话 30 天有效，活跃设备自动续期；退出只注销本设备。迁移后保留原数据库可继续用同一账号，若会话异常用户可重新登录。同步使用逐条版本比较，不以设备时钟覆盖另一设备的修改；同一通知冲突应由用户选择保留版本。

## 可选 Docker 搬家方案

`server/Dockerfile` 与 `server/compose.yaml` 为以后迁移准备，本轮不自动安装或启动 Docker。它们运行同一个 Node 24 服务和本地 SQLite 文件，不另起 MySQL/Redis，也不在小服务器构建前端或 APK。[Node 官方镜像说明](https://hub.docker.com/_/node)

新机器、私密环境与 TLS 准备好后可选用：

```sh
docker compose -f server/compose.yaml build
docker compose -f server/compose.yaml up -d
```

默认读取仓库外的 `/etc/campus-inbox/backend.env`，其他路径用 `CAMPUS_ENV_FILE` 指定。容器监听 `0.0.0.0`，宿主只映射 `127.0.0.1:8787`。Nginx 留在宿主处理 TLS；不能同时启动占用同一端口的 systemd 与容器。

名为 `usage` 的数据卷保留目录内的用量文件和两个 SQLite 数据库，启用 Outlook 时也保存 OAuth refresh token 状态。使用 OAuth 时目录权限须为 700、状态文件为 600。容器只读运行，预算 256 MB、0.5 核，日志最多约 15 MB。切换时必须迁移这个卷的全部状态；重新建立空卷会造成账号和云通知丢失，不能作为普通升级步骤。

## 2027 年 3 月前的搬家清单

1. 确认新机器、域名/IP 以及部署方式；不必同时更改应用架构和托管方式。
2. 在新机准备同样的私密环境、服务用户、Node 24、状态目录和 TLS。保留现有签名密钥与所有状态，模型 Key 不放进仓库或构建参数。
3. 正式切换前短暂停止旧服务，确保进程已退出，再私密复制 `auth.sqlite`、`sync.sqlite`、存在的 `-wal`/`-shm` 文件及 `usage.json`；也可使用 SQLite 备份接口取得一致数据库。不能只复制正在写入的主数据库文件而遗漏 WAL。
4. 用独立目录启动新机，免费确认 `/health`、登录、同步、来源与限额；检查旧账号的文字和状态。真实模型只做小批单次验收。
5. 更新 Pages 的 `runtime-config.json` 中公开 API 地址，以及 GitHub SSH 主机 Secrets，固定核对新主机公钥。新版 APK 联网时从 Pages 读取地址，通常无需因换 IP 再发版；读取失败时使用内置旧地址兜底，因此切换时要验证实际读取。更早、没有远程配置的 APK 则需覆盖升级。
6. 保留旧环境与上个代码版本作为回滚。切换后检查网页、一个 APK 和证书续期；不要同时让新旧服务各自使用独立付费计数。确认后再决定是否停用旧机器，不自动删除用户数据。

若以后使用稳定 API 域名，搬家只改 DNS/TLS 便可减少客户端发版。GitHub Pages 继续托管网页，不能直接运行此后端；本轮不购买域名或新的服务器。
