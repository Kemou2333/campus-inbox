import { http } from '@kit.NetworkKit';
import { AuthChallenge, ImageProof, Job, JobList, JobReply, ServiceFailure, Session, validID, validateRecord } from '../model/Models';

export const API_ORIGIN = 'https://123.57.30.129';
// Shared declared native-client origin; account credentials still authorize every operation.
export const CLIENT_ORIGIN = 'https://appassets.androidplatform.net';
export interface WireResponse { status: number; body: string }
interface LoginBody { email: string; password: string; captcha: CaptchaBody }
interface CaptchaBody { id: string; answer: string }
interface SourceBody { text: string }
interface SubmissionBody { sources: SourceBody[]; requestId: string }

export class InboxApi {
  private clientId: string;
  constructor(clientId: string) { this.clientId = clientId; }
  private async request(path: string, method: http.RequestMethod, body: string = '', key: string = '', proof: string = ''): Promise<WireResponse> {
    if (!/^\/(?:auth\/(?:challenge|login|logout)|analysis-jobs(?:\/[A-Za-z0-9_-]{1,150})?)$/.test(path)) throw new Error('请求地址不正确。');
    if (key && !/^[A-Za-z0-9_-]{43}$/.test(key)) throw new Error('请重新登录。');
    const connection = http.createHttp();
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Origin': CLIENT_ORIGIN };
    if (key) headers['Authorization'] = `Bearer ${key}`;
    if (proof) headers['X-Campus-Proof'] = proof;
    try {
      const response = await connection.request(`${API_ORIGIN}${path}`, {
        method, header: headers, extraData: body, expectDataType: http.HttpDataType.STRING,
        connectTimeout: 10000, readTimeout: 15000, usingCache: false
      });
      if (typeof response.result !== 'string' || response.result.length > 2 * 1024 * 1024) throw new Error('返回内容暂时无法读取。');
      return { status: response.responseCode, body: response.result as string };
    } catch (error) {
      throw new Error('暂时连不上服务，请检查网络。已提交的整理会在云端继续。');
    } finally { connection.destroy(); }
  }
  private check(response: WireResponse): void {
    if (response.status >= 200 && response.status < 300) return;
    const failure = JSON.parse(response.body) as ServiceFailure;
    const message = typeof failure.error === 'string' && failure.error.length <= 500 ? failure.error : '服务暂时不可用，请稍后再试。';
    throw new Error(message);
  }
  async challenge(): Promise<AuthChallenge> {
    const response = await this.request('/auth/challenge', http.RequestMethod.POST, JSON.stringify({ purpose: 'login', clientId: this.clientId }));
    this.check(response);
    const result = JSON.parse(response.body) as AuthChallenge;
    if (!result || !/^[A-Za-z0-9_-]{24,100}$/.test(result.id) || !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$/.test(result.image) ||
      result.image.length > 16000 || !Number.isFinite(Date.parse(result.expiresAt))) throw new Error('验证码暂时无法读取。');
    return result;
  }
  async login(email: string, password: string, challenge: AuthChallenge, answer: string): Promise<Session> {
    if (!/^[^\s@]{1,64}@[^\s@]{1,189}$/.test(email.trim()) || password.length < 8 || password.length > 128) throw new Error('请检查邮箱和密码。');
    if (!/^\d{4}$/.test(answer) || Date.now() >= Date.parse(challenge.expiresAt)) throw new Error('请填写有效的 4 位图形验证码。');
    const body: LoginBody = { email: email.trim().toLowerCase(), password, captcha: { id: challenge.id, answer } };
    const response = await this.request('/auth/login', http.RequestMethod.POST, JSON.stringify(body));
    this.check(response);
    const session = JSON.parse(response.body) as Session;
    if (!session || !/^[A-Za-z0-9_-]{43}$/.test(session.key) || typeof session.username !== 'string' || !session.username.trim() || session.username.length > 24 ||
      !Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= Date.now()) throw new Error('登录结果暂时无法读取。');
    return session;
  }
  async logout(key: string): Promise<void> { this.check(await this.request('/auth/logout', http.RequestMethod.POST, '{}', key)); }
  async submit(text: string, requestId: string, key: string, proof?: ImageProof, answer: string = ''): Promise<WireResponse> {
    if (!text.trim() || text.length > 4000 || !validID(requestId)) throw new Error('请填入 1–4,000 字通知。');
    let verification = '';
    if (proof) {
      if (proof.type !== 'image' || proof.expires <= Date.now() || !/^\d{4}$/.test(answer)) throw new Error('请填写有效的 4 位图形验证码。');
      verification = JSON.stringify({ token: proof.token, answer });
    }
    const body: SubmissionBody = { sources: [{ text }], requestId };
    return this.request('/analysis-jobs', http.RequestMethod.POST, JSON.stringify(body), key, verification);
  }
  parseJob(response: WireResponse): Job {
    this.check(response);
    const job = (JSON.parse(response.body) as JobReply).job;
    if (!job || !validID(job.id) || !validID(job.requestId) || !['accepted', 'running', 'completed', 'failed'].includes(job.status) ||
      !Array.isArray(job.noticeIds) || job.noticeIds.length > 20 || !job.noticeIds.every(validID)) throw new Error('整理状态暂时无法读取。');
    if (job.records) job.records.forEach(validateRecord);
    return job;
  }
  async readJob(id: string, key: string): Promise<Job> {
    if (!validID(id)) throw new Error('整理任务编号不正确。');
    const result = this.parseJob(await this.request(`/analysis-jobs/${id}`, http.RequestMethod.GET, '', key));
    if (result.id !== id) throw new Error('整理状态暂时无法读取。');
    return result;
  }
  async listJobs(key: string): Promise<JobList> {
    const response = await this.request('/analysis-jobs', http.RequestMethod.GET, '', key);
    this.check(response);
    const page = JSON.parse(response.body) as JobList;
    if (!page || !Array.isArray(page.jobs) || page.jobs.length > 20 || typeof page.hasMore !== 'boolean') throw new Error('整理记录暂时无法读取。');
    page.jobs.forEach((job: Job) => { if (!validID(job.id)) throw new Error('整理记录暂时无法读取。'); });
    return page;
  }
}
