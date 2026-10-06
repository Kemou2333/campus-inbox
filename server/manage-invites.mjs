import {mkdir,open} from 'node:fs/promises';
import {dirname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAuthService} from './auth.mjs';

// Issue codes only from a private terminal command; never print them to logs.
process.umask(0o077);
const args=process.argv.slice(2),get=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const count=Number(get('--count')||10),output=get('--output'),state=get('--state')||process.env.AUTH_STATE_FILE||'/var/lib/campus-inbox/auth.sqlite';
if(!Number.isSafeInteger(count)||count<1||count>30||!output)throw new Error('用法：node server/manage-invites.mjs --count 1-30 --output 私有文件路径 [--state auth.sqlite]');
const target=resolve(output),project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(target===project||target.startsWith(project+sep))throw new Error('邀请码必须保存到项目目录外的私有文件。');
await mkdir(dirname(target),{recursive:true,mode:0o700});
const file=await open(target,'wx',0o600);
let auth;
try{
  auth=await createAuthService({stateFile:state,signingSecret:process.env.CAMPUS_ACCESS_TOKEN,allowedOrigins:[]});
  const codes=auth.issueInvites(count);await file.writeFile(codes.join('\n')+'\n');
  process.stdout.write(`已生成 ${count} 个邀请码并写入私有文件。\n`);
}finally{auth?.close();await file.close();}
