/** Only new notice text is sent. Existing records, notes and attachments stay local. */
export const DEFAULT_AI_ENDPOINT = 'https://123.57.30.129/analyze';
export interface AnalysisSource { text: string }
export type AnalysisStage = 'requesting' | 'verifying';
export interface AnalyzeOptions {
  signal?: AbortSignal;
  onStage?: (stage: AnalysisStage) => void;
  endpoint?: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
  sessionKey?: string;
}

export class AnalysisError extends Error {
  constructor(message: string, public readonly code: string, public readonly status = 0,
    public readonly retryAfterSeconds = 0) {
    super(message);
    this.name = 'AnalysisError';
  }
}

interface Challenge { token: string; bits: number; expires: number }

/** This is a computational speed bump, not a claim that the visitor is human. */
export async function solveProof(value: unknown, signal?: AbortSignal): Promise<string> {
  const challenge = value as Challenge | null;
  if (!challenge || challenge.bits !== 16 || typeof challenge.token !== 'string'
    || challenge.token.length > 1400 || !Number.isSafeInteger(challenge.expires)
    || challenge.expires <= Date.now() || challenge.expires > Date.now() + 125_000 || !crypto.subtle) {
    throw new AnalysisError('暂时无法完成安全验证，请稍后再试。', 'PROOF_UNAVAILABLE');
  }
  const encoder = new TextEncoder();
  const deadline = Math.min(challenge.expires, Date.now() + 20_000);
  for (let start = 0; start < 10_000_000; start += 16) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (Date.now() > deadline) throw new AnalysisError('安全验证超时，请稍后再试。', 'PROOF_TIMEOUT');
    const batch = await Promise.all(Array.from({ length: 16 }, async (_, i) => {
      const nonce = start + i;
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(`${challenge.token}:${nonce}`)));
      return hash[0] === 0 && hash[1] === 0 ? nonce : null;
    }));
    const nonce = batch.find(value => value !== null);
    if (nonce !== undefined) return JSON.stringify({ token: challenge.token, nonce });
  }
  throw new AnalysisError('安全验证未完成，请稍后再试。', 'PROOF_TIMEOUT');
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (text.length > 200_000) throw new AnalysisError('整理结果过大，请分批整理。', 'RESPONSE_TOO_LARGE');
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new AnalysisError('整理服务返回异常，请稍后重试。', 'INVALID_RESPONSE', response.status);
  }
}

/** Returns untrusted wire data. Domain parseAnalysisBatch owns result validation. */
export async function analyzeSources(sources: AnalysisSource[], options: AnalyzeOptions = {}): Promise<unknown> {
  if (!sources.length || sources.length > 20 || sources.some(source => !source.text.trim())
    || sources.reduce((total, source) => total + source.text.length, 0) > 4000) {
    throw new AnalysisError('请填写 1–20 条通知，总字数不超过 4,000。', 'INVALID_INPUT');
  }
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 130_000);
  const fetcher = options.fetcher ?? fetch;
  // An explicit projection keeps UI or attachment fields out of the request.
  const body = JSON.stringify({ sources: sources.map(source => ({ text: source.text })) });
  const send = (proof?: string) => fetcher(options.endpoint ?? DEFAULT_AI_ENDPOINT, {
    method: 'POST', credentials: 'omit',
    headers: { 'Content-Type': 'application/json', ...(options.sessionKey ? { Authorization: `Bearer ${options.sessionKey}` } : {}),
      ...(proof ? { 'X-Campus-Proof': proof } : {}) },
    body, signal: controller.signal,
  });
  try {
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    options.onStage?.('requesting');
    let response = await send();
    let value = await responseBody(response);
    if (response.status === 428 && value.code === 'VERIFICATION_REQUIRED') {
      options.onStage?.('verifying');
      const proof = await solveProof(value.challenge, controller.signal);
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      options.onStage?.('requesting');
      // 428 occurs before a provider call. One handshake, no automatic paid retry.
      response = await send(proof);
      value = await responseBody(response);
    }
    if (!response.ok) {
      const seconds = Number(value.retryAfterSeconds ?? response.headers.get('Retry-After'));
      throw new AnalysisError(typeof value.error === 'string' ? value.error : '整理服务暂时不可用，请稍后重试。',
        typeof value.code === 'string' ? value.code : 'SERVICE_ERROR', response.status,
        Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 86_400) : 0);
    }
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return value;
  } catch (error) {
    if (controller.signal.aborted) throw new AnalysisError(timedOut ? '整理超时，请稍后重试。' : '已取消整理。', timedOut ? 'TIMEOUT' : 'CANCELLED');
    if (error instanceof TypeError) throw new AnalysisError('无法连接整理服务，请检查网络。', 'NETWORK_ERROR');
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', cancel);
  }
}
