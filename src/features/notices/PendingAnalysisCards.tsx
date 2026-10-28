import {Box,Divider,Paper,Skeleton,Stack,useMediaQuery} from '@mui/material';
import CachedOutlined from '@mui/icons-material/CachedOutlined';
import type {AnalysisJob} from '../../infrastructure/analysis-jobs';

/** Keep the same visual slot until completed cloud records have reached this device. */
export function pendingAnalysisJobs(jobs:AnalysisJob[],notices:{id:string}[]):AnalysisJob[]{
 const localIDs=new Set(notices.map(notice=>notice.id));
 return jobs.filter(job=>job.status==='accepted'||job.status==='running'||job.status==='completed'&&job.noticeIds.some(id=>!localIDs.has(id)));
}

export function PendingAnalysisCards({jobs}:{jobs:AnalysisJob[]}){
 const reduced=useMediaQuery('(prefers-reduced-motion: reduce)');
 if(!jobs.length)return null;
 return <Stack role="status" aria-label="通知整理中" aria-live="polite" aria-busy="true" spacing={1.5} sx={{mb:1.5,'@media (prefers-reduced-motion: reduce)':{'& .MuiSkeleton-root,& .pending-card-refresh':{animation:'none'}}}}>
  {jobs.map(job=><Paper key={job.id} data-pending-job-id={job.id} aria-hidden="true" variant="outlined" sx={{p:{xs:2,sm:2.5},borderRadius:3,overflow:'hidden',bgcolor:'background.paper'}}>
   <Stack direction="row" sx={{alignItems:'center',gap:2,borderLeft:'4px solid',borderColor:'primary.main',pl:1.5}}>
    <Skeleton animation={reduced?false:'wave'} variant="rounded" width="66%" height={30} sx={{maxWidth:360,borderRadius:1}}/>
    <Box className="pending-card-refresh" sx={{ml:'auto',color:'text.disabled',display:'flex',animation:reduced?'none':'pending-card-refresh 2.8s cubic-bezier(.45,0,.3,1) infinite','@keyframes pending-card-refresh':{'0%':{transform:'rotate(0deg)'},'68%,100%':{transform:'rotate(360deg)'}}}}><CachedOutlined sx={{fontSize:22}}/></Box>
   </Stack>
   <Stack spacing={1} sx={{mt:2.5}}><Skeleton animation={reduced?false:'wave'} variant="rounded" width="88%" height={13}/><Skeleton animation={reduced?false:'wave'} variant="rounded" width="57%" height={13}/></Stack>
   <Divider sx={{mt:2.5,mb:1.5}}/>
   <Stack direction="row" sx={{alignItems:'center',justifyContent:'space-between'}}><Skeleton animation={reduced?false:'wave'} variant="rounded" width={32} height={32} sx={{borderRadius:2}}/><Skeleton animation={reduced?false:'wave'} variant="circular" width={42} height={42}/></Stack>
  </Paper>)}
 </Stack>;
}
