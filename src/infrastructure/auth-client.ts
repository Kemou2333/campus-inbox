import { normalizeSyncEndpoint } from './sync-client';
export interface AuthSession { key: string; username: string; expiresAt: string }
export interface AuthStatus { username: string; expiresAt: string }

export class AuthClient {
  private endpoint: string;
  private fetcher: typeof fetch;
  constructor(endpoint: string, fetcher: typeof fetch = fetch) {
    this.endpoint = normalizeSyncEndpoint(endpoint).replace(/\/sync$/, '/auth');
    this.fetcher = fetcher.bind(globalThis);
  }
  private async request(path: string, body: unknown, key?: string): Promise<unknown | null> {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await this.fetcher(`${this.endpoint}/${path}`, {
        method: 'POST', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(body),
      });
      if (path === 'status' && response.status === 401) return null;
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || '登录暂时不可用，请稍后再试。');
      return result;
    } catch (error) {
      if (error instanceof TypeError || error instanceof Error && error.name === 'AbortError') throw new Error('暂时无法连接登录服务，请检查网络后重试。');
      throw error;
    } finally { clearTimeout(timer); }
  }
  private session(result: unknown): AuthSession {
    const value = result as AuthSession;
    if (!value || typeof value.key !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.key) || typeof value.username !== 'string' || typeof value.expiresAt !== 'string') throw new Error('登录服务返回格式不正确。');
    return value;
  }
  async register(invite: string, username: string, password: string): Promise<AuthSession> {
    if (!/^[A-HJ-NP-Z2-9]{8}$/.test(invite.trim().toUpperCase())) throw new Error('请填写正确的 8 位邀请码。');
    return this.session(await this.request('register', { invite: invite.trim().toUpperCase(), username, password }));
  }
  async login(username: string, password: string): Promise<AuthSession> {
    return this.session(await this.request('login', { username, password }));
  }
  async status(key: string): Promise<AuthStatus | null> { return await this.request('status', {}, key) as AuthStatus | null; }
  async logout(key: string): Promise<void> { await this.request('logout', {}, key); }
}
export function createAuthClient(endpoint: string, options: { fetch?: typeof fetch } = {}): AuthClient {
  return new AuthClient(endpoint, options.fetch ?? fetch);
}
