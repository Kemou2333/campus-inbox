# 校园 Inbox

把群里的通知整理成清楚的待办和提醒，分清谁需要办理、截止时间和具体步骤。网页与 Android 共用 Material You 界面，登录同一账号后自动同步通知文字、进度和笔记。

- [打开网页](https://kemou2333.github.io/campus-inbox/)
- [免注册查看示例](https://kemou2333.github.io/campus-inbox/?examples=1)
- [Android 安装包](https://github.com/Kemou2333/campus-inbox/releases)

## 使用

宽屏左侧新增、右侧查看；手机竖屏在「整理」里粘贴一条或多条通知，一次提交给 DeepSeek。每次最多 20 条、合计 4000 字。AI 只接收本次提交的文字，不接收已有通知、笔记或附件。结果按适用对象显示待办及子步骤；时间不明确时保留原文，不补造日期、地点或负责人。

通知默认收起，先看标题、适用对象、时间地点和进度，展开后查看具体步骤。示例通知来自之前真实的 DeepSeek 返回结果，可在设置中载入，无需登录或调用模型。勾选步骤、记录逐项笔记、查看附件和导出备份均可离线使用。邀请码注册后，在不同设备使用同一用户名和密码登录即可自动同步。

附件保存在添加它的设备，不进行图像识别或云端上传。Android 支持接收分享文字、系统文件操作、日历确认添加和本地提醒；需用户授予相应权限。网页版可导出日历文件。新版布局已做浏览器尺寸检查，安卓系统栏、键盘与提醒行为仍需新 APK 实机复测。

## 开发

需要 Node 24 和 pnpm 11.19.0：

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm test:server
pnpm build
python3 mobile/prepare-web.py
```

| 目录 | 职责 |
| --- | --- |
| `src/domain` | 通知、步骤、完成状态和时间规则 |
| `src/features` | 整理、通知、笔记、附件与设置界面 |
| `src/infrastructure` | 本地存储、旧数据迁移、AI、账号与同步客户端 |
| `src/platform` | 网页和 Android 能力适配 |
| `server` | AI 请求、限额、邀请注册与文字同步；内置 SQLite |
| `worker/prompt.mjs` | 版本化结构化提示词 |
| `mobile/android` | Android 原生壳、文件、分享、日历与提醒 |

2.3 版进一步精简界面：分类栏只显示一套计数，通知标题加大，笔记、粘贴与新增使用带提示的图标。字数在输入框下方，整理按钮占一整行；数据说明移到设置，深色界面使用中性的蓝灰底色。裸网址显示域名，点击仍打开完整原链接。

通知默认折叠，保留分类、搜索和展开状态；手机弹窗与正文加宽，原文随整个弹窗滚动。支持轻度 Markdown 的加粗、列表和链接，本机 PDF 可直接翻页预览，备份可选择包含附件或仅保留文字。Android 只处理一次屏幕安全区，手动切换主题时系统栏也随之切换；手机横屏、平板和方屏按可用宽度布局。iOS 暂不开发。

界面参考 [Material 3 字体层级](https://m3.material.io/styles/typography/applying-type)、[按钮规范](https://m3.material.io/components/buttons/guidelines)与 [Android edge-to-edge](https://developer.android.com/develop/ui/views/layout/edge-to-edge)，触控目标保持至少 48px。

网页部署到 GitHub Pages，API 独立运行在服务器。模型 Key、设备密码、SSH 与 APK 签名私钥均保存在仓库外。后端不用额外的数据库进程，登录和同步数据采用两个 SQLite 文件，方便整套迁移。接口地址通过公开运行配置更新，APK 联网时也读取该配置。

免费测试覆盖数据迁移、同步冲突、邀请与登录、限额、AI 批量调用、附件和原生边界。测试使用临时数据与假模型；真实模型效果与安卓真机表现另行验收。

频繁整理时出现自托管的四位数字图片验证码，不需要第三方平台账号或海外验证码服务。输错可以重填，取消后保留草稿；账户、网络和全站每日限额仍然有效。

- [产品行为](docs/PRODUCT.md)
- [领域与数据格式](docs/DOMAIN.md)
- [部署、回滚与服务器迁移](docs/DEPLOYMENT.md)
- [邀请码与账号](docs/INVITE-LOGIN.md)
- [服务器容量估算](docs/CAPACITY.md)

本版还修复了删除卡片时的位置跳动、旧搜索隐藏新增结果等交互问题。空白草稿可直接粘贴；误删草稿可恢复文字和附件。宽屏分类和搜索保持可见，HTML 等附件按文字预览，不执行内容。

- [2.3 验收记录](docs/VALIDATION-2.3.md)
- [2.2 验收记录](docs/VALIDATION-2.2.md)
- [验证码与后续公开注册](docs/PUBLIC-ACCESS-PLAN.md)
- [2.1 验收记录](docs/VALIDATION-2.1.md)
