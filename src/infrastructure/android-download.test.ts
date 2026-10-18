import {describe,it,expect} from 'vitest';
import {fallbackAndroidDownload,parseAndroidDownload} from './android-download';

describe('public Android download choices',()=>{
 it('accepts only the corresponding release and owned Bluecloud file',()=>{
  expect(parseAndroidDownload({...fallbackAndroidDownload,lanzou:'https://kemou.lanzouv.com/iu1f04cezzef'})).toEqual({...fallbackAndroidDownload,lanzou:'https://kemou.lanzouv.com/iu1f04cezzef'});
 });
 it('rejects changed hosts, credentials, redirect queries, stale releases and mismatched assets',()=>{
  for(const lanzou of ['http://kemou.lanzouv.com/iaaa','https://kemou.lanzouv.com.evil.test/iaaa','https://user@kemou.lanzouv.com/iaaa','https://kemou.lanzouv.com/iaaa?url=https://evil.test','javascript:alert(1)'])expect(parseAndroidDownload({...fallbackAndroidDownload,lanzou})).toBeNull();
  expect(parseAndroidDownload({...fallbackAndroidDownload,version:'1.0.0'})).toBeNull();
  expect(parseAndroidDownload({...fallbackAndroidDownload,github:'https://github.com/else/repo/releases/latest'})).toBeNull();
 });
 it('keeps a direct GitHub fallback when no mirror is published yet',()=>{
  expect(parseAndroidDownload(fallbackAndroidDownload)).toEqual(fallbackAndroidDownload);
 });
});
