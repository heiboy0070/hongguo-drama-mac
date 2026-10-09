// 老板键的展示工具。放在共享模块里,避免在主界面与设置页各写一份而逐渐不一致。

/** 把 Electron 的 accelerator 写法转成 macOS 习惯的符号显示 */
export const formatAccel = (accel) => (accel || '')
  .replace(/CommandOrControl|CmdOrCtrl|Command|Cmd/g, '⌘')
  .replace(/Control|Ctrl/g, '⌃')
  .replace(/Shift/g, '⇧')
  .replace(/Alt|Option/g, '⌥')
  .replace(/\+/g, ' ');

/**
 * 快捷键被占用时的用户提示。
 * 说清"发生了什么 + 下一步能做什么",不出现 globalShortcut / 注册 之类的内部术语;
 * 给出的动作必须是用户真的能执行的 —— 这里只有"关掉占用它的应用后重开本应用",
 * 因为本版本没有做快捷键自定义。
 */
export const bossKeyWarning = (status) => {
  if (!status) return '';
  const hide = formatAccel(status.hide);
  const show = formatAccel(status.show);
  if (!status.showRegistered) {
    return `唤回窗口的快捷键（${show}）被其它应用占用。为避免窗口隐藏后找不回来，隐藏功能已暂时停用。关闭占用该快捷键的应用，再重新打开本应用即可恢复。`;
  }
  return `隐藏窗口的快捷键（${hide}）被其它应用占用，暂时无法使用。关闭占用该快捷键的应用，再重新打开本应用即可恢复。`;
};
