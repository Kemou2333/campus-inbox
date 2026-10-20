/** Shared by browser and mail service. A supported provider is not proof of a real person. */
export const ALLOWED_EMAIL_DOMAINS = Object.freeze(['qq.com','foxmail.com','163.com','126.com','yeah.net','139.com','189.cn','sina.com','sina.cn','sohu.com','gmail.com','cqu.edu.cn','stu.cqu.edu.cn','alu.cqu.edu.cn']);
const unsupported='此邮箱暂不支持，请选择列表中的邮箱。';
/** Reading a verified identity must not lock out accounts created under an older policy. */
export function canonicalLoginEmail(value){
  if(typeof value!=='string'||value.length>254)throw new Error('请填写正确的邮箱地址。');
  const email=value.trim().toLowerCase(),parts=email.split('@');
  if(parts.length!==2)throw new Error('请填写正确的邮箱地址。');
  let [local,domain]=parts;
  if(!/^[a-z0-9][a-z0-9.!#$%&'*+/=?^_`{|}~-]{0,63}$/.test(local)||local.endsWith('.')||local.includes('..')||domain.length>253||!domain.includes('.')||!domain.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))throw new Error('请填写正确的邮箱地址。');
  if(domain==='gmail.com'){
    if(!/^[a-z0-9][a-z0-9.]*(?:\+[a-z0-9._-]+)?$/.test(local))throw new Error('Gmail 地址格式不正确。');
    local=local.split('+')[0].replace(/\./g,'');
  }
  return `${local}@${domain}`;
}
/** New registration and new binding only: exact domains, no arbitrary campus/custom domains. */
export function canonicalEmail(value){
  const email=canonicalLoginEmail(value),[local,domain]=email.split('@');
  if(!ALLOWED_EMAIL_DOMAINS.includes(domain))throw new Error(unsupported);
  if(domain!=='gmail.com'&&!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(local))throw new Error('邮箱地址格式不正确；此邮箱不支持加号别名。');
  return email;
}
