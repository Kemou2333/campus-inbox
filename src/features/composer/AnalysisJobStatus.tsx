import {Alert,Button,Stack} from '@mui/material';
import type {CampusController} from '../../app/useCampus';

/** Visible in every view: leaving the composer must not hide a cloud submission. */
export function AnalysisJobStatus({app,onRestore}:{app:CampusController;onRestore:()=>void}){
 const active=app.analysisJobs.filter(j=>j.status==='accepted'||j.status==='running');
 const failed=app.analysisJobs.find(j=>j.status==='failed');
 const unknown=app.unconfirmedSubmissions[0];
 if(!active.length&&!failed&&!unknown&&!app.jobStatusError)return null;
 return <Stack spacing={1} sx={{mb:2,flexShrink:0}}>
  {!!active.length&&<Alert severity="info" role="status">云端正在整理{active.length>1?` ${active.length} 批通知`:''}，可能需要数秒到一分钟，复杂通知可能更久。可关闭页面或应用，稍后回来查看；结果会自动保存。</Alert>}
  {unknown&&<Alert severity="warning" action={<Button disabled={app.busy} sx={{whiteSpace:'nowrap'}} onClick={()=>void app.confirmAnalysisSubmission(unknown.requestId).catch(app.report)}>确认提交</Button>}>提交状态尚未确认，原文已保留。确认同一次提交不会重复整理。</Alert>}
  {failed&&<Alert severity="warning" action={<Button disabled={app.busy} sx={{whiteSpace:'nowrap'}} onClick={()=>failed.recoverableResult?void app.saveAnalysisJob(failed.id):void app.restoreAnalysisJob(failed.id).then(onRestore).catch(app.report)}>{failed.recoverableResult?'保存结果':'恢复原文'}</Button>}>{failed.recoverableResult?'整理结果已生成，尚未保存到云端。保存结果无需再次调用 AI。':`${failed.error||'这次整理未完成。'} 原文已保留，没有自动重试。`}</Alert>}
  {!!app.jobStatusError&&<Alert severity="info" action={<Button sx={{whiteSpace:'nowrap'}} onClick={()=>void app.refreshAnalysisJobs()}>查看结果</Button>}>{app.jobStatusError}</Alert>}
 </Stack>;
}
