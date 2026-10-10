import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeSources, AnalysisError } from './ai-client';

const json = (value: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(value), { status, headers });
const batch = { schemaVersion: 4, notices: [{ title: '真实返回，领域层再校验' }] };

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('AI transport', () => {
  const humanChallenge = () => ({ type: 'image', image: 'data:image/png;base64,iVBORw0KGgoAAA==',
    token: 'server-signed-context', expires: Date.now() + 120_000 });
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

  it('delegates an image challenge once and sends only its answer plus the same signed context and source body', async () => {
    const challenge = humanChallenge();
    const fetcher = vi.fn(async (_url: RequestInfo | URL, request?: RequestInit) => {
      const proof = (request?.headers as Record<string, string>)['X-Campus-Proof'];
      if (!proof) return json({ code: 'VERIFICATION_REQUIRED', challenge }, 428);
      expect(JSON.parse(proof)).toEqual({ token: challenge.token, answer: '0123' });
      return json(batch);
    });
    const onHumanVerification = vi.fn(async () => ' 0123 ');
    const stages: string[] = [];
    expect(await analyzeSources([{ text: '请提交申请' }], { fetcher, sessionKey: 'device-key',
      onHumanVerification, onStage: stage => stages.push(stage) })).toEqual(batch);
    expect(onHumanVerification).toHaveBeenCalledTimes(1);
    expect(onHumanVerification).toHaveBeenCalledWith(challenge, expect.any(AbortSignal));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][1]?.body).toBe(fetcher.mock.calls[1][1]?.body);
    expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({ Authorization: 'Bearer device-key' });
    expect(stages).toEqual(['requesting', 'verifying', 'requesting']);
  });

  it('does not fall back to PoW or submit a paid request when the host has no human verification callback', async () => {
    const fetcher = vi.fn(async () => json({ code: 'VERIFICATION_REQUIRED', challenge: humanChallenge() }, 428));
    await expect(analyzeSources([{ text: '通知' }], { fetcher })).rejects.toMatchObject({ code: 'HUMAN_VERIFICATION_REQUIRED', status: 428 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('cancels an outstanding verification dialog even if its host ignores the AbortSignal', async () => {
    const challenge = humanChallenge(), controller = new AbortController();
    const fetcher = vi.fn(async () => json({ code: 'VERIFICATION_REQUIRED', challenge }, 428));
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const onHumanVerification = vi.fn((_request, signal: AbortSignal) => { started();
      expect(signal.aborted).toBe(false); return new Promise<string>(() => {}); });
    const pending = analyzeSources([{ text: '通知' }], { fetcher, signal: controller.signal, onHumanVerification });
    const check = expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
    await ready; controller.abort(); await check;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(onHumanVerification.mock.calls[0][1].aborted).toBe(true);
  });

  it('rejects malformed image challenges before opening a dialog or contacting the server again', async () => {
    for (const replacement of [{ image: 'https://untrusted.test/image.png' }, { image: 'data:image/svg+xml,<svg />' }, { image: 'x'.repeat(16001) },
      { expires: Date.now() - 1 }, { expires: Date.now() + 600_000 }, { token: 'x'.repeat(1801) }]) {
      const fetcher = vi.fn(async () => json({ code: 'VERIFICATION_REQUIRED', challenge: { ...humanChallenge(), ...replacement } }, 428));
      const onHumanVerification = vi.fn(async () => '1234');
      await expect(analyzeSources([{ text: '通知' }], { fetcher, onHumanVerification })).rejects.toMatchObject({ code: 'INVALID_CHALLENGE' });
      expect(fetcher).toHaveBeenCalledTimes(1); expect(onHumanVerification).not.toHaveBeenCalled();
    }
  });

  it('rejects answers other than four digits and a response that outlives the signed challenge', async () => {
    for (const answer of ['', ' ', '123', '12345', '12a4']) {
      const fetcher = vi.fn(async () => json({ code: 'VERIFICATION_REQUIRED', challenge: humanChallenge() }, 428));
      await expect(analyzeSources([{ text: '通知' }], { fetcher, onHumanVerification: async () => answer }))
        .rejects.toMatchObject({ code: 'INVALID_HUMAN_ANSWER' });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
    vi.useFakeTimers();
    const challenge = humanChallenge(), fetcher = vi.fn(async () => json({ code: 'VERIFICATION_REQUIRED', challenge }, 428));
    await expect(analyzeSources([{ text: '通知' }], { fetcher, onHumanVerification: async () => {
      vi.setSystemTime(challenge.expires); return '1234';
    } })).rejects.toMatchObject({ code: 'VERIFICATION_EXPIRED' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not retry rejected human verification or a second challenge response', async () => {
    for (const status of [400, 503, 428]) {
      const challenge = humanChallenge(); let attempt = 0;
      const fetcher = vi.fn(async () => ++attempt === 1
        ? json({ code: 'VERIFICATION_REQUIRED', challenge }, 428)
        : json({ code: status === 428 ? 'VERIFICATION_REQUIRED' : 'INVALID_PROOF', challenge, error: '验证未完成' }, status));
      const onHumanVerification = vi.fn(async () => '1234');
      await expect(analyzeSources([{ text: '通知' }], { fetcher, onHumanVerification })).rejects.toMatchObject({ status });
      expect(fetcher).toHaveBeenCalledTimes(2); expect(onHumanVerification).toHaveBeenCalledTimes(1);
    }
  });

  it('lets a wrong image answer retry the same context without requesting a new challenge or making a second paid call', async () => {
    const challenge = humanChallenge(); let paid = 0,attempt = 0;
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const proof = (init?.headers as Record<string, string>)['X-Campus-Proof'];
      if (!proof) return json({ code: 'VERIFICATION_REQUIRED', challenge }, 428);
      const answer = JSON.parse(proof);
      expect(answer.token).toBe(challenge.token);
      if (++attempt === 1) return json({ code: 'CAPTCHA_INCORRECT', remainingAttempts: 4, error: '数字不正确，请再试一次。' }, 400);
      paid++; return json(batch);
    });
    const onHumanVerification = vi.fn(async () => attempt ? '0123' : '9999');
    expect(await analyzeSources([{ text: '通知' }], { fetcher, onHumanVerification })).toEqual(batch);
    expect(paid).toBe(1); expect(fetcher).toHaveBeenCalledTimes(3); expect(onHumanVerification).toHaveBeenCalledTimes(2);
    expect(onHumanVerification.mock.calls[1]).toEqual([{ ...challenge, error: '数字不正确，请再试一次。' }, expect.any(AbortSignal)]);
    expect(fetcher.mock.calls.map(call => call[1]?.body)).toEqual(Array(3).fill(JSON.stringify({ sources: [{ text: '通知' }] })));
  });

  it('allows at most five wrong-answer dialog attempts and never treats malformed remaining counts or server errors as retryable', async () => {
    let attempts = 0;
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (!(init?.headers as Record<string, string>)['X-Campus-Proof']) return json({ code: 'VERIFICATION_REQUIRED', challenge: humanChallenge() }, 428);
      return json({ code: 'CAPTCHA_INCORRECT', remainingAttempts: 5 - ++attempts, error: '数字不正确' }, 400);
    });
    const onHumanVerification = vi.fn(async () => '9999');
    await expect(analyzeSources([{ text: '通知' }], { fetcher, onHumanVerification })).rejects.toMatchObject({ code: 'CAPTCHA_INCORRECT', status: 400 });
    expect(onHumanVerification).toHaveBeenCalledTimes(5); expect(fetcher).toHaveBeenCalledTimes(6);
    for (const [remainingAttempts, status] of [[5,400],[100,400],['4',400],[4,502]]) {
      let count = 0;
      const failed = vi.fn(async () => ++count === 1
        ? json({ code: 'VERIFICATION_REQUIRED', challenge: humanChallenge() }, 428)
        : json({ code: 'CAPTCHA_INCORRECT', remainingAttempts }, status as number));
      const callback = vi.fn(async () => '9999');
      await expect(analyzeSources([{ text: '通知' }], { fetcher: failed, onHumanVerification: callback })).rejects.toMatchObject({ status });
      expect(callback).toHaveBeenCalledTimes(1);expect(failed).toHaveBeenCalledTimes(2);
    }
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

  it('gives generation its full response window after time spent filling the image verification', async () => {
    vi.useFakeTimers();
    const challenge = humanChallenge();
    const fetcher = vi.fn(async (_url: RequestInfo | URL, request?: RequestInit) => {
      if (!(request?.headers as Record<string, string>)['X-Campus-Proof']) {
        await new Promise(resolve => setTimeout(resolve, 25));
        return json({ code: 'VERIFICATION_REQUIRED', challenge }, 428);
      }
      return new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => resolve(json(batch)), 40);
        request?.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
      });
    });
    const onHumanVerification = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 80));
      return '0123';
    });
    const pending = analyzeSources([{ text: '长通知' }], { fetcher, timeoutMs: 50, onHumanVerification });
    const check = expect(pending).resolves.toEqual(batch);
    await vi.advanceTimersByTimeAsync(145);
    await check;
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(onHumanVerification).toHaveBeenCalledTimes(1);
  });

  it('expires an ignored verification dialog at its signed deadline rather than the generation timeout', async () => {
    vi.useFakeTimers();
    const challenge = { ...humanChallenge(), expires: Date.now() + 1000 };
    const fetcher = vi.fn(async () => json({ code: 'VERIFICATION_REQUIRED', challenge }, 428));
    const onHumanVerification = vi.fn((_request, _signal: AbortSignal) => new Promise<string>(() => {}));
    const pending = analyzeSources([{ text: '通知' }], { fetcher, timeoutMs: 50, onHumanVerification });
    const check = expect(pending).rejects.toMatchObject({ code: 'VERIFICATION_EXPIRED' });
    await vi.advanceTimersByTimeAsync(60);
    expect(onHumanVerification).toHaveBeenCalledTimes(1);
    expect(onHumanVerification.mock.calls[0][1].aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(940);
    await check;
    expect(onHumanVerification.mock.calls[0][1].aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
