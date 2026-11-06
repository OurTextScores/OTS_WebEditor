/** Whether performer mode runs as an installed Home Screen web app (standalone), not in a Safari tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const legacy = (navigator as Navigator & { standalone?: boolean }).standalone;
  return legacy === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
}
