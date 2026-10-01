'use client';

import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import React, { type ComponentProps, type ReactNode } from 'react';
import { InspectorPanel } from '../InspectorPanel';
import { AiToolsTabStrip, type AiToolsTab } from './ai-tools/AiToolsTabStrip';
import { MusicXmlPanel, type MusicXmlPanelProps } from './MusicXmlPanel';

type InspectorProps = Omit<
  ComponentProps<typeof InspectorPanel>,
  'collapsed' | 'onToggleCollapsed'
>;

/**
 * The right-hand sidebars of the legacy shell (`?shell=legacy`): Inspector, MusicXML, AI Tools
 * and the strip of collapsed-panel tabs. The v2 shell docks these as panels instead; this goes
 * when the flag does (SHELL_REDESIGN_DESIGN Phase 5).
 */
export function LegacySidePanels({
  panelsVisible,
  inspector,
  inspectorOpen,
  onInspectorOpenChange,
  musicXml,
  musicXmlOpen,
  onMusicXmlOpenChange,
  aiOpen,
  xmlMode,
  onXmlModeChange,
  xmlTab,
  onXmlTabChange,
  xmlWidth,
  onResizeStart,
  aiEnabled,
  aiStatus,
  aiBody,
  historyCollapsed,
  onHistoryCollapsedChange,
}: {
  panelsVisible: boolean;
  inspector: InspectorProps;
  inspectorOpen: boolean;
  onInspectorOpenChange: (open: boolean) => void;
  musicXml: MusicXmlPanelProps;
  musicXmlOpen: boolean;
  onMusicXmlOpenChange: (open: boolean) => void;
  aiOpen: boolean;
  xmlMode: 'closed' | 'open';
  onXmlModeChange: (mode: 'closed' | 'open') => void;
  xmlTab: AiToolsTab;
  onXmlTabChange: (tab: AiToolsTab) => void;
  xmlWidth: number;
  onResizeStart: (event: React.MouseEvent) => void;
  aiEnabled: boolean;
  aiStatus: { checkpointCount: number; dirtySinceCheckpoint: boolean; loading: boolean };
  aiBody: ReactNode;
  historyCollapsed: boolean;
  onHistoryCollapsedChange: (collapsed: boolean) => void;
}) {
  return (
    <>
      {panelsVisible && (
        <InspectorPanel
          {...inspector}
          collapsed={!inspectorOpen}
          onToggleCollapsed={() => onInspectorOpenChange(!inspectorOpen)}
        />
      )}

      {panelsVisible && musicXmlOpen && <MusicXmlPanel {...musicXml} />}

      {panelsVisible && aiOpen && (
        <aside
          className="flex shrink-0 border-l bg-white text-sm"
          style={{ width: `${xmlWidth}px` }}
          data-testid="xml-sidebar"
        >
          {/* Resize Handle Container */}
          {xmlMode === 'open' && (
            <div
              className="shrink-0 cursor-ew-resize bg-slate-300 hover:bg-blue-500 transition-colors border-r border-slate-400 hover:border-blue-700 flex items-center justify-center"
              style={{ width: '24px' }}
              onMouseDown={onResizeStart}
              title="Drag to resize sidebar"
              data-testid="sidebar-resize-handle"
            >
              {/* Vertical grip icon (three vertical bars with rounded ends) */}
              <svg
                width="14"
                height="24"
                viewBox="0 0 14 24"
                fill="none"
                className="pointer-events-none"
              >
                {/* Left bar */}
                <rect x="2" y="2" width="3" height="20" rx="1.5" fill="#475569" />
                {/* Middle bar */}
                <rect x="5.5" y="2" width="3" height="20" rx="1.5" fill="#475569" />
                {/* Right bar */}
                <rect x="9" y="2" width="3" height="20" rx="1.5" fill="#475569" />
              </svg>
            </div>
          )}
          {/* Sidebar Content */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <div className="sticky top-0 z-10 bg-white">
              <div className="flex items-center justify-between p-4">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  AI Tools
                </span>
                <button
                  type="button"
                  data-testid="btn-xml-toggle"
                  aria-expanded
                  aria-controls="xml-sidebar-content"
                  aria-label="Close AI Tools sidebar"
                  title="Close AI Tools sidebar"
                  onClick={() => onXmlModeChange('closed')}
                  className="rounded p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  <PanelRightClose size={16} />
                </button>
              </div>
              {aiOpen && (
                <AiToolsTabStrip
                  activeTab={xmlTab}
                  setActiveTab={onXmlTabChange}
                  aiEnabled={aiEnabled}
                  status={aiStatus}
                />
              )}
            </div>
            {aiOpen && (
              <div id="xml-sidebar-content" className="flex-1 overflow-y-auto pb-4 px-4">
                {aiBody}
              </div>
            )}
          </div>
        </aside>
      )}

      {panelsVisible &&
        (() => {
          const tabs = [
            !inspectorOpen && {
              key: 'inspector',
              label: 'Inspector',
              onOpen: () => onInspectorOpenChange(true),
            },
            !musicXmlOpen && {
              key: 'musicxml',
              label: 'MusicXML',
              onOpen: () => onMusicXmlOpenChange(true),
            },
            xmlMode === 'closed' && {
              key: 'ai-tools',
              label: 'AI Tools',
              onOpen: () => onXmlModeChange('open'),
            },
            historyCollapsed && {
              key: 'history',
              label: 'History',
              onOpen: () => onHistoryCollapsedChange(false),
            },
          ].filter(Boolean) as Array<{ key: string; label: string; onOpen: () => void }>;
          if (tabs.length === 0) {
            return null;
          }
          return (
            <div
              style={{ order: 4 }}
              className="flex w-8 shrink-0 flex-col items-stretch gap-2 border-l border-slate-200 bg-slate-50 py-3"
              data-testid="collapsed-panel-strip"
            >
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  data-testid={`expand-panel-${tab.key}`}
                  onClick={tab.onOpen}
                  title={`Open ${tab.label}`}
                  className="flex flex-col items-center gap-1 rounded-l-md border border-r-0 border-slate-200 bg-white py-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  <PanelRightOpen size={14} />
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wide"
                    style={{ writingMode: 'vertical-rl' }}
                  >
                    {tab.label}
                  </span>
                </button>
              ))}
            </div>
          );
        })()}
    </>
  );
}
