# 轻量服务器迁移准备

当前仍是一套 Node 服务、两个 SQLite 数据库、一个用量文件和既有反向代理；无需引入新数据库、队列或付费平台。本轮只准备配置和步骤，**没有执行迁移，也没有变更真实数据、密钥或限额**。

## 可迁移配置

`CAMPUS_STATE_DIRECTORY` 默认 `/var/lib/campus-inbox`，服务与现有备份脚本共用。默认将 `auth.sqlite`、`sync.sqlite`、`usage.json`、后台备份状态和邮件 OAuth 状态放在此目录。既有 `AUTH_STATE_FILE` / `SYNC_STATE_FILE` / `USAGE_STATE_FILE` / `BACKUP_STATUS_FILE` / `SMTP_OAUTH_STATE_FILE` 显式配置仍优先；修改根目录不会自动搬走旧文件。

迁移优先保留 `/var/lib/campus-inbox` 和 `/etc/campus-inbox/backend.env` 原路径，最少改动。若改路径，需同时改服务与备份服务的环境配置、systemd可写目录授权以及所有显式路径，不能只设置新根目录后得到空库。现有 `StateDirectory=campus-inbox` 对应默认路径；其他路径需明确 `ReadWritePaths=` 并自行创建700目录、确认服务用户可写。

保留原 `CAMPUS_ACCESS_TOKEN`：它保护会话、签名和用量匿名键。换密钥会造成会话/限流身份变化，不应当作迁移步骤。`usage.json` 必须与数据库一起带走，不能从零重建预算。账号、通知、笔记、收藏、进度、删除记录、整理任务、问答幂等账本都在原SQLite中，直接保留。

## 获准正式切换时的步骤

1. 新主机先安装兼容的 Node 24+（含 `node:sqlite`）、Python3、Nginx及既有HTTPS证书工具；准备当前完整后端发布文件、同一服务用户和相同私密环境文件。不要使用尚未完成的构建。保持监听 `127.0.0.1:8787`，只让代理暴露443。
2. 旧主机停止备份计时器和后端，等待在途任务排空（现有停止宽限195秒）。确认进程停止后再制作最终整目录快照；运行中分别拷贝两个SQLite文件不能保证跨库一致。
3. 以私密归档完整复制状态目录（包括可能仍存在的 `-wal` / `-shm`、`backups/`、`smtp-oauth.json`），同时复制私密环境文件。只通过SSH等加密通道传输，目录700、文件600，不放Git/网页/共享附件。

   默认路径下的最终快照示例（只在正式切换获准后执行）：

   ```sh
   sudo systemctl stop campus-backup.timer campus-backup.service campus-inbox
   sudo install -d -m 700 /root/campus-move
   sudo tar -czf /root/campus-move/state.tar.gz -C /var/lib campus-inbox
   sudo chmod 600 /root/campus-move/state.tar.gz
   sudo sha256sum /root/campus-move/state.tar.gz
   ```

4. 在新主机空的目标路径恢复，不覆盖已有业务目录。核对归档校验和、文件所有者、私密权限及SQLite `PRAGMA quick_check`。确认旧主机服务保持停止；**同一份预算状态只能有一个运行实例**，否则两个进程的内存互斥/文件配额无法协调。
5. 用原配置启动新服务，只检查本机 `/health`、未登录接口拒绝、登录/云通知可见性和用量文件延续。检查不需要调用模型或发送邮件。若需验证收费模型，另按既有小批量规则执行，不能自动重试。
6. 新代理沿用请求体/超时/IP规则，加入 `/notice-question`，调整真实主机名与证书路径；先通过Nginx配置检查，再切换现有域名或前端API地址。新的网页Origin须明确加入 `ALLOWED_ORIGINS`；Android仍保留既有 appassets Origin，不能改成 `*`。
7. 用户确认通知/笔记/进度保留后再视为迁移完成。旧服务器与快照先保留，不自动删除。若新主机已收到业务写入，回退前必须在停止新实例后把最新完整状态带回旧主机；直接启动旧快照会丢失新写入。

## 可选容器

`server/Dockerfile` / `compose.yaml` 仍只是备用运行方式；已补全后台、邮件及vendor依赖，SQLite继续使用持久卷。部署前要把原数据恢复进同一卷并带入私密环境文件，不能直接新建空卷代替迁移。不要同时运行systemd与容器。此轮只检查文件覆盖与Node启动，未实际构建/启动Docker镜像。

现有在线备份是业务恢复手段，不是跨数据库原子切换快照；正式搬迁采用停止写入后的完整目录。公网主机、证书、DNS、前端API地址和Android升级属于实际切换时的工作，此轮没有修改这些项目。
