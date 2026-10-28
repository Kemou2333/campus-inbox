# 安卓主下载

本模块只保护安装包下载，与账号、邮箱和AI额度完全独立。当前主入口为 `https://kemou.top:88/downloads/`，原阿里云地址继续兼容；各入口转到阿里云同一个门禁和账本，GitHub精确版本链接作为备用。验证码不是账号注册或邮件验证，不需要登录。

固定入口每次从已批准发行索引选择最高正式版本，跳转到该版本的验证码页；跳转不缓存、不占下载额度。更新元数据仍返回精确版本URL，兼容已安装客户端。

## 固定规则

- 每次下载需完成一张四位数字图片验证码；五分钟有效，最多五次错误。换图至少间隔10秒；同一IP每滚动小时最多申请20张。短时间普通刷新复用同一张图片，不绕过换图冷却。
- 验证成功签发两分钟有效的一次性下载凭证，绑定实际网络IP和精确版本；成功后303跳到同一版本的下载地址。每次新下载重新验证，下载凭证不能重放、跨IP或跨版本使用。
- 全站按**上海自然日**最多预留 **500,000,000字节（500 MB）**。派发文件前持久保存完整文件大小的预留；断开、失败和取消均不退款，防止反复下载部分内容消耗出站流量。
- 同一IP滚动一小时最多开始八次下载，同时只允许一条；全站最多八条活动下载。窗口在每条开始时间满一小时的准确边界释放，午夜不清空IP窗口。
- 每条最高 **2,000,000字节/秒（2 MB/s）**。逐块最多64 KiB读取、定时发送，并尊重响应背压；不会先读入完整APK。等待排空最长30秒，整个连接另有文件传输时间加120秒的上限。
- HEAD只返回元数据，不预留字节、不增加下载次数、不消耗凭证；不支持Range或断点续传。GET无凭证只显示验证页，不能直接获取文件。

这些数字为模块内部常量，AI预算或登录限频不会改变它们。全站流量预留是应用层的保守文件字节统计，不包含验证码/HTML、TLS/TCP、失败握手等协议开销，不能当作云厂商账单或整台服务器流量硬上限。GitHub备用流量不计入阿里云应用账本。下载按开始日归属；跨过午夜的旧下载继续完成，字节不按传输时刻重新拆分到次日，因此也不表示自然日真实出站字节硬限制。

## Node接入

```js
const handleAPK=await createAPKDownloads({
  directory:'/var/lib/campus-inbox-downloads',
  releaseManifestFile:'/var/lib/campus-inbox-downloads/releases.json',
  stateFile:'/var/lib/campus-inbox/apk-download-usage.json',
  signingSecret:existingStrongPrivateSecret,
  publicOrigin:'https://123.57.30.129',
  publicOriginAliases:['https://kemou.top:88','https://kemou.top:8443']
});
// 先于普通Request/Response缓冲适配分流；verifiedIP使用同一可信代理边界。
if(path.startsWith('/downloads/'))return handleAPK(req,res,verifiedIP);
```

`createAPKDownloads`返回异步Node请求处理函数，并提供`await handleAPK.close()`供正常停止时中止下载。配置路径必须为绝对路径；`publicOrigin`与可选别名均为精确HTTPS来源（仅本机测试的主地址另允许`http://127.0.0.1`）。请求Host只能选择已配置的来源，禁止任意Host或转发头生成跳转；POST、验证码和票据绑定同一个来源，不能跨入口复用。环境字段为 `APK_DOWNLOAD_PUBLIC_ORIGIN` 与逗号分隔的 `APK_DOWNLOAD_PUBLIC_ORIGIN_ALIASES`。

处理器不自行相信`X-Real-IP`或`X-Forwarded-For`。日本节点重写客户端IP，并以固定来源和私密认证连接阿里云；阿里云仅在验证通过后恢复IP及精确批准的公开Host。各入口共用一份额度与并发状态。IPv4映射IPv6统一为IPv4，普通IPv6按规范形式归一，不根据IP推断用户所在地。

处理器必须在`Response.arrayBuffer()`等整体缓冲适配之前接管原生`req/res`。反向代理的`/downloads/`应关闭响应缓冲与临时文件缓存，并保留正确客户端断开；建议由代理同时限制该真实IP的活动连接，保证浏览器到代理这一段慢连接也不能并行占用下载。模块的活动槽持续到Node响应完成或关闭。

下载地址固定为：

```
/downloads/android-v2.27.1/campus-inbox-2.27.1.apk
```

这个公开地址无查询参数时呈现中文HTML表单，无JavaScript要求。POST仅接受小于等于1024字节的URL编码表单，字段仅`challenge`和`answer`；Origin必须为固定服务来源，拒绝明确跨站POST。成功303跳转到同路径`?ticket=…`。不要把`ticket`查询参数写进代理访问日志；可以对该位置关闭访问日志或只记录不含参数的`$uri`。验证码数字只在绘制PNG时短暂存在，响应和HTML不包含明文答案、答案哈希或服务器密钥。

