import { usePanelState, type PanelState } from './vendor/viritura';

export const PANEL_LIMITS = {
  left: { defaultWidth: 296, min: 240, max: 520 },
  ai: { defaultWidth: 360, min: 280, max: 720 },
  source: { defaultWidth: 420, min: 300, max: 760 },
} as const;

/** The widths of the three resizable panels, each remembered per browser. */
export function useShellPanels(): { left: PanelState; ai: PanelState; source: PanelState } {
  const left = usePanelState({ storageKey: 'ots.shell.panel.left', ...PANEL_LIMITS.left });
  const ai = usePanelState({ storageKey: 'ots.shell.panel.ai', ...PANEL_LIMITS.ai });
  const source = usePanelState({ storageKey: 'ots.shell.panel.source', ...PANEL_LIMITS.source });
  return { left, ai, source };
}
