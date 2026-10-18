import {Alert,Button,Stack} from '@mui/material';
import type {CampusController} from '../../app/useCampus';
import {friendlyErrorMessage} from '../../shared/error-message';

/** Visible in every view: leaving the composer must not hide a cloud submission. */
export function AnalysisJobStatus({app,onRestore}:{app:CampusController;onRestore:()=>void}){
 const active=app.analysisJobs.filter(j=>j.status==='accepted'||j.status==='running');
 const failed=app.analysisJobs.find(j=>j.status==='failed');
 const unknown=app.unconfirmedSubmissions[0];
 const report=(issue:unknown)=>app.report(new Error(friendlyErrorMessage(issue)));
 if(!active.length&&!failed&&!unknown&&!app.jobStatusError)return null;
 return <Stack spacing={1} sx={{mb:2,flexShrink:0}}>
  {!!active.length&&<Alert severity="info" role="status">云端整理中{active.length>1?` · ${active.length} 批`:''}，结果会自动保存。<br/>复杂通知可能超过一分钟，可关闭页面稍后查看。</Alert>}
  {unknown&&<Alert severity="warning" action={<Button disabled={app.busy} sx={{whiteSpace:'nowrap'}} onClick={()=>void app.confirmAnalysisSubmission(unknown.requestId).catch(report)}>确认提交</Button>}>提交状态尚未确认，原文已保留。确认同一次提交不会重复整理。</Alert>}
  {failed&&<Alert severity="warning" action={<Button disabled={app.busy} sx={{whiteSpace:'nowrap'}} onClick={()=>failed.recoverableResult?void app.saveAnalysisJob(failed.id):void app.restoreAnalysisJob(failed.id).then(onRestore).catch(report)}>{failed.recoverableResult?'保存结果':'恢复原文'}</Button>}>{failed.recoverableResult?'整理结果已生成，尚未保存到云端。保存结果无需再次调用 AI。':`${failed.error?friendlyErrorMessage(failed.error):'这次整理未完成。'} 原文已保留，没有自动重试。`}</Alert>}
  {!!app.jobStatusError&&<Alert severity="info" action={<Button sx={{whiteSpace:'nowrap'}} onClick={()=>void app.refreshAnalysisJobs().catch(report)}>查看结果</Button>}>{friendlyErrorMessage(app.jobStatusError)}</Alert>}
 </Stack>;
}
