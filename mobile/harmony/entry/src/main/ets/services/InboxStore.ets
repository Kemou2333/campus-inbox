import { common } from '@kit.AbilityKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { SavedState, emptyState, validateRecord, NoticeRow, validID } from '../model/Models';

// No login key/password is persisted. Guest and each stable server account use separate files.
export class InboxStore {
  private root: string;
  constructor(context: common.UIAbilityContext) {
    this.root = `${context.filesDir}/native-inbox-v1`;
    if (!fs.accessSync(this.root)) fs.mkdirSync(this.root);
  }
  private path(account: string): string {
    let name = 'guest';
    if (account) {
      name = 'account-';
      for (let index = 0; index < account.length; index++) name += account.charCodeAt(index).toString(16).padStart(4, '0');
    }
    return `${this.root}/${name}.json`;
  }
  load(account: string): SavedState {
    const path = this.path(account);
    if (!fs.accessSync(path)) return emptyState();
    if (fs.statSync(path).size > 4 * 1024 * 1024) throw new Error('本机记录较大，暂时无法读取；原文件已保留。');
    const state = JSON.parse(fs.readTextSync(path)) as SavedState;
    if (state.version !== 1 || !Array.isArray(state.rows) || !Array.isArray(state.deletedRows) || state.rows.length + state.deletedRows.length > 500 ||
      typeof state.draft !== 'string' || state.draft.length > 4000 || !Number.isInteger(state.demoIndex) || state.demoIndex < 0 ||
      !Number.isInteger(state.selectedDemo) || state.selectedDemo < -1 || state.selectedDemo > 2) throw new Error('本机记录暂时无法读取，原文件已保留。');
    [...state.rows, ...state.deletedRows].forEach((row: NoticeRow) => {
      validateRecord(row.record);
      if (!Array.isArray(row.openTasks)) throw new Error('本机记录暂时无法读取。');
    });
    if (state.pending && (!validID(state.pending.requestId) || typeof state.pending.text !== 'string' || state.pending.text.length > 4000)) {
      throw new Error('上次整理的记录暂时无法读取，原文已保留。');
    }
    return state;
  }
  save(account: string, state: SavedState): void {
    const content = JSON.stringify(state);
    if (state.rows.length + state.deletedRows.length > 500 || content.length > 1024 * 1024) throw new Error('本机通知较多，请先保留需要的记录。');
    const target = this.path(account), temporary = `${target}.tmp`;
    const file = fs.openSync(temporary, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
    try { fs.writeSync(file.fd, content); fs.fsyncSync(file.fd); } finally { fs.closeSync(file); }
    fs.renameSync(temporary, target);
  }
}
