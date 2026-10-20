import { common } from '@kit.AbilityKit';
import { util } from '@kit.ArkTS';
import { image } from '@kit.ImageKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { NoticeCard } from '../components/NoticeCard';
import { InboxStore } from '../services/InboxStore';
import { InboxApi } from '../services/InboxApi';
import { AuthChallenge, DemoFixture, ImageProof, Job, NoticeRow, PendingSubmission, SavedState, ServerNotice, ServerTask,
  ServiceFailure, Session, emptyState, validateRecord } from '../model/Models';

@Entry
@Component
struct Index {
  @State private page: number = 0;
  @State private rows: NoticeRow[] = [];
  @State private deletedRows: NoticeRow[] = [];
  @State private draft: string = '';
  @State private message: string = '';
  @State private busy: boolean = false;
  @State private loaded: boolean = false;
  @State private signedIn: boolean = false;
  @State private accountEmail: string = '';
  @State private email: string = '';
  @State private password: string = '';
  @State private captchaAnswer: string = '';
  @State private captchaImage: image.PixelMap | undefined = undefined;
  @State private proofImage: image.PixelMap | undefined = undefined;
  @State private proofAnswer: string = '';
  @State private jobPending: boolean = false;
  @State private filter: number = 0;
  @StorageLink('nativeForeground') @Watch('onForegroundChanged') private foreground: boolean = true;
  private store: InboxStore | undefined = undefined;
  private api: InboxApi = new InboxApi(util.generateRandomUUID());
  private session: Session | undefined = undefined;
  private challenge: AuthChallenge | undefined = undefined;
  private proof: ImageProof | undefined = undefined;
  private pending: PendingSubmission | null = null;
  private fixtures: DemoFixture[] = [];
  private demoIndex: number = 0;
  private selectedDemo: number = -1;
  private pollTimer: number = -1;
  private demoTimer: number = -1;
  private refreshing: boolean = false;
  private captchaAfter: number = 0;
  private stateBroken: boolean = false;

