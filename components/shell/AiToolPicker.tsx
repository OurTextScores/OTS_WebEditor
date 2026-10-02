'use client';

import React from 'react';
import { AI_TOOLS } from '../score-editor/shellCommands';
import type { AiToolsTab } from '../score-editor/ai-tools/aiToolsTab';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';

/**
 * The AI Tools panel's tool picker (SHELL_REDESIGN_DESIGN §8.3): one select over the seven
 * tools. Tools that need the AI proxy are left out while it is off. Options keep the test
 * ids the old tab strip's tabs had (`tab-ai`, `tab-notagen`, ...).
 */
export function AiToolPicker({
  value,
  onChange,
  aiEnabled,
}: {
  value: AiToolsTab;
  onChange: (tool: AiToolsTab) => void;
  aiEnabled: boolean;
}) {
  const tools = AI_TOOLS.filter((tool) => aiEnabled || !tool.needsAi);
  return (
    <Select value={value} onValueChange={(next) => onChange(next as AiToolsTab)}>
      <SelectTrigger
        data-testid="ai-tool-picker"
        aria-label="AI tool"
        className="h-6 min-w-[8.5rem] gap-1 text-[11px]"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="relative z-menu">
        {tools.map((tool) => (
          <SelectItem key={tool.tool} value={tool.tool} data-testid={tool.testId}>
            {tool.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
