/** Shared by the browser and mail-login service; no Node-only dependencies. */
export const ALLOWED_EMAIL_DOMAINS = Object.freeze(['qq.com','163.com','126.com','gmail.com','stu.cqu.edu.cn','cqu.edu.cn','alu.cqu.edu.cn','139.com','189.cn','yeah.net']);
export function canonicalEmail(value){
  if(typeof value!=='string'||value.length>254)throw new Error('请填写支持的邮箱地址。');
  const email=value.trim().toLowerCase(),parts=email.split('@');
  if(parts.length!==2||!ALLOWED_EMAIL_DOMAINS.includes(parts[1]))throw new Error('此邮箱暂不支持，请使用页面列出的邮箱。');
  let [local,domain]=parts;
  if(domain==='qq.com'){
    if(!/^[1-9]\d{4,11}$/.test(local))throw new Error('QQ 邮箱请填写数字 QQ 号@qq.com。');
  }else if(domain==='gmail.com'){
    if(!/^[a-z0-9][a-z0-9.]*(?:\+[a-z0-9._-]+)?$/.test(local))throw new Error('Gmail 地址格式不正确。');
    local=local.split('+')[0].replace(/\./g,'');
    if(local.length>64)throw new Error('邮箱地址过长。');
  }else if(!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(local))throw new Error('邮箱用户名格式不正确；此邮箱不支持加号别名。');
  return `${local}@${domain}`;
}
