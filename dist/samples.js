/* Explicit demonstration fixtures; never used to infer arbitrary input. */
globalThis.CAMPUS_SAMPLES = [
{
 text:'各班班长请通知国庆期间离校的同学，于9月30日18:00前填写离校登记表，包括姓名、学号、离校时间、返校时间及紧急联系人，并由班长统一汇总后提交。离校计划发生变化的同学需及时重新登记。',
 legacyTasks:['离校同学填写离校登记表：姓名、学号、离校时间、返校时间、紧急联系人','班长统一汇总并提交登记信息','离校计划发生变化的同学及时重新登记'],
 result:{schemaVersion:3,title:'国庆离校登记',summary:'国庆期间离校的同学填写登记表，班长汇总后提交。',deadline:null,deadlineText:'9月30日 18:00 前',timeline:[{label:'填写登记表截止',time:null,timeText:'9月30日18:00前',location:null}],tasks:[
 {text:'填写离校登记表',assignee:'离校同学',details:['填写姓名、学号、离校时间、返校时间及紧急联系人'],time:null,timeText:'9月30日18:00前',location:null},
 {text:'汇总并提交登记信息',assignee:'班长',details:[],time:null,timeText:'',location:null}
 ],materials:['离校登记表'],warnings:['离校计划变化时，及时重新登记。']}
},
{
 text:'请参加新生学习交流会的同学于2026年10月8日18:00前完成报名表。交流会于2026年10月10日14:30在教学楼A101开始，请携带学生证。',
 legacyTasks:['参加交流会的同学完成报名表','携带学生证，在教学楼A101参加交流会'],
 result:{schemaVersion:3,title:'新生学习交流会',summary:'参加交流会的同学提前报名，并携带学生证参加。',deadline:'2026-10-08T18:00:00',deadlineText:'2026年10月8日18:00前',timeline:[{label:'报名截止',time:'2026-10-08T18:00:00',timeText:'2026年10月8日18:00前',location:null},{label:'交流会开始',time:'2026-10-10T14:30:00',timeText:'2026年10月10日14:30',location:'教学楼A101'}],tasks:[
 {text:'填写报名表',assignee:'参加交流会的同学',details:[],time:'2026-10-08T18:00:00',timeText:'2026年10月8日18:00前',location:null},
 {text:'携带学生证参加交流会',assignee:'参加交流会的同学',details:[],time:'2026-10-10T14:30:00',timeText:'2026年10月10日14:30',location:'教学楼A101'}
 ],materials:['报名表','学生证'],warnings:[]}
},
{
 text:'学校图书馆国庆期间正常开放，具体开放时间以图书馆当日公告为准。本通知仅作信息告知，同学无需提交材料或办理手续。',
 result:{schemaVersion:3,title:'图书馆国庆开放',summary:'国庆期间正常开放，具体时间以图书馆当日公告为准。',deadline:null,deadlineText:'',timeline:[],tasks:[],materials:[],warnings:[]}
}
];
