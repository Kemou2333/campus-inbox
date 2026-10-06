import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeSources, AnalysisError } from './ai-client';

const json = (value: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(value), { status, headers });
const batch = { schemaVersion: 4, notices: [{ title: '真实返回，领域层再校验' }] };

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('AI transport', () => {
  it('sends only new source text and returns the untouched wire result', async () => {
    const fetcher = vi.fn(async () => json(batch));
    const sources = [{ text: '请提交申请', attachments: ['private-file'], note: 'private-note' }];
    const result = await analyzeSources(sources, { fetcher, endpoint: 'https://example.test/analyze' });
    expect(result).toEqual(batch);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://example.test/analyze');
    expect(JSON.parse(request.body as string)).toEqual({ sources: [{ text: '请提交申请' }] });
    expect(request.credentials).toBe('omit');
  });

  it('handles one proof handshake without an additional paid generation', async () => {
    const encoded: string[] = [];
    vi.stubGlobal('crypto', { subtle: { digest: vi.fn(async (_algorithm: string, value: BufferSource) => {
      const text = new TextDecoder().decode(value);
      encoded.push(text);
      const hash = new Uint8Array(32);
      if (!text.endsWith(':3')) hash[0] = 1;
      return hash.buffer;
    }) } });
    const challenge = { token: 'signed-challenge', bits: 16, expires: Date.now() + 60_000 };
    let providerCalls = 0;
    const fetcher = vi.fn(async (_url: RequestInfo | URL, request?: RequestInit) => {
      const proof = (request?.headers as Record<string, string>)['X-Campus-Proof'];
      if (!proof) return json({ code: 'VERIFICATION_REQUIRED', challenge }, 428);
      expect(JSON.parse(proof)).toEqual({ token: challenge.token, nonce: 3 });
      providerCalls++;
      return json(batch);
    });
    const stages: string[] = [];
    expect(await analyzeSources([{ text: '请登记' }], { fetcher, onStage: stage => stages.push(stage) })).toEqual(batch);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(providerCalls).toBe(1);
    expect(stages).toEqual(['requesting', 'verifying', 'requesting']);
    expect(encoded).toContain('signed-challenge:3');
    expect(fetcher.mock.calls[0][1]?.body).toBe(fetcher.mock.calls[1][1]?.body);
  });

  it('does not loop when proof verification is rejected', async () => {
    vi.stubGlobal('crypto', { subtle: { digest: async () => new Uint8Array(32).buffer } });
    const fetcher = vi.fn(async () => json({ code: 'VERIFICATION_REQUIRED',
      challenge: { token: 'signed', bits: 16, expires: Date.now() + 60_000 } }, 428));
    await expect(analyzeSources([{ text: '请登记' }], { fetcher })).rejects.toMatchObject({ status: 428 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('exposes a rate-limit wait without automatically retrying', async () => {
    const fetcher = vi.fn(async () => json({ error: '请稍后再试', code: 'IP_RATE_LIMIT', retryAfterSeconds: 121 }, 429));
    await expect(analyzeSources([{ text: '请登记' }], { fetcher })).rejects.toMatchObject({
      status: 429, code: 'IP_RATE_LIMIT', retryAfterSeconds: 121,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('passes only the current device session key in Authorization and never retries 401', async () => {
    const fetcher = vi.fn(async () => json({ error: '请先登录', code: 'AUTH_REQUIRED' }, 401));
    await expect(analyzeSources([{ text: '请登记' }], { fetcher, sessionKey: 'test-device-session' })).rejects.toMatchObject({
      status: 401, code: 'AUTH_REQUIRED',
    });
    const request = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(request[1].headers).toMatchObject({ Authorization: 'Bearer test-device-session' });
    expect(request[1].body).not.toContain('test-device-session');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not retry server failures or malformed responses', async () => {
    const unavailable = vi.fn(async () => json({ error: '服务繁忙' }, 503));
    await expect(analyzeSources([{ text: '请登记' }], { fetcher: unavailable })).rejects.toMatchObject({ status: 503 });
    expect(unavailable).toHaveBeenCalledTimes(1);
    const malformed = vi.fn(async () => new Response('not JSON', { status: 200 }));
    await expect(analyzeSources([{ text: '请登记' }], { fetcher: malformed })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(malformed).toHaveBeenCalledTimes(1);
  });

  it('rejects excessive text before contacting the server', async () => {
    const fetcher = vi.fn();
    await expect(analyzeSources([{ text: '字'.repeat(4001) }], { fetcher })).rejects.toBeInstanceOf(AnalysisError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('cancels without sending when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn();
    await expect(analyzeSources([{ text: '请登记' }], { fetcher, signal: controller.signal })).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('distinguishes a timeout from a manual cancellation', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((_url: RequestInfo | URL, request?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      request?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    const pending = analyzeSources([{ text: '请登记' }], { fetcher, timeoutMs: 50 });
    const check = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(51);
    await check;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
