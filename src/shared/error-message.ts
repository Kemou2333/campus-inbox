/** Keep implementation details and potentially private diagnostics out of UI. */
export function friendlyErrorMessage(error:unknown):string {
 const issue=error instanceof Error?error:undefined;
 const message=(typeof error==='string'?error:issue?.message||'').trim();
 const details=issue as (Error&{code?:unknown})|undefined;
 const code=typeof details?.code==='string'?details.code:'';
 const name=issue?.name||'';
 if(name==='QuotaExceededError'||name==='NS_ERROR_DOM_QUOTA_REACHED'||/quota.{0,30}(?:exceed|reach)|storage.{0,20}(?:full|space)|disk.{0,10}full|(?:空间|存储).{0,12}(?:不足|已满)/i.test(message))return '本机存储空间不足。请先导出备份，再清理不需要的附件。';
 if(code==='AUTH_REQUIRED')return '登录状态已失效，请重新登录后再试。';
 if(name==='TimeoutError'||code==='AI_TIMEOUT'||/^(?:timeout|timed out)\b/i.test(message))return '等待回复超时。请先查看本次结果，再决定是否重试。';
 if(name==='AbortError')return '已停止等待。整理可能仍在进行，请先查看本次结果。';
 if(code==='NETWORK_ERROR'||/failed to fetch|fetch failed|network\s*(?:error|request|failure)|load failed|ERR_(?:NETWORK|INTERNET|CONNECTION|NAME|CERT)|ECONN(?:REFUSED|RESET)|ENOTFOUND/i.test(message))return '暂时无法连接服务，请检查网络后重试。';
 if(name==='NotAllowedError'||name==='SecurityError')return '当前权限不足，请检查浏览器或系统权限后再试。';
 if(name==='InvalidStateError'||/indexeddb|object.?store|transactioninactive/i.test(message))return '本机存储暂时不可用，请关闭无痕模式后重新打开。';
 const privateDetails=/https?:\/\/|file:\/\/|\bwww\.|\b(?:SQLITE\w*|SQLSTATE\w*|SELECT|INSERT|UPDATE|DELETE|Authorization|Bearer|api[_-]?key|secret|password_hash)\b|\btoken\s*[:=]|密钥|令牌|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\b[A-Za-z0-9_-]{32,}\b|\b(?:\d{1,3}\.){3}\d{1,3}\b|(?:^|\n)\s*at\s+|\b[A-Za-z]:\\|\/(?:Users|home|var|private|tmp|opt|etc)\//i;
 if(message&&message.length<=180&&/[\p{Script=Han}]/u.test(message)&&!privateDetails.test(message)&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(message))return message.replace(/\s+/g,' ');
 return '操作未完成，请稍后重试；仍有问题可在设置查看“遇到问题”。';
}
