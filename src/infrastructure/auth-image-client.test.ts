import {describe,it,expect} from 'vitest';
import {AuthClient} from './auth-client';
describe('login image verification transport',()=>{
 it('accepts a bounded server image and sends the explicit answer only with the selected operation',async()=>{
  const sent:{url:string;body:any}[]=[];const id='a'.repeat(32),image='data:image/png;base64,AA==',key='b'.repeat(43);
  const fetcher=(async(url,options)=>{sent.push({url:String(url),body:JSON.parse(String(options?.body))});return Response.json(String(url).endsWith('/challenge')?{id,image,expiresAt:'2030-01-01T00:00:00Z',retryAfterSeconds:6}:{key,username:'sample_user',expiresAt:'2030-01-01T00:00:00Z'});}) as typeof fetch;
  const client=new AuthClient('https://api.example.test/analyze',fetcher);const challenge=await client.imageChallenge('login');
  expect(challenge.id).toBe(id);expect(sent[0].body.purpose).toBe('login');expect(sent[0].body.clientId).toMatch(/^[a-f0-9-]+$/);
  await client.login('sample_user','example-password',{id,answer:'1234'});expect(sent[1].body.captcha).toEqual({id,answer:'1234'});
  expect(sent[0].body).not.toHaveProperty('password');
 });
 it('rejects script-bearing image URLs and exposes server cooldown without inventing a challenge',async()=>{
  const bad=new AuthClient('https://api.example.test/analyze',(async()=>Response.json({id:'a'.repeat(32),image:'javascript:alert(1)',expiresAt:'2030-01-01T00:00:00Z',retryAfterSeconds:6})) as typeof fetch);
  await expect(bad.imageChallenge('register')).rejects.toThrow('格式');
  const limited=new AuthClient('https://api.example.test/analyze',(async()=>Response.json({error:'请稍后换图',code:'AUTH_CAPTCHA_RATE_LIMIT',retryAfterSeconds:6},{status:429})) as typeof fetch);
  await expect(limited.imageChallenge('login')).rejects.toMatchObject({code:'AUTH_CAPTCHA_RATE_LIMIT',retryAfterSeconds:6});
 });
});
