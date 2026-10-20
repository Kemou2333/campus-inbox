import { UIAbility } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';

export default class EntryAbility extends UIAbility {
  onCreate(): void { AppStorage.setOrCreate('nativeForeground', true); }
  onWindowStageCreate(stage: window.WindowStage): void { stage.loadContent('pages/Index'); }
  onForeground(): void { AppStorage.setOrCreate('nativeForeground', true); }
  onBackground(): void { AppStorage.setOrCreate('nativeForeground', false); }
}