  aboutToAppear(): void { this.initialize(); }
  aboutToDisappear(): void {
    this.stopPolling();
    if (this.demoTimer >= 0) clearTimeout(this.demoTimer);
    this.captchaImage?.release(); this.proofImage?.release();
  }
  private async initialize(): Promise<void> {
    try {
      const context = getContext(this) as common.UIAbilityContext;
      this.store = new InboxStore(context);
      const bytes = await context.resourceManager.getRawFileContent('demo-notices.json');
      this.fixtures = JSON.parse(new util.TextDecoder().decodeWithStream(bytes)) as DemoFixture[];
      this.fixtures.forEach((fixture: DemoFixture) => validateRecord(fixture.notice));
      this.loadScope('');
    } catch (error) { this.stateBroken = true; this.message = this.errorText(error as BusinessError); }
    finally { this.loaded = true; }
  }
  private errorText(error: BusinessError): string {
    return typeof error.message === 'string' && error.message.length < 600 ? error.message : '这一步暂时没成功，请稍后再试。';
  }
  private loadScope(account: string): void {
    const state = this.store?.load(account) || emptyState();
    this.applyState(state);
  }
  private applyState(state: SavedState): void {
    this.rows = state.rows; this.deletedRows = state.deletedRows; this.draft = state.draft; this.pending = state.pending;
    this.demoIndex = state.demoIndex; this.selectedDemo = state.selectedDemo;
    this.jobPending = state.pending !== null; this.proof = undefined;
    this.proofImage?.release(); this.proofImage = undefined;
    this.stateBroken = false;
  }
  private save(): boolean {
    if (!this.store || this.stateBroken) return false;
    const state: SavedState = { version: 1, rows: this.rows, deletedRows: this.deletedRows, pending: this.pending, draft: this.draft,
      demoIndex: this.demoIndex, selectedDemo: this.selectedDemo };
    try { this.store.save(this.session?.username || '', state); return true; }
    catch (error) { this.message = this.errorText(error as BusinessError); return false; }
  }
  private stopPolling(): void { if (this.pollTimer >= 0) clearTimeout(this.pollTimer); this.pollTimer = -1; }
  private onForegroundChanged(): void {
    this.stopPolling();
    if (this.foreground && this.session) this.recover();
  }
  private schedulePoll(): void {
    this.stopPolling();
    if (this.foreground && this.session && this.jobPending) {
      this.pollTimer = setTimeout(() => { this.recover(); }, 4000);
    }
  }
  private async decodeCaptcha(source: string): Promise<image.PixelMap> {
    if (!/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$/.test(source) || source.length > 16000) throw new Error('验证码图片暂时无法读取。');
    const bytes = new util.Base64Helper().decodeSync(source.slice('data:image/png;base64,'.length));
    const decoder = image.createImageSource(bytes.buffer as ArrayBuffer);
    try { return await decoder.createPixelMap(); } finally { decoder.release(); }
  }
  private async refreshCaptcha(): Promise<void> {
    if (this.busy) return;
    if (Date.now() < this.captchaAfter) { this.message = '验证码刚刚刷新，请稍等一下。'; return; }
    this.busy = true;
    try {
      const challenge = await this.api.challenge();
      const pixels = await this.decodeCaptcha(challenge.image);
      this.captchaImage?.release(); this.captchaImage = pixels; this.challenge = challenge;
      this.captchaAfter = Date.now() + Math.max(1, challenge.retryAfterSeconds) * 1000;
      this.captchaAnswer = ''; this.message = '';
    } catch (error) { this.message = this.errorText(error as BusinessError); }
    finally { this.busy = false; }
  }
  private async login(): Promise<void> {
    if (this.busy || !this.challenge) { this.message = '请先获取图形验证码。'; return; }
    this.busy = true;
    try {
      const next = await this.api.login(this.email, this.password, this.challenge, this.captchaAnswer);
      // Read the target account before changing the session; a broken file cannot overwrite another account.
      const state = this.store?.load(next.username);
      if (!state) throw new Error('本机存储还没准备好。');
      this.session = next; this.applyState(state);
      this.accountEmail = next.email || this.email.trim(); this.signedIn = true;
      this.password = ''; this.captchaAnswer = ''; this.challenge = undefined;
      this.captchaImage?.release(); this.captchaImage = undefined;
      this.message = '已登录'; this.page = 1;
    } catch (error) { this.message = this.errorText(error as BusinessError); }
    finally { this.busy = false; }
    if (this.session) this.recover();
  }
  private async logout(): Promise<void> {
    if (!this.session || this.busy) return;
    this.busy = true; this.stopPolling();
    try {
      const guest = this.store?.load('');
      if (!guest) throw new Error('本机存储还没准备好。');
      await this.api.logout(this.session.key);
      this.session = undefined; this.signedIn = false; this.accountEmail = ''; this.proof = undefined;
      this.applyState(guest); this.message = '已退出，本机通知保留。';
    } catch (error) { this.message = this.errorText(error as BusinessError); }
    finally { this.busy = false; }
  }
  private fillExample(): void {
    if (this.busy || this.pending || !this.fixtures.length) return;
    this.selectedDemo = this.demoIndex % this.fixtures.length;
    this.draft = this.fixtures[this.selectedDemo].notice.originalText;
    this.demoIndex = (this.selectedDemo + 1) % this.fixtures.length;
    this.message = ''; this.save();
  }
  private async submit(): Promise<void> {
    if (this.busy || !this.loaded || this.stateBroken || !this.draft.trim()) return;
    if (this.pending?.jobId) { this.recover(); this.page = 1; return; }
    if (this.selectedDemo >= 0 && this.fixtures[this.selectedDemo]?.notice.originalText === this.draft && !this.pending) {
      this.busy = true; this.message = '正在整理…';
      this.demoTimer = setTimeout(() => {
        const record = JSON.parse(JSON.stringify(this.fixtures[this.selectedDemo].notice)) as ServerNotice;
        record.id = `local-demo-${util.generateRandomUUID()}`;
        record.createdAt = new Date().toISOString(); record.updatedAt = record.createdAt;
        this.addRecord(record); this.draft = ''; this.selectedDemo = -1;
        this.busy = false; this.message = '整理好了'; this.save(); this.page = 1; this.demoTimer = -1;
      }, 3000);
      return;
    }
    if (!this.session) { this.message = '整理自己的通知，请先登录。也可以先填入示例试试。'; this.page = 2; return; }
    this.busy = true;
    try {
      if (this.proof && this.proof.expires <= Date.now()) {
        this.proof = undefined; this.proofImage?.release(); this.proofImage = undefined; this.proofAnswer = '';
      }
      if (!this.pending) {
        this.pending = { requestId: util.generateRandomUUID(), text: this.draft, jobId: '', createdAt: new Date().toISOString() };
        if (!this.save()) { this.pending = null; return; }
      }
      const response = await this.api.submit(this.pending.text, this.pending.requestId, this.session.key, this.proof, this.proofAnswer);
      if (response.status === 428) {
        const failure = JSON.parse(response.body) as ServiceFailure;
        const proof = failure.challenge;
        if (!proof || proof.type !== 'image' || typeof proof.token !== 'string' || proof.token.length > 1800 ||
          !Number.isSafeInteger(proof.expires) || proof.expires <= Date.now() || proof.expires > Date.now() + 125000) {
          throw new Error('请稍后通过网页完成这次安全验证；原文已保留。');
        }
        const pixels = await this.decodeCaptcha(proof.image);
        this.proof = proof; this.proofImage?.release(); this.proofImage = pixels; this.proofAnswer = '';
        this.message = '请输入图片中的数字，再点整理。'; return;
      }
      if (response.status >= 400 && response.status < 500) {
        const failure = JSON.parse(response.body) as ServiceFailure;
        if (failure.code !== 'CAPTCHA_INCORRECT') { this.pending = null; this.jobPending = false; this.save(); }
      }
      const job = this.api.parseJob(response);
      if (!this.pending) throw new Error('提交记录暂时无法读取。');
      this.pending.jobId = job.id; this.jobPending = true;
      this.proof = undefined; this.proofImage?.release(); this.proofImage = undefined; this.proofAnswer = '';
      this.save(); this.message = '已交给云端整理，可以稍后回来查看。'; this.page = 1;
      this.schedulePoll();
    } catch (error) { this.message = this.errorText(error as BusinessError); }
    finally { this.busy = false; }
  }
  private addRecord(record: ServerNotice): void {
    if ([...this.rows, ...this.deletedRows].some((row: NoticeRow) => row.record.id === record.id)) return;
    this.rows = [{ record, expanded: false, openTasks: [], sourceOpen: false }, ...this.rows];
  }
  private async recover(): Promise<void> {
    if (!this.session || this.refreshing || !this.foreground) return;
    this.refreshing = true;
    const account = this.session.username, key = this.session.key;
    try {
      const page = await this.api.listJobs(key);
      // Read snapshots only. No sync mutation, auto-resubmission, or paid retry occurs here.
      const jobs = page.jobs.filter((job: Job) => ![...this.rows, ...this.deletedRows].some((row: NoticeRow) => job.noticeIds.includes(row.record.id)) && job.status === 'completed');
      for (let index = 0; index < Math.min(5, jobs.length); index++) {
        const detail = await this.api.readJob(jobs[index].id, key);
        if (this.session?.username !== account) return;
        detail.records?.forEach((record: ServerNotice) => this.addRecord(record));
      }
      if (this.pending) {
        const matching = this.pending.jobId ? await this.api.readJob(this.pending.jobId, key)
          : page.jobs.find((job: Job) => job.requestId === this.pending?.requestId);
        if (this.session?.username !== account) return;
        if (matching?.status === 'completed') {
          const detail = matching.records ? matching : await this.api.readJob(matching.id, key);
          if (this.session?.username !== account) return;
          detail.records?.forEach((record: ServerNotice) => this.addRecord(record));
          if (this.draft === this.pending.text) this.draft = '';
          this.pending = null; this.jobPending = false; this.message = '整理好了';
        } else if (matching?.status === 'failed') {
          this.pending = null; this.jobPending = false; this.message = matching.error || '这次整理没成功，原文已保留。';
        } else if (matching) { this.pending.jobId = matching.id; this.jobPending = true; }
      }
      this.save();
    } catch (error) { this.message = this.errorText(error as BusinessError); }
    finally { this.refreshing = false; this.schedulePoll(); }
  }
  private act(id: string, action: string, target: string): void {
    if (action === 'remove') {
      AlertDialog.show({ title: '删除这条通知？', message: '可以在设置里恢复。',
        primaryButton: { value: '取消', action: () => {} },
        secondaryButton: { value: '删除', action: () => this.removeRow(id) } });
      return;
    }
    const next = JSON.parse(JSON.stringify(this.rows)) as NoticeRow[];
    const row = next.find((item: NoticeRow) => item.record.id === id);
    if (!row) return;
    if (action === 'expand') row.expanded = !row.expanded;
    if (action === 'source') row.sourceOpen = !row.sourceOpen;
    if (action === 'expandTask') row.openTasks = row.openTasks.includes(target) ? row.openTasks.filter((value: string) => value !== target) : [...row.openTasks, target];
    if (action === 'task') {
      const task = row.record.tasks.find((item: ServerTask) => item.id === target);
      if (task) task.completed = !task.completed;
      row.record.completed = row.record.tasks.length > 0 && row.record.tasks.every((item: ServerTask) => item.completed);
    }
    if (action === 'complete') {
      row.record.completed = !row.record.completed;
      row.record.tasks.forEach((task: ServerTask) => { task.completed = row.record.completed; });
    }
    row.record.updatedAt = new Date().toISOString();
    animateTo({ duration: 480, curve: Curve.EaseInOut }, () => { this.rows = next; });
    this.save();
  }
  private shownRows(): NoticeRow[] {
    return this.rows.filter((row: NoticeRow) => this.filter === 0 ? !row.record.completed : row.record.completed);
  }
  private removeRow(id: string): void {
    const row = this.rows.find((item: NoticeRow) => item.record.id === id);
    if (!row) return;
    const before = this.rows, deleted = this.deletedRows;
    this.deletedRows = [row, ...this.deletedRows]; this.rows = this.rows.filter((item: NoticeRow) => item.record.id !== id);
    if (!this.save()) { this.rows = before; this.deletedRows = deleted; return; }
    this.message = '已删除，可在设置中恢复。';
  }
  private restoreLast(): void {
    if (!this.deletedRows.length) return;
    const before = this.rows, deleted = this.deletedRows;
    this.rows = [this.deletedRows[0], ...this.rows]; this.deletedRows = this.deletedRows.slice(1);
    if (!this.save()) { this.rows = before; this.deletedRows = deleted; return; }
    this.message = '已恢复';
  }

