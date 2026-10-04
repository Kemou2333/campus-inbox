# Android 界面主题

`native-theme.css` 必须在网页已有样式之后引入；`native-theme.js` 在原生桥接 `native.js` 之前引入。它们只随 APK 打包，公开网页保持原有拟态风格。

主题以 `html[data-native="android"]` 为作用域。字体统一为现有思源黑体资源，随后回退至 Android 系统无衬线字体。背景、卡片、输入框和标签使用不透明平面色块；弹窗与底部提示允许轻微传统阴影；没有玻璃模糊和拟态凹凸阴影。

原生桥接在获取系统主题后调用：

```javascript
window.applyNativeTheme({
  dark: false,
  primary: '#6750A4', onPrimary: '#FFFFFF',
  primaryContainer: '#EADDFF', onPrimaryContainer: '#21005D',
  surface: '#FFFBFE', surfaceVariant: '#E7E0EC', onSurface: '#1C1B1F',
  outline: '#79747E', secondary: '#625B71', tertiary: '#486B5D'
});
```

也可发送 `campus-native-theme` 自定义事件，`detail` 为同一对象。模块不读取或修改 `CampusNative` 消息处理器。颜色只接受 `#RRGGBB` 或 CSS 顺序的 `#RRGGBBAA`；原生 Android 的 `#AARRGGBB` 请先转换，推荐只传六位不透明颜色。调用会完整替换上次调色板，缺失或无效颜色回退到该明暗主题的默认值。

CSS 变量合同：`--md-primary`、`--md-on-primary`、`--md-primary-container`、`--md-on-primary-container`、`--md-surface`、`--md-surface-variant`、`--md-on-surface`、`--md-outline`、`--md-secondary`、`--md-tertiary`。兼容现有业务组件的 `--blue`、`--deep`、`--muted` 等指向这些角色。系统 Android 12+ 动态色由宿主提供，旧版本使用默认紫色调；深色模式由宿主显式设置，未提供时跟随 `prefers-color-scheme`。

应用保留同一套通知业务和本地存储，未增加 AI 请求。触控按钮至少 44 像素，主要输入框为 16 像素字，适配 320、390、430 像素及平板视口。
