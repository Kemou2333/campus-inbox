# 校园 Inbox · 鸿蒙原生开发预览

这是独立的 **ArkTS / ArkUI Stage** 工程，供少量朋友自行编译、签名测试。没有嵌入网页，也不是 APK 改名。

**当前尚未经过 HarmonyOS SDK 编译和真机验证，没有可直接安装的 HAP。** 不在网页或安卓应用内提供鸿蒙下载入口，也不作为已交付的产品能力宣传。

## 可以先做什么

- 原生「添加 → 整理 → 逐条展开 → 完成」界面，默认跟随明暗模式。
- 与网页相同的三条已审查示例顺序轮换，本机预制体验，不调用模型。
- 现有邮箱账号及密码登录，保留服务器图形验证码与原有额度限制。密码和会话仅在内存，退出应用后重新登录；本版不提供注册、改密。
- 单条真实通知复用既有云端任务接口。保存 requestId 后再提交；网络失败不自动再次调用模型。前台每四秒读取进度，退后台停止读取，重新登录可恢复最近的云端整理结果。
- 各账号及游客本机数据分开，原文、任务进度和草稿保存到应用沙箱。先写临时文件并落盘，再原子替换；读取坏文件时保留原文件，不以空状态覆盖。删除需要确认，可在设置里恢复最近删除。

开发预览还没有：进度跨端同步、附件、分享长图、注册、系统提醒、更新检查和完整网页功能。它不向已有网页记录回写精简字段，避免覆盖原数据。云端恢复当前读取最近二十次任务，每次最多导入五次已完成结果，可再次刷新；不是完整历史浏览器。

## 朋友需要安装什么

1. 安装官方 [DevEco Studio](https://developer.huawei.com/consumer/cn/deveco-studio/)，Mac 选择符合芯片的版本。
2. 完成首次设置向导，安装 HarmonyOS SDK。工程最低目标为 **HarmonyOS 5.0.0 / API 12**；如所装 DevEco 仅支持新版，在项目结构中将编译 SDK 和 Hvigor 配套升级，不能仅修改文件后宣称兼容。
3. 用 DevEco 打开本目录，等待工程同步，在模拟器编译运行，先确认原生控件与本机示例闭环。

DevEco 自带或配套管理 JDK、Node.js、ohpm、Hvigor，优先使用它们，不需要先另找第三方安装器。官方下载页若调整，可从[统一下载入口](https://developer.huawei.com/consumer/cn/download/)进入。

### unsigned HAP 与真机

未配置签名时，编译出的 **unsigned HAP 只是构建产物，不等于能在朋友手机上直接安装**。真机测试需按[华为官方自动签名说明](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-signing-auto)登录开发者账号，选择 HarmonyOS 签名，并绑定测试设备。正式分发另有审核和签名要求，本工程不假设随意下载侧载可行。

请勿把 DevEco 自动生成的签名材料、口令、设备标识或本机路径提交到公开仓库；`.p12`、`.cer`、`.p7b` 和本地配置均须留在私密位置。签名配置当前为空，CLI 不自动登录、签名、购买或创建云资源。

## 本机检查与构建

```bash
python3 scripts/check_project.py
python3 scripts/toolchain.py
```

第一个仅检查目录、配置、权限和公开示例一致性；第二个检测本机官方工具是否存在。它们**不能代替 ArkTS 编译**。

公开示例有更新时，先在网页源码完成原有隐私审查，再运行 `python3 scripts/prepare_samples.py`；它只复用最新已审查通知，不生成新的模型响应来源。纯模型边界可在仓库现有 Node 24 环境执行 `node checks/model-checks.mjs`，也不等于 SDK 编译；朋友只用 DevEco 构建时无需这项可选检查。

工具就绪后，可用 DevEco 菜单构建，或显式执行：

```bash
python3 scripts/toolchain.py --build --install-dependencies --output build-evidence.json
```

若自动探测不到安装位置，可以设置 `DEVECO_HOME`（`.app/Contents`）、`HVIGORW_PATH`、`OHPM_PATH`、`JAVA_HOME`、`HOS_SDK_HOME`。构建只使用已安装工具；缺工具返回非零状态，不伪造安装包。脚本核对 HAP 内的模块配置及 Ark 字节码并记录大小、哈希，仍明确标记未签名、未验证安装。

官方 [Hvigor 命令行文档](https://developer.huawei.com/consumer/en/doc/harmonyos-guides/ide-hvigor-commandline)及 [HDC 安装工具文档](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides-V13/hdc-V13)。不要关闭证书验证或系统安全检查来绕过安装错误。

## 后续每次发布

先随源码在 GitHub 保留这个独立工程；只有官方 SDK 实际编译成功才附 unsigned HAP，只有签名与真机确认完成才称可安装版。`availability.json` 是内部交付状态，默认无下载链接。SDK、原生界面和真机尚未验证前，不把网页/Android 的测试结果算作鸿蒙测试。

将来可在已配置官方工具的自有 runner 上，仅对手动发布任务执行同一脚本并上传产物；不要为普通 PR 开放带签名的自托管 runner。当前没有启用新的云构建或付费资源。

代码采用仓库的 AGPL-3.0-only；内置原通知保留各自原权利。
