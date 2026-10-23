import {describe,it,expect} from 'vitest';
import {fallbackAndroidDownload,parseAndroidDownload} from './android-download';

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
