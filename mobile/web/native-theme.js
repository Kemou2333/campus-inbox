/* Native host owns its bridge. This module only applies trusted theme values. */
(() => {
  'use strict';
  const root = document.documentElement;
  const keys = {
    primary: 'primary', onPrimary: 'on-primary',
    primaryContainer: 'primary-container', onPrimaryContainer: 'on-primary-container',
    surface: 'surface', surfaceVariant: 'surface-variant', onSurface: 'on-surface',
    outline: 'outline', secondary: 'secondary', tertiary: 'tertiary'
  };
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  let hostControlsDark = false;
  const color = value => typeof value === 'string' && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value) ? value : null;

  function applyNativeTheme(theme = {}) {
    if (typeof theme === 'string') {
      try { theme = JSON.parse(theme); } catch (_) { return false; }
    }
    if (!theme || typeof theme !== 'object' || Array.isArray(theme)) return false;
    root.dataset.native = 'android';
    if (typeof theme.dark === 'boolean') hostControlsDark = true;
    root.dataset.nativeDark = String(typeof theme.dark === 'boolean' ? theme.dark : media.matches);
    // A fresh host palette replaces the preceding palette rather than retaining stale values.
    for (const [field, variable] of Object.entries(keys)) {
      const value = color(theme[field]);
      root.style.removeProperty('--md-' + variable);
      if (value) root.style.setProperty('--md-' + variable, value);
    }
    const dark = root.dataset.nativeDark === 'true';
    // These tonal layers use the native surface/accent with safe fallback in old WebViews.
    root.style.removeProperty('--md-surface-low');
    root.style.removeProperty('--md-surface-high');
    root.style.removeProperty('--md-on-surface-variant');
    root.style.removeProperty('--md-outline-variant');
    if (CSS.supports('color', 'color-mix(in srgb, white, black)')) {
      root.style.setProperty('--md-surface-low', 'color-mix(in srgb, var(--md-surface) 96%, var(--md-primary))');
      root.style.setProperty('--md-surface-high', 'color-mix(in srgb, var(--md-surface) 90%, var(--md-primary))');
      root.style.setProperty('--md-on-surface-variant', 'color-mix(in srgb, var(--md-on-surface) 78%, var(--md-surface))');
      root.style.setProperty('--md-outline-variant', 'color-mix(in srgb, var(--md-outline) 35%, var(--md-surface))');
    }
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = color(theme.surface) || (dark ? '#141218' : '#fffbfe');
    return true;
  }

  window.applyNativeTheme = applyNativeTheme;
  window.addEventListener('campus-native-theme', event => applyNativeTheme(event.detail));
  const onScheme = () => { if (!hostControlsDark) root.dataset.nativeDark = String(media.matches); };
  if (media.addEventListener) media.addEventListener('change', onScheme);
  else if (media.addListener) media.addListener(onScheme);
  // Loading this asset opts the bundled APK in; it is never included by the public website.
  applyNativeTheme();
})();
