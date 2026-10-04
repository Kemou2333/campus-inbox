# 公开整理服务的边界

正式服务不要求访问码。所有模型请求由服务器发出，网页与公开仓库没有模型Key。每天全站最多30次付费调用，每IP最多10次；同一IP滚动3分钟最多5次提交，同时只处理一个模型调用。上游失败也占用次数，不自动重试。

连续第3次起，未命中缓存时返回428轻量挑战；浏览器计算SHA-256后，用X-Campus-Proof重新提交完全相同的正文。这个往返只有通过后才调用模型，不等于两次付费。挑战由服务端HMAC签名，绑定IP、Origin和正文，两分钟有效，单次使用，服务重启后旧挑战作废。SHA-256与HMAC依据[Web Crypto文档](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest)与[Node.js文档](https://nodejs.org/api/crypto.html#cryptocreatehmacalgorithm-key-options)。

轻量计算验证不证明用户是人类；Origin只能限制浏览器跨站请求，不能防止脚本伪造。单IP也无法覆盖多IP攻击，共享校园网络可能共同消耗10次额度。全站每日硬上限限制最坏付费请求量，不是固定人民币金额上限。

磁盘仅保留请求/token数、结束代码以及每日HMAC(IP)计数与请求时间。没有通知数据库、原始IP、通知文本或持久化模型结果；缓存最多15分钟且仅在内存。签名密钥沿用服务器内部CAMPUS_ACCESS_TOKEN环境值，前端不再接收这个值。

## 本地日历与紧急事项

紧急事项完全在浏览器计算，已完成/不适用事项排除，缺少完整日期不猜测年份。日历导出遵循[RFC 5545](https://www.rfc-editor.org/rfc/rfc5545)的ICS格式，UTF-8按字节折行，文本字段转义。导出不会请求设备日历权限、不会自动写入手机日历，用户在日历应用确认导入。Android等客户端是否提供文件直接导入入口由其日历应用决定。

## 后续候选功能

通知问答留待下一轮：只在用户明确提问时选择相关本地通知，引用原文证据回答，计算额外费用前给出明确入口。当前没有问答、后台合并、个人资料筛选或APK；Android WebView打包可后续评估，参见[Android官方说明](https://developer.android.com/develop/ui/views/layout/webapps/webview)。
