import { normalizeSyncEndpoint } from './sync-client';
import { canonicalEmail,canonicalLoginEmail } from '../../server/contracts/email-policy.mjs';

export interface AuthSession { key: string; username: string; expiresAt: string; email?: string | null }
export interface AuthStatus { username: string; expiresAt: string; email?: string | null }
export interface AuthOptions { emailEnabled: boolean; inviteEnabled: boolean; domains: string[]; imageCaptchaEnabled?:boolean }
export interface AuthCaptcha {id:string;answer:string}
export interface AuthImageChallenge {id:string;image:string;expiresAt:string;retryAfterSeconds:number}
export interface EmailChallenge { challengeId: string; retryAfterSeconds: number; expiresAt: string; codeLength: 4 | 6 }
export type EmailPurpose = 'login' | 'bind' | 'register' | 'password';
interface AuthErrorDetails { code?: string; retryAfterSeconds?: number; username?: string }
export class AuthError extends Error {
  code?: string;
  retryAfterSeconds?: number;
  username?: string;
  constructor(message: string, details: AuthErrorDetails = {}) {
    super(message); this.name = 'AuthError';
    this.code = details.code; this.retryAfterSeconds = details.retryAfterSeconds; this.username = details.username;
  }
}

type ApiObject = Record<string, unknown>;
const keyPattern = /^[A-Za-z0-9_-]{43}$/;
const validExpiry = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const validUsername = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && [...value].length <= 24;
const formatError = () => new AuthError('登录服务返回格式不正确。');
function emailValue(value: string,restrictDomain=true): string {
  try { return restrictDomain?canonicalEmail(value):canonicalLoginEmail(value); }
  catch (error) { throw new AuthError(error instanceof Error ? error.message : '请填写支持的邮箱地址。'); }
}
function optionalEmail(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'string') throw formatError();
  try { if (canonicalLoginEmail(value) === value) return value; } catch { /* Invalid server field. */ }
  throw formatError();
}

