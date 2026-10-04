'use client';

import { ChevronDown } from 'lucide-react';
import React from 'react';
import { Button } from '../../../ui/Button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../ui/DropdownMenu';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../ui/Tooltip';
import styles from '../WriteToolbar.module.css';
import {
  announceUnavailable,
  ControlTip,
  DISABLED_LOOK,
  type StripControlContext,
} from './ControlButton';
import type { StripItem, StripMenu } from './toolbarLayout';

/** A button that opens a list; each item runs a command and keeps its test id. */
export function MenuButton({
  control,
  context,
}: {
  control: StripMenu;
  context: StripControlContext;
}) {
  const { tools, activeKey, setActiveKey } = context;
  const Icon = control.icon;
  const commandOf = (item: StripItem) => item.commandId ?? control.commandId ?? '';
  const itemEnabled = (item: StripItem) => tools.enabled(commandOf(item));
  // The menu opens when something in it can run; otherwise it explains the first reason it finds.
  const enabled = control.items.some(itemEnabled);
  const reason = enabled
    ? undefined
    : control.items.map((item) => tools.reason(commandOf(item))).find(Boolean);

  const blockWhenDisabled = (event: { preventDefault: () => void }) => {
    if (enabled) return;
    event.preventDefault();
    announceUnavailable(control.label, reason);
  };

  return (
    <DropdownMenu modal={false}>
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
      <DropdownMenuContent data-testid={control.contentTestId}>
        {control.items.map((item, position) => {
          const commandId = commandOf(item);
          const run = tools.run(commandId, item.arg);
          const label = (
            <>
              {item.glyph ? (
                <span className={styles.glyph} aria-hidden="true">
                  {item.glyph}
                </span>
              ) : null}
              {item.label}
            </>
          );
          const heading = item.section ? (
            <>
              {position > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel>{item.section}</DropdownMenuLabel>
            </>
          ) : null;
          if (control.checkable) {
            return (
              <React.Fragment key={item.testId}>
                {heading}
                <DropdownMenuCheckboxItem
                  data-testid={item.testId}
                  checked={tools.checkedFor(commandId, item.arg)}
                  disabled={!itemEnabled(item)}
                  onSelect={(event) => {
                    event.preventDefault();
                    run();
                  }}
                >
                  {label}
                </DropdownMenuCheckboxItem>
              </React.Fragment>
            );
          }
          return (
            <React.Fragment key={item.testId}>
              {heading}
              <DropdownMenuItem
                data-testid={item.testId}
                className={item.glyph ? 'gap-3' : undefined}
                disabled={!itemEnabled(item)}
                onSelect={run}
              >
                {label}
              </DropdownMenuItem>
            </React.Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
