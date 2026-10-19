import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const created=vi.fn(),started=vi.fn(),peak=vi.fn();
class FakeContext{
 currentTime=1;state='running';destination={};
 constructor(){created();}
 createOscillator(){return {type:'',frequency:{value:0},connect:vi.fn(),disconnect:vi.fn(),start:started,stop:vi.fn(),onended:null};}
 createGain(){return {gain:{setValueAtTime:vi.fn(),linearRampToValueAtTime:peak,exponentialRampToValueAtTime:vi.fn()},connect:vi.fn(),disconnect:vi.fn()};}
}
let doc:EventTarget&{visibilityState:string};
beforeEach(()=>{
 vi.resetModules();vi.clearAllMocks();
 doc=Object.assign(new EventTarget(),{visibilityState:'visible'});
 const storage=new Map<string,string>();
 vi.stubGlobal('document',doc);vi.stubGlobal('window',{AudioContext:FakeContext});
 vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)});
});
afterEach(()=>vi.unstubAllGlobals());
describe('sparse operation sounds',()=>{
 it('waits for interaction, plays quietly, and suppresses repeated feedback',async()=>{
  const sound=await import('../src/shared/operation-sounds');
  expect(sound.playOperationSound('complete')).toBe(false);expect(created).not.toHaveBeenCalled();
  const dispose=sound.installOperationSounds();doc.dispatchEvent(new Event('pointerdown'));
  expect(sound.playOperationSound('complete')).toBe(true);expect(started).toHaveBeenCalledTimes(3);
  expect(peak.mock.calls.every(([gain])=>gain<=.045)).toBe(true);
  expect(sound.playOperationSound('remove')).toBe(false);expect(started).toHaveBeenCalledTimes(3);dispose();
 });
 it('persists mute and never initializes audio when disabled',async()=>{
  const sound=await import('../src/shared/operation-sounds');sound.setOperationSoundsEnabled(false);
  const dispose=sound.installOperationSounds();doc.dispatchEvent(new Event('pointerdown'));
  expect(sound.operationSoundsEnabled()).toBe(false);expect(created).not.toHaveBeenCalled();
  expect(sound.playOperationSound('organized')).toBe(false);dispose();
 });
 it('does not play in a hidden tab',async()=>{
  const sound=await import('../src/shared/operation-sounds');const dispose=sound.installOperationSounds();
  doc.dispatchEvent(new Event('pointerdown'));doc.visibilityState='hidden';
  expect(sound.playOperationSound('organized')).toBe(false);expect(started).not.toHaveBeenCalled();dispose();
 });
 it('keeps operations working when audio is unavailable',async()=>{
  vi.stubGlobal('window',{});const sound=await import('../src/shared/operation-sounds');
  const dispose=sound.installOperationSounds();expect(()=>doc.dispatchEvent(new Event('pointerdown'))).not.toThrow();
  expect(sound.playOperationSound('complete')).toBe(false);dispose();
 });
});
