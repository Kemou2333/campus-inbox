import { expect, test, vi } from 'vitest';
import { AuthError, createAuthClient } from '../src/infrastructure/auth-client';

const key = 'A'.repeat(43), challengeId = 'B'.repeat(43), expiresAt = '2026-10-08T09:05:00.000Z';
const session = { key, username: '同学_0123456789abcdef', expiresAt, email: 'review@gmail.com' };
interface Call { url: string; init: RequestInit; body: Record<string, unknown>; authorization: string | null }
function clientWith(responder: (url: string, body: Record<string, unknown>) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const client = createAuthClient('https://example.test/analyze', { fetch: (async (input, init) => {
    const url = String(input), body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url, init: init!, body, authorization: new Headers(init?.headers).get('Authorization') });
    return responder(url, body);
  }) as typeof fetch });
  return { client, calls };
}

test('auth options and email request use the shared mailbox normalization without extra credentials', async () => {
  const { client, calls } = clientWith(url => Response.json(url.endsWith('/options')
    ? { emailEnabled: true, inviteEnabled: true, domains: ['qq.com', 'gmail.com'] }
    : { challengeId, retryAfterSeconds: 60, expiresAt }));
  expect(await client.options()).toEqual({ emailEnabled: true, inviteEnabled: true, domains: ['qq.com', 'gmail.com'] });
  expect(await client.requestEmail(' Re.View+school@gmail.com ')).toEqual({ challengeId, retryAfterSeconds: 60, expiresAt });
  expect(calls.map(call => ({ url: call.url, body: call.body, authorization: call.authorization }))).toEqual([
    { url: 'https://example.test/auth/options', body: {}, authorization: null },
    { url: 'https://example.test/auth/email/request', body: { email: 'review@gmail.com', purpose: 'login' }, authorization: null },
  ]);
  expect(calls.every(call => call.init.credentials === 'omit' && call.init.redirect === 'error' && call.init.referrerPolicy === 'no-referrer')).toBe(true);
});

test('email login and binding distinguish session replies from status and send the old session only in headers', async () => {
  const { client, calls } = clientWith(url => Response.json(url.endsWith('/request')
    ? { challengeId, retryAfterSeconds: 60, expiresAt }
    : session));
  expect(await client.verifyEmail(challengeId, ' 123456 ')).toEqual(session);
  await client.requestEmail('review@gmail.com', 'bind', key);
  expect(await client.bindEmail(challengeId, '654321', key)).toEqual({ username: session.username, expiresAt, email: session.email });
  expect(calls[0].body).toEqual({ challengeId, code: '123456' }); expect(calls[0].authorization).toBeNull();
  expect(calls[1].body).toEqual({ email: 'review@gmail.com', purpose: 'bind' });
  expect(calls[2].body).toEqual({ challengeId, code: '654321' });
  expect(calls.slice(1).every(call => call.authorization === `Bearer ${key}` && !Object.hasOwn(call.body, 'key'))).toBe(true);
});

test('registration and email failures preserve recovery codes and safe retry metadata', async () => {
  const { client } = clientWith(url => Response.json(url.endsWith('/register')
    ? { error: '账号已创建。请稍后登录。', code: 'ACCOUNT_CREATED_LOGIN_PENDING', username: 'old-user' }
    : { error: '验证码请求较多。', code: 'EMAIL_RATE_LIMIT', retryAfterSeconds: 60 }, { status: 429 }));
  const created = await client.register('ABCDEFGH', 'old-user', 'a simple password').catch(error => error);
  expect(created).toBeInstanceOf(AuthError); expect(created).toMatchObject({ code: 'ACCOUNT_CREATED_LOGIN_PENDING', username: 'old-user' });
  const rate = await client.requestEmail('review@163.com').catch(error => error);
  expect(rate).toBeInstanceOf(AuthError); expect(rate).toMatchObject({ code: 'EMAIL_RATE_LIMIT', retryAfterSeconds: 60 });
});

test('expired email codes preserve their API error and status 401 remains null even without JSON', async () => {
  const { client } = clientWith(url => url.endsWith('/status') ? new Response('gateway content', { status: 401 })
    : Response.json({ error: '验证码无效或已过期，请重新获取。', code: 'EMAIL_CODE_INVALID' }, { status: 400 }));
  expect(await client.status(key)).toBeNull();
  await expect(client.verifyEmail(challengeId, '123456')).rejects.toMatchObject({ code: 'EMAIL_CODE_INVALID' });
});