export class AuthClient {
  private endpoint: string;
  private fetcher: typeof fetch;
  private captchaClientID=crypto.randomUUID();
  constructor(endpoint: string, fetcher: typeof fetch = fetch) {
    this.endpoint = normalizeSyncEndpoint(endpoint).replace(/\/sync$/, '/auth');
    this.fetcher = fetcher.bind(globalThis);
  }
  private async request(path: string, body: unknown, key?: string): Promise<ApiObject | null> {
    if (key !== undefined && !keyPattern.test(key)) throw new AuthError('登录会话无效，请重新登录。', { code: 'AUTH_REQUIRED' });
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await this.fetcher(`${this.endpoint}/${path}`, {
        method: 'POST', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body),
      });
      if (path === 'status' && response.status === 401) return null;
      let result: unknown;
      try { result = await response.json(); }
      catch { throw response.ok ? formatError() : new AuthError('登录暂时不可用，请稍后再试。'); }
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw response.ok ? formatError() : new AuthError('登录暂时不可用，请稍后再试。');
      const value = result as ApiObject;
      if (!response.ok) {
        const details: AuthErrorDetails = {};
        if (typeof value.code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(value.code)) details.code = value.code;
        if (Number.isSafeInteger(value.retryAfterSeconds) && Number(value.retryAfterSeconds) > 0 && Number(value.retryAfterSeconds) <= 86400) details.retryAfterSeconds = Number(value.retryAfterSeconds);
        if (validUsername(value.username)) details.username = value.username;
        throw new AuthError(typeof value.error === 'string' && value.error.trim() && value.error.length <= 500 ? value.error : '登录暂时不可用，请稍后再试。', details);
      }
      return value;
    } catch (error) {
      if (error instanceof TypeError || error instanceof Error && error.name === 'AbortError') throw new AuthError('暂时无法连接登录服务，请检查网络后重试。');
      throw error;
    } finally { clearTimeout(timer); }
  }
  private session(result: unknown): AuthSession {
    const value = result as ApiObject | null;
    if (!value || typeof value.key !== 'string' || !keyPattern.test(value.key)) throw formatError();
    return { key: value.key, ...this.account(value) };
  }
  private account(result: unknown): AuthStatus {
    const value = result as ApiObject | null;
    if (!value || !validUsername(value.username) || !validExpiry(value.expiresAt)) throw formatError();
    const email = optionalEmail(value.email);
    return { username: value.username, expiresAt: value.expiresAt, ...(email !== undefined ? { email } : {}) };
  }
  private verification(challengeId: string, code: string): { challengeId: string; code: string } {
    if (!keyPattern.test(challengeId)) throw new AuthError('验证码已失效，请重新获取。', { code: 'EMAIL_CODE_INVALID' });
    const trimmed = code.trim();
    if (!/^(?:\d{4}|\d{6})$/.test(trimmed)) throw new AuthError('请完整填写邮件中的数字验证码。', { code: 'EMAIL_CODE_INVALID' });
    return { challengeId, code: trimmed };
  }
  async imageChallenge(purpose:'login'|'register'|'email'):Promise<AuthImageChallenge>{
    const value=await this.request('challenge',{purpose,clientId:this.captchaClientID});
    if(!value||typeof value.id!=='string'||!/^[A-Za-z0-9_-]{24,100}$/.test(value.id)||typeof value.image!=='string'||value.image.length>150000||!/^data:image\/(?:svg\+xml|png);base64,[A-Za-z0-9+/=]+$/.test(value.image)||!validExpiry(value.expiresAt)||!Number.isSafeInteger(value.retryAfterSeconds)||Number(value.retryAfterSeconds)<0||Number(value.retryAfterSeconds)>86400)throw formatError();
    return {id:value.id,image:value.image,expiresAt:value.expiresAt,retryAfterSeconds:Number(value.retryAfterSeconds)};
  }
  async register(invite: string, username: string, password: string,captcha?:AuthCaptcha): Promise<AuthSession> {
    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(invite.trim().toUpperCase())) throw new AuthError('请填写正确的 8 位邀请码。');
    return this.session(await this.request('register', { invite: invite.trim().toUpperCase(), username, password,...(captcha?{captcha}:{}) }));
  }
  async login(identifier: string, password: string,captcha?:AuthCaptcha): Promise<AuthSession> {
    let account:{email:string}|{username:string};
    try{account=identifier.includes('@')?{email:canonicalLoginEmail(identifier)}:{username:identifier};}catch(issue){throw new AuthError(issue instanceof Error?issue.message:'请填写正确的邮箱地址。');}
    return this.session(await this.request('login', { ...account, password,...(captcha?{captcha}:{}) }));
  }
  async status(key: string): Promise<AuthStatus | null> {
    const value = await this.request('status', {}, key);
    return value === null ? null : this.account(value);
  }
  async logout(key: string): Promise<void> { await this.request('logout', {}, key); }
  async options(): Promise<AuthOptions> {
    const value = await this.request('options', {});
    if (!value || typeof value.emailEnabled !== 'boolean' || typeof value.inviteEnabled !== 'boolean' || !Array.isArray(value.domains)
      || value.domains.length > 50 || !value.domains.every(domain => typeof domain === 'string' && domain.length <= 254 && /^[a-z0-9][a-z0-9.-]*\.[a-z0-9-]+$/.test(domain))) throw formatError();
    if(value.imageCaptchaEnabled!==undefined&&typeof value.imageCaptchaEnabled!=='boolean')throw formatError();
    return { emailEnabled: value.emailEnabled, inviteEnabled: value.inviteEnabled, domains: [...value.domains] as string[],...(value.imageCaptchaEnabled===undefined?{}:{imageCaptchaEnabled:value.imageCaptchaEnabled}) };
  }
  async requestEmail(email: string, purpose: EmailPurpose = 'login', key?: string,captcha?:AuthCaptcha): Promise<EmailChallenge> {
    if (!['login', 'bind', 'register', 'password'].includes(purpose)) throw new AuthError('请选择注册或绑定邮箱。');
    if (purpose === 'bind' && !key) throw new AuthError('请先登录原账号，再绑定邮箱。', { code: 'AUTH_REQUIRED' });
    const address=emailValue(email,['register','bind'].includes(purpose));
    const value = await this.request('email/request', { email: address, purpose, codeLength:4,...(captcha?{captcha}:{}) }, key);
    if (!value || typeof value.challengeId !== 'string' || !keyPattern.test(value.challengeId) || !validExpiry(value.expiresAt)
      || !Number.isSafeInteger(value.retryAfterSeconds) || Number(value.retryAfterSeconds) < 0 || Number(value.retryAfterSeconds) > 86400
      || value.codeLength !== undefined && value.codeLength !== 4 && value.codeLength !== 6) throw formatError();
    // Older backends send six digits without a length field during rolling updates.
    return { challengeId: value.challengeId, retryAfterSeconds: Number(value.retryAfterSeconds), expiresAt: value.expiresAt, codeLength: value.codeLength === 4 ? 4 : 6 };
  }
  async verifyEmail(challengeId: string, code: string): Promise<AuthSession> {
    return this.session(await this.request('email/verify', this.verification(challengeId, code)));
  }
  async registerEmail(challengeId: string, code: string, password: string): Promise<AuthSession> {
    this.password(password);
    return this.session(await this.request('email/verify', { ...this.verification(challengeId, code), password }));
  }
  async setEmailPassword(challengeId: string, code: string, password: string): Promise<AuthSession> {
    this.password(password);
    return this.session(await this.request('email/verify', { ...this.verification(challengeId, code), password }));
  }
  private password(value: string): void {
    if (typeof value !== 'string' || value.length < 8 || value.length > 128) throw new AuthError('密码需为 8–128 个字符。');
  }
  async bindEmail(challengeId: string, code: string, key: string): Promise<AuthStatus> {
    if (!key) throw new AuthError('请先登录原账号，再绑定邮箱。', { code: 'AUTH_REQUIRED' });
    return this.account(await this.request('email/verify', this.verification(challengeId, code), key));
  }
}
export function createAuthClient(endpoint: string, options: { fetch?: typeof fetch } = {}): AuthClient {
  return new AuthClient(endpoint, options.fetch ?? fetch);
}
