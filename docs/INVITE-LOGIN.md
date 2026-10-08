# 邀请注册与登录

注册只需一次性 8 位邀请码、用户名和密码；以后在网页和安卓使用同一个账号登录，通知、笔记与完成状态持续同步。配置发信后也支持邮箱验证码登录；旧账号先用原密码登录，再绑定邮箱即可继续使用原数据。配置步骤见 [EMAIL-LOGIN.md](EMAIL-LOGIN.md)。尚未绑定邮箱的旧账号仍没有密码找回功能，请保存好密码。

## 接口

| POST 路径 | 内容 | 成功返回 |
| --- | --- | --- |
| `/auth/register` | `{invite,username,password}` | `{key,username,expiresAt}` |
| `/auth/login` | `{username,password}` | 同上 |
| `/auth/status` | `{}`，Bearer 设备会话 | `{username,expiresAt}`，过期为 401 |
| `/auth/logout` | `{}`，Bearer 设备会话 | `{ok:true}` |

`createAuthClient(endpoint)` 提供 `register(invite,username,password)`、`login(username,password)`、`status(key)`、`logout(key)`。验证成功后把 session 的 key 交给 `CloudSync.connect`。每次登录发不同设备会话；同步空间归属稳定的账号 UUID，不依赖可展示的用户名。

## 规则

- 邀请码只有大写字母与数字，排除 `0`、`O`、`I`、`1`；服务器只存 SHA-256 哈希，注册成功后一次性消耗。
- 用户名做 NFKC 规范化、去首尾空白、英文字母小写，允许 3–24 个中文、字母、数字、下划线或短横线。
- 密码 8–128 字符，不要求额外的复杂组合，不去掉用户输入的空格。
- 密码使用独立随机盐和异步 scrypt；每次最多 16 MB 内存，最多同时处理 4 个密码派生。
- 用户名不存在和密码错误使用相同的提示，都会执行一次密码派生与恒时比较。
- 注册尝试每网络每分钟 5 次，成功注册每网络每天 5 次，总账号 500。失败的邀请码猜测也计入分钟限制。
- 登录每网络和每用户名每分钟各最多 5 次。
- 设备会话 30 天有效，活跃时剩余不足 15 天会续到 30 天；退出立即注销，其他设备继续使用。

邀请注册没有公开发行邀请码的接口、匿名同步注册或管理页面。用户数据仍先写本地，登录失败不删除本机记录。

## 私有发行

仅在有服务器维护权限的终端执行：

```sh
node server/manage-invites.mjs --count 10 --state /var/lib/campus-inbox/auth.sqlite --output /root/.config/campus-inbox/invites.txt
```

运行环境需要已有的 `CAMPUS_ACCESS_TOKEN` signing secret。每次可生成 1–30 个邀请码，默认 10 个；输出必须在项目目录外，文件权限为 600，不覆盖已有文件，也不把邀请码打印到日志。把该私有文件中的邀请码单独交给需要试用的人即可。

邀请码与密码不会进入通知备份、网页源码或公开仓库。邮箱域策略由网页和登录服务共用；SMTP 默认关闭，只有配置私密发信凭据并明确开启后才提供邮箱登录。

## 服务器迁移

登录、邀请和账号在 `auth.sqlite`，通知文字在 `sync.sqlite`。迁移时正确备份两个 SQLite 数据库并保留环境配置；先停止写入或用 SQLite 备份操作，避免遗漏 WAL。新服务地址登录同一用户名和密码后可以连接原账号空间，手机本地附件仍在原设备。
