import type {Notice, Task} from './types';
import {isWeekOneMonday} from './teaching-calendar';

export const CAMPUS_PREFERENCES_KEY = 'campus-inbox:campus-preferences:v1';
export const CAMPUS_ROLES = [
  {value: 'undergraduate', label: '本科生'},
  {value: 'postgraduate', label: '研究生'},
  {value: 'class-representative', label: '班干部'},
  {value: 'retaking', label: '重修生'},
] as const;
export type CampusRole = typeof CAMPUS_ROLES[number]['value'];
export interface CampusProfile {entryYear: number | null; major: string; roles: CampusRole[]}
export interface CampusPreferences {profile: CampusProfile; weekOneMonday: string}
export type ProfileMatch = 'matched' | 'unmatched' | 'unknown';
export const EMPTY_CAMPUS_PREFERENCES: CampusPreferences = {profile: {entryYear: null, major: '', roles: []}, weekOneMonday: ''};

/** This data stays on this device and is never part of a model request or notice record. */
export function parseCampusPreferences(value: unknown): CampusPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('个人设置格式不正确');
  const o = value as Record<string, unknown>;
  if (!o.profile || typeof o.profile !== 'object' || Array.isArray(o.profile)) throw new Error('个人条件格式不正确');
  const p = o.profile as Record<string, unknown>, entryYear = p.entryYear ?? null;
  if (entryYear !== null && (!Number.isInteger(entryYear) || Number(entryYear) < 2000 || Number(entryYear) > 2100)) throw new Error('请选择入学年份');
  if (typeof p.major !== 'string') throw new Error('请填写专业名称');
  const major = p.major.normalize('NFKC').trim();
  if (Array.from(major).length > 24 || !/^[\p{Script=Han}A-Za-z0-9 ·()（）-]*$/u.test(major)) throw new Error('专业限24字，请只填写名称');
  if (!Array.isArray(p.roles) || p.roles.length > CAMPUS_ROLES.length || p.roles.some(v => !CAMPUS_ROLES.some(r => r.value === v))) throw new Error('请选择列表中的身份');
  const roles = [...new Set(p.roles)] as CampusRole[];
  if (roles.includes('undergraduate') && roles.includes('postgraduate')) throw new Error('本科生和研究生请选择其一');
  if (typeof o.weekOneMonday !== 'string' || o.weekOneMonday !== '' && !isWeekOneMonday(o.weekOneMonday)) throw new Error('学期第一周须选择周一');
  return {profile: {entryYear: entryYear as number | null, major, roles}, weekOneMonday: o.weekOneMonday};
}

export function readCampusPreferences(storage: Pick<Storage, 'getItem'>): CampusPreferences {
  try {
    const value = storage.getItem(CAMPUS_PREFERENCES_KEY);
    return value ? parseCampusPreferences(JSON.parse(value)) : structuredClone(EMPTY_CAMPUS_PREFERENCES);
  } catch { return structuredClone(EMPTY_CAMPUS_PREFERENCES); }
}
export function hasProfile(profile: CampusProfile): boolean {return profile.entryYear !== null || !!profile.major || profile.roles.length > 0;}