所有响应禁止缓存、禁止被嵌入、禁止嗅探，设置CSP和精确表单来源。HTML表单页使用same-origin来源策略，确保浏览器POST保留本站Origin，同时不向GitHub发送来源；303凭证跳转和APK使用no-referrer。公开字符串统一HTML转义，APK响应使用attachment。验证码/ticket仅存在有界内存中，重启后需要重新验证；已花下载次数和字节不因重启恢复。

## 只读资产索引与发布

索引只能列已完成包名、既有签名及文件校验并正式发布的稳定版本，不得列草稿、预览或尚未发布的候选版本。资产目录必须位于网页静态发布目录之外，不创建Nginx文件alias，不开放第二条可绕过验证的APK路径。只允许维护者部署已审核的同签名APK与索引，不让网页请求写入目录。处理器不会从任意URL拉取文件。

`releaseManifestFile`按请求重新安全读取，支持后续原子发布新版本而不重启AI后端。它是最多64 KiB、最多32个版本的普通非符号链接JSON文件，格式严格：

```json
{
  "schemaVersion":1,
  "releases":[
    {
      "version":"2.27.1",
      "filename":"campus-inbox-2.27.1.apk",
      "sha256":"由实际安装包生成的64位小写十六进制摘要",
      "size":1234567,
      "github":"https://github.com/Kemou2333/campus-inbox/releases/download/android-v2.27.1/campus-inbox-2.27.1.apk"
    }
  ]
}
```

摘要与size示例须替换为真实值。版本只接受三个不带前导零的数字部分；文件名必须由同版本精确派生；GitHub必须是这个仓库、这个标签、这个文件的精确HTTPS链接，不能自定义域名、认证信息、参数或跳转URL。

先由发布流程核对包名、既有签名、ZIP及内置资源，再以私有临时文件上传APK，校验SHA-256与大小后原子改名；最后原子替换索引。已发布APK视作不可变文件。模块只打开索引批准的叶子文件名，使用`O_NOFOLLOW`拒绝文件符号链接；首次实际下载验证实际大小和SHA-256，之后只在摘要及文件设备号/inode/大小/纳秒mtime/ctime均不变时复用验证。索引不能替代APK签名审核，模块不声称做过真实手机安装。

缺失或损坏的索引仅让下载返回503，不阻止整个AI后端启动。未批准版本和路径返回404；任何路径穿越、未知参数、重复ticket、Range、错误格式和错误凭证都不能得到文件字节。

## 独立持久账本

`stateFile`必须位于私密状态目录，原子写入、文件权限0600，写入及替换目录同步完成后才派发文件。它只保存：

```json
{"version":1,"day":"2026-10-23","reservedBytes":0,"downloads":{},"captchaRequests":{}}
```

两个映射的键均是带稳定服务器密钥和用途前缀的HMAC，值是有界时间戳数组。不保存明文IP、邮箱、账号、答案、ticket、文件名或下载内容。使用稳定密钥；不要每次重启临时生成密钥，否则无法延续同IP窗口。

每个准入与验证码发放在同一单后端进程内串行完成原子账本更新。状态损坏/无法保存时下载关闭并返回503，网页仍可显示已批准的GitHub备用；AI账号与原AI用量文件完全不受影响。不要删除账本恢复当日额度，不允许多个后端进程同时写这个本机JSON文件。备份策略可纳入该独立账本，但不能把它覆盖到AI`usage.json`或账号数据库。

## 免费验证范围

`server/tests/apk-downloads.test.mjs`使用真实本机HTTP服务、临时小文件和本地固定验证码，不调用模型、邮箱、生产账号或公网下载。覆盖单次凭证/HEAD、五错及刷新/有效期、Origin/IP绑定、滚动一小时与重启、上海午夜、日字节最后一次并发竞争、每IP/全站并发、断开保留预留、按假单调时钟检查64 KiB流式节流、非法表单/路径/Range、资产摘要与符号链接、坏状态/索引及无重启新版本热读。它不等于生产Nginx限速、云厂商账单或Android真机验收。


## 最新正式版本元数据

`GET /downloads/android-latest.json`和HEAD从同一已批准只读索引中按三个数字部分比较，选择最高稳定版本，返回`version`、同版本`aliyun`/`github`、`lanzou:null`、`sizeBytes`和`sha256`。不按数组顺序、字符串排序或上一个已安装版本逐级推送。此端点不创建验证码、不读取或扣除下载用量；即使日额度耗尽或下载账本损坏也可读取元数据。索引缺失、为空、非法或混入预览版本时返回503，不编造“已是最新”。

元数据禁止缓存，不支持查询参数与重定向，最多远低于客户端32 KiB读取上限。原生客户端固定使用此HTTPS端点，失败才回退固定GitHub最新正式Release API；网站原`android-download.json`仍是兼容的公开静态清单。原生更新检查行为及旧APK限制见[安卓最新版本检查](ANDROID-UPDATES.md)。
