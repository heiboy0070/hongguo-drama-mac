// 主题偏好：浅色 / 深色 / 跟随系统。
//
// 为什么用 localStorage 而不是走主进程的设置文件：主题必须在**首帧之前**定下来，
// 否则会先闪一下浅色再切成深色。走 IPC 是异步的，必然闪。
// localStorage 是同步可读的，代价只是跟随应用数据目录 —— 对主题来说可以接受。
const THEME_KEY = 'hongguo.theme';
const VALID = ['light', 'dark', 'system'];

/** 读取保存的偏好（非法值一律回退到跟随系统） */
export function readThemePreference() {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return VALID.includes(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

/** 解析出实际要用的主题：跟随系统时看系统的深浅色设置 */
export function resolveTheme(preference) {
  if (preference === 'light' || preference === 'dark') return preference;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** 把主题写到根元素上。同时同步 color-scheme，让滚动条等原生控件跟着变。 */
export function applyTheme(preference) {
  const resolved = resolveTheme(preference);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;
  root.style.colorScheme = resolved;
  return resolved;
}

export function saveThemePreference(preference) {
  try {
    localStorage.setItem(THEME_KEY, VALID.includes(preference) ? preference : 'system');
  } catch {
    /* 存不下就只在本次会话生效，不影响使用 */
  }
}

/**
 * 跟随系统时监听系统主题变化。
 * 返回取消订阅函数；非跟随模式不订阅（用户已明确指定，不该被系统改动覆盖）。
 */
export function watchSystemTheme(preference, onChange) {
  if (preference !== 'system' || !window.matchMedia) return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => onChange(applyTheme('system'));
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}
