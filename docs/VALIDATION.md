# 检查与发布

只检查修改涉及的功能及直接影响面。自动化用例保留在源码中，历次检查数量、截图和运行日志不再逐版放入仓库；历史提交仍可追溯。

- 网页：`pnpm test`、`pnpm build`；构建包含公开示例隐私检查。
- 后台：`pnpm test:server`；用临时数据和固定模型响应核对权限、配额及数据边界。
- 安卓原生兼容规则：见 [原生检查](../.github/workflows/native-policy.yml)。安装包使用既有签名。
- 发布：使用现有 GitHub Actions；本机构建、线上发布和真机体验分别记录。

当次生产版本以 [Releases](https://github.com/Kemou2333/note-inbox/releases) 和实际入口为准。浏览器尺寸模拟不等于 QQ/Via 或安卓真机验收；真实模型及邮件检查需要单独执行，不用固定响应冒充。

[限额标准](LIMITS.md) · [部署](DEPLOYMENT.md)
