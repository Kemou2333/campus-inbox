import { NoticeRow, ServerTask, ServerStep, ServerReminder, displayTime, readable, emptyRow } from '../model/Models';

@Component
export struct NoticeCard {
  @Prop row: NoticeRow = emptyRow();
  onAction: (id: string, action: string, target: string) => void = () => {};

  @Builder
  detail(text: string) {
    Text(readable(text)).fontSize(16).lineHeight(25).fontColor($r('app.color.text_secondary')).width('100%')
  }
  @Builder
  task(task: ServerTask) {
    Column({ space: 10 }) {
      Row({ space: 10 }) {
        Button(task.completed ? '✓' : '○', { type: ButtonType.Circle })
          .width(44).height(44).fontSize(26)
          .backgroundColor(task.completed ? $r('app.color.accent') : $r('app.color.card_background'))
          .fontColor(task.completed ? Color.White : $r('app.color.accent'))
          .accessibilityText(task.completed ? '撤销完成' : '完成待办')
          .onClick(() => this.onAction(this.row.record.id, 'task', task.id))
        Button(this.row.openTasks.includes(task.id) ? '⌃' : '⌄', { type: ButtonType.Circle })
          .width(32).height(38).backgroundColor(Color.Transparent).fontColor($r('app.color.text_secondary'))
          .accessibilityText(this.row.openTasks.includes(task.id) ? '收起步骤' : '展开步骤')
          .onClick(() => this.onAction(this.row.record.id, 'expandTask', task.id))
        Text(readable(task.text)).fontSize(20).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary'))
          .layoutWeight(1).onClick(() => this.onAction(this.row.record.id, 'expandTask', task.id))
      }.width('100%')
      if (this.row.openTasks.includes(task.id)) {
        if (displayTime(task.time, task.timeText)) {
          Text(displayTime(task.time, task.timeText)).fontSize(16).fontWeight(FontWeight.Medium).fontColor($r('app.color.accent')).width('100%')
        }
        if (task.location) { this.detail(task.location) }
        if (task.condition) { this.detail(task.condition) }
        ForEach(task.details, (text: string) => { this.detail(text) })
        ForEach(task.steps, (step: ServerStep) => {
          Column({ space: 7 }) {
            Text(readable(step.text)).fontSize(17).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary')).width('100%')
            ForEach(step.details, (text: string) => { this.detail(text) })
          }.width('100%').padding({ left: 12, top: 8, bottom: 8 })
            .border({ width: { left: 2 }, color: $r('app.color.outline') })
        }, (step: ServerStep) => step.id)
      }
    }.width('100%').alignItems(HorizontalAlign.Start).padding(14)
      .backgroundColor($r('app.color.detail_background')).borderRadius(18)
  }
  build() {
    Column({ space: 14 }) {
      Row() {
        Text(this.row.record.completed ? '已完成' : this.row.record.kind === 'task' ? '待办' : '提醒')
          .fontSize(13).fontWeight(FontWeight.Medium).fontColor($r('app.color.accent'))
          .padding({ left: 9, right: 9, top: 5, bottom: 5 }).backgroundColor($r('app.color.accent_surface')).borderRadius(8)
        Blank()
        if (this.row.record.tasks.length) {
          Text(`${this.row.record.tasks.filter((task: ServerTask) => task.completed).length}/${this.row.record.tasks.length}`)
            .fontSize(13).fontColor($r('app.color.text_secondary'))
        }
      }.width('100%')
      Text(this.row.record.title).fontSize(28).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).width('100%')
      if (this.row.record.summary) { this.detail(this.row.record.summary) }
      if (displayTime(this.row.record.deadline, this.row.record.deadlineText)) {
        Text(displayTime(this.row.record.deadline, this.row.record.deadlineText)).fontSize(16).fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.accent')).width('100%')
      }
      Row({ space: 8 }) {
        Button(this.row.expanded ? '⌃' : '⌄', { type: ButtonType.Circle }).width(48).height(48)
          .backgroundColor($r('app.color.accent_surface')).fontColor($r('app.color.accent')).fontSize(24)
          .accessibilityText(this.row.expanded ? '收起通知' : '展开通知')
          .onClick(() => this.onAction(this.row.record.id, 'expand', ''))
        Blank()
        Button('删除', { type: ButtonType.Normal }).borderRadius(12).height(44)
          .fontSize(14).backgroundColor($r('app.color.detail_background')).fontColor($r('app.color.text_secondary'))
          .onClick(() => this.onAction(this.row.record.id, 'remove', ''))
        Button(this.row.record.completed ? '↶' : '✓', { type: ButtonType.Circle }).width(56).height(56)
          .fontSize(30).fontColor(Color.White).backgroundColor($r('app.color.accent'))
          .accessibilityText(this.row.record.completed ? '恢复通知' : '完成通知')
          .onClick(() => this.onAction(this.row.record.id, 'complete', ''))
      }.width('100%')
      if (this.row.expanded) {
        ForEach(this.row.record.tasks, (task: ServerTask) => { this.task(task) }, (task: ServerTask) => task.id)
        if (this.row.record.warnings.length || this.row.record.materials.length || this.row.record.reminders.length) {
          Text('补充说明').fontSize(18).fontWeight(FontWeight.Bold).fontColor($r('app.color.text_primary')).width('100%')
          ForEach(this.row.record.warnings, (text: string) => { this.detail(text) })
          ForEach(this.row.record.materials, (text: string) => { this.detail(text) })
          ForEach(this.row.record.reminders, (reminder: ServerReminder) => { this.detail(reminder.text) }, (reminder: ServerReminder) => reminder.id)
        }
        Button(this.row.sourceOpen ? '收起原文' : '原文', { type: ButtonType.Normal }).height(40).borderRadius(10)
          .fontSize(14).fontColor($r('app.color.text_secondary')).backgroundColor(Color.Transparent)
          .onClick(() => this.onAction(this.row.record.id, 'source', ''))
        if (this.row.sourceOpen) { this.detail(this.row.record.originalText) }
      }
    }.width('100%').padding(20).alignItems(HorizontalAlign.Start).backgroundColor($r('app.color.card_background'))
      .borderRadius(24).border({ width: 1, color: $r('app.color.outline') })
  }
}