function requirementMatch(text: string, profile: CampusProfile): ProfileMatch {
  // Preferences are optional hints, not evidence about poverty, political affiliation,
  // scores or other unprovided facts. Soft preferences never exclude anyone.
  const hard = text.split(/[。；;\n]/).filter(s => !/优先|特别欢迎|鼓励|不限|亦可|也可|均可/.test(s)).join('；');
  if (!hard.trim()) return 'unknown';
  if (/(?:非|除|不面向|不含|不包括|之外|以外|排除)|免(?:做|交|修)|无需|不必|(?:或者|或|任一|满足其一)/.test(hard)) return 'unknown';
  if (/20\d{2}\s*级?\s*(?:至|到|[-—–~～])\s*20\d{2}|级\s*(?:及|或)?(?:以[上下前后]|之[前后]|至|到|[-—–~～])/.test(hard)) return 'unknown';
  const undergrad = /本科生|本科同学|本科学生/.test(hard), postgraduate = /研究生|硕士生|博士生/.test(hard);
  if (undergrad && postgraduate && /20\d{2}\s*级/.test(hard)) return 'unknown';
  let matched = false, unknown = false;
  const years = [...hard.matchAll(/(?<!\d)(20\d{2})\s*级/g)].map(m => Number(m[1]));
  if (years.length) {
    if (/级(?:及|或)?(?:以上|以下)|级至|级到|级[-—~～]/.test(hard)) unknown = true;
    else if (profile.entryYear === null) unknown = true;
    else if (!years.includes(profile.entryYear)) return 'unmatched';
    else matched = true;
  }
  if (undergrad !== postgraduate) {
    const required = undergrad ? 'undergraduate' : 'postgraduate', opposite = undergrad ? 'postgraduate' : 'undergraduate';
    if (profile.roles.includes(opposite)) return 'unmatched';
    if (profile.roles.includes(required)) matched = true; else unknown = true;
  } else if (undergrad && postgraduate) {
    if (profile.roles.includes('undergraduate') || profile.roles.includes('postgraduate')) matched = true; else unknown = true;
  }
  if (/班干部|团支书|班长|各班负责人/.test(hard)) {
    if (profile.roles.includes('class-representative')) matched = true; else unknown = true;
  }
  if (/重修(?:班|生|学生)/.test(hard) && !/免(?:做|交|修)|无需|不必/.test(hard)) {
    if (profile.roles.includes('retaking')) matched = true; else unknown = true;
  }
  if (/普通班/.test(hard) && /(?:仅|只|限|面向|对象)/.test(hard)) {
    if (profile.roles.includes('retaking')) return 'unmatched'; else unknown = true;
  }
  // Only explicit 专业 requirements are compared. A course or notice title
  // containing e.g. 计算机 is not a restriction to that major.
  const majorMatch = hard.match(/(?:仅(?:限)?|只(?:限)?|限(?:于)?|面向|对象(?:为|是)?|专业为|^)\s*([\p{Script=Han}A-Za-z0-9·()（） -]{2,24}?)专业(?:的)?(?:同学|学生|本科生|研究生|[，,；;。]|$)/u);
  if (majorMatch && !/其他|所有|各|不限|全校|相关|理工|等|或|及/.test(majorMatch[1])) {
    const required = majorMatch[1].replace(/^为/, '').replace(/^20\d{2}\s*级\s*/, '').trim(), own = profile.major.replace(/专业$/, '').trim();
    if (!own) unknown = true;
    else if (own !== required) {
      const base = (value: string) => value.replace(/[（(][^）)]*[）)]/g, '').trim();
      if (base(own) === base(required) || own.includes(required) || required.includes(own) || /[（()）]/.test(required + own) || Array.from(required).length < 4 || Array.from(own).length < 4) unknown = true;
      else return 'unmatched';
    }
    else matched = true;
  } else if (/专业/.test(hard)) unknown = true;
  if (/困难|助学|入党|党员|团员|绩点|学分|成绩|雅思|PTE|感兴趣|有意愿|报名|已提交|已申请|名额|资格/.test(hard)) unknown = true;
  if (!matched && /^(?:全体(?:同学|学生)|所有(?:同学|学生)|全校(?:同学|学生))[。！!\s]*$/.test(hard.trim())) matched = true;
  return unknown || !matched ? 'unknown' : 'matched';
}

function taskMatch(task: Task, profile: CampusProfile): ProfileMatch {
  const audience = [task.assignee, task.condition].filter(Boolean).join('；');
  if (audience) return requirementMatch(audience, profile);
  return task.scope === 'all' ? 'matched' : 'unknown';
}

/** A notice is excluded only when every explicit task audience clearly differs.
 * Unknown requirements always remain visible. No model request is needed. */
export function matchNoticeProfile(notice: Notice, profile: CampusProfile): ProfileMatch {
  if (!hasProfile(profile)) return 'unknown';
  if (notice.audienceOverride === 'all') return 'matched';
  if (notice.tasks.length) {
    const matches = notice.tasks.map(task => taskMatch(task, profile));
    if (matches.includes('matched')) return 'matched';
    return matches.every(value => value === 'unmatched') ? 'unmatched' : 'unknown';
  }
  const clauses = notice.originalText.split(/[。；;\n]/).filter(s => /(?:仅限|只限|面向|适用对象|通知对象)/.test(s));
  return clauses.length === 1 ? requirementMatch(clauses[0], profile) : 'unknown';
}
