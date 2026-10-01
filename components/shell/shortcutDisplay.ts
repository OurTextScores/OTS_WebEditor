/**
 * Shortcut strings use the registry's grammar ('Mod+Shift+P'); this renders them for the
 * platform: Ctrl on Windows and Linux, ⌘ on macOS.
 */
const isMac = () => typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform);

const SYMBOLS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Delete: 'Del',
};

export function formatShortcut(shortcut: string | undefined, mac: boolean = isMac()): string {
  if (!shortcut) return '';
  const parts = shortcut.split('+').map((part) => {
    if (part === 'Mod') return mac ? '⌘' : 'Ctrl';
    if (part === 'Shift') return mac ? '⇧' : 'Shift';
    if (part === 'Alt') return mac ? '⌥' : 'Alt';
    return SYMBOLS[part] ?? part;
  });
  return mac ? parts.join('') : parts.join('+');
}
