import { expect, test } from 'vitest';
import { createAuthClient } from './auth-client';

test('registration uses the invite and credentials while storing no second token', async () => {
  const calls: { url: string; body: Record<string, unknown>; authorization: string | null }[] = [], key = 'A'.repeat(43);
  const client = createAuthClient('https://example.test/analyze', { fetch: (async (url, init) => {
    const body = JSON.parse(String(init?.body)); calls.push({ url: String(url), body, authorization: new Headers(init?.headers).get('Authorization') });
    return Response.json({ key, username: 'test_同学', expiresAt: '2026-11-06T00:00:00Z' });
  }) as typeof fetch });
  const result = await client.register('abcdefgh', 'ＴＥＳＴ_同学', 'a simple password');
  expect(calls[0]).toEqual({ url: 'https://example.test/auth/register', body: { invite: 'ABCDEFGH', username: 'ＴＥＳＴ_同学', password: 'a simple password' }, authorization: null }); expect(result.key).toBe(key); expect(result.username).toBe('test_同学');
});
test('login preserves the password and status/logout send the session only in the header', async () => {
  const calls: { url: string; init: RequestInit }[] = [], client = createAuthClient('https://example.test', { fetch: (async (url, init) => { calls.push({ url: String(url), init: init! }); return Response.json({ key: 'A'.repeat(43), username: 'kemou', expiresAt: '2026-11-06T00:00:00Z' }); }) as typeof fetch });
  await client.login('kemou', ' spaced password '); await client.status('A'.repeat(43)); await client.logout('A'.repeat(43));
  expect(JSON.parse(String(calls[0].init.body))).toEqual({ username: 'kemou', password: ' spaced password ' }); expect(calls[0].url).toBe('https://example.test/auth/login');
  expect(calls.slice(1).every(c => new Headers(c.init.headers).get('Authorization') === `Bearer ${'A'.repeat(43)}` && c.init.body === '{}' && c.init.credentials === 'omit')).toBe(true);
});
test('expired status returns null and invalid invitations do not request', async () => {
  let calls = 0; const client = createAuthClient('https://example.test', { fetch: (async url => { calls++; return Response.json({ error: '用户名或密码不正确。' }, { status: String(url).endsWith('/status') ? 401 : 400 }); }) as typeof fetch });
  expect(await client.status('A'.repeat(43))).toBeNull(); await expect(client.login('kemou', 'wrong password')).rejects.toThrow('用户名或密码'); await expect(client.register('short', 'kemou', 'password')).rejects.toThrow('8 位'); expect(calls).toBe(2);
});
