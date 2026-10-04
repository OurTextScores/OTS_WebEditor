'use client';

import { ChevronDown } from 'lucide-react';
import React, { useState, useSyncExternalStore } from 'react';
import { Button } from '../../../ui/Button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../../../ui/DropdownMenu';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../ui/Tooltip';
import styles from '../WriteToolbar.module.css';
import {
  announceUnavailable,
  ControlTip,
  DISABLED_LOOK,
  type StripControlContext,
} from './ControlButton';
import { commandOf, MenuItems } from './MenuItems';
import {
  getLastUsedMap,
  getLastUsedMapOnServer,
  subscribeLastUsed,
  writeLastUsed,
} from './stripPersistence';
import type { StripMenu } from './toolbarLayout';

/**
 * A button that opens a menu of variants. A plain menu button is one control; a split button
 * (`control.split`) is the icon, which runs the variant used last, and a chevron that opens the menu.
 */
export function MenuButton({
  control,
  context,
}: {
  control: StripMenu;
  context: StripControlContext;
}) {
  const { tools, activeKey, setActiveKey } = context;
  const Icon = control.icon;
  const [open, setOpen] = useState(false);
  const lastUsed = useSyncExternalStore(subscribeLastUsed, getLastUsedMap, getLastUsedMapOnServer);
  const current =
    control.items.find((item) => item.testId === lastUsed[control.testId]) ?? control.items[0];
  const currentCommand = commandOf(control, current);

  // The menu opens when something in it can run; otherwise it explains the first reason it finds.
  const enabled = control.items.some((item) => tools.enabled(commandOf(control, item)));
  const reason = enabled
    ? undefined
    : control.items.map((item) => tools.reason(commandOf(control, item))).find(Boolean);
  const faceEnabled = tools.enabled(currentCommand);
  const faceReason = faceEnabled ? undefined : tools.reason(currentCommand);

  const blockWhenDisabled = (event: { preventDefault: () => void }) => {
    if (enabled) return;
    event.preventDefault();
    announceUnavailable(control.label, reason);
  };

  const content = (
    <DropdownMenuContent
      data-testid={control.contentTestId}
      style={
        control.columns
          ? { display: 'grid', gridTemplateColumns: `repeat(${control.columns}, 2.25rem)`, gap: 2 }
          : undefined
      }
    >
      <MenuItems
        control={control}
        tools={tools}
        onChoose={control.split ? (item) => writeLastUsed(control.testId, item.testId) : undefined}
      />
    </DropdownMenuContent>
  );

  if (!control.split) {
    return (
      <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                data-testid={control.testId}
                data-strip-control={control.testId}
                variant="outline"
                size="xs"
                className={`h-8 gap-0.5 px-1.5 ${enabled ? '' : DISABLED_LOOK}`}
                aria-label={control.label}
                aria-disabled={enabled ? undefined : true}
                tabIndex={activeKey === control.testId ? 0 : -1}
                onFocus={() => setActiveKey(control.testId)}
                onPointerDown={blockWhenDisabled}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
                    blockWhenDisabled(event);
                  }
                }}
              >
                <Icon size={16} aria-hidden="true" />
                <ChevronDown size={11} aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <ControlTip label={control.label} reason={reason} />
          </TooltipContent>
        </Tooltip>
        {content}
      </DropdownMenu>
    );
  }

  // Split: the face is the strip's one tab stop for the pair; ArrowDown on it opens the menu.
  const faceLabel = `${control.label}: ${current.label}`;
  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <div role="group" aria-label={control.label} data-split-pair="" className="flex items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              data-testid={`${control.testId}-last`}
              data-strip-control={control.testId}
              variant="outline"
              size="xs"
              className={`h-8 min-w-8 rounded-r-none border-r-0 px-1.5 ${faceEnabled ? '' : DISABLED_LOOK}`}
              aria-label={faceLabel}
              aria-disabled={faceEnabled ? undefined : true}
              aria-haspopup="menu"
              tabIndex={activeKey === control.testId ? 0 : -1}
              onFocus={() => setActiveKey(control.testId)}
              onClick={() =>
                faceEnabled
                  ? tools.run(currentCommand, current.arg)()
                  : announceUnavailable(faceLabel, faceReason)
              }
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' && enabled) {
                  event.preventDefault();
                  setOpen(true);
                }
              }}
            >
              {current.glyph ? (
                <span className={styles.glyph} aria-hidden="true">
                  {current.glyph}
                </span>
              ) : (
                <Icon size={16} aria-hidden="true" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <ControlTip label={faceLabel} reason={faceReason} />
          </TooltipContent>
        </Tooltip>
        <DropdownMenuTrigger asChild>
          <Button
            data-testid={control.testId}
            variant="outline"
            size="xs"
            className={`h-8 rounded-l-none px-1 ${enabled ? '' : DISABLED_LOOK}`}
            aria-label={`${control.label} options`}
            aria-disabled={enabled ? undefined : true}
            tabIndex={-1}
            onPointerDown={blockWhenDisabled}
          >
            <ChevronDown size={11} aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
      </div>
      {content}
    </DropdownMenu>
  );
}
