import {describe,expect,it} from 'vitest';
import type {CampusController} from '../../app/useCampus';
import {problemSummary} from './ProblemHelpDialog';

describe('local problem summary',()=>{
 it('copies only safe finite status fields and never account or record contents',()=>{
  const app={platform:{kind:'android'},username:'private-person',email:'private@example.test',sync:{connected:true,status:'offline',pendingChanges:3,error:'private-session-secret',conflicts:[{local:'private-original'}]},analysisJobs:[{status:'running',id:'private-id',sources:[{text:'private-notice'}]}],unconfirmedSubmissions:[],jobStatusError:'private-backend-address'} as unknown as CampusController;
  const summary=problemSummary(app,false);expect(summary).toContain('平台：安卓应用');expect(summary).toContain('网络：设备离线');expect(summary).toContain('有改动待上传');expect(summary).toContain('云端处理中');expect(summary).not.toMatch(/private|@|http/);
 });
 it('reports uncertainty without claiming a successful sync or starting any request',()=>{
  const app={platform:{kind:'browser'},sync:{connected:false,status:'disconnected',pendingChanges:0},analysisJobs:[],unconfirmedSubmissions:[{requestId:'hidden-request-id'}],jobStatusError:''} as unknown as CampusController;
  expect(problemSummary(app,undefined)).toContain('有提交待确认');expect(problemSummary(app,undefined)).not.toMatch(/hidden-request-id|已同步|已保存到云端/);
 });
});
