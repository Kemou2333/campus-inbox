import {createNotice} from '../../domain/notice';
export const demoOriginal='参加课程分享的同学，请在10月20日前把一份原创学习素材交给课程助教。视频、音频、文字任选一种。';
/** A synthetic in-memory exercise. No provider, repository or cloud job is used. */
export function createDemoNotice(){return createNotice({
 schemaVersion:4,kind:'task',title:'课程分享素材提交',summary:'准备一份原创学习素材，交给课程助教。',deadline:null,deadlineText:'10月20日前',timeline:[],
 tasks:[{text:'提交原创学习素材',assignee:'参加课程分享的同学',scope:'conditional',condition:'参加课程分享',details:['视频、音频、文字任选一种。'],steps:[{text:'准备原创素材',details:[]},{text:'交给课程助教',details:[]}],time:null,timeText:'10月20日前',location:null}],materials:[],warnings:[],reminders:[],sourceRefs:{'tasks.0.text':[1]}
},demoOriginal);}