  @Builder
  heading(title: string, caption: string) {
    Column({ space: 7 }) {
      Text(title).fontSize(30).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).width('100%')
      if (caption) { Text(caption).fontSize(16).lineHeight(24).fontColor($r('app.color.text_secondary')).width('100%') }
    }.alignItems(HorizontalAlign.Start).width('100%')
  }
  @Builder
  composer() {
    Scroll() {
      Column({ space: 18 }) {
        this.heading('添加', '把群通知粘贴到这里。')
        Button('填入示例', { type: ButtonType.Normal }).borderRadius(14).width('100%').height(48)
          .backgroundColor($r('app.color.accent_surface')).fontColor($r('app.color.accent')).fontSize(17)
          .enabled(!this.busy && !this.pending && this.loaded).onClick(() => this.fillExample())
        TextArea({ text: this.draft, placeholder: '粘贴通知…' }).height(260).fontSize(17).maxLength(4000)
          .backgroundColor($r('app.color.card_background')).fontColor($r('app.color.text_primary')).borderRadius(18)
          .enabled(!this.busy && !this.pending && this.loaded && !this.stateBroken)
          .onChange((value: string) => { this.draft = value; this.selectedDemo = -1; this.save(); })
        Text(`${this.draft.length}/4000`).fontSize(13).fontColor($r('app.color.text_secondary')).width('100%').textAlign(TextAlign.End)
        if (this.proofImage) {
          Image(this.proofImage).height(88).width(240).objectFit(ImageFit.Contain)
          TextInput({ text: this.proofAnswer, placeholder: '图片中的 4 位数字' }).type(InputType.Number).maxLength(4)
            .onChange((value: string) => { this.proofAnswer = value; })
        }
        Button(this.busy ? '正在整理…' : this.jobPending ? '查看进度' : '整理').height(54).fontSize(19).fontWeight(FontWeight.Bold)
          .width('100%').backgroundColor($r('app.color.accent')).fontColor(Color.White)
          .enabled(!this.busy && this.loaded && !this.stateBroken && this.draft.trim().length > 0)
          .onClick(() => this.submit())
      }.padding(20).width('100%').alignItems(HorizontalAlign.Start)
    }.layoutWeight(1).width('100%')
  }
  @Builder
  feed() {
    Scroll() {
      Column({ space: 16 }) {
        this.heading('通知', '')
        Row({ space: 10 }) {
          Button('待办').fontSize(16).backgroundColor(this.filter === 0 ? $r('app.color.accent') : $r('app.color.card_background'))
            .fontColor(this.filter === 0 ? Color.White : $r('app.color.text_secondary')).onClick(() => { this.filter = 0; })
          Button('已处理').fontSize(16).backgroundColor(this.filter === 1 ? $r('app.color.accent') : $r('app.color.card_background'))
            .fontColor(this.filter === 1 ? Color.White : $r('app.color.text_secondary')).onClick(() => { this.filter = 1; })
          Blank()
          if (this.signedIn) { Button('刷新').fontSize(15).fontColor($r('app.color.accent')).backgroundColor(Color.Transparent).onClick(() => this.recover()) }
        }.width('100%')
        if (this.jobPending) { Text('云端正在整理，稍后会出现在这里。').fontSize(16).fontColor($r('app.color.accent')).width('100%') }
        if (!this.shownRows().length) {
          Text('暂时没有通知').fontSize(20).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_secondary')).padding(30)
          Button('添加').backgroundColor($r('app.color.accent')).fontColor(Color.White).onClick(() => { this.page = 0; })
        }
        ForEach(this.shownRows(), (row: NoticeRow) => {
          NoticeCard({ row, onAction: (id: string, action: string, target: string) => this.act(id, action, target) })
        }, (row: NoticeRow) => `${row.record.id}-${row.record.updatedAt}-${row.expanded}-${row.openTasks.join(',')}-${row.sourceOpen}`)
      }.padding(20).width('100%').alignItems(HorizontalAlign.Start)
    }.layoutWeight(1).width('100%')
  }
  @Builder
  settings() {
    Scroll() {
      Column({ space: 20 }) {
        this.heading('设置', '')
        Text('账号').fontSize(24).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).width('100%')
        if (this.signedIn) {
          Text(this.accountEmail).fontSize(18).fontColor($r('app.color.text_primary')).width('100%')
          Button('退出登录').backgroundColor($r('app.color.detail_background')).fontColor($r('app.color.text_secondary')).onClick(() => this.logout())
        } else {
          TextInput({ text: this.email, placeholder: '邮箱' }).type(InputType.Email).maxLength(254).height(52).fontSize(18)
            .onChange((value: string) => { this.email = value; })
          TextInput({ text: this.password, placeholder: '密码' }).type(InputType.Password).maxLength(128).height(52).fontSize(18)
            .onChange((value: string) => { this.password = value; })
          if (this.captchaImage) {
            Image(this.captchaImage).width(240).height(88).objectFit(ImageFit.Contain)
            TextInput({ text: this.captchaAnswer, placeholder: '图片中的 4 位数字' }).type(InputType.Number).maxLength(4)
              .onChange((value: string) => { this.captchaAnswer = value; })
          }
          Row({ space: 12 }) {
            Button(this.captchaImage ? '换一张' : '获取验证码').backgroundColor($r('app.color.accent_surface')).fontColor($r('app.color.accent'))
              .enabled(!this.busy).onClick(() => this.refreshCaptcha())
            Button('登录').backgroundColor($r('app.color.accent')).fontColor(Color.White).enabled(!this.busy && !!this.challenge)
              .onClick(() => this.login())
          }
          Text('使用网页里已有的邮箱账号。还没注册的话，可以先体验示例。').fontSize(15).lineHeight(23).fontColor($r('app.color.text_secondary')).width('100%')
        }
        Divider().color($r('app.color.outline'))
        if (this.deletedRows.length) {
          Text('回收站').fontSize(24).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).width('100%')
          Button(`恢复最近删除 · ${this.deletedRows.length}`).fontSize(17).backgroundColor($r('app.color.accent_surface'))
            .fontColor($r('app.color.accent')).onClick(() => this.restoreLast())
        }
        Text('关于').fontSize(24).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).width('100%')
        Text('校园 Inbox · 鸿蒙原生开发预览').fontSize(18).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary')).width('100%')
        Text('通知和进度保存在本机。登录后可查看最近的云端整理结果；本版的进度暂不跨端同步。').fontSize(15).lineHeight(24)
          .fontColor($r('app.color.text_secondary')).width('100%')
      }.padding(20).width('100%').alignItems(HorizontalAlign.Start)
    }.layoutWeight(1).width('100%')
  }
  build() {
    Column() {
      Row({ space: 9 }) {
        Image($r('app.media.app_icon')).width(32).height(32)
        Text('校园 Inbox').fontSize(22).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
      }.width('100%').padding({ left: 20, right: 20, top: 14, bottom: 14 })
      if (this.message) {
        Text(this.message).fontSize(15).lineHeight(23).fontColor($r('app.color.accent')).width('100%')
          .padding({ left: 20, right: 20, top: 10, bottom: 10 }).backgroundColor($r('app.color.accent_surface'))
      }
      if (this.page === 0) { this.composer() }
      if (this.page === 1) { this.feed() }
      if (this.page === 2) { this.settings() }
      Row() {
        ForEach(['添加', '通知', '设置'], (label: string, index: number) => {
          Button(label, { type: ButtonType.Normal }).layoutWeight(1).height(54).fontSize(17)
            .fontWeight(this.page === index ? FontWeight.Bold : FontWeight.Regular)
            .fontColor(this.page === index ? $r('app.color.accent') : $r('app.color.text_secondary'))
            .backgroundColor(this.page === index ? $r('app.color.accent_surface') : $r('app.color.card_background'))
            .borderRadius(14).onClick(() => { this.page = index; })
        })
      }.padding(10).backgroundColor($r('app.color.card_background'))
    }.width('100%').height('100%').backgroundColor($r('app.color.page_background'))
  }
}
