import {describe,it,expect} from 'vitest';
import {fallbackAndroidDownload,parseAndroidDownload,initialAndroidDownload} from './android-download';

describe('public Android download choices',()=>{
 it('accepts only the corresponding release and owned Bluecloud file',()=>{
  expect(parseAndroidDownload({...fallbackAndroidDownload,lanzou:'https://kemou.lanzouv.com/iu1f04cezzef'})).toEqual({...fallbackAndroidDownload,lanzou:'https://kemou.lanzouv.com/iu1f04cezzef'});
 });
 it('rejects changed hosts, credentials, redirect queries and mismatched release assets',()=>{
  for(const lanzou of ['http://kemou.lanzouv.com/iaaa','https://kemou.lanzouv.com.evil.test/iaaa','https://user@kemou.lanzouv.com/iaaa','https://kemou.lanzouv.com/iaaa?url=https://evil.test','javascript:alert(1)'])expect(parseAndroidDownload({...fallbackAndroidDownload,lanzou})).toBeNull();
  expect(parseAndroidDownload({...fallbackAndroidDownload,version:'1.0.0'})).toBeNull();
  expect(parseAndroidDownload({...fallbackAndroidDownload,github:'https://github.com/else/repo/releases/latest'})).toBeNull();
 });
 it('keeps a direct GitHub fallback when no mirror is published yet',()=>{
  expect(parseAndroidDownload(fallbackAndroidDownload)).toEqual(fallbackAndroidDownload);
 });
 it('accepts only the exact HTTPS application-server APK for the same release',()=>{
  const aliyun=`https://123.57.30.129/downloads/android-v${fallbackAndroidDownload.version}/campus-inbox-${fallbackAndroidDownload.version}.apk`;
  expect(parseAndroidDownload({...fallbackAndroidDownload,aliyun})).toEqual({...fallbackAndroidDownload,aliyun});
  for(const value of [aliyun.replace('https:','http:'),aliyun.replace('123.57.30.129','123.57.30.129.evil.test'),aliyun.replace('https://','https://user@'),aliyun+'?redirect=https://evil.test',aliyun+'#hash',aliyun.replace('.apk','%2eapk'),aliyun.replace('/downloads/','/sync/'),'https://123.57.30.129/downloads/android-v1.0.0/campus-inbox-1.0.0.apk',true,42])expect(parseAndroidDownload({...fallbackAndroidDownload,aliyun:value})).toBeNull();
  expect(parseAndroidDownload({...fallbackAndroidDownload,aliyun:null})).toEqual(fallbackAndroidDownload);
 });
 it('keeps a visible public extraction code only with a validated mirror',()=>{
  const value={...fallbackAndroidDownload,lanzou:'https://kemou.lanzouv.com/i6sUw4cfl11a',extractionCode:'1234'};
  expect(parseAndroidDownload(value)).toEqual(value);
  for(const extractionCode of ['123','12345','<img>',' 1234'])expect(parseAndroidDownload({...value,extractionCode})).toBeNull();
  expect(parseAndroidDownload({...value,lanzou:null})).toBeNull();
 });
});

it('a web build uses the approved published APK instead of requiring an unreleased same-version APK',()=>{
 const approved={version:'2.27.1',github:'https://github.com/Kemou2333/campus-inbox/releases/download/android-v2.27.1/campus-inbox-2.27.1.apk',lanzou:null};
 expect(parseAndroidDownload(approved)).toEqual(approved);
 expect(parseAndroidDownload(fallbackAndroidDownload)).toEqual(fallbackAndroidDownload);
});


it('accepts the approved domain mirror only for the same exact release asset',()=>{
 const path=`/downloads/android-v${fallbackAndroidDownload.version}/campus-inbox-${fallbackAndroidDownload.version}.apk`;
 for(const origin of ['https://kemou.top:88','https://kemou.top:8443']){
  const primary=origin+path;expect(parseAndroidDownload({...fallbackAndroidDownload,primary})).toEqual({...fallbackAndroidDownload,primary});
 }
 for(const primary of ['http://kemou.top'+path,'https://kemou.top.evil.test'+path,'https://user@kemou.top'+path,'https://kemou.top:4433'+path,'https://kemou.top'+path+'?redirect=x','https://kemou.top'+path+'#x','https://kemou.top'+path.replace('downloads','sync')])expect(parseAndroidDownload({...fallbackAndroidDownload,primary})).toBeNull();
});

it('accepts canonical Note Inbox and legacy release URLs only for the exact APK',()=>{
 const version='2.28.2',filename=`campus-inbox-${version}.apk`;
 for(const repo of ['note-inbox','campus-inbox']){
  const value={version,github:`https://github.com/Kemou2333/${repo}/releases/download/android-v${version}/${filename}`,lanzou:null};
  expect(parseAndroidDownload(value)).toEqual(value);
 }
 const base=`https://github.com/Kemou2333/note-inbox/releases/download/android-v${version}/${filename}`;
 for(const github of [base+'?redirect=x',base.replace('/note-inbox/','/note-inbox-copy/'),base.replace('github.com','github.com.evil.test'),base.replace('https://','https://user@')])expect(parseAndroidDownload({version,github,lanzou:null})).toBeNull();
});


it('first paint shows the approved primary before the GitHub fallback',async()=>{
 const {renderToStaticMarkup}=await import('react-dom/server');const {createElement}=await import('react');const {AndroidDownloads}=await import('../shared/ui/AndroidDownloads');
 const html=renderToStaticMarkup(createElement(AndroidDownloads));
 expect(initialAndroidDownload.primary).toBe(`https://kemou.top:88/downloads/android-v${initialAndroidDownload.version}/campus-inbox-${initialAndroidDownload.version}.apk`);
 expect(html.indexOf('href=\"https://kemou.top:88/downloads/\"')).toBeGreaterThan(-1);
 expect(html.indexOf('href=\"https://kemou.top:88/downloads/\"')).toBeLessThan(html.indexOf('href=\"'+initialAndroidDownload.github+'\"'));
});