test('malformed mailbox, code, challenge and session are rejected before requesting', async () => {
  const { client, calls } = clientWith(() => Response.json(session));
  await expect(client.requestEmail('user@unsupported.test')).rejects.toBeInstanceOf(AuthError);
  await expect(client.verifyEmail('not-a-challenge', '123456')).rejects.toMatchObject({ code: 'EMAIL_CODE_INVALID' });
  await expect(client.verifyEmail(challengeId, '12345x')).rejects.toMatchObject({ code: 'EMAIL_CODE_INVALID' });
  await expect(client.requestEmail('review@163.com', 'bind')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  await expect(client.bindEmail(challengeId, '123456', 'unsafe\r\nAuthorization')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  await expect(client.status('wrong-session')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  await expect(client.logout('')).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  expect(calls).toHaveLength(0);
});

test('gateway text and malformed JSON replies use safe messages without exposing their body', async () => {
  for (const response of [new Response('<html>private server traceback</html>', { status: 503 }), Response.json(['private detail'], { status: 503 })]) {
    const { client } = clientWith(() => response);
    const error = await client.login('old-user', 'a simple password').catch(issue => issue);
    expect(error).toBeInstanceOf(AuthError); expect(error.message).toBe('登录暂时不可用，请稍后再试。');
    expect(error.message).not.toContain('private');
  }
  const malformed = clientWith(() => Response.json({ ...session, key: 'invalid' })).client;
  await expect(malformed.verifyEmail(challengeId, '123456')).rejects.toThrow('返回格式不正确');
  const unsafeOptions = clientWith(() => Response.json({ emailEnabled: true, inviteEnabled: true, domains: ['<script>'] })).client;
  await expect(unsafeOptions.options()).rejects.toThrow('返回格式不正确');
});

test('transport failures are readable and auth requests abort after fifteen seconds', async () => {
  const offline = createAuthClient('https://example.test', { fetch: (async () => { throw new TypeError('private transport detail'); }) as typeof fetch });
  await expect(offline.options()).rejects.toThrow('暂时无法连接登录服务');
  vi.useFakeTimers();
  try {
    let signal: AbortSignal | null | undefined;
    const client = createAuthClient('https://example.test', { fetch: ((_input, init) => {
      signal = init?.signal;
      return new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new DOMException('private abort detail', 'AbortError')), { once: true }));
    }) as typeof fetch });
    const pending = expect(client.options()).rejects.toThrow('暂时无法连接登录服务');
    await vi.advanceTimersByTimeAsync(14999); expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1); await pending; expect(signal?.aborted).toBe(true);
  } finally { vi.useRealTimers(); }
});

test('legacy status may omit email and nullable email is retained without leaking unknown response fields', async () => {
  const legacy = clientWith(() => Response.json({ username: 'old-user', expiresAt })).client;
  expect(await legacy.status(key)).toEqual({ username: 'old-user', expiresAt });
  const nullable = clientWith(() => Response.json({ ...session, email: null, unrelatedSecret: 'ignored' })).client;
  expect(await nullable.login('old-user', 'a simple password')).toEqual({ ...session, email: null });
});

test('verified email registration sends credentials only on redemption, then ordinary login needs no new email', async () => {
 const {client,calls}=clientWith(url=>Response.json(url.endsWith('/request')?{challengeId,retryAfterSeconds:60,expiresAt}:session));
 await client.requestEmail('review@gmail.com','register');
 expect(await client.registerEmail(challengeId,'123456','student-one','a simple password')).toEqual(session);
 await client.login('review@gmail.com','a simple password');
 expect(calls.map(call=>call.body)).toEqual([
  {email:'review@gmail.com',purpose:'register'},
  {challengeId,code:'123456',username:'student-one',password:'a simple password'},
  {username:'review@gmail.com',password:'a simple password'},
 ]);
 expect(calls[2].url).toBe('https://example.test/auth/login');expect(calls.every(call=>call.authorization===null)).toBe(true);
});

test('legacy email password setup redeems a code once and rejects short passwords locally',async()=>{
 const {client,calls}=clientWith(url=>Response.json(url.endsWith('/request')?{challengeId,retryAfterSeconds:60,expiresAt}:session));
 await expect(client.setEmailPassword(challengeId,'123456','short')).rejects.toThrow('8–128');expect(calls).toHaveLength(0);
 await client.requestEmail('review@gmail.com','password');
 expect(await client.setEmailPassword(challengeId,'123456','new secure password')).toEqual(session);
 expect(calls[1].body).toEqual({challengeId,code:'123456',password:'new secure password'});
});
