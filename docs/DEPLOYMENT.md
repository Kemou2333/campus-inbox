# 部署与维护

## 网页

仓库 `Kemou2333/campus-inbox` 的 Pages 使用 GitHub Actions 发布 `dist/`。正式地址为 `https://kemou2333.github.io/campus-inbox/`，不覆盖账号原有博客。

`dist/config.js`仅包含HTTPS接口地址与关闭访问码的开关，不含密钥。网页可直接整理；后端用持久化每日/IP限额、并发控制和高频自动验证防滥用。示例按钮直接追加12条已存结果，无模型费用。

## 后端

- 程序：`/opt/campus-inbox/current`，仅监听 `127.0.0.1:8787`。
- 密钥：`/etc/campus-inbox/backend.env`，root 读取，权限 600。
- 服务：`campus-inbox.service`，以独立普通用户运行，自动启动和故障重启。
- 用量：`/var/lib/campus-inbox/usage.json`，只保存计数，不保存通知。
- Nginx：外部只暴露 HTTPS API 和 HTTP 证书验证目录。

环境项与 `server/.env.example` 对齐。更换 API Key 后重启 `campus-inbox`，不需要改网页或公开仓库。

## GitHub Actions 后端发布

仓库 Actions Secrets 使用：

| 名称 | 用途 |
| --- | --- |
| `SERVER_HOST` | 后端主机 |
| `SERVER_PORT` | SSH 端口 |
| `DEPLOY_SSH_PRIVATE_KEY` | 限定用途的发布私钥 |
| `SSH_KNOWN_HOSTS` | 固定主机公钥，避免跳过身份校验 |

`campus-deploy` 账号的密钥只允许执行 `deploy-campus-inbox`，不能进入交互 shell、端口转发或获取 root 会话。发布器只接收五个明确的源码文件，拒绝路径遍历、链接、额外文件与超大内容。切换版本后检查健康状态，失败时恢复上一个版本。系统配置和密钥不会被代码发布覆盖。

## HTTPS 与续期

使用 Let's Encrypt 的短期 IP 证书，不需要另购域名。服务器已安装隔离的 Certbot；首次申请需要账号所有者确认阅读并同意服务协议；本项目已获得用户的明确同意并完成申请。

首次申请示意命令（首次接受协议需先确认；当前证书已签发，不必重复注册）：

```sh
ssh -t root@123.57.30.129 '/opt/campus-certbot/bin/certbot certonly --webroot -w /var/www/campus-acme --ip-address 123.57.30.129 --preferred-profile shortlived --cert-name 123.57.30.129 --register-unsafely-without-email'
```

证书成功签发后，加载 `server/nginx-https.conf`，验证配置再重载 Nginx。安装并启用 `campus-certbot-renew.timer`，每日检查两次；续期成功后验证并重载 Nginx。

首次接受协议之前不运行非交互注册，不用自签名证书冒充浏览器信任的 HTTPS。

## 日常维护

```sh
systemctl status campus-inbox
systemctl status campus-certbot-renew.timer
journalctl -u campus-inbox --since today
```

应用不打印通知正文、访问码或模型密钥。用户浏览器中的数据只能由用户导出备份，服务器无法代为恢复。

## 当前进度

截至 2026-10-04，Node.js 后端和 HTTPS 已启用。信任链校验正常，健康接口返回 200，未经授权的整理请求返回 401 且不调用模型；续期定时器已启用。用户只需打开 github.io 网页，不必在地址栏输入服务器 IP。
